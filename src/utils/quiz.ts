import type { QuizQuestion, QuizResult, QuizSession } from '../types/quiz'

/** Fisher–Yates shuffle. Returns a new array; never mutates the input. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// --- multi-answer helpers ------------------------------------------------

/** True when the question expects more than one option to be ticked. */
export function isMultiAnswer(question: QuizQuestion): boolean {
  return question.correctAnswers.length > 1
}

/** A question as written by a build before multiple correct answers existed. */
export interface LegacyQuizQuestion extends Omit<QuizQuestion, 'correctAnswers'> {
  correctAnswers?: string[]
  correctAnswer?: string
}

/**
 * Coerce a question that may still carry the pre-multi-answer `correctAnswer`
 * string into the current shape. Single point of backward compatibility —
 * used by the JSON importer and by every storage load path.
 */
export function normalizeQuestion(raw: LegacyQuizQuestion): QuizQuestion {
  const { correctAnswer, correctAnswers, ...rest } = raw
  return {
    ...rest,
    correctAnswers: correctAnswers ?? (correctAnswer === undefined ? [] : [correctAnswer]),
  }
}

/**
 * An answer counts only when the selection is exactly the correct set: every
 * correct option ticked and nothing else. No partial credit.
 */
export function isAnswerCorrect(question: QuizQuestion, selected?: string[]): boolean {
  if (selected === undefined || selected.length !== question.correctAnswers.length) return false
  return selected.every((option) => question.correctAnswers.includes(option))
}

/** Add or remove an option from a multi-select draft. Never mutates. */
export function toggleOption(selected: string[], option: string): string[] {
  return selected.includes(option)
    ? selected.filter((o) => o !== option)
    : [...selected, option]
}

/**
 * Parse and validate raw JSON text into a quiz.
 * Returns either the questions or a friendly, human-readable error message.
 */
export function parseQuizJson(
  raw: string,
): { ok: true; questions: QuizQuestion[] } | { ok: false; error: string } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      error:
        'That is not valid JSON. Check for missing commas, unquoted keys, or trailing commas.',
    }
  }

  if (!Array.isArray(data)) {
    return { ok: false, error: 'The JSON must be an array of question objects: [ { ... }, ... ]' }
  }
  if (data.length === 0) {
    return { ok: false, error: 'The quiz is empty — add at least one question.' }
  }

  const seenIds = new Set<number>()
  for (let i = 0; i < data.length; i++) {
    const q = data[i] as Partial<LegacyQuizQuestion>
    const label = `Question ${i + 1}`

    if (typeof q !== 'object' || q === null) {
      return { ok: false, error: `${label}: expected an object, got ${typeof q}.` }
    }
    if (typeof q.id !== 'number') {
      return { ok: false, error: `${label}: "id" is required and must be a number.` }
    }
    if (seenIds.has(q.id)) {
      return { ok: false, error: `${label}: duplicate id ${q.id}. Every question needs a unique id.` }
    }
    seenIds.add(q.id)
    if (typeof q.question !== 'string' || q.question.trim() === '') {
      return { ok: false, error: `${label}: "question" is required and must be a non-empty string.` }
    }
    if (
      !Array.isArray(q.options) ||
      q.options.length < 2 ||
      !q.options.every((o) => typeof o === 'string')
    ) {
      return { ok: false, error: `${label}: "options" must be an array of at least 2 strings.` }
    }
    // "correctAnswers" is the current shape; a single "correctAnswer" string
    // is still accepted so quizzes exported by older builds keep loading.
    const options = q.options
    if (q.correctAnswers !== undefined) {
      if (
        !Array.isArray(q.correctAnswers) ||
        q.correctAnswers.length === 0 ||
        !q.correctAnswers.every((a) => typeof a === 'string')
      ) {
        return {
          ok: false,
          error: `${label}: "correctAnswers" must be an array of at least one string.`,
        }
      }
      const duplicate = q.correctAnswers.find((a, idx) => q.correctAnswers!.indexOf(a) !== idx)
      if (duplicate !== undefined) {
        return { ok: false, error: `${label}: "correctAnswers" lists "${duplicate}" twice.` }
      }
      const unknown = q.correctAnswers.find((a) => !options.includes(a))
      if (unknown !== undefined) {
        return {
          ok: false,
          error: `${label}: "correctAnswers" entry ("${unknown}") must exactly match one of the options.`,
        }
      }
    } else if (typeof q.correctAnswer === 'string') {
      if (!options.includes(q.correctAnswer)) {
        return {
          ok: false,
          error: `${label}: "correctAnswer" ("${q.correctAnswer}") must exactly match one of the options.`,
        }
      }
    } else {
      return {
        ok: false,
        error: `${label}: "correctAnswers" is required — an array of the options that are correct (a single "correctAnswer" string also works).`,
      }
    }
    for (const [key, type] of [
      ['explanation', 'string'],
      ['category', 'string'],
      ['difficulty', 'string'],
    ] as const) {
      if (q[key] !== undefined && typeof q[key] !== type) {
        return { ok: false, error: `${label}: "${key}" must be a string when provided.` }
      }
    }
  }

  return { ok: true, questions: (data as LegacyQuizQuestion[]).map(normalizeQuestion) }
}

/** Unique, sorted category names present in a question set. */
export function getCategories(questions: QuizQuestion[]): string[] {
  const set = new Set<string>()
  for (const q of questions) {
    if (q.category) set.add(q.category)
  }
  return [...set].sort()
}

/** Score a finished (or in-progress) session. */
export function computeResult(session: QuizSession): QuizResult {
  const total = session.questions.length
  let correct = 0
  let unanswered = 0
  for (const q of session.questions) {
    const answer = session.answers[q.id]
    if (answer === undefined) unanswered++
    else if (isAnswerCorrect(q, answer)) correct++
  }
  const incorrect = total - correct - unanswered
  return {
    total,
    correct,
    incorrect,
    unanswered,
    percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
  }
}

/** Format seconds as m:ss (or h:mm:ss above one hour). */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`
}
