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

describe('checkbox-marked pastes', () => {
  /** Exam-dump shape: titled header, "❏" options, the answer repeated under "✓". */
  const EXAM_BLOCK = `AI Practitioner Exam Question 1
A digital media startup, BrightWave Studios, is evaluating Amazon Q Developer to speed up coding. What should you tell them about its availability across developer tools and AWS interfaces?

❏ A. Amazon Q Developer is limited to desktop IDEs only

❏ B. Amazon Q Developer is available in IDEs and in the AWS Management Console

❏ C. Amazon Q Developer is offered solely through AWS Chatbot integrations like Slack and Amazon Chime

❏ D. Amazon Q Developer can be used only inside the AWS Management Console

✓ B. Amazon Q Developer is available in IDEs and in the AWS Management Console
`

  it('reads the ticked option as the answer', () => {
    const q = parseOne(EXAM_BLOCK)
    expect(q.options).toHaveLength(4)
    expect(q.correctAnswers).toEqual([
      'Amazon Q Developer is available in IDEs and in the AWS Management Console',
    ])
  })

  it('drops the titled header from the question text', () => {
    const q = parseOne(EXAM_BLOCK)
    expect(q.question).toBe(
      'A digital media startup, BrightWave Studios, is evaluating Amazon Q Developer to speed up coding. What should you tell them about its availability across developer tools and AWS interfaces?',
    )
  })

  it('parses a run of exam-dump questions', () => {
    const parsed = parseMcqText(`${EXAM_BLOCK}

AI Practitioner Exam Question 2
An online marketplace has collected 120 TB of unlabeled clickstream data and wants to group shoppers into tiers. Which approach should the team choose?

❏ A. Reinforcement learning

❏ B. Unsupervised learning

❏ C. Supervised learning

❏ D. Amazon SageMaker Ground Truth

✓ B. Unsupervised learning


AI Practitioner Exam Question 3
A language learning app wants shorter hints. Which parameter change enforces shorter responses?

❏ A. Decrease the temperature setting

❏ B. Choose a smaller model size

❏ C. Set a lower max tokens limit

❏ D. Expand the context window
✓ C. Set a lower max tokens limit`)

    expect(parsed.skipped).toBe(0)
    expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(parsed.questions).toHaveLength(3)
    expect(parsed.questions.map((q) => q.options.length)).toEqual([4, 4, 4])
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([
      ['Amazon Q Developer is available in IDEs and in the AWS Management Console'],
      ['Unsupervised learning'],
      ['Set a lower max tokens limit'],
    ])
  })

  it('ticks an option inline in the list without duplicating it', () => {
    const q = parseOne(`Which planet is the largest?

❏ A. Mars
✓ B. Jupiter
❏ C. Venus
❏ D. Mercury`)

    expect(q.options).toEqual(['Mars', 'Jupiter', 'Venus', 'Mercury'])
    expect(q.correctAnswers).toEqual(['Jupiter'])
  })

  it('treats several ticks as one multi-answer question', () => {
    const parsed = parseMcqText(`Which of the following are operating systems?

❏ A. Windows
❏ B. Python
❏ C. Linux
❏ D. Java

✓ A. Windows
✓ C. Linux`)

    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0].correctAnswers).toEqual(['Windows', 'Linux'])
  })

  it('skips a block whose tick matches no option', () => {
    const parsed = parseMcqText(`Which planet is the largest?

❏ A. Mars
❏ B. Jupiter

✓ Z`)

    expect(parsed.questions).toHaveLength(0)
    expect(parsed.skipped).toBe(1)
    expect(parsed.issues[0].message).toContain("doesn't match any option")
  })
})
