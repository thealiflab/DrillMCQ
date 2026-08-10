/**
 * Split a raw paste into chunks small enough to reformat in one request.
 *
 * A formatting request has to *rewrite* everything it is given, so its output
 * is about as long as its input. One call covering a whole question bank
 * therefore runs into both the provider's output-token budget and the HTTP
 * timeout — which is what a large paste used to do. Chunking trades one long
 * request for several short ones.
 *
 * Pure: no React, no I/O — see the note at the top of `utils/ai`.
 */

/** A line that looks like the start of a numbered question ("12." / "Q3)"). */
const QUESTION_START_RE = /^\s*(?:q(?:uestion)?\s*)?\d+\s*[.):]/i

/**
 * Chunk on blank lines first, because that is where questions are separated in
 * every format this app understands, so a chunk boundary lands between
 * questions rather than inside one. A single blank-line block that is still too
 * big is broken on line boundaries, preferring a line that starts a new
 * question.
 *
 * Returns `[]` for blank input. Chunks are trimmed and never empty.
 */
export function chunkRawText(text: string, maxChars: number): string[] {
  if (text.trim() === '') return []

  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current.trim() !== '') chunks.push(current.trim())
    current = ''
  }

  for (const block of splitBlocks(text)) {
    for (const piece of block.length > maxChars ? splitOversized(block, maxChars) : [block]) {
      // +2 for the blank line that will rejoin them.
      if (current !== '' && current.length + piece.length + 2 > maxChars) flush()
      current = current === '' ? piece : `${current}\n\n${piece}`
    }
  }
  flush()

  return chunks
}

/** Blank-line separated blocks, blanks dropped. */
function splitBlocks(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
}

/**
 * Break a block that has no usable blank lines. Accumulates lines up to the
 * budget, but cuts early at a question start once the chunk is at least half
 * full — better a slightly small chunk than one split mid-question.
 */
function splitOversized(block: string, maxChars: number): string[] {
  const pieces: string[] = []
  let current = ''

  for (const line of block.split(/\r?\n/)) {
    const wouldOverflow = current !== '' && current.length + line.length + 1 > maxChars
    const goodBreak =
      current.length >= maxChars / 2 && QUESTION_START_RE.test(line)

    if (wouldOverflow || goodBreak) {
      pieces.push(current)
      current = ''
    }
    current = current === '' ? line : `${current}\n${line}`
  }
  if (current.trim() !== '') pieces.push(current)

  return pieces
}
