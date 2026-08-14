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
 * Chunk on question boundaries, so a chunk boundary lands between questions
 * rather than inside one.
 *
 * Blank lines are where questions are separated in every format this app
 * understands — but they are *also* where a messy paste separates a question
 * from its own options ("1. What is X?" ⏎⏎ "❏ A. …"). Packing raw blank-line
 * blocks therefore risks sending a stem to the model in one request and its
 * options in the next, and neither half can be formatted. So blocks are first
 * glued into question units (see `splitQuestionUnits`) and only whole units are
 * packed. A single unit that is still too big is broken on line boundaries,
 * preferring a line that starts a new question.
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

  for (const block of splitQuestionUnits(text)) {
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

/** First line of a block that starts a question: "12.", "Q3)", "Exam Question 5". */
const NUMBERED_START_RE = /^\s*\(?\d{1,3}\)?\s*[.):\]]\s*\S/
const LABELLED_START_RE = /^\s*q(?:uestion|ues|no?)?\s*[#№]?\s*\d{0,3}\s*[.):\]\-–—]\s*/i
const TITLED_START_RE = /^[\w\s'&()\-–—]{1,60}?\bquestions?\s*[#№]?\s*\d{1,3}\b/i

/** Any line that carries an option marker, tick and checkbox glyphs included. */
const OPTION_LINE_RE =
  /^(?:[❏☐▢□⬜◻▫○◯◽✓✔✅☑]\s*)?(?:\(?[A-Ha-h][.)\]:]\s+|[-*•▪◦]\s+|\(?\d{1,3}[.)\]:]\s+)/

/**
 * A block that is nothing but options. Numbered options ("1. Amazon S3") look
 * exactly like numbered question headers, which is the same ambiguity
 * `parseMcqText` resolves with its run-of-numbered-lines pre-pass; the rule here
 * matches it, so an option list can never start a unit and get torn off the
 * question above it.
 */
function isOptionListBlock(block: string): boolean {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (lines.length === 0 || !lines.every((line) => OPTION_LINE_RE.test(line))) return false
  // A lone numbered line that reads like a question ("2. What is 6 x 7?") is a
  // header; a short one with no question punctuation is an option on its own.
  if (lines.length === 1) return !/[?:]$/.test(lines[0]) && lines[0].length < 80
  return true
}

/** Does this block open a new question? */
function startsQuestion(block: string): boolean {
  const first = block.split('\n').find((line) => line.trim() !== '') ?? ''
  const marked =
    NUMBERED_START_RE.test(first) || LABELLED_START_RE.test(first) || TITLED_START_RE.test(first)
  return marked && !isOptionListBlock(block)
}

/**
 * Blank-line blocks glued into one string per question.
 *
 * A paste with no recognizable question start (unnumbered prose banks) is
 * returned as its blocks, exactly as it was chunked before question units
 * existed — there is nothing to group by, and guessing would be worse.
 */
export function splitQuestionUnits(text: string): string[] {
  const blocks = splitBlocks(text)
  if (!blocks.some(startsQuestion)) return blocks

  const units: string[] = []
  for (const block of blocks) {
    // Anything ahead of the first question start (a title, exam instructions)
    // stays on its own rather than being glued onto question one.
    if (units.length === 0 || startsQuestion(block)) units.push(block)
    else units[units.length - 1] += `\n\n${block}`
  }
  return units
}

/**
 * How many questions a piece of text opens. Used to hand a chunk its share of a
 * bottom answer key when the questions carry no numbers to match on.
 */
export function countQuestionStarts(text: string): number {
  return splitBlocks(text).filter(startsQuestion).length
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
