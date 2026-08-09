import type { QuizQuestion } from '../../types/quiz'
import { AI_COMMON_SYSTEM, CONFIDENCE_SCHEMA, formatQuestion } from './shared'

export interface ExplanationPromptInput {
  question: QuizQuestion
  /** What the user picked, so the model can explain why it was wrong. */
  selected?: string[]
}

export const AI_EXPLANATION_SYSTEM =
  `${AI_COMMON_SYSTEM} ` +
  'Work out the answer yourself before considering the answer the source material gives. ' +
  'The source may be wrong; if you believe it is, say so plainly in your explanation.'

export const AI_EXPLANATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['correctOptionIndexes', 'explanation', 'optionNotes', 'confidence'],
  properties: {
    correctOptionIndexes: {
      type: 'array',
      items: { type: 'integer' },
    },
    explanation: { type: 'string' },
    optionNotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['optionIndex', 'note'],
        properties: {
          optionIndex: { type: 'integer' },
          note: { type: 'string' },
        },
      },
    },
    confidence: CONFIDENCE_SCHEMA,
  },
} as const

/**
 * Workflow A: explain one already-answered question. Shown only on the result
 * screen — never mid-quiz, since an AI evaluation is correctness disclosure.
 */
export function buildAIExplanationPrompt({ question, selected }: ExplanationPromptInput): string {
  const lines = [formatQuestion(question, { includeSource: true })]

  if (selected !== undefined && selected.length > 0) {
    const indexes = selected
      .map((option) => question.options.indexOf(option))
      .filter((index) => index !== -1)
    lines.push(
      indexes.length > 0
        ? `The person answering chose: ${indexes.join(', ')}`
        : 'The person answering chose an option that is no longer present.',
    )
  } else {
    lines.push('The person answering skipped this question.')
  }

  lines.push(
    '',
    'Return:',
    '- correctOptionIndexes: the options you believe are correct, as indexes.',
    '- explanation: why the correct option is correct, why the chosen option is',
    '  wrong if it was, and whether the source answer itself looks mistaken.',
    '- optionNotes: short notes on individual options where useful (may be empty).',
    '- confidence: how sure you are.',
  )

  return lines.join('\n')
}
