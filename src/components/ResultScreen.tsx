import { useMemo, useRef, useState } from 'react'
import type { QuizQuestion, QuizSession } from '../types/quiz'
import { computeResult, isAnswerCorrect, isMultiAnswer } from '../utils/quiz'
import { ConfirmDialog } from './ConfirmDialog'
import { ExplanationPanel } from './ExplanationPanel'

/** Injected renderer for the optional per-question extras (the AI panel). */
export type ResultScreenExtras = (
  question: QuizQuestion,
  selected: string[] | undefined,
) => React.ReactNode

interface ResultScreenProps {
  session: QuizSession
  /** Omitted when reviewing a stored attempt, where there's nothing to retry. */
  onRetry?: () => void
  onNewQuiz: () => void
  /** Label for the "leave this screen" action — "Back to history" in review mode. */
  newQuizLabel?: string
  /** Shown when the attempt belongs to a saved quiz. */
  onViewHistory?: () => void
  /** Straight to the Quiz Library. Omitted in review mode, which has its own back. */
  onLibrary?: () => void
  onHome?: () => void
  /** Optional context line, e.g. the quiz name and attempt date. */
  subtitle?: string
  /**
   * Extra content rendered at the bottom of each review block. Used for the
   * optional AI explanation panel, which is injected rather than imported so
   * this screen keeps no dependency on the AI layer.
   */
  renderQuestionExtras?: ResultScreenExtras
}

