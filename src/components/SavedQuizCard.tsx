import type { AttemptStatus, HistoryStats, SavedQuiz } from '../types/quiz'
import { formatDateTime } from '../utils/library'
import { getCategories } from '../utils/quiz'

interface SavedQuizCardProps {
  quiz: SavedQuiz
  status: AttemptStatus
  stats: HistoryStats
  /** Start, resume, or retake — the label follows `status`. */
  onPrimary: () => void
  onViewResults: () => void
  onDelete: () => void
}

const STATUS_LABEL: Record<AttemptStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
}

const STATUS_CLASS: Record<AttemptStatus, string> = {
  'not-started': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  'in-progress': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
}

const PRIMARY_LABEL: Record<AttemptStatus, string> = {
  'not-started': 'Start quiz',
  'in-progress': 'Resume quiz',
  completed: 'Retake quiz',
}

/** One quiz in the library: what it is, how it went, and what to do next. */
export function SavedQuizCard({
  quiz,
  status,
  stats,
  onPrimary,
  onViewResults,
  onDelete,
}: SavedQuizCardProps) {
  const categories = getCategories(quiz.questions)
  const shownCategories = categories.slice(0, 3)
  const answeredInProgress = quiz.progress ? Object.keys(quiz.progress.answers).length : 0

  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug break-words">{quiz.name}</h3>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
        {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · Updated{' '}
        {formatDateTime(quiz.updatedAt)}
      </p>

      {shownCategories.length > 0 && (
        <ul aria-label="Categories" className="mt-3 flex flex-wrap gap-1.5">
          {shownCategories.map((category) => (
            <li
              key={category}
              className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400"
            >
              {category}
            </li>
          ))}
          {categories.length > shownCategories.length && (
            <li className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-500">
              +{categories.length - shownCategories.length} more
            </li>
          )}
        </ul>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {stats.latest !== null && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Last score</dt>
            <dd className="font-semibold text-indigo-600 dark:text-indigo-400">{stats.latest}%</dd>
          </div>
        )}
        {stats.attempts > 0 && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Attempts</dt>
            <dd className="font-semibold">{stats.attempts}</dd>
          </div>
        )}
        {status === 'in-progress' && quiz.progress && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Answered</dt>
            <dd className="font-semibold">
              {answeredInProgress}/{quiz.progress.questions.length}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          {PRIMARY_LABEL[status]}
        </button>
        <button
          type="button"
          onClick={onViewResults}
          disabled={stats.attempts === 0}
          title={stats.attempts === 0 ? 'No attempts yet' : undefined}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          View results
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${quiz.name}`}
          className="ml-auto rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50"
        >
          Delete
        </button>
      </div>
    </li>
  )
}
