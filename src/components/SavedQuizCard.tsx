import type { AttemptStatus, HistoryStats, SavedQuiz } from '../types/quiz'
import { formatRelativeDay, progressSummary } from '../utils/library'
import { getCategories } from '../utils/quiz'
import type { MenuAction } from './OverflowMenu'
import { OverflowMenu } from './OverflowMenu'

interface SavedQuizCardProps {
  quiz: SavedQuiz
  status: AttemptStatus
  stats: HistoryStats
  /** The one visible action: Start, Continue, or Start again. */
  onPrimary: () => void
  /** Restart from question 1, discarding an unfinished run. */
  onStartOver: () => void
  onViewResults: () => void
  onRename: () => void
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
  'not-started': 'Start',
  'in-progress': 'Continue',
  completed: 'Start again',
}

/**
 * One quiz in the library: what it is, how it went, and what to do next.
 *
 * Exactly one action is a button — the one the status implies. Everything
 * else sits in the overflow menu, so the card reads as a quiz rather than as
 * a toolbar.
 */
export function SavedQuizCard({
  quiz,
  status,
  stats,
  onPrimary,
  onStartOver,
  onViewResults,
  onRename,
  onDelete,
}: SavedQuizCardProps) {
  const categories = getCategories(quiz.questions)
  const shownCategories = categories.slice(0, 3)
  const progress = quiz.progress ? progressSummary(quiz.progress) : null

  const actions: MenuAction[] = [
    // Only meaningful while a run is unfinished — otherwise the primary
    // button already starts from the beginning.
    ...(status === 'in-progress' ? [{ label: 'Start again', onSelect: onStartOver }] : []),
    {
      label: 'View results',
      onSelect: onViewResults,
      disabled: stats.attempts === 0,
      title: stats.attempts === 0 ? 'No attempts yet' : undefined,
    },
    { label: 'Rename', onSelect: onRename },
    { label: 'Delete', onSelect: onDelete, danger: true },
  ]

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
        {formatRelativeDay(quiz.updatedAt)}
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

      {progress !== null && (
        <div className="mt-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Progress: {progress.percent}% · {progress.answered}/{progress.total} answered
          </p>
          <div
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${quiz.name} progress`}
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          >
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {stats.latest !== null && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Last score</dt>
            <dd className="font-semibold text-indigo-600 dark:text-indigo-400">{stats.latest}%</dd>
          </div>
        )}
        {stats.best !== null && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Best</dt>
            <dd className="font-semibold">{stats.best}%</dd>
          </div>
        )}
        {stats.attempts > 0 && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Attempts</dt>
            <dd className="font-semibold">{stats.attempts}</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button
          type="button"
          onClick={onPrimary}
          className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:flex-none"
        >
          {PRIMARY_LABEL[status]}
        </button>
        <OverflowMenu label={`More actions for ${quiz.name}`} actions={actions} />
      </div>
    </li>
  )
}
