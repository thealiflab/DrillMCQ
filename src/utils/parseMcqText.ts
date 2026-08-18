import type { QuizQuestion } from '../types/quiz'
import { findAnswerKey, type AnswerKeyEntry } from './answerKey'

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
 * Answers may also arrive as one key at the *bottom* of the paste — see
 * `utils/answerKey.ts` for the shapes recognized. Such a key is split off before
 * the state machine runs and applied to the parsed questions afterwards, so it
 * shares the option-matching and error reporting of an inline "Answer:" line.
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
  | 'checkedOption'
  | 'numbered'
  | 'questionHeader'
  | 'text'

interface Classified {
  kind: LineKind
  /** Payload after the marker/label (option text, answer value, etc.). */
  value: string
  /** Option letter for letterOption/checkedOption lines. */
  label?: string
  /** Question number for numbered/questionHeader lines, used to match a bottom answer key. */
  number?: number
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

// "Sol:" / "Soln:" / "Solution:" are how textbook and coaching-site dumps
// label the answer; they mean exactly what "Answer:" means here.
const ANSWER_RE =
  /^\s*(?:correct\s*answers?|answers?|ans|correct|solutions?|soln?)\s*[:\-–—]\s*(.+)$/i
const EXPLANATION_RE = /^\s*(?:explanation|reason|rationale|because|why)\s*[:\-–—]\s*(.*)$/i
const CATEGORY_RE = /^\s*(?:category|topic|subject)\s*[:\-–—]\s*(.+)$/i
const LETTER_OPTION_RE = /^\s*\(?([A-Ha-h])[.)\]:]\s+(.+)$/
const BULLET_OPTION_RE = /^\s*[-*•▪◦]\s+(.+)$/
const NUMBERED_RE = /^\s*\(?(\d{1,3})[.)\]:]\s*(.+)$/
const QUESTION_HEADER_RE = /^\s*(?:question|q)\s*(\d*)\s*[:.)\]]\s*(.*)$/i
// A header carrying a title in front of the numbering: "AI Practitioner Exam
// Question 1", "Set B — Question 12:". The prefix charclass excludes sentence
// punctuation and the number after "question" is required, so ordinary prose
// ("…which answers this question?") can't match.
const TITLED_HEADER_RE =
  /^[\w\s'&()\-–—]{1,60}?\bquestions?\s*[#№]?\s*(\d{1,3})\s*[:.)\]\-–—]?\s*(.*)$/i

// Empty checkbox/radio glyphs that exam dumps put in front of every option.
const UNCHECKED_MARK_RE = /^\s*[❏☐▢□⬜◻▫○◯◽]\s*/
// The same, but ticked — the paste's way of pointing at the correct option.
const CHECKED_MARK_RE = /^\s*[✓✔✅☑]\s*/
/** Leading option marker on a checked line: "B. text", "(b) text", "3) text". */
const CHECKED_LABEL_RE = /^\(?([A-Ha-h])[.)\]:]\s+/

function classify(line: string): Classified {
  if (line.trim() === '') return { kind: 'blank', value: '' }
  // Noise wins before everything else: patterns are full-line anchored, so a
  // real answer/option line ("Answer: B", "A. Share") can't be swallowed.
  if (isNoise(line)) return { kind: 'noise', value: '' }

  const checked = CHECKED_MARK_RE.exec(line)
  if (checked) {
    const rest = line.slice(checked[0].length).trim()
    if (rest !== '') {
      const labelled = CHECKED_LABEL_RE.exec(rest)
      return {
        kind: 'checkedOption',
        value: rest,
        ...(labelled && { label: labelled[1].toUpperCase() }),
      }
    }
  }

  // An empty checkbox is pure decoration: strip it and classify what's behind
  // it, so "❏ A. Foo" is a letter option and "❏ Foo" is a bullet option.
  const unchecked = UNCHECKED_MARK_RE.exec(line)
  if (unchecked) {
    const rest = line.slice(unchecked[0].length)
    if (rest.trim() !== '') {
      const inner = classifyBody(rest)
      // The glyph itself is a bullet, so unlabelled text behind it is an option.
      return inner.kind === 'text' ? { kind: 'bulletOption', value: inner.value } : inner
    }
  }

  return classifyBody(line)
}

