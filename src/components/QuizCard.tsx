import { useEffect, useRef } from 'react'
import { playSound } from '../services/sound'
import type { QuizQuestion } from '../types/quiz'
import { isAnswerCorrect, isMultiAnswer } from '../utils/quiz'
import { ExplanationPanel } from './ExplanationPanel'

interface QuizCardProps {
  question: QuizQuestion
  /** Submitted answer. For a multi-answer question this also means "locked". */
  selectedAnswers?: string[]
  /** Options ticked on a multi-answer question but not yet checked. */
  draft?: string[]
  /** True once "Check Answer" has revealed the result for this question. */
  revealed: boolean
  /** Single-answer questions only. */
  onSelect: (option: string) => void
  /** Multi-answer questions only: tick/untick an option. */
  onToggle: (option: string) => void
  /** Submit the current selection and reveal whether it was right. */
  onCheck: () => void
}

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** One question with its options, rendered as a card. */
export function QuizCard({
  question,
  selectedAnswers,
  draft,
  revealed,
  onSelect,
  onToggle,
  onCheck,
}: QuizCardProps) {
  const multi = isMultiAnswer(question)
  // A question is frozen once its answer has been revealed; a multi-answer one
  // is frozen by its commit too, which is what a pre-reveal build wrote.
  const locked = revealed || (multi && selectedAnswers !== undefined)
  const ticked = locked ? (selectedAnswers ?? []) : multi ? (draft ?? []) : (selectedAnswers ?? [])
  // What "Check Answer" would judge: a single pick is already an answer, a
  // multi-answer selection is still a draft until this button commits it.
  const hasSelection = ticked.length > 0
  const correct = revealed && isAnswerCorrect(question, selectedAnswers)

  /*
   * The verdict sounds on a *transition*, not on a state: only for a question
   * this component watched go from unrevealed to revealed. Navigating back to
   * an already-checked question, or restoring a session parked on one, is
   * silent, because there was no transition to hear.
   *
   * It lives here because line 41 above is the only place the app knows the
   * verdict — `useQuiz.checkAnswer` computes everything inside a `setSession`
   * updater, and React runs updaters twice under StrictMode, so a side effect
   * there would double-fire and the lock it enforces is not worth reshaping.
   *
   * The ref survives navigation because App renders `<QuizCard>` without a
   * `key`, so the instance persists across questions. (The `key` on the root
   * div below is inside the component and doesn't remount it.)
   */
  const armedFor = useRef<number | null>(null)
  useEffect(() => {
    if (!revealed) {
      armedFor.current = question.id
      return
    }
    if (armedFor.current !== question.id) return
    armedFor.current = null
    playSound(correct ? 'correct' : 'incorrect')
  }, [question.id, revealed, correct])

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
            Select all that apply · {question.correctAnswers.length} correct
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
          const isCorrectOption = question.correctAnswers.includes(option)
          // Before the reveal an option only shows "you picked this". After it,
          // colour carries the verdict: green marks every correct option, red
          // marks a pick that wasn't one.
          const tone = !revealed
            ? selected
              ? 'chosen'
              : 'plain'
            : isCorrectOption
              ? 'right'
              : selected
                ? 'wrong'
                : 'plain'

          return (
            <button
              key={option}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={selected}
              disabled={locked}
              onClick={() => (multi ? onToggle(option) : onSelect(option))}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                tone === 'chosen'
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-950/50'
                  : tone === 'right'
                    ? 'border-green-500 bg-green-50 ring-2 ring-green-500/30 dark:border-green-700 dark:bg-green-950/50'
                    : tone === 'wrong'
                      ? 'border-red-500 bg-red-50 ring-2 ring-red-500/30 dark:border-red-800 dark:bg-red-950/50'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              } ${
                locked
                  ? // A revealed card is for reading, so it keeps full contrast;
                    // an un-revealed lock stays dimmed as before.
                    revealed
                    ? 'cursor-default'
                    : 'cursor-not-allowed opacity-70'
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
                  tone === 'chosen'
                    ? 'bg-indigo-600 text-white'
                    : tone === 'right'
                      ? 'bg-green-600 text-white'
                      : tone === 'wrong'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {revealed
                  ? tone === 'right'
                    ? '✓'
                    : tone === 'wrong'
                      ? '✗'
                      : (OPTION_KEYS[index] ?? index + 1)
                  : multi && selected
                    ? '✓'
                    : (OPTION_KEYS[index] ?? index + 1)}
              </span>
              <span className="flex-1 text-sm sm:text-base">{option}</span>
              {revealed && (tone === 'right' || tone === 'wrong') && (
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    tone === 'right'
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {tone === 'right'
                    ? selected
                      ? 'Correct'
                      : multi
                        ? 'Missed'
                        : 'Answer'
                    : 'Your pick'}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* The verdict. Announced politely so it reaches a screen reader that
          never sees the colour change. */}
      {revealed && (
        <div
          aria-live="polite"
          className={`animate-fade-slide-in mt-5 rounded-xl border p-4 ${
            correct
              ? 'border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/50'
              : 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/50'
          }`}
        >
          <p
            className={`text-sm font-semibold sm:text-base ${
              correct ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'
            }`}
          >
            {correct
              ? '✓ Correct'
              : selectedAnswers === undefined
                ? '✗ Not answered'
                : multi
                  ? '✗ Not quite — your selection is incomplete or has an extra option'
                  : '✗ Incorrect'}
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="font-medium">
              {multi ? `Correct answers (${question.correctAnswers.length}):` : 'Correct answer:'}
            </span>{' '}
            {question.correctAnswers.join(' · ')}
          </p>
          {!correct && selectedAnswers !== undefined && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">You chose:</span> {selectedAnswers.join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Checking is deliberate and one-way: it locks the question in at the
          answer on screen, and never moves the quiz along by itself. */}
      <div className="mt-5">
        {revealed ? (
          <p className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            ✓ Answer checked — review it above, then continue when you're ready.
          </p>
        ) : locked ? (
          // Committed by a build that predates the reveal, so there is nothing
          // left to check on this one.
          <p className="rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400">
            ✓ Answer recorded ({ticked.length} selected)
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={onCheck}
              disabled={!hasSelection}
              className="min-h-12 w-full rounded-xl bg-amber-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Check Answer{multi && hasSelection ? ` (${ticked.length} selected)` : ''}
            </button>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {hasSelection
                ? 'Reveals the correct answer. Your choice is locked in once checked.'
                : multi
                  ? 'Tick the options you think are correct, then check.'
                  : 'Pick an option to check it.'}
            </p>
          </>
        )}
      </div>

      {/* Remounted on reveal so the explanation opens itself alongside the
          verdict, and collapses back for the next unchecked question. */}
      <ExplanationPanel
        key={revealed ? 'revealed' : 'hidden'}
        explanation={question.explanation}
        defaultOpen={revealed}
      />
    </div>
  )
}
