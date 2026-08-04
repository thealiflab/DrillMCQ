import type { QuizQuestion } from '../types/quiz'
import { isMultiAnswer } from '../utils/quiz'
import { ExplanationPanel } from './ExplanationPanel'

interface QuizCardProps {
  question: QuizQuestion
  /** Submitted answer. For a multi-answer question this also means "locked". */
  selectedAnswers?: string[]
  /** Options ticked on a multi-answer question but not yet checked. */
  draft?: string[]
  /** Single-answer questions only. */
  onSelect: (option: string) => void
  /** Multi-answer questions only: tick/untick an option. */
  onToggle: (option: string) => void
  /** Multi-answer questions only: submit the draft and lock the question. */
  onCheck: () => void
}

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** One question with its options, rendered as a card. */
export function QuizCard({
  question,
  selectedAnswers,
  draft,
  onSelect,
  onToggle,
  onCheck,
}: QuizCardProps) {
  const multi = isMultiAnswer(question)
  // A multi-answer question is frozen the moment it has been checked; a
  // single-answer one stays editable until the quiz is finished.
  const locked = multi && selectedAnswers !== undefined
  const ticked = locked ? (selectedAnswers ?? []) : multi ? (draft ?? []) : (selectedAnswers ?? [])

  return (
    <div
      key={question.id}
      className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {question.category && (
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {question.category}
          </span>
        )}
        {question.difficulty && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {question.difficulty}
          </span>
        )}
        {multi && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Select all that apply
          </span>
        )}
      </div>

      <h2 className="mb-6 text-lg font-semibold leading-snug sm:text-xl">
        {question.question}
      </h2>

      <div
        role={multi ? 'group' : 'radiogroup'}
        aria-label="Answer options"
        className="space-y-3"
      >
        {question.options.map((option, index) => {
          const selected = ticked.includes(option)
          return (
            <button
              key={option}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={selected}
              disabled={locked}
              onClick={() => (multi ? onToggle(option) : onSelect(option))}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-950/50'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              } ${
                locked
                  ? 'cursor-not-allowed opacity-70'
                  : selected
                    ? ''
                    : 'hover:border-indigo-300 hover:bg-slate-50 dark:hover:border-indigo-700 dark:hover:bg-slate-800'
              }`}
            >
              <span
                aria-hidden
                className={`flex size-7 shrink-0 items-center justify-center text-sm font-semibold ${
                  multi ? 'rounded-md' : 'rounded-full'
                } ${
                  selected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {multi && selected ? '✓' : (OPTION_KEYS[index] ?? index + 1)}
              </span>
              <span className="text-sm sm:text-base">{option}</span>
            </button>
          )
        })}
      </div>

      {/* Multi-answer questions are submitted deliberately, one at a time.
          Correctness is never shown here — that stays on the result screen. */}
      {multi && (
        <div className="mt-5">
          {locked ? (
            <p className="rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400">
              ✓ Answer recorded ({ticked.length} selected)
            </p>
          ) : (
            <button
              type="button"
              onClick={onCheck}
              disabled={ticked.length === 0}
              className="rounded-xl bg-amber-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check answer{ticked.length > 0 ? ` (${ticked.length} selected)` : ''}
            </button>
          )}
          {!locked && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              This question can only be answered once.
            </p>
          )}
        </div>
      )}

      <ExplanationPanel explanation={question.explanation} />
    </div>
  )
}
