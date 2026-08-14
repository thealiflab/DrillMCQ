import { describe, expect, it } from 'vitest'
import { chunkTextWithAnswerKey } from './chunkTextWithAnswerKey'
import { chunkRawText } from './chunkRawText'
import { parseMcqText } from '../parseMcqText'

/** One numbered question of roughly 60 characters, as a single block. */
const question = (n: number) => `${n}. Question number ${n}?\nA. First\nB. Second\nC. Third`

const bank = (count: number) =>
  Array.from({ length: count }, (_, i) => question(i + 1)).join('\n\n')

const key = (count: number) =>
  `ANSWER KEY\n${Array.from({ length: count }, (_, i) => `${i + 1}. B`).join('\n')}`

describe('chunkTextWithAnswerKey', () => {
  it('matches chunkRawText when there is no answer key', () => {
    const text = `${bank(4)}\n\nAnswer: A`
    expect(chunkTextWithAnswerKey(text, 400)).toEqual(chunkRawText(text, 400))
  })

  it('returns [] for blank input', () => {
    expect(chunkTextWithAnswerKey('   \n\n', 400)).toEqual([])
  })

  it('keeps the whole key with a bank that fits in one chunk', () => {
    const chunks = chunkTextWithAnswerKey(`${bank(3)}\n\n${key(3)}`, 10_000)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('ANSWER KEY')
    expect(chunks[0]).toContain('3. B')
  })

  it('gives each chunk only the entries for the questions it holds', () => {
    const chunks = chunkTextWithAnswerKey(`${bank(8)}\n\n${key(8)}`, 300)
    expect(chunks.length).toBeGreaterThan(1)

    for (const chunk of chunks) {
      const numbers = [...chunk.matchAll(/^(\d+)\. Question number/gm)].map((m) => Number(m[1]))
      const entries = [...chunk.matchAll(/^(\d+)\. B$/gm)].map((m) => Number(m[1]))
      expect(entries.sort((a, b) => a - b)).toEqual(numbers.sort((a, b) => a - b))
    }
  })

  it('loses no answer entry across the chunks', () => {
    const chunks = chunkTextWithAnswerKey(`${bank(8)}\n\n${key(8)}`, 300)
    const seen = new Set(
      chunks.flatMap((c) => [...c.matchAll(/^(\d+)\. B$/gm)].map((m) => Number(m[1]))),
    )
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('carries explanations from the key into the chunk', () => {
    const chunks = chunkTextWithAnswerKey(
      `${bank(2)}\n\nANSWER KEY\n1. B — Second is right\n2. A`,
      10_000,
    )
    expect(chunks[0]).toContain('1. B — Second is right')
  })

  it('hands out entries in order when the key numbers match no question', () => {
    // Questions numbered 11.. but a key numbered 1.. — nothing matches by number.
    const questions = Array.from({ length: 8 }, (_, i) => question(i + 11)).join('\n\n')
    const chunks = chunkTextWithAnswerKey(`${questions}\n\n${key(8)}`, 300)
    expect(chunks.length).toBeGreaterThan(1)

    for (const chunk of chunks) {
      const asked = (chunk.match(/^\d+\. Question number/gm) ?? []).length
      const entries = [...chunk.matchAll(/^(\d+)\. B$/gm)].map((m) => Number(m[1]))
      expect(entries).toHaveLength(asked)
      // Renumbered within the chunk, so the model can pair them off in order.
      expect(entries).toEqual(Array.from({ length: asked }, (_, i) => i + 1))
    }
  })

  it('attaches nothing when the counts disagree', () => {
    const questions = Array.from({ length: 8 }, (_, i) => question(i + 11)).join('\n\n')
    const chunks = chunkTextWithAnswerKey(`${questions}\n\n${key(5)}`, 300)
    expect(chunks.some((chunk) => chunk.includes('ANSWER KEY'))).toBe(false)
  })

  it('produces chunks the parser can still read back', () => {
    // Each chunk is re-parsed after the model rewrites it, so a chunk with its
    // slice of the key has to parse on its own.
    for (const chunk of chunkTextWithAnswerKey(`${bank(8)}\n\n${key(8)}`, 300)) {
      const parsed = parseMcqText(chunk)
      expect(parsed.skipped).toBe(0)
      expect(parsed.questions.length).toBeGreaterThan(0)
      expect(parsed.questions.every((q) => q.correctAnswers[0] === 'Second')).toBe(true)
    }
  })
})
