import { useDeferredValue, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { QuizQuestion } from '../types/quiz'
import { parseMcqText } from '../utils/parseMcqText'

interface TextUploaderProps {
  onLoad: (questions: QuizQuestion[]) => void
}

/** Cap the preview list so pasting a huge bank doesn't bloat the DOM. */
const PREVIEW_LIMIT = 50

const PLACEHOLDER = `1. What is the powerhouse of the cell?

A. Nucleus
B. Ribosomes
C. Mitochondria
D. Lysosomes

Answer: C
Explanation: The mitochondrion (plural: mitochondria) is the powerhouse of the cell. These tiny, membrane-bound organelles take nutrients like glucose and oxygen and convert them into adenosine triphosphate (ATP), which is the primary energy currency that cells use to power bodily functions.`

/**
 * Plain-text MCQ import: paste raw questions, watch a live parsing preview,
 * then generate the quiz. Parsing runs on every keystroke but on deferred
 * input, so typing stays responsive even with large question banks.
 */
export function TextUploader({ onLoad }: TextUploaderProps) {
  const [text, setText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Defer parsing so fast typing never blocks the input.
  const deferredText = useDeferredValue(text)
  const parsed = useMemo(() => parseMcqText(deferredText), [deferredText])

  const warnings = parsed.issues.filter((i) => i.severity === 'warning')
  const hasInput = deferredText.trim() !== ''

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file)
    event.target.value = ''
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
              </p>
              <ul className="space-y-0.5">
                {q.options.map((option) => (
                  <li
                    key={option}
                    className={
                      option === q.correctAnswer
                        ? 'font-medium text-green-700 dark:text-green-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }
                  >
                    {option === q.correctAnswer ? '✓' : '•'} {option}
                  </li>
                ))}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onLoad(parsed.questions)}
          disabled={parsed.questions.length === 0}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generate quiz{parsed.questions.length > 0 ? ` (${parsed.questions.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Upload .txt file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,text/plain"
          onChange={handleFile}
          className="hidden"
          aria-label="Upload plain text question file"
        />
      </div>
    </div>
  )
}
