import { formatTime } from '../utils/quiz'

interface QuizTopBarProps {
  title: string
  /** 1-based position of the question on screen. */
  current: number
  total: number
  answered: number
  /** Seconds left, or null when the run is untimed. */
  remaining: number | null
  onExit: () => void
}

/**
 * The only chrome shown while a quiz is being answered.
 *
 * Replaces the app navigation deliberately: with four destinations one tap
 * away, leaving a run half-answered would be far too easy. The single way out
 * is the labelled back button, which `App` puts behind a confirmation.
 */
export function QuizTopBar({
  title,
  current,
  total,
  answered,
  remaining,
  onExit,
}: QuizTopBarProps) {
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100)
  const urgent = remaining !== null && remaining <= 60

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3 sm:px-4">
        <button
          type="button"
          onClick={onExit}
          aria-label="Leave this quiz"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-lg text-slate-600 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          <span aria-hidden>←</span>
        </button>

        <p className="min-w-0 flex-1 truncate font-semibold">{title}</p>

        {remaining !== null && (
          <span
            aria-label="Time remaining"
            className={`shrink-0 rounded-lg px-2 py-1 font-mono text-sm font-semibold tabular-nums ${
              urgent
                ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            ⏱ {formatTime(remaining)}
          </span>
        )}

        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-400">
          {current} / {total}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${answered} of ${total} questions answered`}
        className="h-1 w-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </header>
  )
}
