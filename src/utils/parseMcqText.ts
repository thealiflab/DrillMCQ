import type { QuizQuestion } from '../types/quiz'

/**
 * Plain-text MCQ parser.
 *
 * Turns pasted exam dumps / practice questions into the app's QuizQuestion
 * schema. Line-based single pass with a small state machine, so it stays
 * fast for question banks with hundreds of entries.
 *
 * Supported shapes (mix and match):
 *   1. What does AWS stand for?          ← numbered or "Q1." / "Question:" headers
 *   A. Option / a) Option / (A) Option   ← lettered options
 *   - Option / * Option                  ← bulleted options
 *   1. Option (runs of ≥2 numbered lines under a question are options)
 *   Answer: B | Correct Answer: Canberra | Ans: 3
 *   Explanation: ... | Reason: ...
 *   Category: ... | Topic: ...
 */

export type IssueSeverity = 'error' | 'warning'

export interface ParseIssue {
  /** 1-based line number in the pasted text the issue points at. */
  line: number
  message: string
  severity: IssueSeverity
}

export interface ParsedMcq {
  questions: QuizQuestion[]
  issues: ParseIssue[]
  /** Question blocks that were detected but dropped due to errors. */
  skipped: number
}

// --- line classification -------------------------------------------------

type LineKind =
  | 'blank'
  | 'answer'
  | 'explanation'
  | 'category'
  | 'letterOption'
  | 'bulletOption'
  | 'numbered'
  | 'questionHeader'
  | 'text'

interface Classified {
  kind: LineKind
  /** Payload after the marker/label (option text, answer value, etc.). */
  value: string
  /** Option letter for letterOption lines. */
  label?: string
}

const ANSWER_RE = /^\s*(?:correct\s*answer|answer|ans|correct)\s*[:\-–—]\s*(.+)$/i
const EXPLANATION_RE = /^\s*(?:explanation|reason|rationale|because|why)\s*[:\-–—]\s*(.*)$/i
const CATEGORY_RE = /^\s*(?:category|topic|subject)\s*[:\-–—]\s*(.+)$/i
const LETTER_OPTION_RE = /^\s*\(?([A-Ha-h])[.)\]:]\s+(.+)$/
const BULLET_OPTION_RE = /^\s*[-*•▪◦]\s+(.+)$/
const NUMBERED_RE = /^\s*\(?(\d{1,3})[.)\]:]\s*(.+)$/
const QUESTION_HEADER_RE = /^\s*(?:question|q)\s*\d*\s*[:.)\]]\s*(.*)$/i

function classify(line: string): Classified {
  if (line.trim() === '') return { kind: 'blank', value: '' }

  let m = ANSWER_RE.exec(line)
  if (m) return { kind: 'answer', value: m[1].trim() }
  m = EXPLANATION_RE.exec(line)
  if (m) return { kind: 'explanation', value: m[1].trim() }
  m = CATEGORY_RE.exec(line)
  if (m) return { kind: 'category', value: m[1].trim() }
  m = LETTER_OPTION_RE.exec(line)
  if (m) return { kind: 'letterOption', value: m[2].trim(), label: m[1].toUpperCase() }
  m = BULLET_OPTION_RE.exec(line)
  if (m) return { kind: 'bulletOption', value: m[1].trim() }
  m = NUMBERED_RE.exec(line)
  if (m) return { kind: 'numbered', value: m[2].trim() }
  m = QUESTION_HEADER_RE.exec(line)
  if (m) return { kind: 'questionHeader', value: m[1].trim() }
  return { kind: 'text', value: line.trim() }
}

// --- answer resolution ---------------------------------------------------

