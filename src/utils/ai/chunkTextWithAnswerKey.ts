import { findAnswerKey, type AnswerKeyEntry } from '../answerKey'
import { chunkRawText } from './chunkRawText'

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

  return chunks.map((chunk) => {
    const numbers = questionNumbersIn(chunk)
    const entries = key.entries.filter((entry) => numbers.has(entry.number))
    return entries.length === 0 ? chunk : `${chunk}\n\n${renderKey(entries)}`
  })
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