function classifyBody(line: string): Classified {
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
  if (m) return { kind: 'numbered', value: m[2].trim(), number: Number(m[1]) }
  m = QUESTION_HEADER_RE.exec(line)
  if (m) {
    return {
      kind: 'questionHeader',
      value: m[2].trim(),
      ...(m[1] !== '' && { number: Number(m[1]) }),
    }
  }
  m = TITLED_HEADER_RE.exec(line)
  if (m) return { kind: 'questionHeader', value: m[2].trim(), number: Number(m[1]) }
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

  // "(c) Both (a) and (b)." — a label in front of the option's own words. This
  // has to be tried before the split too, for the same reason the exact match
  // above does: an option containing "and"/"," would otherwise be shredded
  // into a multi-answer the paste never meant.
  const labelled = /^\(?([A-Ha-h])[.)\]:]\s*(.+)$/.exec(value)
  if (labelled) {
    const rest = labelled[2].trim().replace(/[.;,]+$/, '')
    const match = options.find((o) => norm(o) === norm(rest))
    if (match) return [match]
  }

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
  /** Number carried by the header ("3." / "Q3." / "Exam Question 3"), if any. */
  number?: number
  questionLines: string[]
  options: { text: string; line: number }[]
  answerRaw?: string
  answerLine?: number
  /** Entry from a bottom answer key that matched this question. */
  keyAnswer?: AnswerKeyEntry
  /** True when `answerRaw` came from the answer key rather than an inline line. */
  answerFromKey?: boolean
  /** Options pointed at by a "✓" marker instead of an "Answer:" line. */
  checkedAnswers: { raw: string; line: number }[]
  /** True once an option carried an A./B./… label, so ticks can be read against it. */
  labelledOptions?: boolean
  explanationLines: string[]
  category?: string
}

function emptyRaw(startLine: number): RawQuestion {
  return { startLine, questionLines: [], options: [], checkedAnswers: [], explanationLines: [] }
}

function hasContent(raw: RawQuestion): boolean {
  return raw.questionLines.length > 0 || raw.options.length > 0
}

/** A question that already has options and an answer — new prose starts the next one. */
function isComplete(raw: RawQuestion): boolean {
  return raw.options.length >= 2 && (raw.answerRaw !== undefined || raw.checkedAnswers.length > 0)
}

/** A line that closed a sentence: "…for retrieval." / "…done!" / "(see below.)" */
const SENTENCE_END_RE = /[.!?][)"'”’\]]?$/

/**
 * Whether prose sitting directly under an explanation starts the next question
 * instead of continuing that explanation.
 *
 * Pastes with no blank line between questions put the next stem on the line
 * right after "Explanation: …", while a hard-wrapped explanation puts its own
 * continuation there — and both are plain prose. The sentence above settles it:
 * a wrapped line breaks mid-sentence, so an explanation that already closed
 * with "." has said what it was going to say. Only a question that is already
 * complete can be ended this way, so an explanation above an unfinished block
 * still absorbs everything that follows it.
 */
function explanationIsFinished(raw: RawQuestion): boolean {
  if (!isComplete(raw)) return false
  const last = raw.explanationLines[raw.explanationLines.length - 1]
  return last !== undefined && SENTENCE_END_RE.test(last.trim())
}

/**
 * Stricter form used on option lines only: an option below an "Answer:" line
 * means a new question began, but a "✓" tick applied *inside* an option list
 * doesn't end anything — the options after it still belong to this question.
 */
function answeredByLine(raw: RawQuestion): boolean {
  return raw.options.length >= 2 && raw.answerRaw !== undefined
}

