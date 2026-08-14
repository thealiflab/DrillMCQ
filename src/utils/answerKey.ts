/**
 * Bottom answer-key detection.
 *
 * Exam dumps and printed practice tests very often list every question first
 * and put the answers in one block at the end:
 *
 *   ANSWER KEY
 *   1. C
 *   2 - A
 *   3: B, D — both are relational databases
 *
 * This module only *finds and reads* that block. Mapping entries onto questions
 * and resolving them against options stays in `parseMcqText`, so there is one
 * answer-resolution path and one question model.
 *
 * Pure: no React, no I/O — `utils/ai` imports it too.
 */

export interface AnswerKeyEntry {
  /** The question number the entry points at. */
  number: number
  /** Raw answer value ("C", "A, C"), fed to `resolveAnswers` by the caller. */
  raw: string
  /** Explanation given on the entry line or on a following "Explanation:" line. */
  explanation?: string
  /** 1-based line number of the entry. */
  line: number
}

export interface AnswerKeySection {
  /** Index of the first line belonging to the key (the heading, when there is one). */
  startIndex: number
  entries: AnswerKeyEntry[]
}

/**
 * Whole-line heading that introduces the key. Anchored end to end so a question
 * or an option mentioning "answers" can never match.
 */
const KEY_HEADING_RE =
  /^\s*(?:the\s+)?(?:correct\s+)?(?:answers?(?:\s*(?:key|sheet|list|section))?|answer\s*keys?|solutions?(?:\s*key)?|key|answers?\s*(?:,|&|and|\/)\s*(?:explanations?|solutions?|rationales?))\s*[:.\-–—]?\s*$/i

/**
 * One key entry. Deliberately narrow: the value may only be a letter or a
 * separator-joined list of letters, so a question header ("1. What is AWS?") or
 * a lettered option ("A. Amazon S3") cannot be mistaken for one. Anything after
 * a dash/colon following the letters is taken as an explanation.
 */
const KEY_ENTRY_RE =
  /^\s*\(?(\d{1,3})\)?\s*[.):\-–—]\s*([A-Ha-h](?:\s*(?:,|;|&|\/|\+|\band\b)\s*[A-Ha-h])*)\s*(?:[.)\]]\s*)?(?:[:\-–—]\s*(.*))?$/i

/** Same labels as the parser's inline explanations, so both styles read alike. */
const KEY_EXPLANATION_RE = /^\s*(?:explanation|reason|rationale|because|why)\s*[:\-–—]\s*(.*)$/i

/** Lines that may sit inside a key section without breaking it. */
function isSkippable(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '') return true
  // Decorative rules and page numbers printed under the key.
  return /^[-=_*~#•·.]{3,}$/.test(trimmed) || /^page\s*\d+(?:\s*(?:of|\/|-)\s*\d+)?$/i.test(trimmed)
}

interface ParsedEntryLine {
  number: number
  raw: string
  explanation?: string
}

function parseEntryLine(line: string): ParsedEntryLine | null {
  const m = KEY_ENTRY_RE.exec(line)
  if (!m) return null
  const explanation = m[3]?.trim()
  return {
    number: Number(m[1]),
    raw: m[2].trim(),
    ...(explanation ? { explanation } : {}),
  }
}

/**
 * Read the key section that starts at `startIndex`, or return `null` when the
 * lines from there to the end aren't one.
 *
 * `minEntries` is 1 behind an explicit heading (the heading is the evidence) and
 * 2 for a bare run of entries, where the run itself is the only evidence.
 */
function readSection(
  lines: string[],
  startIndex: number,
  minEntries: number,
): AnswerKeyEntry[] | null {
  const entries: AnswerKeyEntry[] = []
  let last: AnswerKeyEntry | undefined

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    if (isSkippable(line)) continue

    const entry = parseEntryLine(line)
    if (entry) {
      last = { ...entry, line: i + 1 }
      entries.push(last)
      continue
    }

    // An explanation line belongs to the entry above it.
    const explanation = KEY_EXPLANATION_RE.exec(line)
    if (explanation && last) {
      const text = explanation[1].trim()
      if (text !== '') {
        last.explanation = last.explanation ? `${last.explanation} ${text}` : text
      }
      continue
    }

    // Anything else means this run isn't a key section that reaches the end.
    return null
  }

  return entries.length >= minEntries ? entries : null
}

/**
 * Find a bottom answer key, if the paste has one.
 *
 * The section must run to the end of the text — that is what keeps a stray
 * "1. B" in the middle of a bank from being read as a key — and there must be
 * content above it, so a paste that is *only* an answer key is left alone.
 */
export function findAnswerKey(lines: string[]): AnswerKeySection | null {
  const hasContentBefore = (index: number) => lines.slice(0, index).some((l) => l.trim() !== '')

  // Prefer an explicit heading: scan from the end for the last one that is
  // followed by a valid key section.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!KEY_HEADING_RE.test(lines[i])) continue
    if (!hasContentBefore(i)) return null
    const entries = readSection(lines, i + 1, 1)
    if (entries) return { startIndex: i, entries }
  }

  // No heading: accept a trailing run of >=2 entries.
  let start = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isSkippable(lines[i])) continue
    if (parseEntryLine(lines[i]) === null && !KEY_EXPLANATION_RE.test(lines[i])) break
    start = i
  }
  if (start < 0 || !hasContentBefore(start)) return null

  const entries = readSection(lines, start, 2)
  return entries ? { startIndex: start, entries } : null
}
