import { useState } from 'react'
import type { QuizAttempt, QuizSettings, SavedQuiz } from '../types/quiz'
import { computeHistoryStats, formatDateTime } from '../utils/library'
import { formatTime } from '../utils/quiz'
import { ConfirmDialog } from './ConfirmDialog'

interface QuizHistoryProps {
  quiz: SavedQuiz
  /** Attempts for this quiz, newest first. */
  attempts: QuizAttempt[]
  onBack: () => void
  onRetake: () => void
  onReview: (attempt: QuizAttempt) => void
  onDeleteAttempt: (attempt: QuizAttempt) => void
}

/** One-line summary of how an attempt was configured. */
function describeSettings(settings: QuizSettings): string {
  const parts: string[] = []
  if (settings.timerMinutes > 0) parts.push(`${settings.timerMinutes} min timer`)
  else parts.push('Untimed')
  if (settings.shuffleQuestions) parts.push('shuffled questions')
  if (settings.shuffleOptions) parts.push('shuffled options')
  if (settings.categories.length > 0) parts.push(`categories: ${settings.categories.join(', ')}`)
  return parts.join(' · ')
}

/** Results history for a single saved quiz: aggregates plus every attempt. */
export function QuizHistory({
  quiz,
  attempts,
  onBack,
  onRetake,
  onReview,
  onDeleteAttempt,
}: QuizHistoryProps) {
  const [pendingDelete, setPendingDelete] = useState<QuizAttempt | null>(null)
  const stats = computeHistoryStats(attempts)

  const summary: { label: string; value: string }[] = [
    { label: 'Latest', value: stats.latest === null ? '—' : `${stats.latest}%` },
    { label: 'Best', value: stats.best === null ? '—' : `${stats.best}%` },
    { label: 'Average', value: stats.average === null ? '—' : `${stats.average}%` },
    { label: 'Attempts', value: String(stats.attempts) },
  ]

  return (
    <section className="animate-fade-slide-in space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 hover:underline dark:text-slate-400"
          >
            ← Back to My Quizzes
          </button>
          <h2 className="mt-1 text-xl font-semibold">{quiz.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Results history</p>
        </div>
        <button
          type="button"
          onClick={onRetake}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Retake quiz
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="text-base font-semibold">Attempt history</h3>

      {attempts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          No completed attempts yet. Take the quiz and your result will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {attempts.map((attempt) => (
            <li
              key={attempt.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="text-indigo-600 dark:text-indigo-400">{attempt.percentage}%</span>{' '}
                    <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                      {attempt.correct}/{attempt.total} correct
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {formatDateTime(attempt.completedAt)} · took {formatTime(attempt.timeTakenSeconds)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {describeSettings(attempt.settings)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onReview(attempt)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(attempt)}
                    aria-label={`Delete attempt from ${formatDateTime(attempt.completedAt)}`}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete !== null && (
        <ConfirmDialog
          title="Delete this attempt?"
          message={
            <>
              <p>
                The attempt from {formatDateTime(pendingDelete.completedAt)} ({pendingDelete.percentage}
                %) will be removed from your history.
              </p>
              <p className="mt-2">Your other attempts and the quiz itself are kept.</p>
            </>
          }
          confirmLabel="Delete attempt"
          danger
          onConfirm={() => {
            onDeleteAttempt(pendingDelete)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}
