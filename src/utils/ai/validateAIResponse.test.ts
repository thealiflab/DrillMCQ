import { describe, expect, it } from 'vitest'
import type { QuizQuestion } from '../../types/quiz'
import {
  extractJson,
  validateExplanationResponse,
  validateFormattingResponse,
  validateVerificationResponse,
} from './validateAIResponse'

const question: QuizQuestion = {
  id: 1,
  question: 'Which is the functional unit of life?',
  options: ['Mitochondria', 'Cell', 'Tissue', 'Organ'],
  correctAnswers: ['Mitochondria'], // deliberately the WRONG source answer
}

const multi: QuizQuestion = {
  id: 2,
  question: 'Pick two',
  options: ['A', 'B', 'C', 'D'],
  correctAnswers: ['A', 'B'],
}

function explanationBody(overrides: Record<string, unknown> = {}) {
  return {
    correctOptionIndexes: [1],
    explanation: 'The cell is the basic structural and functional unit of life.',
    optionNotes: [],
    confidence: 'high',
    ...overrides,
  }
}

describe('validateExplanationResponse', () => {
  it('accepts a well-formed response and resolves indexes to option strings', () => {
    const result = validateExplanationResponse(explanationBody(), question)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.aiCorrectOptions).toEqual(['Cell'])
    expect(result.value.questionId).toBe(1)
    expect(result.value.confidence).toBe('high')
  })

  it('flags disagreement with a wrong source answer', () => {
    const result = validateExplanationResponse(explanationBody(), question)
    expect(result.ok && result.value.agreesWithSource).toBe(false)
  })

  it('reports agreement when the AI matches the source', () => {
    const result = validateExplanationResponse(
      explanationBody({ correctOptionIndexes: [0] }),
      question,
    )
    expect(result.ok && result.value.agreesWithSource).toBe(true)
  })

  it('compares multi-answer sets without regard to order', () => {
    const forward = validateExplanationResponse(explanationBody({ correctOptionIndexes: [0, 1] }), multi)
    const reversed = validateExplanationResponse(explanationBody({ correctOptionIndexes: [1, 0] }), multi)
    expect(forward.ok && forward.value.agreesWithSource).toBe(true)
    expect(reversed.ok && reversed.value.agreesWithSource).toBe(true)
  })

  it('does not treat a subset as agreement', () => {
    const result = validateExplanationResponse(explanationBody({ correctOptionIndexes: [0] }), multi)
    expect(result.ok && result.value.agreesWithSource).toBe(false)
  })

  it('rejects an out-of-range option index', () => {
    const result = validateExplanationResponse(
      explanationBody({ correctOptionIndexes: [9] }),
      question,
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('option 9')
  })

  it('rejects a non-integer option index', () => {
    const result = validateExplanationResponse(
      explanationBody({ correctOptionIndexes: ['Cell'] }),
      question,
    )
    expect(result.ok).toBe(false)
  })

  it('collapses duplicate indexes', () => {
    const result = validateExplanationResponse(
      explanationBody({ correctOptionIndexes: [1, 1, 1] }),
      question,
    )
    expect(result.ok && result.value.aiCorrectOptions).toEqual(['Cell'])
  })

  it('rejects an empty answer list', () => {
    const result = validateExplanationResponse(explanationBody({ correctOptionIndexes: [] }), question)
    expect(result.ok).toBe(false)
  })

  it('rejects an empty or missing explanation', () => {
    expect(validateExplanationResponse(explanationBody({ explanation: '   ' }), question).ok).toBe(false)
    expect(validateExplanationResponse(explanationBody({ explanation: undefined }), question).ok).toBe(
      false,
    )
  })

  it('coerces an unknown confidence to low rather than failing', () => {
    const result = validateExplanationResponse(explanationBody({ confidence: 'certain' }), question)
    expect(result.ok && result.value.confidence).toBe('low')
  })

  it('keeps good option notes and drops bad ones', () => {
    const result = validateExplanationResponse(
      explanationBody({
        optionNotes: [
          { optionIndex: 0, note: 'Mitochondria are an organelle, not the unit of life.' },
          { optionIndex: 99, note: 'Out of range — dropped.' },
          { optionIndex: 2, note: '   ' },
          'not an object',
        ],
      }),
      question,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.optionNotes).toHaveLength(1)
    expect(result.value.optionNotes[0].option).toBe('Mitochondria')
  })

  it('truncates a runaway explanation instead of rejecting it', () => {
    const result = validateExplanationResponse(
      explanationBody({ explanation: 'x'.repeat(10_000) }),
      question,
    )
    expect(result.ok && result.value.explanation.length).toBeLessThanOrEqual(4001)
  })

  it.each([null, undefined, [], 'text', 42, {}])('rejects %p without throwing', (input) => {
    expect(() => validateExplanationResponse(input, question)).not.toThrow()
    expect(validateExplanationResponse(input, question).ok).toBe(false)
  })
})

function verificationBody(overrides: Record<string, unknown> = {}) {
  return {
    verifications: [
      {
        questionId: 1,
        status: 'disagrees',
        correctOptionIndexes: [1],
        reasoning: 'The cell is the functional unit of life.',
        suggestedExplanation: '',
        confidence: 'high',
        ...overrides,
      },
    ],
  }
}

