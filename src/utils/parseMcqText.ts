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
 *   Answer: A, C | Answer: a, b and d      ← two or more = multi-select
 *   Explanation: ... | Reason: ...
 *   Category: ... | Topic: ...
 *
 * Clutter copied along from websites/PDFs (ads, page numbers, "Show Answer"
 * buttons, share widgets, breadcrumbs, copyright footers, …) is recognized by
 * NOISE_RES and silently ignored, reported via `ignored`.
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
  /** Lines ignored as website/PDF clutter (ads, page numbers, nav links, …). */
  ignored: number
}

// --- line classification -------------------------------------------------

type LineKind =
  | 'blank'
  | 'noise'
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

/**
 * Clutter that rides along when copying from websites, PDFs, blogs, or exam
 * dumps. Every pattern is anchored to the whole (trimmed) line so real
 * content — "A. Share price rises", "1. Facebook was founded in…" — never
 * matches: the option/number marker keeps the line from matching full-line.
 */
const NOISE_RES: RegExp[] = [
  // Bare URLs and emails on their own line.
  /^(?:https?:\/\/|www\.)\S+$/i,
  /^\S+@\S+\.\S{2,}$/,
  // Horizontal rules / decorative separators: ----, ====, ***, ····
  /^[-=_*~#•·.]{3,}$/,
  // Copyright and footer boilerplate.
  /^(?:©|\(c\)\s*\d{4}|copyright\s*(?:©|\(c\)|\d{4})).*$/i,
  /\ball rights reserved\b/i,
  /^downloaded from\b.*$/i,
  // Ads.
  /^(?:advertisements?|sponsored(?:\s+(?:links?|content|posts?))?|promoted)$/i,
  // Page numbers: "Page 3", "Page 3 of 10", "3 / 10", "3 of 10", lone "3".
  /^page\s*\d+(?:\s*(?:of|\/|-)\s*\d+)?$/i,
  /^\d{1,4}\s*(?:of|\/)\s*\d{1,4}$/i,
  /^\d{1,4}$/,
  // Quiz-site UI chrome around the answer.
  /^(?:show|hide|view|check|reveal|see|display)\s+(?:the\s+)?(?:correct\s+)?answers?[.!»→]*$/i,
  /^answers?\s*[&/]\s*(?:explanations?|solutions?)$/i,
  /^(?:answers?|solutions?|explanations?)$/i,
  // Navigation buttons and quiz controls.
  /^[«‹<←]*\s*(?:next|previous|prev|back|submit|skip|continue|finish|start\s+quiz|restart|try\s+again)(?:\s+(?:question|quiz|page))?\s*[»›>→]*$/i,
  // Social / engagement widgets.
  /^(?:share(?:\s+(?:this|on|via)\b.*)?|print|bookmark|save|like|upvote|downvote|report(?:\s+(?:this\s+)?(?:question|error|issue|ad))?|discuss(?:ion)?(?:\s+forum)?|comments?(?:\s*[(:]?\s*\d+\)?)?|reply|copy\s+link|follow\s+us\b.*)$/i,
  /^(?:facebook|twitter|whatsapp|telegram|linkedin|instagram|pinterest|reddit|youtube)$/i,
  // Breadcrumb trails: "Home > Exams > AWS Practice Test".
  /^(?:home|index)\s*[>»/].*$/i,
  // Calls to action and link teasers.
  /^(?:read\s+more\b.*|learn\s+more\b.*|click\s+here\b.*|see\s+also\b.*|sign\s*up|log\s*in|login|register|subscribe|join\s+(?:us|now|our)\b.*|download\s+(?:pdf|app|now)\b.*|get\s+the\s+app\b.*|install\s+(?:our\s+)?app\b.*|visit\b.*|also\s+read\b.*|related\s+(?:posts?|questions?|articles?|topics?)\b.*|(?:you\s+)?may\s+also\s+like\b.*|trending\b.*|popular\s+posts?\b.*)[:.…»→]*$/i,
  // Author lines and timestamps.
  /^(?:posted|published|updated|last\s+(?:updated|modified)|reviewed|created)\b.*$/i,
  /^(?:by\s+admin|author\s*[:\-–—].*|written\s+by\b.*)$/i,
  /^views?\s*[:\-–—]?\s*[\d,.]+[km]?$/i,
  // Loading indicators.
  /^(?:loading|please\s+wait)[.…]*$/i,
  // Exam-dump metadata that isn't part of the question.
  /^(?:marks?|difficulty|level|time(?:\s+limit)?|duration|negative\s+marking)\s*[:\-–—]\s*.+$/i,
]

function isNoise(line: string): boolean {
  const trimmed = line.trim()
  return NOISE_RES.some((re) => re.test(trimmed))
}

const ANSWER_RE = /^\s*(?:correct\s*answers?|answers?|ans|correct)\s*[:\-–—]\s*(.+)$/i
const EXPLANATION_RE = /^\s*(?:explanation|reason|rationale|because|why)\s*[:\-–—]\s*(.*)$/i
const CATEGORY_RE = /^\s*(?:category|topic|subject)\s*[:\-–—]\s*(.+)$/i
const LETTER_OPTION_RE = /^\s*\(?([A-Ha-h])[.)\]:]\s+(.+)$/
const BULLET_OPTION_RE = /^\s*[-*•▪◦]\s+(.+)$/
const NUMBERED_RE = /^\s*\(?(\d{1,3})[.)\]:]\s*(.+)$/
const QUESTION_HEADER_RE = /^\s*(?:question|q)\s*\d*\s*[:.)\]]\s*(.*)$/i

