import { useState } from 'react'
import type { QuizAttempt } from '../types/quiz'
import { formatDateTime } from '../utils/library'
import { ConfirmDialog } from './ConfirmDialog'

interface RecentResultsProps {
  /** Newest first; the caller decides how many to pass. */
  attempts: QuizAttempt[]
  onReview: (attempt: QuizAttempt) => void
  onDelete: (attempt: QuizAttempt) => void
}

/**
 * Compact "recent results" strip for the main screen, spanning every quiz —
 * including attempts at quizzes that were never saved to the library, which
 * have no other home.
 */
export function RecentResults({ attempts, onReview, onDelete }: RecentResultsProps) {
  const [pendingDelete, setPendingDelete] = useState<QuizAttempt | null>(null)

  if (attempts.length === 0) return null

  return (
    <section aria-labelledby="recent-results-heading" className="space-y-3">
      <h2 id="recent-results-heading" className="text-lg font-semibold">
        🕘 Recent results
      </h2>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{attempt.quizName}</span>
            <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              {attempt.percentage}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateTime(attempt.completedAt)}
            </span>
            <button
              type="button"
              onClick={() => onReview(attempt)}
              aria-label={`Review ${attempt.quizName} attempt from ${formatDateTime(attempt.completedAt)}`}
              className="text-sm font-medium text-slate-500 hover:text-indigo-600 hover:underline dark:text-slate-400"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(attempt)}
              aria-label={`Delete ${attempt.quizName} attempt from ${formatDateTime(attempt.completedAt)}`}
              className="text-sm font-medium text-slate-500 hover:text-red-600 hover:underline dark:text-slate-400"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {pendingDelete !== null && (
        <ConfirmDialog
          title="Delete this attempt?"
          message={
            <p>
              The <strong>{pendingDelete.quizName}</strong> attempt from{' '}
              {formatDateTime(pendingDelete.completedAt)} ({pendingDelete.percentage}%) will be removed
              from your history.
            </p>
          }
          confirmLabel="Delete attempt"
          danger
          onConfirm={() => {
            onDelete(pendingDelete)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}
