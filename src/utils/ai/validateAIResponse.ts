import type {
  AIConfidence,
  AIExplanation,
  AIFormattingResult,
  AIVerification,
  AIVerificationBatch,
  AIVerificationStatus,
} from '../../types/ai'
import type { QuizQuestion } from '../../types/quiz'

/**
 * Pure validators for AI responses.
 *
 * Nothing here throws, and nothing here trusts the model further than it has
 * to. The two rules that matter:
 *
 * - **Indexes, not strings.** The model answers with option indexes; we resolve
 *   them against the real question. A hallucinated string can never reach
 *   `correctAnswers`, so `isAnswerCorrect`'s exact-set contract holds.
 * - **The app decides agreement.** `status` is recomputed by comparing the
 *   resolved set with the question's real answers, so a model that claims to
 *   agree while proposing something different is reported as disagreeing.
 *
 * Length and count caps live here rather than in the JSON schemas, because
 * OpenAI's strict mode and Anthropic's structured outputs both reject
 * `maxLength`/`minItems`.
 */

export type AIValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const MAX_EXPLANATION_CHARS = 4000
const MAX_NOTE_CHARS = 600
const MAX_REASONING_CHARS = 2000
const MAX_NOTES = 20

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toConfidence(value: unknown): AIConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low'
}

function clamp(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/** Exact-set equality, order-independent — mirrors `isAnswerCorrect`. */
function sameAnswerSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value) => b.includes(value))
}

/**
 * Map model-supplied indexes onto real option strings. Out-of-range indexes
 * are fatal (the model was talking about options that don't exist); duplicates
 * are simply collapsed.
 */
function resolveIndexes(
  raw: unknown,
  question: QuizQuestion,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'The AI did not return a list of answer options.' }
  }
  const seen = new Set<number>()
  const options: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'number' || !Number.isInteger(entry)) {
      return { ok: false, error: 'The AI returned an answer that was not an option number.' }
    }
    if (entry < 0 || entry >= question.options.length) {
      return {
        ok: false,
        error: `The AI referred to option ${entry}, which this question does not have.`,
      }
    }
    if (seen.has(entry)) continue
    seen.add(entry)
    options.push(question.options[entry])
  }
  if (options.length === 0) {
    return { ok: false, error: 'The AI did not name any correct option.' }
  }
  return { ok: true, value: options }
}

// ---------------------------------------------------------------------------
// Explanation (workflow A)
// ---------------------------------------------------------------------------

export function validateExplanationResponse(
  raw: unknown,
  question: QuizQuestion,
): AIValidation<AIExplanation> {
  if (!isRecord(raw)) {
    return { ok: false, error: 'The AI response was not in the expected format.' }
  }

  const resolved = resolveIndexes(raw.correctOptionIndexes, question)
  if (!resolved.ok) return resolved

  if (typeof raw.explanation !== 'string' || raw.explanation.trim() === '') {
    return { ok: false, error: 'The AI response contained no explanation.' }
  }

  // A note pointing at an option that doesn't exist is dropped, not fatal —
  // it is supporting detail, and losing one shouldn't cost the whole answer.
  const optionNotes: { option: string; note: string }[] = []
  if (Array.isArray(raw.optionNotes)) {
    for (const entry of raw.optionNotes) {
      if (!isRecord(entry)) continue
      const index = entry.optionIndex
      if (typeof index !== 'number' || !Number.isInteger(index)) continue
      if (index < 0 || index >= question.options.length) continue
      if (typeof entry.note !== 'string' || entry.note.trim() === '') continue
      optionNotes.push({
        option: question.options[index],
        note: clamp(entry.note, MAX_NOTE_CHARS),
      })
    }
  }

  return {
    ok: true,
    value: {
      questionId: question.id,
      aiCorrectOptions: resolved.value,
      agreesWithSource: sameAnswerSet(resolved.value, question.correctAnswers),
      explanation: clamp(raw.explanation, MAX_EXPLANATION_CHARS),
      optionNotes,
      confidence: toConfidence(raw.confidence),
    },
  }
}

// ---------------------------------------------------------------------------
// Verification (workflow B)
// ---------------------------------------------------------------------------

/**
 * Decide the status ourselves. The model's own `status` is only consulted for
 * `invalid`, which is a claim about the question rather than about agreement.
 */
