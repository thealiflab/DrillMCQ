import type { QuizQuestion } from '../types/quiz'
import { ExplanationPanel } from './ExplanationPanel'

interface QuizCardProps {
  question: QuizQuestion
  selectedAnswer?: string
  onSelect: (option: string) => void
}

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** One question with its options, rendered as a card. */
export function QuizCard({ question, selectedAnswer, onSelect }: QuizCardProps) {
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
      </div>

      <h2 className="mb-6 text-lg font-semibold leading-snug sm:text-xl">
        {question.question}
      </h2>

      <div role="radiogroup" aria-label="Answer options" className="space-y-3">
        {question.options.map((option, index) => {
          const selected = option === selectedAnswer
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option)}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-950/50'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700 dark:hover:bg-slate-800'
              }`}
            >
              <span
                aria-hidden
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  selected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {OPTION_KEYS[index] ?? index + 1}
              </span>
              <span className="text-sm sm:text-base">{option}</span>
            </button>
          )
        })}
      </div>

      <ExplanationPanel explanation={question.explanation} />
    </div>
  )
}
