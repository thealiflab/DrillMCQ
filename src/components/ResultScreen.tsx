import { useMemo, useState } from 'react'
import type { QuizSession } from '../types/quiz'
import { computeResult } from '../utils/quiz'
import { ExplanationPanel } from './ExplanationPanel'

interface ResultScreenProps {
  session: QuizSession
  onRetry: () => void
  onNewQuiz: () => void
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
export function ResultScreen({ session, onRetry, onNewQuiz }: ResultScreenProps) {
  const result = useMemo(() => computeResult(session), [session])
  const [incorrectOnly, setIncorrectOnly] = useState(false)
  const [search, setSearch] = useState('')

  const reviewQuestions = session.questions.filter((q) => {
    const answer = session.answers[q.id]
    if (incorrectOnly && answer === q.correctAnswer) return false
    if (search.trim() !== '') {
      const haystack = `${q.question} ${q.options.join(' ')} ${q.category ?? ''}`.toLowerCase()
      if (!haystack.includes(search.trim().toLowerCase())) return false
    }
    return true
  })

  const grade =
    result.percentage >= 80 ? '🎉 Excellent!' : result.percentage >= 60 ? '👍 Good job!' : '📚 Keep practicing!'

  return (
    <div className="animate-fade-slide-in space-y-6">
      {/* Score summary card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-lg font-medium text-slate-600 dark:text-slate-400">{grade}</p>
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

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Retry quiz
          </button>
          <button
            type="button"
            onClick={onNewQuiz}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            New quiz
          </button>
          <button
            type="button"
            onClick={() => exportQuiz(session)}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Review controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          const isCorrect = answer === q.correctAnswer
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

              <div className="space-y-2">
                {q.options.map((option) => {
                  const isAnswer = option === q.correctAnswer
                  const isChosen = option === answer
                  return (
                    <div
                      key={option}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                        isAnswer
                          ? 'border-green-400 bg-green-50 dark:border-green-800 dark:bg-green-950/50'
                          : isChosen
                            ? 'border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
                            : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <span>{option}</span>
                      {isAnswer && (
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">
                          Correct answer
                        </span>
                      )}
                      {isChosen && !isAnswer && (
                        <span className="text-xs font-medium text-red-700 dark:text-red-400">
                          Your answer
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <ExplanationPanel explanation={q.explanation} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
