interface StepIndicatorProps {
  /** 1-based index of the step the user is on. */
  current: number
}

const STEPS = ['Paste', 'Review', 'Start'] as const

/**
 * Where you are in the create-a-quiz flow.
 *
 * Two screens, three beats: pasting (with its live preview), reviewing and
 * configuring the parsed bank, then the quiz itself. Step 3 is the
 * destination — it is never "current", because by then the quiz has started.
 */
export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <ol className="flex items-center gap-1.5 text-sm sm:gap-2">
      {STEPS.map((label, index) => {
        const step = index + 1
        const state = step < current ? 'done' : step === current ? 'current' : 'todo'
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-2">
            {index > 0 && (
              <span aria-hidden className="text-slate-300 dark:text-slate-700">
                →
              </span>
            )}
            <span
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 font-medium ${
                state === 'current'
                  ? 'bg-indigo-600 text-white'
                  : state === 'done'
                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400'
                    : 'text-slate-500 dark:text-slate-500'
              }`}
            >
              <span
                aria-hidden
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  state === 'current'
                    ? 'bg-white/25 text-white'
                    : state === 'done'
                      ? 'bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {state === 'done' ? '✓' : step}
              </span>
              {label}
              {state === 'done' && <span className="sr-only">(done)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
