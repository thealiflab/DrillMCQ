import type { QuizQuestion } from '../../types/quiz'
import { AI_COMMON_SYSTEM, CONFIDENCE_SCHEMA, formatQuestion } from './shared'

export const AI_VERIFICATION_SYSTEM =
  `${AI_COMMON_SYSTEM} ` +
  'Judge each question on its own merits and decide the correct options yourself. ' +
  'Question banks scraped from the web often carry the wrong answer key, so ' +
  'disagreeing with the source is a useful result, not a failure. ' +
  'Use the invalid status when the question itself is broken: no option is ' +
  'correct, two options mean the same thing, or it cannot be answered as written.'

export const AI_VERIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verifications'],
  properties: {
    verifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'questionId',
          'status',
          'correctOptionIndexes',
          'reasoning',
          'suggestedExplanation',
          'confidence',
        ],
        properties: {
          questionId: { type: 'integer' },
          status: { type: 'string', enum: ['agrees', 'disagrees', 'uncertain', 'invalid'] },
          correctOptionIndexes: { type: 'array', items: { type: 'integer' } },
          reasoning: { type: 'string' },
          /**
           * Required by the schema because OpenAI's strict mode demands every
           * property be listed in `required`; an empty string means "none".
           */
          suggestedExplanation: { type: 'string' },
          confidence: CONFIDENCE_SCHEMA,
        },
      },
    },
  },
} as const

/**
 * Workflow B: check a batch of freshly imported questions. Returns `''` for an
 * empty batch — the caller is expected not to send that.
 */
export function buildAIVerificationPrompt(questions: QuizQuestion[]): string {
  if (questions.length === 0) return ''

  const blocks = questions.map((question) =>
    formatQuestion(question, { includeSource: true, includeId: true }),
  )

  return [
    `Check the answer key on ${questions.length} question(s).`,
    '',
    blocks.join('\n\n---\n\n'),
    '',
    'For each question return one entry carrying its questionId unchanged, the',
    'options you believe are correct as indexes, a short reasoning, your',
    'confidence, and optionally a better explanation (empty string for none).',
  ].join('\n')
}