function classify(line: string): Classified {
  if (line.trim() === '') return { kind: 'blank', value: '' }
  // Noise wins before everything else: patterns are full-line anchored, so a
  // real answer/option line ("Answer: B", "A. Share") can't be swallowed.
  if (isNoise(line)) return { kind: 'noise', value: '' }

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

/** Separators between the parts of a multi-answer line: "A, C", "A and C". */
const ANSWER_SEPARATOR_RE = /\s*(?:,|;|&|\/|\+|\band\b)\s*/i

/**
 * Map a raw answer string onto one *or more* options, which is what decides
 * whether the question ends up single- or multi-select.
 *
 * Order matters: an exact option match has to be tried on the whole value
 * first, or a legitimate single answer containing a separator ("Atomicity,
 * Consistency, Isolation, Durability") would be shredded into pieces.
 */
function resolveAnswers(raw: string, options: string[]): string[] | null {
  const value = raw.trim()
  const norm = (s: string) => s.trim().toLowerCase()

  const exact = options.find((o) => norm(o) === norm(value))
  if (exact) return [exact]

  // "A, C" / "a, b and d" / "B; D": every part has to land on a distinct
  // option, otherwise this wasn't a list and the single-answer path is right.
  const parts = value
    .split(ANSWER_SEPARATOR_RE)
    .map((p) => p.trim())
    .filter((p) => p !== '')
  if (parts.length >= 2) {
    const resolved: string[] = []
    for (const part of parts) {
      const option = resolveAnswer(part, options)
      if (option === null || resolved.includes(option)) {
        resolved.length = 0
        break
      }
      resolved.push(option)
    }
    if (resolved.length === parts.length) return resolved
  }

  const single = resolveAnswer(value, options)
  return single === null ? null : [single]
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
    // A numbered line that reads like a question ("2. What is 6 x 7?")
    // directly followed by ≥2 numbered options is a header, not an option.
    let start = i
    if (end - start >= 2 && /[?:]$/.test(classified[start].value)) start++
    const isRun = end > start
    for (let j = i; j <= end; j++) numberedIsOption[j] = isRun && j >= start
    i = end
  }

  const issues: ParseIssue[] = []
  const rawQuestions: RawQuestion[] = []
  let current = emptyRaw(1)
  let inExplanation = false
  let lastWasBlank = false
  let ignored = 0

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

      case 'noise':
        // Website/PDF clutter: invisible to the question being built, but it
        // separates content like a blank line does (ads and nav chrome sit at
        // question boundaries), so prose after it starts a new question.
        ignored++
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

    lastWasBlank = kind === 'blank' || kind === 'noise'
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

    const correctAnswers = resolveAnswers(raw.answerRaw, options)
    if (correctAnswers === null) {
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
      correctAnswers,
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

  return { questions, issues, skipped, ignored }
}
