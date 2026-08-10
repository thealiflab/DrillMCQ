import { useState } from 'react'
import type { UseAI } from '../hooks/useAI'
import type { AIFormattingResult } from '../types/ai'
import type { QuizQuestion } from '../types/quiz'
import { AI_JSON_REPAIR_MAX_CHARS } from '../utils/ai/buildAIJsonRepairPrompt'
import { parseQuizJson } from '../utils/quiz'

interface JsonUploaderProps {
  onLoad: (questions: QuizQuestion[]) => void
  /** Present only when the AI assistant is configured. */
  ai?: UseAI
}

const SCHEMA_EXAMPLE = `[
  {
    "id": 1,
    "question": "What is the powerhouse of the cell?",
    "options": ["Nucleus", "Ribosomes", "Mitochondria", "Lysosomes"],
    "correctAnswers": ["Mitochondria"],
    "explanation": "The mitochondrion (plural: mitochondria) is the powerhouse of the cell. These tiny, membrane-bound organelles take nutrients like glucose and oxygen and convert them into adenosine triphosphate (ATP), which is the primary energy currency that cells use to power bodily functions.",
    "category": "Biology",
    "difficulty": "easy"
  },
  {
    "id": 2,
    "question": "Which of the following are programming languages?",
    "options": ["Python", "HTML", "Java", "CSS"],
    "correctAnswers": ["Python", "Java"],
    "explanation": "HTML is a markup language and CSS is a stylesheet language.",
    "category": "Computing"
  }
]`

/**
 * Quiz import: paste JSON into the textarea.
 * Validates the payload and surfaces a friendly error when it's malformed.
 */
export function JsonUploader({ onLoad, ai }: JsonUploaderProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Set while an AI repair is showing, so it can be undone.
  const [repair, setRepair] = useState<AIFormattingResult | null>(null)
  const [preAiText, setPreAiText] = useState<string | null>(null)

  const aiReady = ai?.ready === true
  const repairingNow = ai?.active?.kind === 'json-repair'
  const tooLong = text.length > AI_JSON_REPAIR_MAX_CHARS

  // A long paste is repaired in several requests, so show where it is up to.
  const repairProgress =
    repairingNow && ai?.active?.total !== undefined && ai.active.total > 1
      ? ` part ${(ai.active.done ?? 0) + 1} of ${ai.active.total}`
      : ''

  const tryLoad = (raw: string) => {
    const result = parseQuizJson(raw)
    if (result.ok) {
      setError(null)
      onLoad(result.questions)
    } else {
      setError(result.error)
    }
  }

  const loadSample = async () => {
    const sample = await import('../data/sampleQuiz.json')
    const raw = JSON.stringify(sample.default, null, 2)
    setText(raw)
    tryLoad(raw)
  }

  /**
   * Put the repaired JSON back in the textarea rather than loading it.
   *
   * `parseQuizJson` still decides what becomes a quiz, so the AI can only
   * propose source text — it cannot slip past the id, option and exact-answer
   * checks — and the user sees precisely what will be validated. The result is
   * re-validated immediately so a repair that didn't work says so straight
   * away instead of waiting for a click on Load quiz.
   */
  const runRepair = async () => {
    if (ai === undefined) return
    const before = text
    const result = await ai.repairJson(before)
    if (result === null) return
    setPreAiText(before)
    setText(result.text)
    setRepair(result)

    const check = parseQuizJson(result.text)
    setError(check.ok ? null : check.error)
  }

  const undoRepair = () => {
    if (preAiText === null) return
    setText(preAiText)
    setPreAiText(null)
    setRepair(null)
    setError(null)
  }

  return (
    <div className="space-y-4">
      <label htmlFor="quiz-json" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        Paste your quiz JSON
      </label>
      <textarea
        id="quiz-json"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        placeholder={SCHEMA_EXAMPLE}
        rows={10}
        spellCheck={false}
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-600"
      />

      {/* Optional AI repair. Hidden entirely when the assistant is off. */}
      {aiReady && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={repairingNow ? ai?.cancel : () => void runRepair()}
              disabled={(ai?.busy === true && !repairingNow) || text.trim() === '' || tooLong}
              className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950"
            >
              {repairingNow ? `✨ Fixing${repairProgress}… (cancel)` : '✨ Fix JSON with AI'}
            </button>
            {preAiText !== null && !repairingNow && (
              <button
                type="button"
                onClick={undoRepair}
                className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                ↩ Undo AI fix
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

          {repair !== null && (
            <div className="animate-fade-slide-in rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/50">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">✨ Repaired by AI — check it before loading</p>
                <button
                  type="button"
                  onClick={() => setRepair(null)}
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Dismiss
                </button>
              </div>
              {repair.notes.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
                  {repair.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {error === null
                  ? 'It now passes validation — but the AI may have changed wording, so read it before loading.'
                  : 'It still does not validate. Fix the remaining problem above by hand, or try again.'}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="animate-fade-slide-in rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
        >
          <strong className="font-semibold">Invalid quiz JSON.</strong> {error}
          {aiReady && !repairingNow && ' You can try “Fix JSON with AI” above.'}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => tryLoad(text)}
          disabled={text.trim() === ''}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Load quiz
        </button>
        <button
          type="button"
          onClick={loadSample}
          className="px-2 py-2.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Try the sample quiz
        </button>
      </div>
    </div>
  )
}
