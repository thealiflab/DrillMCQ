import { describe, expect, it } from 'vitest'
import { chunkRawJson, mergeJsonChunks, splitJsonObjects } from './chunkRawJson'

function question(n: number, extra = ''): string {
  return `{
  "id": ${n},
  "question": "Question number ${n}?",
  "options": ["One", "Two", "Three"],
  "correctAnswers": ["Two"]${extra}
}`
}

function bank(count: number): string {
  return `[\n${Array.from({ length: count }, (_, i) => question(i + 1)).join(',\n')}\n]`
}

describe('splitJsonObjects', () => {
  it('finds each top-level object', () => {
    expect(splitJsonObjects(bank(3))).toHaveLength(3)
  })

  it('ignores braces inside strings', () => {
    const source = `[{"id":1,"question":"What does {x} mean?","options":["a","b"]}]`
    const objects = splitJsonObjects(source)
    expect(objects).toHaveLength(1)
    expect(objects[0]).toContain('{x}')
  })

  it('ignores escaped quotes inside strings', () => {
    const source = `[{"id":1,"question":"He said \\"hi\\" }"},{"id":2}]`
    expect(splitJsonObjects(source)).toHaveLength(2)
  })

  it('gives up on a source that ends mid-object', () => {
    expect(splitJsonObjects('[{"id":1,"question":"x"')).toEqual([])
  })

  it('gives up on a source that ends mid-string', () => {
    expect(splitJsonObjects('[{"id":1,"question":"unterminated}]')).toEqual([])
  })

  it('gives up on an unbalanced closing brace', () => {
    expect(splitJsonObjects('[{"id":1}}]')).toEqual([])
  })
})

describe('chunkRawJson', () => {
  it('returns nothing for blank input', () => {
    expect(chunkRawJson('', 100)).toEqual([])
    expect(chunkRawJson('  \n ', 100)).toEqual([])
  })

  it('leaves a small paste in one chunk', () => {
    const source = bank(2)
    expect(chunkRawJson(source, 8000)).toEqual([source])
  })

  it('splits a large bank into array-shaped chunks', () => {
    const chunks = chunkRawJson(bank(20), 600)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.startsWith('[')).toBe(true)
      expect(chunk.endsWith(']')).toBe(true)
      // Each chunk is valid JSON on its own, so it can be repaired alone.
      expect(() => JSON.parse(chunk)).not.toThrow()
    }
  })

  it('keeps every question, in order, across the chunks', () => {
    const ids = chunkRawJson(bank(20), 600)
      .flatMap((chunk) => JSON.parse(chunk) as { id: number }[])
      .map((q) => q.id)

    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('falls back to a single chunk when the source cannot be split safely', () => {
    const broken = `[{"id":1,"question":"unterminated, ${'x'.repeat(500)}`
    expect(chunkRawJson(broken, 100)).toEqual([broken])
  })

  it('never splits a lone oversized object', () => {
    const huge = `[${question(1, `,\n  "explanation": "${'y'.repeat(2000)}"`)}]`
    expect(chunkRawJson(huge, 100)).toHaveLength(1)
  })
})

describe('mergeJsonChunks', () => {
  it('rejoins split chunks into one valid array', () => {
    const chunks = chunkRawJson(bank(12), 600)
    const merged = mergeJsonChunks(chunks)

    const parsed = JSON.parse(merged) as { id: number }[]
    expect(parsed.map((q) => q.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
  })

  it('round-trips a single chunk', () => {
    const merged = mergeJsonChunks([bank(2)])
    expect(JSON.parse(merged)).toHaveLength(2)
  })

  it('keeps an unbracketed chunk rather than dropping it', () => {
    // What a part-way failure hands back: repaired arrays plus raw remainder.
    const merged = mergeJsonChunks([`[${question(1)}]`, 'total garbage'])
    expect(merged).toContain('total garbage')
    expect(merged).toContain('"id": 1')
  })

  it('returns an empty string when there is nothing to merge', () => {
    expect(mergeJsonChunks([])).toBe('')
    expect(mergeJsonChunks(['   '])).toBe('')
  })
})
