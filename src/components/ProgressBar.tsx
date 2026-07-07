interface ProgressBarProps {
  current: number
  total: number
  answered: number
}

/** Progress through the quiz: bar shows answered count, label shows position. */
export function ProgressBar({ current, total, answered }: ProgressBarProps) {
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100)

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>
          Question <span className="font-semibold text-slate-900 dark:text-slate-100">{current}</span> of {total}
        </span>
        <span>
          {answered}/{total} answered
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Quiz progress"
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
