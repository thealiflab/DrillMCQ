import { findAnswerKey, type AnswerKeyEntry } from '../answerKey'
import { chunkRawText, countQuestionStarts, splitQuestionUnits } from './chunkRawText'

/**
 * Chunk a raw paste for the formatting workflow, keeping a bottom answer key
 * with the questions it answers.
 *
 * `chunkRawText` cuts on blank lines, so a paste that lists every question
 * first and the answer key last would send the key to the model in a chunk of
 * its own — the questions arrive with no answers and the key arrives with no
 * questions. Here the key is split off, the body is chunked as usual, and each
 * chunk gets back only the entries whose question numbers it actually contains.
 *
 * With no answer key present this is exactly `chunkRawText`.
 *
 * Pure: no React, no I/O — see the note at the top of `utils/ai`.
 */
export function chunkTextWithAnswerKey(text: string, maxChars: number): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const key = findAnswerKey(lines)
  if (!key) return chunkRawText(text, maxChars)

  const body = lines.slice(0, key.startIndex).join('\n')
  const keyText = renderKey(key.entries)

  // Leave room for the key block each chunk will carry: roughly its share of
  // the key, in proportion to the share of the body the chunk holds.
  const share = Math.ceil((keyText.length * maxChars) / Math.max(1, body.length))
  const budget = Math.max(Math.floor(maxChars / 2), maxChars - share - KEY_HEADING.length - 4)

  const chunks = chunkRawText(body, budget)
  if (chunks.length === 0) return chunkRawText(text, maxChars)
  // A single chunk holds every question, so it takes the whole key — which is
  // also the only thing that can work when the questions aren't numbered.
  if (chunks.length === 1) return [`${chunks[0]}\n\n${keyText}`]

  const byNumber = chunks.map((chunk) => {
    const numbers = questionNumbersIn(chunk)
    return key.entries.filter((entry) => numbers.has(entry.number))
  })

  // Nothing matched by number — the questions carry none. Fall back to handing
  // out the entries in order, but only when the questions counted across the
  // chunks agree exactly with the number of entries; a mismatch means we cannot
  // say which answer belongs where, and a wrong answer is worse than none.
  if (byNumber.every((entries) => entries.length === 0)) {
    // Numbered starts where there are any, question units otherwise (an
    // unnumbered bank). Either count can be wrong on a strange paste, which is
    // what the total check below is for.
    const counts = chunks.map((chunk) => countQuestionStarts(chunk) || splitQuestionUnits(chunk).length)
    const total = counts.reduce((sum, n) => sum + n, 0)
    if (total !== key.entries.length) return chunks

    let offset = 0
    return chunks.map((chunk, i) => {
      const slice = key.entries.slice(offset, offset + counts[i])
      offset += counts[i]
      // Renumbered 1..n: within the chunk the entries line up with the questions
      // in order, which is what the prompt tells the model to rely on.
      return slice.length === 0
        ? chunk
        : `${chunk}\n\n${renderKey(slice.map((entry, j) => ({ ...entry, number: j + 1 })))}`
    })
  }

  return chunks.map((chunk, i) =>
    byNumber[i].length === 0 ? chunk : `${chunk}\n\n${renderKey(byNumber[i])}`,
  )
}

const KEY_HEADING = 'ANSWER KEY'

function renderKey(entries: AnswerKeyEntry[]): string {
  const body = entries
    .map((e) => `${e.number}. ${e.raw}${e.explanation ? ` — ${e.explanation}` : ''}`)
    .join('\n')
  return `${KEY_HEADING}\n${body}`
}

/** Leading number of any "1." / "Q2)" / "(3)" line — question headers included. */
const LEADING_NUMBER_RE = /^\s*\(?(?:q(?:uestion)?\s*)?(\d{1,3})\)?\s*[.):]/i

/**
 * Numbers a chunk mentions at the start of a line. Over-inclusive on purpose
 * (a numbered *option* list counts too): sending one extra key entry along is
 * harmless, while dropping the entry a question needs loses its answer.
 */
function questionNumbersIn(chunk: string): Set<number> {
  const numbers = new Set<number>()
  for (const line of chunk.split('\n')) {
    const m = LEADING_NUMBER_RE.exec(line)
    if (m) numbers.add(Number(m[1]))
  }
  return numbers
}