function resolveStatus(
  claimed: unknown,
  resolvedAnswers: string[],
  question: QuizQuestion,
  confidence: AIConfidence,
): AIVerificationStatus {
  if (claimed === 'invalid') return 'invalid'
  if (confidence === 'low') return 'uncertain'
  return sameAnswerSet(resolvedAnswers, question.correctAnswers) ? 'agrees' : 'disagrees'
}

export function validateVerificationResponse(
  raw: unknown,
  questions: QuizQuestion[],
  now: number = Date.now(),
): AIValidation<AIVerificationBatch> {
  if (!isRecord(raw) || !Array.isArray(raw.verifications)) {
    return { ok: false, error: 'The AI response was not in the expected format.' }
  }

  const byId = new Map(questions.map((q) => [q.id, q]))
  const verifications: AIVerification[] = []

  for (const entry of raw.verifications) {
    if (!isRecord(entry)) continue
    if (typeof entry.questionId !== 'number') continue

    // Questions we didn't ask about are dropped rather than invented.
    const question = byId.get(entry.questionId)
    if (question === undefined) continue

    const resolved = resolveIndexes(entry.correctOptionIndexes, question)
    if (!resolved.ok) continue

    const confidence = toConfidence(entry.confidence)
    const suggestedExplanation =
      typeof entry.suggestedExplanation === 'string' && entry.suggestedExplanation.trim() !== ''
        ? clamp(entry.suggestedExplanation, MAX_EXPLANATION_CHARS)
        : undefined

    verifications.push({
      questionId: question.id,
      status: resolveStatus(entry.status, resolved.value, question, confidence),
      confidence,
      suggestedAnswers: resolved.value,
      // Snapshot from the real question, never from the response.
      sourceAnswers: [...question.correctAnswers],
      reasoning:
        typeof entry.reasoning === 'string' && entry.reasoning.trim() !== ''
          ? clamp(entry.reasoning, MAX_REASONING_CHARS)
          : 'No reasoning given.',
      suggestedExplanation,
      checkedAt: now,
    })
  }

  if (verifications.length === 0) {
    return { ok: false, error: 'The AI returned no usable results for these questions.' }
  }
  return { ok: true, value: { verifications } }
}

// ---------------------------------------------------------------------------
// Formatting (workflow C)
// ---------------------------------------------------------------------------

/**
 * Shape check only. Whether the text actually parses is `parseMcqText`'s job
 * in the component, which keeps this validator free of a parser dependency.
 */
export function validateFormattingResponse(raw: unknown): AIValidation<AIFormattingResult> {
  if (!isRecord(raw) || typeof raw.text !== 'string') {
    return { ok: false, error: 'The AI response was not in the expected format.' }
  }

  const text = stripFence(raw.text).trim()
  if (text === '') {
    return { ok: false, error: 'The AI returned no formatted text.' }
  }

  const notes: string[] = []
  if (Array.isArray(raw.notes)) {
    for (const note of raw.notes) {
      if (typeof note !== 'string' || note.trim() === '') continue
      notes.push(clamp(note, MAX_NOTE_CHARS))
      if (notes.length >= MAX_NOTES) break
    }
  }

  return { ok: true, value: { text, notes } }
}

/** Remove a leading/trailing markdown fence a provider may have leaked in. */
function stripFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return text
  const withoutOpen = trimmed.replace(/^```[a-zA-Z]*\r?\n?/, '')
  return withoutOpen.replace(/\r?\n?```$/, '')
}

// ---------------------------------------------------------------------------
// Raw text -> JSON
// ---------------------------------------------------------------------------

/**
 * Pull a JSON object out of a model response that may be fenced or preceded by
 * prose. Scans for the first balanced `{…}`, skipping braces inside strings.
 */
export function extractJson(text: string): AIValidation<unknown> {
  const source = stripFence(text)
  const start = source.indexOf('{')
  if (start === -1) return { ok: false, error: 'The AI response contained no JSON.' }

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i++) {
    const char = source[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        try {
          return { ok: true, value: JSON.parse(source.slice(start, i + 1)) }
        } catch {
          return { ok: false, error: 'The AI returned malformed JSON.' }
        }
      }
    }
  }

  return { ok: false, error: 'The AI returned incomplete JSON.' }
}
