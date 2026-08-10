import { AI_COMMON_SYSTEM } from './shared'

/**
 * Workflow D: repair a quiz-JSON paste that `parseQuizJson` rejected.
 *
 * The result is **JSON source text**, handed back to the textarea — exactly the
 * arrangement `buildAIFormattingPrompt` uses for plain text, and for the same
 * reason. `parseQuizJson` still validates every question before it becomes a
 * quiz, so the model cannot smuggle in a `correctAnswers` entry that doesn't
 * match an option, a duplicate id, or an option list of one; it just gets a
 * chance to fix the syntax first. Never feed this straight to `onLoad`.
 */

/**
 * Upper bound on the JSON sent in one request. Lower than the plain-text cap:
 * JSON is punctuation-heavy, so the same character count costs more tokens on
 * the way in and on the way back out.
 */
export const AI_JSON_REPAIR_MAX_CHARS = 40_000

/** Delimiter around the pasted source. Neutralized if it appears in the input. */
const RAW_FENCE = '<<<RAW_QUIZ_JSON>>>'

export const AI_JSON_REPAIR_SYSTEM =
  `${AI_COMMON_SYSTEM} ` +
  'You are repairing a JSON file of multiple-choice questions so a strict validator will accept it. ' +
  'You are fixing, not authoring: preserve the meaning of the source exactly. ' +
  'Never invent a question, an option, an answer, or an explanation, and never drop one. ' +
  'If a question has no answer you can recover from the source, leave its "correctAnswers" as an ' +
  'empty array rather than guessing.'

export const AI_JSON_REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'notes'],
  properties: {
    text: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const

/**
 * The target shape. Mirrors `JsonUploader`'s placeholder and the rules enforced
 * by `parseQuizJson` — keep the two in step.
 */
const TARGET_FORMAT = `[
  {
    "id": 1,
    "question": "What is the powerhouse of the cell?",
    "options": ["Nucleus", "Ribosomes", "Mitochondria", "Lysosomes"],
    "correctAnswers": ["Mitochondria"],
    "explanation": "Mitochondria convert nutrients into ATP.",
    "category": "Biology",
    "difficulty": "easy"
  }
]`

export function buildAIJsonRepairPrompt(rawJson: string): string {
  // The paste could contain the fence itself and break out of it.
  const safe = rawJson.split(RAW_FENCE).join('<<<RAW_QUIZ_JSON_ESCAPED>>>')
  const truncated = safe.length > AI_JSON_REPAIR_MAX_CHARS
  const body = truncated ? safe.slice(0, AI_JSON_REPAIR_MAX_CHARS) : safe

  return [
    'Fix the quiz JSON below so it is valid and matches this shape exactly:',
    '',
    TARGET_FORMAT,
    '',
    'Rules the validator enforces:',
    '- The whole document is one array of question objects.',
    '- "id" is a number and is unique across the array.',
    '- "question" is a non-empty string.',
    '- "options" is an array of at least 2 strings.',
    '- "correctAnswers" is an array of strings, each one an *exact*',
    '  character-for-character copy of an entry in that question\'s "options".',
    '  Fix the copy rather than the option if they disagree only in wording.',
    '- "explanation", "category" and "difficulty" are optional strings. Omit a',
    '  key rather than giving it null.',
    '- No comments, no trailing commas, no unquoted keys, double quotes only.',
    '',
    'Also repair the obvious structural damage: missing commas or brackets,',
    'single quotes, unescaped quotes inside strings, and truncated entries.',
    'Keep every question that is in the source, in the same order, and keep the',
    'wording as close to the source as you can.',
    truncated ? '- The source was truncated; repair only what is given below.' : null,
    '',
    'Return the corrected JSON as a string in "text" — the array only, with no',
    'markdown fence and no commentary — and a short list of what you fixed in',
    '"notes".',
    '',
    RAW_FENCE,
    body,
    RAW_FENCE,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}
