import { AI_COMMON_SYSTEM } from './shared'

/**
 * Upper bound on the raw text sent for formatting. `TextUploader` disables the
 * button above this so the user gets a clear message; the builder truncates as
 * well, so a caller that forgets cannot silently blow the model's context.
 */
export const AI_FORMATTING_MAX_CHARS = 60_000

/** Delimiter around the pasted text. Neutralized if it appears in the input. */
const RAW_FENCE = '<<<RAW_MCQ_TEXT>>>'

export const AI_FORMATTING_SYSTEM =
  `${AI_COMMON_SYSTEM} ` +
  'You are tidying up messy question text so a strict plain-text parser can read it. ' +
  'You are reformatting, not authoring: preserve the meaning of the source exactly. ' +
  'Never invent a question, an option, an answer, or an explanation. ' +
  'If a question has no answer in the source, omit its Answer line rather than guessing.'

export const AI_FORMATTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'notes'],
  properties: {
    text: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const

/**
 * The target shape, mirroring `TextUploader`'s placeholder — which is the
 * format `parseMcqText` is written against.
 */
const TARGET_FORMAT = `1. What is the powerhouse of the cell?

A. Nucleus
B. Ribosomes
C. Mitochondria
D. Lysosomes

Answer: C
Explanation: Mitochondria convert nutrients into ATP.

2. Which of the following are programming languages?

A. Python
B. HTML
C. Java
D. CSS

Answer: A, C`

/**
 * Workflow C: clean up a messy paste. The result is plain text that goes back
 * into the textarea, so `parseMcqText` stays the only thing that ever produces
 * question objects — the AI cannot bypass noise filtering or answer matching.
 */
export function buildAIFormattingPrompt(rawText: string): string {
  // A pasted document could contain the fence itself and break out of it.
  const safe = rawText.split(RAW_FENCE).join('<<<RAW_MCQ_TEXT_ESCAPED>>>')
  const truncated = safe.length > AI_FORMATTING_MAX_CHARS
  const body = truncated ? safe.slice(0, AI_FORMATTING_MAX_CHARS) : safe

  return [
    'Reformat the multiple-choice questions below into this exact format:',
    '',
    TARGET_FORMAT,
    '',
    'Rules:',
    '- Number each question and start options at A.',
    '- Use "Answer: B" for a single answer and "Answer: A, C" for several.',
    '- Use "Explanation:" and "Category:" lines only where the source has them.',
    '- Separate questions with a blank line.',
    '- If the source ends with a separate answer key ("ANSWER KEY", "ANSWERS",',
    '  "SOLUTIONS", … followed by lines like "1. C", "2 - A", "3: B, D"), move each',
    '  answer onto its own question as an "Answer:" line, matching by question',
    '  number, and any text the key gives with it as an "Explanation:" line.',
    '  Do not repeat the answer key section in your output.',
    '- Leave a question without an "Answer:" line if the key has no entry for it.',
    '- Drop website clutter: navigation, ads, page numbers, share widgets,',
    '  "Show Answer" buttons, copyright footers.',
    '- Keep question and option wording as close to the source as you can.',
    truncated ? '- The source was truncated; format only what is given below.' : null,
    '',
    'Return the reformatted text in "text", and a short list of what you changed',
    'or dropped in "notes".',
    '',
    RAW_FENCE,
    body,
    RAW_FENCE,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}
