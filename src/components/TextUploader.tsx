import { useDeferredValue, useMemo, useState } from 'react'
import type { UseAI } from '../hooks/useAI'
import type { AIFormattingResult } from '../types/ai'
import type { QuizQuestion } from '../types/quiz'
import { AI_FORMATTING_MAX_CHARS } from '../utils/ai/buildAIFormattingPrompt'
import { parseMcqText } from '../utils/parseMcqText'
import { isMultiAnswer } from '../utils/quiz'

interface TextUploaderProps {
  onLoad: (questions: QuizQuestion[]) => void
  /** Present only when the AI assistant is configured. */
  ai?: UseAI
}

/** Cap the preview list so pasting a huge bank doesn't bloat the DOM. */
const PREVIEW_LIMIT = 50

const PLACEHOLDER = `1. What is the powerhouse of the cell?

A. Nucleus
B. Ribosomes
C. Mitochondria
D. Lysosomes

Answer: C
Explanation: The mitochondrion (plural: mitochondria) is the powerhouse of the cell. These tiny, membrane-bound organelles take nutrients like glucose and oxygen and convert them into adenosine triphosphate (ATP), which is the primary energy currency that cells use to power bodily functions.

2. Which of the following are programming languages?

A. Python
B. HTML
C. Java
D. CSS

Answer: A, C
Explanation: HTML and CSS are markup and styling languages, not programming languages.

Sample Exam Question 3
Which AWS service records configuration changes over time?

❏ A. AWS Security Hub
❏ B. AWS Config
❏ C. AWS CloudTrail

✓ B. AWS Config`

/**
 * Plain-text MCQ import: paste raw questions, watch a live parsing preview,
 * then generate the quiz. Parsing runs on every keystroke but on deferred
 * input, so typing stays responsive even with large question banks.
 */
export function TextUploader({ onLoad, ai }: TextUploaderProps) {
  const [text, setText] = useState('')

  // Set while an AI reformat is showing, so it can be undone.
  const [formatting, setFormatting] = useState<AIFormattingResult | null>(null)
  const [preAiText, setPreAiText] = useState<string | null>(null)

  // Defer parsing so fast typing never blocks the input.
  const deferredText = useDeferredValue(text)
  const parsed = useMemo(() => parseMcqText(deferredText), [deferredText])

  const warnings = parsed.issues.filter((i) => i.severity === 'warning')
  const hasInput = deferredText.trim() !== ''

  const aiReady = ai?.ready === true
  const formattingNow = ai?.active?.kind === 'formatting'
  const tooLong = text.length > AI_FORMATTING_MAX_CHARS

  /**
   * Hand the tidied text back to the textarea rather than to `onLoad`.
   *
   * This is the whole point of the workflow: `parseMcqText` stays the only
   * thing that turns text into questions, so the AI cannot bypass the noise
   * filter or the answer matching, and the user sees and can edit exactly what
   * will be parsed.
   */
  const runFormat = async () => {
    if (ai === undefined) return
    const before = text
    const result = await ai.formatText(before)
    if (result === null) return
    setPreAiText(before)
    setText(result.text)
    setFormatting(result)
  }

  const undoFormat = () => {
    if (preAiText === null) return
    setText(preAiText)
    setPreAiText(null)
    setFormatting(null)
  }

  return (
    <div className="space-y-4">
      <label htmlFor="quiz-text" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        Paste your questions as plain text
      </label>
      <textarea
        id="quiz-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={14}
        spellCheck={false}
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-600"
      />

      {/* Optional AI clean-up. Hidden entirely when the assistant is off. */}
      {aiReady && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={formattingNow ? ai?.cancel : () => void runFormat()}
              disabled={(ai?.busy === true && !formattingNow) || text.trim() === '' || tooLong}
              className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950"
            >
              {formattingNow ? '✨ Formatting… (cancel)' : '✨ Format with AI'}
            </button>
            {preAiText !== null && !formattingNow && (
              <button
                type="button"
                onClick={undoFormat}
                className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                ↩ Undo AI formatting
              </button>
            )}
            {tooLong && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Too long to send ({text.length.toLocaleString()} characters). Paste it in
                smaller chunks.
              </span>
            )}
          </div>

          {ai?.error != null && (
            <div
              role="alert"
              className="animate-fade-slide-in rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
            >
              {ai.error.message}
              {ai.error.retryable && ' You can try again.'}
            </div>
          )}

          {formatting !== null && (
            <div className="animate-fade-slide-in rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/50">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">✨ Reformatted by AI — check it before continuing</p>
                <button
                  type="button"
                  onClick={() => setFormatting(null)}
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Dismiss
                </button>
              </div>
              {formatting.notes.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
                  {formatting.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                The preview below comes from the normal parser, not the AI — edit the text
                above if anything looks wrong.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Live parsing summary */}
      {hasInput && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              parsed.questions.length > 0
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {parsed.questions.length} question{parsed.questions.length === 1 ? '' : 's'} detected
          </span>
          {parsed.skipped > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
              {parsed.skipped} skipped
            </span>
          )}
          {parsed.ignored > 0 && (
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {parsed.ignored} clutter line{parsed.ignored === 1 ? '' : 's'} ignored
            </span>
          )}
          {warnings.length > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              {warnings.length} warning{warnings.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {/* Issues */}
      {hasInput && parsed.issues.length > 0 && (
        <div
          role="alert"
          className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40"
        >
          {parsed.issues.map((issue, idx) => (
            <p
              key={idx}
              className={
                issue.severity === 'error'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-amber-700 dark:text-amber-400'
              }
            >
              <span className="font-mono text-xs opacity-70">L{issue.line}</span>{' '}
              {issue.severity === 'error' ? '✗' : '⚠'} {issue.message}
            </p>
          ))}
        </div>
      )}

      {/* Preview of parsed questions */}
      {parsed.questions.length > 0 && (
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Preview
          </p>
          {parsed.questions.slice(0, PREVIEW_LIMIT).map((q) => (
            <div
              key={q.id}
              className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="mb-1.5 font-medium">
                {q.id}. {q.question}
                {q.category && (
                  <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {q.category}
                  </span>
                )}
                {isMultiAnswer(q) && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {q.correctAnswers.length} answers
                  </span>
                )}
              </p>
              <ul className="space-y-0.5">
                {q.options.map((option) => {
                  const correct = q.correctAnswers.includes(option)
                  return (
                    <li
                      key={option}
                      className={
                        correct
                          ? 'font-medium text-green-700 dark:text-green-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }
                    >
                      {correct ? '✓' : '•'} {option}
                    </li>
                  )
                })}
              </ul>
              {q.explanation && (
                <p className="mt-1.5 text-xs italic text-slate-500 dark:text-slate-500">
                  💡 {q.explanation}
                </p>
              )}
            </div>
          ))}
          {parsed.questions.length > PREVIEW_LIMIT && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              …and {parsed.questions.length - PREVIEW_LIMIT} more questions
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onLoad(parsed.questions)}
        disabled={parsed.questions.length === 0}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generate quiz{parsed.questions.length > 0 ? ` (${parsed.questions.length})` : ''}
      </button>
    </div>
  )
}