describe('validateVerificationResponse', () => {
  it('accepts a well-formed batch', () => {
    const result = validateVerificationResponse(verificationBody(), [question], 1234)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [v] = result.value.verifications
    expect(v.suggestedAnswers).toEqual(['Cell'])
    expect(v.sourceAnswers).toEqual(['Mitochondria'])
    expect(v.checkedAt).toBe(1234)
  })

  it('overrides a bogus "agrees" when the proposed set actually differs', () => {
    // The single most important guard: the app decides agreement, not the model.
    const result = validateVerificationResponse(verificationBody({ status: 'agrees' }), [question])
    expect(result.ok && result.value.verifications[0].status).toBe('disagrees')
  })

  it('overrides a bogus "disagrees" when the sets actually match', () => {
    const result = validateVerificationResponse(
      verificationBody({ status: 'disagrees', correctOptionIndexes: [0] }),
      [question],
    )
    expect(result.ok && result.value.verifications[0].status).toBe('agrees')
  })

  it('downgrades a low-confidence verdict to uncertain', () => {
    const result = validateVerificationResponse(verificationBody({ confidence: 'low' }), [question])
    expect(result.ok && result.value.verifications[0].status).toBe('uncertain')
  })

  it('honours an invalid verdict even at low confidence', () => {
    const result = validateVerificationResponse(
      verificationBody({ status: 'invalid', confidence: 'low' }),
      [question],
    )
    expect(result.ok && result.value.verifications[0].status).toBe('invalid')
  })

  it('takes sourceAnswers from the real question, not the response', () => {
    const result = validateVerificationResponse(
      verificationBody({ sourceAnswers: ['Fabricated'] }),
      [question],
    )
    expect(result.ok && result.value.verifications[0].sourceAnswers).toEqual(['Mitochondria'])
  })

  it('drops verdicts for questions that were not in the batch', () => {
    const result = validateVerificationResponse(verificationBody({ questionId: 999 }), [question])
    expect(result.ok).toBe(false) // nothing usable survived
  })

  it('keeps the good entries when part of the batch is malformed', () => {
    const raw = {
      verifications: [
        verificationBody().verifications[0],
        { questionId: 2, status: 'agrees', correctOptionIndexes: [42], reasoning: 'x', confidence: 'high' },
        'not an object',
        { questionId: 2, status: 'agrees', correctOptionIndexes: [0, 1], reasoning: 'ok', confidence: 'high' },
      ],
    }
    const result = validateVerificationResponse(raw, [question, multi])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.verifications.map((v) => v.questionId)).toEqual([1, 2])
  })

  it('substitutes a placeholder when reasoning is missing', () => {
    const result = validateVerificationResponse(verificationBody({ reasoning: '' }), [question])
    expect(result.ok && result.value.verifications[0].reasoning).toBe('No reasoning given.')
  })

  it('treats an empty suggestedExplanation as absent', () => {
    const result = validateVerificationResponse(verificationBody(), [question])
    expect(result.ok && result.value.verifications[0].suggestedExplanation).toBeUndefined()
  })

  it('fails on an empty verifications array', () => {
    expect(validateVerificationResponse({ verifications: [] }, [question]).ok).toBe(false)
  })

  it.each([null, undefined, [], 'text', {}])('rejects %p without throwing', (input) => {
    expect(() => validateVerificationResponse(input, [question])).not.toThrow()
    expect(validateVerificationResponse(input, [question]).ok).toBe(false)
  })
})

describe('validateFormattingResponse', () => {
  it('accepts text and notes', () => {
    const result = validateFormattingResponse({ text: '1. Q\nA. a\nB. b\nAnswer: A', notes: ['Removed ads'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.text).toContain('Answer: A')
    expect(result.value.notes).toEqual(['Removed ads'])
  })

  it('strips a leaked markdown fence', () => {
    const result = validateFormattingResponse({ text: '```json\n1. Q\nAnswer: A\n```' })
    expect(result.ok && result.value.text).toBe('1. Q\nAnswer: A')
  })

  it('defaults notes to an empty array', () => {
    const result = validateFormattingResponse({ text: '1. Q' })
    expect(result.ok && result.value.notes).toEqual([])
  })

  it('drops non-string note entries', () => {
    const result = validateFormattingResponse({ text: '1. Q', notes: ['kept', 42, null, '  '] })
    expect(result.ok && result.value.notes).toEqual(['kept'])
  })

  it('rejects whitespace-only text', () => {
    expect(validateFormattingResponse({ text: '   \n  ' }).ok).toBe(false)
  })

  it.each([null, undefined, [], 'text', {}, { text: 42 }])(
    'rejects %p without throwing',
    (input) => {
      expect(() => validateFormattingResponse(input)).not.toThrow()
      expect(validateFormattingResponse(input).ok).toBe(false)
    },
  )
})

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('parses JSON after prose', () => {
    const result = extractJson('Sure! Here is the result:\n{"a":1}')
    expect(result.ok && result.value).toEqual({ a: 1 })
  })

  it('parses a fenced block', () => {
    const result = extractJson('```json\n{"a":1}\n```')
    expect(result.ok && result.value).toEqual({ a: 1 })
  })

  it('handles nested objects', () => {
    const result = extractJson('prefix {"a":{"b":{"c":1}}} suffix')
    expect(result.ok && result.value).toEqual({ a: { b: { c: 1 } } })
  })

  it('ignores braces inside strings', () => {
    const result = extractJson('{"a":"} not the end {"}')
    expect(result.ok && result.value).toEqual({ a: '} not the end {' })
  })

  it('ignores escaped quotes inside strings', () => {
    const result = extractJson('{"a":"say \\"hi\\" }"}')
    expect(result.ok && result.value).toEqual({ a: 'say "hi" }' })
  })

  it('fails on unbalanced JSON', () => {
    expect(extractJson('{"a":1').ok).toBe(false)
  })

  it('fails when there is no object at all', () => {
    expect(extractJson('I cannot help with that.').ok).toBe(false)
  })

  it('fails on a balanced but malformed object', () => {
    expect(extractJson('{a: 1,}').ok).toBe(false)
  })
})
