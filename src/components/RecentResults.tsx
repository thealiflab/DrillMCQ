import { useEffect, useState } from 'react'
import type { SaveAttemptResult } from '../hooks/useSavedQuizzes'
import { playSound } from '../services/sound'
import type { QuizAttempt } from '../types/quiz'
import { formatDateTime, formatRelativeDay } from '../utils/library'
import { ConfirmDialog } from './ConfirmDialog'
import type { MenuAction } from './OverflowMenu'
import { OverflowMenu } from './OverflowMenu'

/** How long the "Saved to Quiz Library" confirmation stays up. */
const FEEDBACK_MS = 5000

interface RecentResultsProps {
  /** Newest first; the caller decides how many to pass. */
  attempts: QuizAttempt[]
  onReview: (attempt: QuizAttempt) => void
  onDelete: (attempt: QuizAttempt) => void
  /**
   * Files the attempt's questions in the Quiz Library. Omitted only if a caller
   * wants a read-only list; when omitted the menu item isn't offered at all.
   */
  onSaveToLibrary?: (attempt: QuizAttempt) => SaveAttemptResult
  /** Whether this attempt's questions are already in the library. */
  isInLibrary?: (attempt: QuizAttempt) => boolean
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
  onSaveToLibrary,
  isInLibrary,
  heading = 'Recent results',
  subheading,
  emptyState,
  onSeeAll,
}: RecentResultsProps) {
  const [pendingDelete, setPendingDelete] = useState<QuizAttempt | null>(null)
  const [feedback, setFeedback] = useState<SaveAttemptResult | null>(null)

  // The confirmation clears itself so it can't linger over an unrelated action
  // later in the session. Re-saving restarts the timer, because `feedback` is
  // a new object each time.
  useEffect(() => {
    if (feedback === null) return
    const timer = window.setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const handleSave = (attempt: QuizAttempt) => {
    if (onSaveToLibrary === undefined) return
    const outcome = onSaveToLibrary(attempt)
    // Only a real save sounds. "Already saved" changed nothing, and the menu
    // item is disabled in that state anyway — a tone there would only ever
    // accompany a race.
    if (outcome.status === 'saved') playSound('save')
    setFeedback(outcome)
  }

  /**
   * "Save to Quiz Library" turns into a disabled "Already saved" rather than
   * disappearing, so the row's actions don't move around and the state is
   * visible instead of merely implied.
   */
  const buildActions = (attempt: QuizAttempt): MenuAction[] => {
    const actions: MenuAction[] = [{ label: 'Review answers', onSelect: () => onReview(attempt) }]

    if (onSaveToLibrary !== undefined) {
      const saved = isInLibrary?.(attempt) ?? false
      actions.push({
        label: saved ? 'Already saved' : 'Save to Quiz Library',
        onSelect: () => handleSave(attempt),
        disabled: saved,
        title: saved
          ? 'These questions are already in your Quiz Library.'
          : 'Keep these questions in your library so you can retake them.',
      })
    }

    actions.push({ label: 'Delete', onSelect: () => setPendingDelete(attempt), danger: true })
    return actions
  }

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

      {feedback !== null && (
        <p
          role="status"
          className="animate-fade-slide-in rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400"
        >
          {feedback.status === 'saved' ? (
            <>
              Saved to Quiz Library as <strong>{feedback.quiz.name}</strong>.
            </>
          ) : (
            <>
              Already in your Quiz Library as <strong>{feedback.quiz.name}</strong> — nothing was
              duplicated.
            </>
          )}
        </p>
      )}

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
                actions={buildActions(attempt)}
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
