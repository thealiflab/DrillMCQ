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

describe('bottom answer keys', () => {
  /** Three numbered questions, none of which carries an answer of its own. */
  const BANK = `1. Which AWS service stores objects?

A. Amazon S3
B. Amazon EC2
C. Amazon Bedrock
D. Amazon RDS

2. Which AWS service runs virtual machines?

A. Amazon S3
B. Amazon EC2
C. Amazon Bedrock
D. Amazon RDS

3. Which AWS service hosts foundation models?

A. Amazon S3
B. Amazon EC2
C. Amazon Bedrock
D. Amazon RDS
`

  const withKey = (key: string) => parseMcqText(`${BANK}\n${key}`)

  it('reads a key introduced by an ANSWER KEY heading', () => {
    const parsed = withKey('ANSWER KEY\n1. A\n2. B\n3. C')
    expect(parsed.skipped).toBe(0)
    expect(parsed.issues).toEqual([])
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([
      ['Amazon S3'],
      ['Amazon EC2'],
      ['Amazon Bedrock'],
    ])
  })

  it('reads dash- and colon-separated keys', () => {
    expect(withKey('ANSWERS\n1 - A\n2 - B\n3 - C').questions.map((q) => q.correctAnswers)).toEqual([
      ['Amazon S3'],
      ['Amazon EC2'],
      ['Amazon Bedrock'],
    ])
    expect(withKey('SOLUTIONS\n1: A\n2: B\n3: C').questions.map((q) => q.correctAnswers)).toEqual([
      ['Amazon S3'],
      ['Amazon EC2'],
      ['Amazon Bedrock'],
    ])
  })

  it('reads a key with no heading at all', () => {
    const parsed = withKey('1. A\n2. B\n3. C')
    expect(parsed.skipped).toBe(0)
    expect(parsed.questions).toHaveLength(3)
    expect(parsed.questions[2].correctAnswers).toEqual(['Amazon Bedrock'])
  })

  it('does not count the key section as ignored clutter', () => {
    expect(withKey('ANSWER KEY\n1. A\n2. B\n3. C').ignored).toBe(0)
  })

  it('makes a multi-answer entry a multi-answer question', () => {
    const parsed = withKey('ANSWER KEY\n1. A, C\n2. B and D\n3. C')
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([
      ['Amazon S3', 'Amazon Bedrock'],
      ['Amazon EC2', 'Amazon RDS'],
      ['Amazon Bedrock'],
    ])
  })

  it('takes an explanation from the key line', () => {
    const parsed = withKey('ANSWER KEY\n1. A — S3 is object storage.\n2. B\n3. C')
    expect(parsed.questions[0].explanation).toBe('S3 is object storage.')
    expect(parsed.questions[1].explanation).toBeUndefined()
  })

  it('takes an explanation from an Explanation: line under the entry', () => {
    const parsed = withKey('ANSWER KEY\n1. A\nExplanation: S3 is object storage.\n2. B\n3. C')
    expect(parsed.questions[0].explanation).toBe('S3 is object storage.')
  })

  it('matches by question number, not by position', () => {
    const parsed = withKey('ANSWER KEY\n3. C\n1. A\n2. B')
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([
      ['Amazon S3'],
      ['Amazon EC2'],
      ['Amazon Bedrock'],
    ])
  })

  it('matches "Q1."-style and titled headers by their number', () => {
    const parsed = parseMcqText(`Q1. Which planet is the largest?
A. Mars
B. Jupiter

Sample Exam Question 2
Which planet is closest to the sun?
A. Mercury
B. Venus

ANSWER KEY
1. B
2. A`)
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([['Jupiter'], ['Mercury']])
  })

  it('fills only the questions that have no answer of their own', () => {
    const parsed = parseMcqText(`1. Which AWS service stores objects?
A. Amazon S3
B. Amazon EC2

Answer: A

2. Which AWS service runs virtual machines?
A. Amazon S3
B. Amazon EC2

ANSWER KEY
1. A
2. B`)
    expect(parsed.issues).toEqual([])
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([['Amazon S3'], ['Amazon EC2']])
  })

  it('keeps the inline answer and warns when the key disagrees', () => {
    const parsed = parseMcqText(`1. Which AWS service stores objects?
A. Amazon S3
B. Amazon EC2

Answer: A

2. Which AWS service runs virtual machines?
A. Amazon S3
B. Amazon EC2

ANSWER KEY
1. B
2. B`)
    expect(parsed.questions[0].correctAnswers).toEqual(['Amazon S3'])
    expect(parsed.issues).toHaveLength(1)
    expect(parsed.issues[0].severity).toBe('warning')
    expect(parsed.issues[0].message).toContain('the answer key says "B"')
  })

  it('maps positionally when the questions are not numbered', () => {
    const parsed = parseMcqText(`Which planet is the largest?
A. Mars
B. Jupiter

Which planet is closest to the sun?
A. Mercury
B. Venus

ANSWER KEY
1. B
2. A`)
    expect(parsed.skipped).toBe(0)
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([['Jupiter'], ['Mercury']])
  })

  it('ignores the key rather than guessing when unnumbered questions do not line up', () => {
    const parsed = parseMcqText(`Which planet is the largest?
A. Mars
B. Jupiter

Which planet is closest to the sun?
A. Mercury
B. Venus

ANSWER KEY
1. B
2. A
3. A`)
    expect(parsed.questions).toHaveLength(0)
    expect(parsed.skipped).toBe(2)
    const warnings = parsed.issues.filter((i) => i.severity === 'warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain("couldn't be matched")
  })

  it('reports a key entry that has no question', () => {
    const parsed = withKey('ANSWER KEY\n1. A\n2. B\n3. C\n4. D')
    expect(parsed.questions).toHaveLength(3)
    expect(parsed.issues.map((i) => i.message)).toContain(
      'Answer key entry 4 has no matching question — ignored.',
    )
  })

  it('reports a duplicated key entry and keeps the first', () => {
    const parsed = withKey('ANSWER KEY\n1. A\n1. B\n2. B\n3. C')
    expect(parsed.questions[0].correctAnswers).toEqual(['Amazon S3'])
    expect(parsed.issues.map((i) => i.message)).toContain(
      'Answer key lists question 1 more than once — entry ignored.',
    )
  })

  it('skips a question whose key entry matches no option, keeping the rest', () => {
    const parsed = withKey('ANSWER KEY\n1. A\n2. H\n3. C')
    expect(parsed.skipped).toBe(1)
    expect(parsed.questions.map((q) => q.question)).toEqual([
      'Which AWS service stores objects?',
      'Which AWS service hosts foundation models?',
    ])
    const errors = parsed.issues.filter((i) => i.severity === 'error')
    expect(errors[0].message).toContain('answer key entry "H" doesn\'t match any option')
  })

  it('reports a question the key does not cover', () => {
    const parsed = withKey('ANSWER KEY\n1. A\n2. B')
    expect(parsed.questions).toHaveLength(2)
    expect(parsed.skipped).toBe(1)
    const errors = parsed.issues.filter((i) => i.severity === 'error')
    expect(errors[0].message).toContain('the answer key has no entry for it')
  })

  it('leaves a paste without a key exactly as it was', () => {
    const parsed = parseMcqText(`${OS_BLOCK}\nAnswer: A, C`)
    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0].correctAnswers).toEqual(['Windows', 'Linux'])
  })

  it('does not mistake a trailing numbered option list for a key', () => {
    const parsed = parseMcqText(`Which of these is a database?

1. Amazon S3
2. Amazon RDS
3. Amazon EC2

Answer: 2`)
    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0].options).toHaveLength(3)
    expect(parsed.questions[0].correctAnswers).toEqual(['Amazon RDS'])
  })

  it('does not mistake trailing numbered questions for a key', () => {
    const parsed = parseMcqText(`${OS_BLOCK}
Answer: A

2. Which planet is the largest?
A. Mars
B. Jupiter
Answer: B`)
    expect(parsed.questions).toHaveLength(2)
    expect(parsed.questions[1].correctAnswers).toEqual(['Jupiter'])
  })

  it('reads a key that follows checkbox-marked questions', () => {
    const parsed = parseMcqText(`1. Which planet is the largest?

❏ A. Mars
❏ B. Jupiter

2. Which planet is closest to the sun?

❏ A. Mercury
❏ B. Venus

ANSWER KEY
1. B
2. A`)
    expect(parsed.skipped).toBe(0)
    expect(parsed.questions.map((q) => q.correctAnswers)).toEqual([['Jupiter'], ['Mercury']])
  })
})
