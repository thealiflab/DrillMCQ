import { useState } from 'react'
import type { QuizAttempt } from '../types/quiz'
import { formatDateTime, formatRelativeDay } from '../utils/library'
import { ConfirmDialog } from './ConfirmDialog'
import { OverflowMenu } from './OverflowMenu'

interface RecentResultsProps {
  /** Newest first; the caller decides how many to pass. */
  attempts: QuizAttempt[]
  onReview: (attempt: QuizAttempt) => void
  onDelete: (attempt: QuizAttempt) => void
  heading?: string
  subheading?: string
  /**
   * Shown instead of the list when there are no attempts. Omitted on the home
   * strip, where the section simply disappears rather than taking up room.
   */
  emptyState?: React.ReactNode
  /** Adds a "See all" link beside the heading. */
  onSeeAll?: () => void
}

/**
 * The results list, spanning every quiz — including attempts at quizzes that
 * were never saved to the library, which have no other home.
 *
 * One component serves both the short home strip and the full Results screen;
 * the caller decides how many attempts to pass and what an empty list means.
 */
export function RecentResults({
  attempts,
  onReview,
  onDelete,
  heading = 'Recent results',
  subheading,
  emptyState,
  onSeeAll,
}: RecentResultsProps) {
  const [pendingDelete, setPendingDelete] = useState<QuizAttempt | null>(null)

  if (attempts.length === 0 && emptyState === undefined) return null

  return (
    <section aria-labelledby="recent-results-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="recent-results-heading" className="text-xl font-bold tracking-tight">
            {heading}
          </h2>
          {subheading !== undefined && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{subheading}</p>
          )}
        </div>
        {onSeeAll !== undefined && attempts.length > 0 && (
          <button
            type="button"
            onClick={onSeeAll}
            className="min-h-11 rounded-xl px-3 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
          >
            See all →
          </button>
        )}
      </div>

      {attempts.length === 0 ? (
        emptyState
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="flex items-center gap-2 pr-3">
              <button
                type="button"
                onClick={() => onReview(attempt)}
                aria-label={`Review ${attempt.quizName} attempt from ${formatDateTime(attempt.completedAt)}`}
                className="flex min-h-16 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{attempt.quizName}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {attempt.correct}/{attempt.total} correct · {formatRelativeDay(attempt.completedAt)}
                  </span>
                </span>
                <span className="shrink-0 text-lg font-bold text-indigo-600 tabular-nums dark:text-indigo-400">
                  {attempt.percentage}%
                </span>
              </button>
              <OverflowMenu
                label={`More actions for the ${attempt.quizName} attempt from ${formatDateTime(attempt.completedAt)}`}
                actions={[
                  { label: 'Review answers', onSelect: () => onReview(attempt) },
                  { label: 'Delete', onSelect: () => setPendingDelete(attempt), danger: true },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

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
