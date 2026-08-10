/**
 * Split a quiz-JSON paste into chunks small enough to repair in one request,
 * and merge the repaired pieces back into one array.
 *
 * Same problem as `chunkRawText`: a repair request reproduces its whole input,
 * so a large question bank in one call runs out of output budget and time. The
 * difference is where it is safe to cut — here that is between the top-level
 * objects of the array, which this scans for directly.
 *
 * The input is *broken* JSON by assumption, so the scan is deliberately
 * tolerant and gives up rather than guessing: an unbalanced or unterminated
 * source yields no split, and the caller sends it as a single chunk.
 *
 * Pure: no React, no I/O.
 */

/**
 * Raw source slices of the top-level `{…}` objects, in order.
 *
 * Only brace depth is tracked, with string and escape awareness so a `{` inside
 * a question never opens a level. Returns `[]` when the text ends mid-string or
 * mid-object, which is exactly the corruption case where cutting would do harm.
 */
export function splitJsonObjects(text: string): string[] {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = i
      depth++
      continue
    }
    if (char === '}') {
      depth--
      // A stray `}` means the source is beyond a safe split.
      if (depth < 0) return []
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  // Left inside a string or an object: don't pretend to understand it.
  if (inString || depth !== 0) return []
  return objects
}

/**
 * Group the pasted questions into array-shaped chunks under `maxChars`.
 *
 * Falls back to a single chunk — the text exactly as pasted — when the source
 * can't be split or is small enough already, so the caller has one code path.
 */
export function chunkRawJson(text: string, maxChars: number): string[] {
  if (text.trim() === '') return []
  if (text.length <= maxChars) return [text.trim()]

  const objects = splitJsonObjects(text)
  if (objects.length < 2) return [text.trim()]

  const chunks: string[] = []
  let current: string[] = []
  let size = 0

  for (const object of objects) {
    // +4 covers the brackets and separator wrapping adds back.
    if (current.length > 0 && size + object.length + 4 > maxChars) {
      chunks.push(wrap(current))
      current = []
      size = 0
    }
    current.push(object)
    size += object.length + 2
  }
  if (current.length > 0) chunks.push(wrap(current))

  return chunks
}

function wrap(objects: string[]): string {
  return `[\n${objects.join(',\n')}\n]`
}

/**
 * Rejoin repaired chunks into one array.
 *
 * Each chunk comes back as its own `[…]`, so the brackets are peeled off and
 * the bodies concatenated. A chunk that isn't bracketed — a model that returned
 * a bare object, or a raw chunk passed through untouched after a failure — is
 * kept as-is, so nothing the user pasted is ever dropped on the floor.
 */
export function mergeJsonChunks(chunks: string[]): string {
  const bodies = chunks
    .map((chunk) => unwrap(chunk))
    .filter((body) => body !== '')

  if (bodies.length === 0) return ''
  if (bodies.length === 1 && !chunks[0].trim().startsWith('[')) return bodies[0]
  return `[\n${bodies.join(',\n')}\n]`
}

function unwrap(chunk: string): string {
  const trimmed = chunk.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return trimmed
  return trimmed.slice(1, -1).trim()
}