/**
 * Attach a bottom answer key to the questions parsed above it.
 *
 * Matching is by question number when every question carries a unique one;
 * otherwise strictly positional, and only when the key numbers are exactly
 * 1..N for the N questions found. Anything less certain than that assigns
 * nothing and says so — a wrong answer silently attached to a question is far
 * worse than a question reported as unanswered.
 */
function applyAnswerKey(
  rawQuestions: RawQuestion[],
  entries: AnswerKeyEntry[],
  keyLine: number,
  issues: ParseIssue[],
): void {
  if (rawQuestions.length === 0 || entries.length === 0) return

  const numbers = rawQuestions.map((q) => q.number)
  const numbered =
    numbers.every((n): n is number => n !== undefined) &&
    new Set(numbers).size === numbers.length

  const byNumber = new Map<number, RawQuestion>()
  if (numbered) {
    rawQuestions.forEach((q) => byNumber.set(q.number as number, q))
  } else {
    // Positional fallback: only safe when the key is a complete 1..N list.
    const keyNumbers = [...new Set(entries.map((e) => e.number))].sort((a, b) => a - b)
    const isSequential =
      keyNumbers.length === entries.length &&
      keyNumbers.length === rawQuestions.length &&
      keyNumbers.every((n, i) => n === i + 1)
    if (!isSequential) {
      issues.push({
        line: keyLine,
        message: `Answer key found, but its ${entries.length} entries couldn't be matched to the ${rawQuestions.length} question(s) detected — key ignored.`,
        severity: 'warning',
      })
      return
    }
    rawQuestions.forEach((q, i) => byNumber.set(i + 1, q))
  }

  const seen = new Set<number>()
  for (const entry of entries) {
    if (seen.has(entry.number)) {
      issues.push({
        line: entry.line,
        message: `Answer key lists question ${entry.number} more than once — entry ignored.`,
        severity: 'warning',
      })
      continue
    }
    seen.add(entry.number)

    const question = byNumber.get(entry.number)
    if (!question) {
      issues.push({
        line: entry.line,
        message: `Answer key entry ${entry.number} has no matching question — ignored.`,
        severity: 'warning',
      })
      continue
    }

    question.keyAnswer = entry
    // An inline answer or tick is the more local signal and wins; the key is
    // still kept so a disagreement can be reported during validation.
    if (question.answerRaw === undefined && question.checkedAnswers.length === 0) {
      question.answerRaw = entry.raw
      question.answerLine = entry.line
      question.answerFromKey = true
    }
    if (entry.explanation && question.explanationLines.length === 0) {
      question.explanationLines.push(entry.explanation)
    }
  }
}

