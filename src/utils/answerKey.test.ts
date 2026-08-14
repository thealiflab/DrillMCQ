import { describe, expect, it } from 'vitest'
import { findAnswerKey } from './answerKey'

const lines = (text: string) => text.replace(/\r\n?/g, '\n').split('\n')

describe('findAnswerKey — detection', () => {
  it('finds a heading followed by entries', () => {
    const key = findAnswerKey(lines('1. A question?\nA. one\nB. two\n\nANSWER KEY\n1. B'))
    expect(key).not.toBeNull()
    expect(key?.entries).toEqual([{ number: 1, raw: 'B', line: 6 }])
    // The heading itself is the start of the section.
    expect(lines('1. A question?\nA. one\nB. two\n\nANSWER KEY\n1. B')[key!.startIndex]).toBe(
      'ANSWER KEY',
    )
  })

  it('accepts the common heading spellings', () => {
    for (const heading of [
      'ANSWER KEY',
      'Answer Key:',
      'ANSWERS',
      'Answers:',
      'SOLUTIONS',
      'Solution Key',
      'Answers and Explanations',
      'Answers & Explanations',
      'Answer Sheet',
      'KEY',
      'Correct Answers',
    ]) {
      const key = findAnswerKey(lines(`Some question\nA. one\nB. two\n\n${heading}\n1. B`))
      expect(key, heading).not.toBeNull()
      expect(key?.entries, heading).toHaveLength(1)
    }
  })

  it('finds a bare trailing run of entries without a heading', () => {
    const key = findAnswerKey(lines('Question\nA. one\nB. two\n\n1. B\n2. A'))
    expect(key?.entries.map((e) => e.raw)).toEqual(['B', 'A'])
  })

  it('needs at least two entries when there is no heading', () => {
    expect(findAnswerKey(lines('Question\nA. one\nB. two\n\n1. B'))).toBeNull()
  })

  it('ignores a run that does not reach the end of the text', () => {
    expect(findAnswerKey(lines('1. B\n2. A\n\nA real question\nA. one\nB. two'))).toBeNull()
  })

  it('returns null for a paste that is only an answer key', () => {
    expect(findAnswerKey(lines('ANSWER KEY\n1. B\n2. A'))).toBeNull()
  })

  it('returns null when there is no key at all', () => {
    expect(findAnswerKey(lines('1. Question?\nA. one\nB. two\nAnswer: A'))).toBeNull()
  })

  it('does not treat a trailing question or option list as a key', () => {
    expect(findAnswerKey(lines('Q\nA. one\nB. two\n\n2. What is AWS?\n3. What is EC2?'))).toBeNull()
    expect(findAnswerKey(lines('Q\n1. Amazon S3\n2. Amazon EC2\n3. Amazon RDS'))).toBeNull()
  })

  it('skips blank lines, rules and page numbers inside the section', () => {
    const key = findAnswerKey(lines('Q\nA. one\nB. two\n\nANSWER KEY\n----\n1. B\n\n2. A\nPage 3'))
    expect(key?.entries.map((e) => e.number)).toEqual([1, 2])
  })
})

describe('findAnswerKey — entry shapes', () => {
  const withKey = (key: string) => findAnswerKey(lines(`Q\nA. one\nB. two\n\nANSWER KEY\n${key}`))

  it('reads dot, dash and colon separators', () => {
    expect(withKey('1. C\n2 - A\n3: B')?.entries.map((e) => [e.number, e.raw])).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'B'],
    ])
  })

  it('reads en/em dashes and parenthesised numbers', () => {
    expect(withKey('1 – C\n2 — A\n(3) B')?.entries.map((e) => e.raw)).toEqual(['C', 'A', 'B'])
  })

  it('reads multi-answer entries', () => {
    expect(withKey('1. A, C\n2. B and D\n3. A;C')?.entries.map((e) => e.raw)).toEqual([
      'A, C',
      'B and D',
      'A;C',
    ])
  })

  it('is case-insensitive about the letters', () => {
    expect(withKey('1. c\n2. a')?.entries.map((e) => e.raw)).toEqual(['c', 'a'])
  })

  it('reads an explanation after the answer', () => {
    const entries = withKey('1. C - Bedrock is the GenAI service\n2. A')?.entries
    expect(entries?.[0].explanation).toBe('Bedrock is the GenAI service')
    expect(entries?.[0].raw).toBe('C')
    expect(entries?.[1].explanation).toBeUndefined()
  })

  it('reads an explanation from a following Explanation: line', () => {
    const entries = withKey('1. C\nExplanation: Bedrock is managed.\n2. A')?.entries
    expect(entries?.[0].explanation).toBe('Bedrock is managed.')
    expect(entries?.[1].explanation).toBeUndefined()
  })

  it('records 1-based line numbers', () => {
    expect(withKey('1. C\n2. A')?.entries.map((e) => e.line)).toEqual([6, 7])
  })

  it('rejects a section holding a line that is not an entry', () => {
    expect(withKey('1. C\nSee you next week\n2. A')).toBeNull()
  })
})
