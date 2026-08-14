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
  'The source may be a PDF dump, a copied web page, or an exam sheet, so expect ' +
  'headings, page furniture, odd labels and answers written in unusual places. ' +
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
 * One messy-in / clean-out pair.
 *
 * Worth its tokens: a formatting model follows a demonstration far more
 * reliably than a rule list, and this one carries four rules at once — a
 * heading becoming a Category, options crammed onto one line, an answer marked
 * on the option instead of on a line of its own, and page furniture being
 * dropped.
 */
const EXAMPLE_INPUT = `Unit 3: Cell Biology                       Page 14

Q.1) Which organelle is the powerhouse of the cell?
(a) Nucleus  (b) Ribosomes  (c) *Mitochondria  (d) Lysosomes
[Show Answer]

Q.2) Name the process shown in figure 4.2.`

const EXAMPLE_OUTPUT = `1. Which organelle is the powerhouse of the cell?

A. Nucleus
B. Ribosomes
C. Mitochondria
D. Lysosomes

Answer: C
Category: Cell Biology`

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
    'KEEP OR DROP',
    '- Keep every question, its options, the answer the source marks, and any',
    '  explanation the source gives.',
    '- Drop page numbers, running headers and footers, watermarks, adverts,',
    '  navigation, "Show Answer" buttons, share widgets, and exam instructions',
    '  such as "Time: 60 minutes" or "Attempt all questions".',
    '- Drop anything that cannot become a multiple-choice question: fewer than two',
    '  options, fill-in-the-blank, essay prompts, or a question whose options are',
    '  only in a figure. List each one you dropped in "notes".',
    '',
    'STRUCTURE',
    '- One question per block, separated by a blank line, numbered 1, 2, 3, …',
    '- Re-label the options A, B, C, D, … whatever the source used: (a), (iii),',
    '  1., dashes, bullets, or checkbox glyphs such as ❏ ☐ □ ○.',
    '- Put each option on its own line, even where the source crams several onto',
    '  one line.',
    '- Rejoin a question or option split across lines by page wrapping, including',
    '  words broken by a hyphen at a line end.',
    '- A heading that names a topic ("Unit 3: Cell Biology", "Chapter 2 — Storage")',
    '  becomes a "Category: <topic>" line on each question underneath it.',
    '',
    'ANSWERS',
    '- The source may mark the correct option anywhere: an "Answer:" / "Ans" /',
    '  "Sol." / "Correct option is B" line, a tick (✓ ✔ ☑), an asterisk, bold, or',
    '  the word "(correct)" on the option itself, or an answer key at the bottom.',
    '- An answer key at the bottom belongs to the questions above it: match it by',
    '  question number, or in order when the questions are not numbered. Move each',
    '  answer onto its question and do not repeat the key section in your output.',
    '- Always write it as "Answer: B", using the letter the option has in YOUR',
    '  output, and "Answer: A, C" when the source marks more than one option.',
    '- If the source never says which option is correct, omit the Answer line.',
    '  Do not work the answer out yourself.',
    '- Use "Explanation:" for the source\'s own reasoning, on one line.',
    '',
    'NEVER',
    '- Never invent a question, an option, an answer, or an explanation, and keep',
    '  the wording as close to the source as you can.',
    truncated ? '- The source was truncated; format only what is given below.' : null,
    '',
    'Example input:',
    EXAMPLE_INPUT,
    '',
    'Example output:',
    EXAMPLE_OUTPUT,
    '(The heading and page number went, the crammed options were split out, the',
    'asterisk became the Answer line, and Q.2 was dropped for having no options —',
    'which is what "notes" would say.)',
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
