import { describe, expect, it } from 'vitest'
import { chunkRawText } from './chunkRawText'

/** Rebuild the original blocks so nothing is lost or duplicated. */
function blocksOf(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
}

function question(n: number, pad = ''): string {
  return `${n}. Question number ${n}?${pad}\n\nA. One\nB. Two\nC. Three\n\nAnswer: B`
}

describe('chunkRawText', () => {
  it('returns nothing for blank input', () => {
    expect(chunkRawText('', 100)).toEqual([])
    expect(chunkRawText('   \n\n  ', 100)).toEqual([])
  })

  it('keeps a small paste in one chunk', () => {
    const text = [question(1), question(2)].join('\n\n')
    expect(chunkRawText(text, 8000)).toEqual([text])
  })

  it('splits on blank lines without losing any block', () => {
    const source = Array.from({ length: 30 }, (_, i) => question(i + 1)).join('\n\n')
    const chunks = chunkRawText(source, 400)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flatMap(blocksOf)).toEqual(blocksOf(source))
  })

  it('never exceeds the budget when blocks fit inside it', () => {
    const source = Array.from({ length: 20 }, (_, i) => question(i + 1)).join('\n\n')
    for (const chunk of chunkRawText(source, 500)) {
      expect(chunk.length).toBeLessThanOrEqual(500)
    }
  })

  it('keeps a question with its options rather than splitting between them', () => {
    const source = Array.from({ length: 12 }, (_, i) => question(i + 1)).join('\n\n')
    for (const chunk of chunkRawText(source, 300)) {
      // Every chunk that opens a question must carry its answer line too.
      const opens = (chunk.match(/^\d+\. Question/gm) ?? []).length
      const answers = (chunk.match(/^Answer:/gm) ?? []).length
      expect(answers).toBe(opens)
    }
  })

  it('breaks a blank-line-free block at question starts', () => {
    const source = Array.from(
      { length: 8 },
      (_, i) => `${i + 1}. Question number ${i + 1}?\nA. One\nB. Two\nAnswer: B`,
    ).join('\n')

    const chunks = chunkRawText(source, 120)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.startsWith('1.') || /^\d+\./.test(chunk)).toBe(true)
    }
    // Nothing dropped: every line survives somewhere, in order.
    expect(chunks.join('\n').replace(/\n+/g, '\n')).toBe(source)
  })

  it('splits a single oversized block instead of emitting it whole', () => {
    const block = Array.from({ length: 40 }, (_, i) => `line ${i} of prose`).join('\n')
    const chunks = chunkRawText(block, 100)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('\n\n').replace(/\n+/g, '\n')).toBe(block)
  })
})
