import type { QuizQuestion } from '../../types/quiz'

/**
 * Bits shared by the three prompt builders. Pure — no React, no I/O.
 *
 * Two conventions run through every prompt in this folder:
 *
 * 1. **Options are addressed by index, never quoted back.** The model sees
 *    `[0] …` `[1] …` and answers with integers, which the validator maps back
 *    to the exact option strings. `isAnswerCorrect` is exact-set equality over
 *    those strings (`utils/quiz.ts`), so a model that paraphrases an option by
 *    a single character would silently produce an unmatchable answer. Indexes
 *    make that impossible.
 * 2. **The model is asked to judge before it is told the source answer**, so a
 *    wrong source key is less likely to anchor it.
 */

/** Shared preamble. Kept short — modern models over-apply emphatic prompts. */
export const AI_COMMON_SYSTEM =
  'You are reviewing multiple-choice questions for a study app. ' +
  'Reply with JSON only, matching the provided schema. ' +
  'Never invent options that were not given. ' +
  'When you are not confident, say so through the confidence field rather than guessing.'

/** `[0] Paris` / `[1] Rome`, one per line. */
export function formatOptions(options: string[]): string {
  return options.map((option, index) => `[${index}] ${option}`).join('\n')
}

/** Indexes of a question's correct answers, for stating the source key. */
export function answerIndexes(question: QuizQuestion): number[] {
  const indexes: number[] = []
  question.correctAnswers.forEach((answer) => {
    const index = question.options.indexOf(answer)
    if (index !== -1) indexes.push(index)
  })
  return indexes
}

/**
 * One question, rendered for a prompt. `includeSource` is false only where the
 * model should form its own view first.
 */
export function formatQuestion(
  question: QuizQuestion,
  options: { includeSource?: boolean; includeId?: boolean } = {},
): string {
  const lines: string[] = []
  if (options.includeId === true) lines.push(`Question id: ${question.id}`)
  lines.push(`Question: ${question.question}`)
  lines.push('Options:')
  lines.push(formatOptions(question.options))
  lines.push(
    question.correctAnswers.length > 1
      ? `This question expects ${question.correctAnswers.length} correct options.`
      : 'This question expects exactly one correct option.',
  )
  if (options.includeSource === true) {
    const indexes = answerIndexes(question)
    lines.push(
      indexes.length > 0
        ? `Answer supplied by the source material: ${indexes.join(', ')}`
        : 'The source material supplied no usable answer.',
    )
    if (question.explanation !== undefined && question.explanation.trim() !== '') {
      lines.push(`Explanation supplied by the source material: ${question.explanation}`)
    }
  }
  return lines.join('\n')
}

/**
 * JSON Schema fragment for a confidence field.
 *
 * Schemas in this folder use only the keywords that *both* OpenAI's strict
 * `json_schema` mode and Anthropic's structured outputs accept: `type`,
 * `properties`, `required`, `additionalProperties`, `enum`, `items`. Length and
 * count caps are deliberately absent — those providers reject `maxLength` and
 * `minItems`, so the caps are enforced in `validateAIResponse` instead.
 */
export const CONFIDENCE_SCHEMA = { type: 'string', enum: ['high', 'medium', 'low'] } as const
