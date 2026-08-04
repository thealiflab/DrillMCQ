import { describe, expect, it } from 'vitest'
import { parseMcqText } from './parseMcqText'

/** The four-option block every multi-answer case below is built on. */
const OS_BLOCK = `Which of the following are operating systems?

A. Windows
B. Python
C. Linux
D. Java
`

function parseOne(text: string) {
  const parsed = parseMcqText(text)
  expect(parsed.skipped).toBe(0)
  expect(parsed.questions).toHaveLength(1)
  return parsed.questions[0]
}

describe('multi-answer answer lines', () => {
  it('reads a comma-separated letter list', () => {
    expect(parseOne(`${OS_BLOCK}\nAnswer: A, C`).correctAnswers).toEqual(['Windows', 'Linux'])
  })

  it('reads "and" between letters', () => {
    expect(parseOne(`${OS_BLOCK}\nAnswer: A and C`).correctAnswers).toEqual(['Windows', 'Linux'])
  })

  it('reads three or more answers', () => {
    expect(parseOne(`${OS_BLOCK}\nAnswer: A, C, D`).correctAnswers).toEqual([
      'Windows',
      'Linux',
      'Java',
    ])
  })

  it('reads a mixed comma / "and" list', () => {
    expect(parseOne(`${OS_BLOCK}\nAnswer: A, B and D`).correctAnswers).toEqual([
      'Windows',
      'Python',
      'Java',
    ])
  })

  it('accepts the "Correct Answer:" and plural labels', () => {
    expect(parseOne(`${OS_BLOCK}\nCorrect Answer: A, C`).correctAnswers).toEqual([
      'Windows',
      'Linux',
    ])
    expect(parseOne(`${OS_BLOCK}\nCorrect Answers: A, C`).correctAnswers).toEqual([
      'Windows',
      'Linux',
    ])
    expect(parseOne(`${OS_BLOCK}\nAnswers: A, C`).correctAnswers).toEqual(['Windows', 'Linux'])
  })

  it('is case-insensitive about the option letters', () => {
    expect(parseOne(`${OS_BLOCK}\nAnswer: a, c`).correctAnswers).toEqual(['Windows', 'Linux'])
  })

  it('accepts semicolons and slashes as separators', () => {
    expect(parseOne(`${OS_BLOCK}\nAnswer: A; C`).correctAnswers).toEqual(['Windows', 'Linux'])
    expect(parseOne(`${OS_BLOCK}\nAnswer: A / C`).correctAnswers).toEqual(['Windows', 'Linux'])
  })

  it('resolves option text, not just letters', () => {
    expect(parseOne(`${OS_BLOCK}\nAnswer: Windows, Linux`).correctAnswers).toEqual([
      'Windows',
      'Linux',
    ])
  })
})

describe('single answers are left alone', () => {
  it('keeps a lone letter single', () => {
    const q = parseOne(`${OS_BLOCK}\nAnswer: B`)
    expect(q.correctAnswers).toEqual(['Python'])
  })

  it('does not split an option whose own text contains commas', () => {
    // The regression this ordering exists for: the ACID question in the
    // bundled sample quiz has separators inside a single correct option.
    const q = parseOne(`What does ACID stand for?

A. Atomicity, Consistency, Isolation, Durability
B. Availability, Consistency, Integrity, Data

Answer: Atomicity, Consistency, Isolation, Durability`)
    expect(q.correctAnswers).toEqual(['Atomicity, Consistency, Isolation, Durability'])
  })

  it('skips the question when part of the list does not resolve', () => {
    const parsed = parseMcqText(`${OS_BLOCK}\nAnswer: A, Z`)
    expect(parsed.questions).toHaveLength(0)
    expect(parsed.skipped).toBe(1)
    expect(parsed.issues[0].message).toContain("doesn't match any option")
  })
})

describe('messy real-world paste', () => {
  it('ignores site clutter and still reads the multi answer', () => {
    const parsed = parseMcqText(`12. Which of the following are characteristics of living organisms?

a) Growth
b) Reproduction
c) Photosynthesis
d) Respiration

View Answer

Answer: a, b, d

Explanation: Growth, reproduction and respiration are characteristics of living organisms.`)

    expect(parsed.skipped).toBe(0)
    expect(parsed.ignored).toBe(1)
    expect(parsed.questions).toHaveLength(1)

    const q = parsed.questions[0]
    expect(q.question).toBe('Which of the following are characteristics of living organisms?')
    expect(q.options).toEqual(['Growth', 'Reproduction', 'Photosynthesis', 'Respiration'])
    expect(q.correctAnswers).toEqual(['Growth', 'Reproduction', 'Respiration'])
    expect(q.explanation).toBe(
      'Growth, reproduction and respiration are characteristics of living organisms.',
    )
  })

  it('mixes single- and multi-answer questions in one paste', () => {
    const parsed = parseMcqText(`1. What is the powerhouse of the cell?

A. Nucleus
B. Mitochondria
C. Ribosomes

Answer: B

2. Which of the following are programming languages?

A. Python
B. HTML
C. Java

Answer: A, C`)

    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([
      ['Mitochondria'],
      ['Python', 'Java'],
    ])
  })
})
