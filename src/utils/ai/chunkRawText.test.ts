import { describe, expect, it } from 'vitest'
import { chunkRawText, countQuestionStarts, splitQuestionUnits } from './chunkRawText'

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

/** Exam-dump shape: a blank line between the stem and every single option. */
function spacedQuestion(n: number): string {
  return [
    `${n}. Question number ${n}?`,
    `❏ A. Option one for ${n}`,
    `❏ B. Option two for ${n}`,
    `❏ C. Option three for ${n}`,
    `✓ B. Option two for ${n}`,
  ].join('\n\n')
}

describe('chunkRawText — question units', () => {
  it('keeps a question whose options are in separate blocks together', () => {
    const source = Array.from({ length: 12 }, (_, i) => spacedQuestion(i + 1)).join('\n\n')

    for (const chunk of chunkRawText(source, 400)) {
      const opens = (chunk.match(/^\d+\. Question number/gm) ?? []).length
      const ticks = (chunk.match(/^✓/gm) ?? []).length
      const options = (chunk.match(/^❏/gm) ?? []).length
      // Every question a chunk opens brings its three options and its tick.
      expect(ticks).toBe(opens)
      expect(options).toBe(opens * 3)
    }
  })

  it('never starts a chunk with orphaned options', () => {
    const source = Array.from({ length: 12 }, (_, i) => spacedQuestion(i + 1)).join('\n\n')
    for (const chunk of chunkRawText(source, 400)) {
      expect(chunk.startsWith('❏') || chunk.startsWith('✓')).toBe(false)
    }
  })

  it('loses nothing and keeps the order', () => {
    const source = Array.from({ length: 12 }, (_, i) => spacedQuestion(i + 1)).join('\n\n')
    expect(chunkRawText(source, 400).flatMap(blocksOf)).toEqual(blocksOf(source))
  })

  it('does not treat a numbered option list as a new question', () => {
    const source = `1. Which of these is a database?

1. Amazon S3
2. Amazon RDS
3. Amazon EC2

Answer: 2`
    expect(splitQuestionUnits(source)).toEqual([source])
  })

  it('keeps a preamble out of the first question', () => {
    const units = splitQuestionUnits('Practice Test — Unit 3\nAttempt all questions.\n\n1. A?\n\nA. One\nB. Two')
    expect(units).toHaveLength(2)
    expect(units[0]).toBe('Practice Test — Unit 3\nAttempt all questions.')
  })

  it('falls back to blank-line blocks when nothing looks like a question start', () => {
    const source = 'Which planet is the largest?\nA. Mars\nB. Jupiter\n\nWhich is closest to the sun?\nA. Mercury\nB. Venus'
    expect(splitQuestionUnits(source)).toEqual(blocksOf(source))
  })

  it('recognises Q-style and titled headers', () => {
    expect(splitQuestionUnits('Q1. First?\n\nA. One\nB. Two\n\nQ2. Second?\n\nA. One\nB. Two')).toHaveLength(2)
    expect(
      splitQuestionUnits(
        'Sample Exam Question 1\nFirst?\n\nA. One\nB. Two\n\nSample Exam Question 2\nSecond?\n\nA. One\nB. Two',
      ),
    ).toHaveLength(2)
  })
})

describe('countQuestionStarts', () => {
  it('counts one per question however its options are laid out', () => {
    expect(countQuestionStarts(Array.from({ length: 5 }, (_, i) => spacedQuestion(i + 1)).join('\n\n'))).toBe(5)
    expect(countQuestionStarts(Array.from({ length: 5 }, (_, i) => question(i + 1)).join('\n\n'))).toBe(5)
  })

  it('counts nothing in an unnumbered paste', () => {
    expect(countQuestionStarts('Which planet is the largest?\nA. Mars\nB. Jupiter')).toBe(0)
  })
})
