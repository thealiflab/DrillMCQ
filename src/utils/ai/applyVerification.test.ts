import { describe, expect, it } from 'vitest'
import type { AIVerification } from '../../types/ai'
import type { QuizQuestion } from '../../types/quiz'
import {
  applyManualAnswers,
  applyVerification,
  isVerificationStale,
  questionsWithIssues,
  summarizeVerifications,
} from './applyVerification'

const bank: QuizQuestion[] = [
  {
    id: 1,
    question: 'Which is the functional unit of life?',
    options: ['Mitochondria', 'Cell', 'Tissue'],
    correctAnswers: ['Mitochondria'],
    explanation: 'Original explanation.',
  },
  { id: 2, question: 'Untouched', options: ['A', 'B'], correctAnswers: ['A'] },
]

function makeVerification(overrides: Partial<AIVerification> = {}): AIVerification {
  return {
    questionId: 1,
    status: 'disagrees',
    confidence: 'high',
    suggestedAnswers: ['Cell'],
    sourceAnswers: ['Mitochondria'],
    reasoning: 'The cell is the functional unit of life.',
    checkedAt: 1000,
    ...overrides,
  }
}

describe('applyVerification', () => {
  it('replaces the answers on the target question', () => {
    const next = applyVerification(bank, makeVerification())
    expect(next[0].correctAnswers).toEqual(['Cell'])
  })

  it('leaves other questions alone', () => {
    const next = applyVerification(bank, makeVerification())
    expect(next[1]).toBe(bank[1])
    expect(next[1].correctAnswers).toEqual(['A'])
  })

  it('does not mutate the input bank or its questions', () => {
    const snapshot = JSON.stringify(bank)
    const next = applyVerification(bank, makeVerification())
    expect(JSON.stringify(bank)).toBe(snapshot)
    expect(next).not.toBe(bank)
    expect(next[0]).not.toBe(bank[0])
  })

  it('does not alias the suggested answers array', () => {
    const verification = makeVerification()
    const next = applyVerification(bank, verification)
    expect(next[0].correctAnswers).not.toBe(verification.suggestedAnswers)
  })

  it('keeps the existing explanation when none is suggested', () => {
    const next = applyVerification(bank, makeVerification())
    expect(next[0].explanation).toBe('Original explanation.')
  })

  it('accepts a suggested explanation when one is offered', () => {
    const next = applyVerification(bank, makeVerification({ suggestedExplanation: 'Better.' }))
    expect(next[0].explanation).toBe('Better.')
  })

  it('is a no-op for an unknown question id', () => {
    const next = applyVerification(bank, makeVerification({ questionId: 99 }))
    expect(next.map((q) => q.correctAnswers)).toEqual([['Mitochondria'], ['A']])
  })
})

describe('applyManualAnswers', () => {
  it('sets a hand-picked answer set without touching the explanation', () => {
    const next = applyManualAnswers(bank, 1, ['Cell', 'Tissue'])
    expect(next[0].correctAnswers).toEqual(['Cell', 'Tissue'])
    expect(next[0].explanation).toBe('Original explanation.')
    expect(next[1]).toBe(bank[1])
  })

  it('does not mutate the input', () => {
    const snapshot = JSON.stringify(bank)
    applyManualAnswers(bank, 1, ['Cell'])
    expect(JSON.stringify(bank)).toBe(snapshot)
  })
})

describe('isVerificationStale', () => {
  it('is false while the question still matches what was verified', () => {
    expect(isVerificationStale(bank[0], makeVerification())).toBe(false)
  })

  it('is true once the suggestion has been accepted', () => {
    const verification = makeVerification()
    const next = applyVerification(bank, verification)
    expect(isVerificationStale(next[0], verification)).toBe(true)
  })

  it('is true when the answer count changes', () => {
    const next = applyManualAnswers(bank, 1, ['Mitochondria', 'Cell'])
    expect(isVerificationStale(next[0], makeVerification())).toBe(true)
  })

  it('ignores answer ordering', () => {
    const question: QuizQuestion = {
      id: 3,
      question: 'Pick two',
      options: ['A', 'B'],
      correctAnswers: ['B', 'A'],
    }
    const verification = makeVerification({ questionId: 3, sourceAnswers: ['A', 'B'] })
    expect(isVerificationStale(question, verification)).toBe(false)
  })
})

describe('summarizeVerifications', () => {
  it('counts each status', () => {
    const summary = summarizeVerifications({
      1: makeVerification({ status: 'agrees' }),
      2: makeVerification({ status: 'disagrees' }),
      3: makeVerification({ status: 'disagrees' }),
      4: makeVerification({ status: 'invalid' }),
    })
    expect(summary).toEqual({ agrees: 1, disagrees: 2, uncertain: 0, invalid: 1 })
  })

  it('returns zeroes for an empty map', () => {
    expect(summarizeVerifications({})).toEqual({
      agrees: 0,
      disagrees: 0,
      uncertain: 0,
      invalid: 0,
    })
  })
})

describe('questionsWithIssues', () => {
  it('picks multi-answer questions and ones missing an explanation', () => {
    const questions: QuizQuestion[] = [
      { id: 1, question: 'clean', options: ['A', 'B'], correctAnswers: ['A'], explanation: 'why' },
      { id: 2, question: 'no explanation', options: ['A', 'B'], correctAnswers: ['A'] },
      {
        id: 3,
        question: 'multi',
        options: ['A', 'B'],
        correctAnswers: ['A', 'B'],
        explanation: 'why',
      },
      { id: 4, question: 'blank explanation', options: ['A', 'B'], correctAnswers: ['A'], explanation: '  ' },
    ]
    expect(questionsWithIssues(questions).map((q) => q.id)).toEqual([2, 3, 4])
  })
})
