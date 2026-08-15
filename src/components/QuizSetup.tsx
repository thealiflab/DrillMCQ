import { useState } from 'react'
import { useBusyAction } from '../hooks/useBusyAction'
import type { QuizQuestion, QuizSettings } from '../types/quiz'
import {
  DEFAULT_PASS_PERCENTAGE,
  getCategories,
  normalizePassPercentage,
  questionsNeededToPass,
} from '../utils/quiz'
import { Spinner } from './Spinner'

const numberField =
  'w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900'

interface QuizSetupProps {
  questions: QuizQuestion[]
  onStart: (settings: QuizSettings) => void
  onDiscard: () => void
}

/**
 * Shown after a quiz is loaded but before it starts: pick shuffle options,
 * an optional timer, and which categories to include.
 */
export function QuizSetup({ questions, onStart, onDiscard }: QuizSetupProps) {
  const categories = getCategories(questions)
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [timerMinutes, setTimerMinutes] = useState(0)
  const [passPercentage, setPassPercentage] = useState(DEFAULT_PASS_PERCENTAGE)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  // Filtering, shuffling and persisting the session is synchronous; yield a
  // frame first so the spinner is visible while it happens.
  const [starting, start] = useBusyAction()

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )
  }

  const effectiveCount = selectedCategories.length
    ? questions.filter((q) => q.category && selectedCategories.includes(q.category)).length
    : questions.length

  return (
    <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Configure your quiz</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {questions.length} questions ready. Choose how you want to take them.
          </p>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-slate-500 transition-colors hover:text-red-600 dark:text-slate-400"
        >
          Start over
        </button>
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            Shuffle questions
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(e) => setShuffleOptions(e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            Shuffle options
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="timer" className="mb-1.5 block text-sm font-medium">
              Timer (minutes) — 0 for untimed
            </label>
            <input
              id="timer"
              type="number"
              min={0}
              max={480}
              value={timerMinutes}
              onChange={(e) => setTimerMinutes(Math.max(0, Number(e.target.value) || 0))}
              className={numberField}
            />
          </div>

          <div>
            <label htmlFor="pass-mark" className="mb-1.5 block text-sm font-medium">
              Pass mark (%)
            </label>
            <input
              id="pass-mark"
              type="number"
              min={0}
              max={100}
              step={1}
              value={passPercentage}
              onChange={(e) => setPassPercentage(normalizePassPercentage(Number(e.target.value)))}
              aria-describedby="pass-mark-hint"
              className={numberField}
            />
            <p id="pass-mark-hint" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {effectiveCount === 0
                ? 'Score at or above this to pass.'
                : `At least ${questionsNeededToPass(effectiveCount, passPercentage)} of ${effectiveCount} correct to pass.`}
            </p>
          </div>
        </div>

        {categories.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">
              Categories <span className="font-normal text-slate-500">(none selected = all)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const active = selectedCategories.includes(category)
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    aria-pressed={active}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {category}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            start(() =>
              onStart({
                shuffleQuestions,
                shuffleOptions,
                timerMinutes,
                categories: selectedCategories,
                passPercentage,
              }),
            )
          }
          disabled={effectiveCount === 0 || starting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {starting && <Spinner label={null} />}
          {starting ? 'Starting…' : `Start quiz (${effectiveCount} questions)`}
        </button>
      </div>
    </div>
  )
}