/** Map a raw answer string ("B", "3", "b) Foo", "Foo") onto one option. */
function resolveAnswer(raw: string, options: string[]): string | null {
  const value = raw.trim().replace(/^["'(]+|[)"'.]+$/g, '').trim()
  if (value === '') return null

  const byIndex = (i: number) => (i >= 0 && i < options.length ? options[i] : null)
  const norm = (s: string) => s.trim().toLowerCase()

  // Exact option text match wins over letter interpretation
  // ("Answer: Canberra" beats treating "C..." as a label).
  const exact = options.find((o) => norm(o) === norm(value))
  if (exact) return exact

  // Bare letter: "B"
  if (/^[A-Ha-h]$/.test(value)) return byIndex(value.toUpperCase().charCodeAt(0) - 65)

  // Bare number: "3" → third option
  if (/^\d{1,3}$/.test(value)) return byIndex(Number(value) - 1)

  // Letter + text: "B. Amazon Web Services" / "(b) Amazon..."
  const labeled = /^\(?([A-Ha-h])[.)\]:]\s*(.*)$/.exec(value)
  if (labeled) {
    const rest = labeled[2].trim()
    if (rest !== '') {
      const match = options.find((o) => norm(o) === norm(rest))
      if (match) return match
    }
    return byIndex(labeled[1].toUpperCase().charCodeAt(0) - 65)
  }

  // Fuzzy: unique prefix match either way ("Answer: Canberra is the capital").
  const partial = options.filter(
    (o) => norm(o).startsWith(norm(value)) || norm(value).startsWith(norm(o)),
  )
  if (partial.length === 1) return partial[0]

  return null
}

// --- main parse ----------------------------------------------------------

interface RawQuestion {
  startLine: number
  questionLines: string[]
  options: { text: string; line: number }[]
  answerRaw?: string
  answerLine?: number
  explanationLines: string[]
  category?: string
}

function emptyRaw(startLine: number): RawQuestion {
  return { startLine, questionLines: [], options: [], explanationLines: [] }
}

function hasContent(raw: RawQuestion): boolean {
  return raw.questionLines.length > 0 || raw.options.length > 0
}

/** A question that already has options and an answer — new prose starts the next one. */
function isComplete(raw: RawQuestion): boolean {
  return raw.options.length >= 2 && raw.answerRaw !== undefined
}

export function parseMcqText(text: string): ParsedMcq {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const classified = lines.map(classify)

  // Disambiguate numbered lines: a run of >=2 consecutive numbered lines is
  // an option list ("1. x / 2. y"); an isolated numbered line starts a new
  // question ("1. What does AWS stand for?").
  const numberedIsOption = new Array<boolean>(lines.length).fill(false)
  for (let i = 0; i < classified.length; i++) {
    if (classified[i].kind !== 'numbered') continue
    let end = i
    while (end + 1 < classified.length && classified[end + 1].kind === 'numbered') end++
    const isRun = end > i
    for (let j = i; j <= end; j++) numberedIsOption[j] = isRun
    i = end
  }

  const issues: ParseIssue[] = []
  const rawQuestions: RawQuestion[] = []
  let current = emptyRaw(1)
  let inExplanation = false
  let lastWasBlank = false

  const flush = (nextStart: number) => {
    if (hasContent(current)) rawQuestions.push(current)
    current = emptyRaw(nextStart)
    inExplanation = false
  }

  for (let i = 0; i < lines.length; i++) {
    const { kind, value, label } = classified[i]
    const lineNo = i + 1

    switch (kind) {
      case 'blank':
        // Blank lines end an explanation block but are otherwise soft separators.
        inExplanation = false
        break

      case 'answer':
        current.answerRaw = value
        current.answerLine = lineNo
        inExplanation = false
        break

      case 'explanation':
        current.explanationLines.push(value)
        inExplanation = true
        break

      case 'category':
        current.category = value
        inExplanation = false
        break

      case 'questionHeader':
        flush(lineNo)
        if (value !== '') current.questionLines.push(value)
        break

      case 'letterOption':
      case 'bulletOption': {
        // Options belong to the current question; if a complete question is
        // above us, an option can't start a new one — but options appearing
        // after an answer usually mean a new (header-less) question began.
        if (isComplete(current)) flush(lineNo)
        if (label && current.options.length === 0 && label !== 'A') {
          issues.push({
            line: lineNo,
            message: `Options start at "${label}" — earlier options may not have been detected.`,
            severity: 'warning',
          })
        }
        current.options.push({ text: value, line: lineNo })
        inExplanation = false
        break
      }

      case 'numbered':
        if (numberedIsOption[i] && current.questionLines.length > 0) {
          if (isComplete(current)) flush(lineNo)
          current.options.push({ text: value, line: lineNo })
          inExplanation = false
        } else {
          // Isolated number (or no question text yet) → new question header.
          flush(lineNo)
          current.questionLines.push(value)
        }
        break

      case 'text':
        if (inExplanation) {
          current.explanationLines.push(value)
        } else if (isComplete(current) || (current.options.length > 0 && lastWasBlank)) {
          // Prose after a finished question — or after a blank line below an
          // option list — begins the next (unnumbered) question.
          flush(lineNo)
          current.questionLines.push(value)
        } else if (current.options.length > 0) {
          // Wrapped option text (no blank in between) continues the previous option.
          current.options[current.options.length - 1].text += ` ${value}`
        } else {
          current.questionLines.push(value)
        }
        break
    }

    lastWasBlank = kind === 'blank'
  }
  flush(lines.length)

  // --- validate + convert to QuizQuestion --------------------------------
  const questions: QuizQuestion[] = []
  let skipped = 0

  for (const raw of rawQuestions) {
    const questionText = raw.questionLines.join(' ').trim()
    const excerpt = questionText.slice(0, 60) || `block at line ${raw.startLine}`

    if (questionText === '') {
      issues.push({
        line: raw.startLine,
        message: 'Found options without any question text — block skipped.',
        severity: 'error',
      })
      skipped++
      continue
    }
    if (raw.options.length < 2) {
      issues.push({
        line: raw.startLine,
        message: `"${excerpt}": needs at least 2 options (found ${raw.options.length}) — skipped.`,
        severity: 'error',
      })
      skipped++
      continue
    }

    const options = raw.options.map((o) => o.text)
    const duplicates = options.filter((o, idx) => options.indexOf(o) !== idx)
    if (duplicates.length > 0) {
      issues.push({
        line: raw.startLine,
        message: `"${excerpt}": duplicate option "${duplicates[0]}".`,
        severity: 'warning',
      })
    }

    if (raw.answerRaw === undefined) {
      issues.push({
        line: raw.startLine,
        message: `"${excerpt}": no "Answer:" line found — skipped.`,
        severity: 'error',
      })
      skipped++
      continue
    }

    const correctAnswer = resolveAnswer(raw.answerRaw, options)
    if (correctAnswer === null) {
      issues.push({
        line: raw.answerLine ?? raw.startLine,
        message: `"${excerpt}": answer "${raw.answerRaw}" doesn't match any option — skipped.`,
        severity: 'error',
      })
      skipped++
      continue
    }

    const explanation = raw.explanationLines.join(' ').trim()
    questions.push({
      id: questions.length + 1,
      question: questionText,
      options,
      correctAnswer,
      ...(explanation !== '' && { explanation }),
      ...(raw.category && { category: raw.category }),
    })
  }

  if (questions.length === 0 && issues.length === 0 && text.trim() !== '') {
    issues.push({
      line: 1,
      message: 'No questions detected. Check that each question has options and an "Answer:" line.',
      severity: 'error',
    })
  }

  return { questions, issues, skipped }
}