export function parseMcqText(text: string): ParsedMcq {
  const allLines = text.replace(/\r\n?/g, '\n').split('\n')

  // A bottom answer key is split off before anything else: the state machine
  // never sees it, so its entries can't be read as questions or options.
  const answerKey = findAnswerKey(allLines)
  const lines = answerKey ? allLines.slice(0, answerKey.startIndex) : allLines
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
    const { kind, value, label, number } = classified[i]
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
        current.number = number
        if (value !== '') current.questionLines.push(value)
        break

      case 'letterOption':
      case 'bulletOption': {
        // Options belong to the current question; if a complete question is
        // above us, an option can't start a new one — but options appearing
        // after an answer usually mean a new (header-less) question began.
        if (answeredByLine(current)) flush(lineNo)
        if (label && current.options.length === 0 && label !== 'A') {
          issues.push({
            line: lineNo,
            message: `Options start at "${label}" — earlier options may not have been detected.`,
            severity: 'warning',
          })
        }
        if (label) current.labelledOptions = true
        current.options.push({ text: value, line: lineNo })
        inExplanation = false
        break
      }

      case 'checkedOption': {
        // A ticked line always names the correct answer. Whether it is *also* a
        // new option depends on the layout: dumps either tick one entry inside
        // the option list, or repeat the winning entry below the whole list.
        // The label settles it — a letter that already has an option above it
        // is a repeat; one past the end is the next option being introduced.
        const body = value.replace(CHECKED_LABEL_RE, '').trim()
        const bareLabel = /^\(?(?:[A-Ha-h]|\d{1,3})[.)\]:]?$/.test(value)
        const labelIndex = label ? label.charCodeAt(0) - 65 : -1
        const isRepeat =
          bareLabel ||
          body === '' ||
          (labelIndex >= 0 && labelIndex < current.options.length) ||
          current.options.some((o) => o.text.trim().toLowerCase() === body.toLowerCase()) ||
          // No label of its own under a lettered list: it can only be pointing
          // back at one of those options, never introducing a new one.
          (labelIndex < 0 && current.labelledOptions === true)

        if (!isRepeat) {
          if (answeredByLine(current)) flush(lineNo)
          if (label && current.options.length === 0 && label !== 'A') {
            issues.push({
              line: lineNo,
              message: `Options start at "${label}" — earlier options may not have been detected.`,
              severity: 'warning',
            })
          }
          if (label) current.labelledOptions = true
          current.options.push({ text: body, line: lineNo })
        }
        current.checkedAnswers.push({ raw: value, line: lineNo })
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
          current.number = number
          current.questionLines.push(value)
        }
        break

      case 'text':
        if (inExplanation && !explanationIsFinished(current)) {
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

  if (answerKey) {
    applyAnswerKey(rawQuestions, answerKey.entries, answerKey.startIndex + 1, issues)
  }

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

    if (raw.answerRaw === undefined && raw.checkedAnswers.length === 0) {
      issues.push({
        line: raw.startLine,
        message: answerKey
          ? `"${excerpt}": no "Answer:" line, and the answer key has no entry for it — skipped.`
          : `"${excerpt}": no "Answer:" line found — skipped.`,
        severity: 'error',
      })
      skipped++
      continue
    }

    // An explicit "Answer:" line wins when both are present — it's the more
    // deliberate signal, and the ticked lines have already contributed options.
    let correctAnswers: string[] | null
    let answerLine = raw.answerLine ?? raw.startLine
    let answerDesc = raw.answerRaw ?? ''
    if (raw.answerRaw !== undefined) {
      correctAnswers = resolveAnswers(raw.answerRaw, options)
    } else {
      // Each tick is resolved on its own — never through resolveAnswers, whose
      // separator split would shred a single answer containing " and "/",".
      const resolved: string[] = []
      correctAnswers = resolved
      for (const checked of raw.checkedAnswers) {
        const option = resolveAnswer(checked.raw, options)
        if (option === null) {
          correctAnswers = null
          answerLine = checked.line
          answerDesc = checked.raw
          break
        }
        if (!resolved.includes(option)) resolved.push(option)
      }
    }

    if (correctAnswers === null || correctAnswers.length === 0) {
      issues.push({
        line: answerLine,
        message: raw.answerFromKey
          ? `"${excerpt}": answer key entry "${answerDesc}" doesn't match any option — skipped.`
          : `"${excerpt}": answer "${answerDesc}" doesn't match any option — skipped.`,
        severity: 'error',
      })
      skipped++
      continue
    }

    // Both an inline answer and a key entry: the inline one was used above, so
    // a disagreement has to be surfaced rather than quietly resolved.
    if (raw.keyAnswer && !raw.answerFromKey) {
      const fromKey = resolveAnswers(raw.keyAnswer.raw, options)
      const differs =
        fromKey === null ||
        fromKey.length !== correctAnswers.length ||
        fromKey.some((o) => !correctAnswers.includes(o))
      if (differs) {
        issues.push({
          line: raw.keyAnswer.line,
          message: `"${excerpt}": the answer key says "${raw.keyAnswer.raw}" but the question's own answer says "${correctAnswers.join(', ')}" — the question's own answer was used.`,
          severity: 'warning',
        })
      }
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