/** Triggers a download of the loaded quiz as a JSON file. */
function exportQuiz(session: QuizSession) {
  const blob = new Blob([JSON.stringify(session.questions, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'quiz.json'
  a.click()
  URL.revokeObjectURL(url)
}

/** Score summary plus a per-question answer review. */
export function ResultScreen({
  session,
  onRetry,
  onNewQuiz,
  newQuizLabel = 'Create Quiz',
  onViewHistory,
  onLibrary,
  onHome,
  subtitle,
  renderQuestionExtras,
}: ResultScreenProps) {
  const result = useMemo(() => computeResult(session), [session])
  const [incorrectOnly, setIncorrectOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [confirmRetry, setConfirmRetry] = useState(false)
  const reviewRef = useRef<HTMLDivElement>(null)

  const reviewQuestions = session.questions.filter((q) => {
    if (incorrectOnly && isAnswerCorrect(q, session.answers[q.id])) return false
    if (search.trim() !== '') {
      const haystack = `${q.question} ${q.options.join(' ')} ${q.category ?? ''}`.toLowerCase()
      if (!haystack.includes(search.trim().toLowerCase())) return false
    }
    return true
  })

  const grade =
    result.percentage >= 80 ? '🎉 Excellent!' : result.percentage >= 60 ? '👍 Good job!' : '📚 Keep practicing!'

  const secondary =
    'min-h-11 rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'

  return (
    <div className="animate-fade-slide-in space-y-6">
      {/* Score summary card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-bold tracking-tight">
          {onRetry === undefined ? 'Attempt review' : 'Quiz complete'}
        </h2>
        {subtitle !== undefined && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
        <p className="mt-2 text-lg font-medium text-slate-600 dark:text-slate-400">{grade}</p>
        <p className="my-2 text-5xl font-bold text-indigo-600 dark:text-indigo-400">
          {result.percentage}%
        </p>
        <p className="text-slate-600 dark:text-slate-400">
          You scored {result.correct} out of {result.total}
        </p>

        <dl className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-green-50 p-3 dark:bg-green-950/50">
            <dt className="text-green-700 dark:text-green-400">Correct</dt>
            <dd className="text-2xl font-bold text-green-700 dark:text-green-400">{result.correct}</dd>
          </div>
          <div className="rounded-xl bg-red-50 p-3 dark:bg-red-950/50">
            <dt className="text-red-700 dark:text-red-400">Incorrect</dt>
            <dd className="text-2xl font-bold text-red-700 dark:text-red-400">{result.incorrect}</dd>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <dt className="text-slate-600 dark:text-slate-400">Skipped</dt>
            <dd className="text-2xl font-bold text-slate-600 dark:text-slate-400">{result.unanswered}</dd>
          </div>
        </dl>

        {/* What to do next, in order of likelihood. Full-width and stacked on
            a phone so every one of them is an easy tap. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => reviewRef.current?.scrollIntoView({ block: 'start' })}
            className="min-h-11 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Review answers
          </button>
          {onRetry !== undefined && (
            <button type="button" onClick={() => setConfirmRetry(true)} className={secondary}>
              Retry quiz
            </button>
          )}
          {onLibrary !== undefined && (
            <button type="button" onClick={onLibrary} className={secondary}>
              Back to Quiz Library
            </button>
          )}
          <button type="button" onClick={onNewQuiz} className={secondary}>
            {newQuizLabel}
          </button>
          {onViewHistory !== undefined && (
            <button type="button" onClick={onViewHistory} className={secondary}>
              Results history
            </button>
          )}
          {onHome !== undefined && (
            <button type="button" onClick={onHome} className={secondary}>
              Home
            </button>
          )}
        </div>

        {/* A utility, not a next step — kept out of the grid above. */}
        <button
          type="button"
          onClick={() => exportQuiz(session)}
          className="mt-4 min-h-11 rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
        >
          Export questions as JSON
        </button>
      </div>

      {confirmRetry && onRetry !== undefined && (
        <ConfirmDialog
          title="Start this quiz again from the beginning?"
          message={
            <p>
              You'll answer all {result.total} questions again as a new attempt. This result stays
              in your Results history.
            </p>
          }
          confirmLabel="Retry quiz"
          onConfirm={() => {
            setConfirmRetry(false)
            onRetry()
          }}
          onCancel={() => setConfirmRetry(false)}
        />
      )}

      {/* Review controls. The heading is the scroll target for "Review answers". */}
      <div
        ref={reviewRef}
        className="flex scroll-mt-20 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <h3 className="text-lg font-semibold">Answer review</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions…"
            aria-label="Search reviewed questions"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={incorrectOnly}
              onChange={(e) => setIncorrectOnly(e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            Incorrect only
          </label>
        </div>
      </div>

      {/* Per-question review */}
      <div className="space-y-4">
        {reviewQuestions.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Nothing to show — adjust the filters above.
          </p>
        )}
        {reviewQuestions.map((q) => {
          const answer = session.answers[q.id]
          const isCorrect = isAnswerCorrect(q, answer)
          const chosen = answer ?? []
          return (
            <div
              key={q.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="font-medium leading-snug">{q.question}</p>
                <span
                  aria-label={isCorrect ? 'Correct' : answer === undefined ? 'Skipped' : 'Incorrect'}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    isCorrect
                      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                      : answer === undefined
                        ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                  }`}
                >
                  {isCorrect ? '✓ Correct' : answer === undefined ? '— Skipped' : '✗ Incorrect'}
                </span>
              </div>

              {isMultiAnswer(q) && (
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Select all that apply · {q.correctAnswers.length} correct options
                </p>
              )}

              <div className="space-y-2">
                {q.options.map((option) => {
                  const isAnswer = q.correctAnswers.includes(option)
                  const isChosen = chosen.includes(option)
                  return (
                    <div
                      key={option}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                        isAnswer
                          ? isChosen
                            ? 'border-green-400 bg-green-50 dark:border-green-800 dark:bg-green-950/50'
                            : 'border-green-400 dark:border-green-800'
                          : isChosen
                            ? 'border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
                            : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <span>{option}</span>
                      {isAnswer && isChosen && (
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">
                          ✓ Correct
                        </span>
                      )}
                      {isAnswer && !isChosen && (
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">
                          Correct answer{answer === undefined ? '' : ' (missed)'}
                        </span>
                      )}
                      {isChosen && !isAnswer && (
                        <span className="text-xs font-medium text-red-700 dark:text-red-400">
                          ✗ Your answer
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <ExplanationPanel explanation={q.explanation} />
              {renderQuestionExtras?.(q, answer)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
