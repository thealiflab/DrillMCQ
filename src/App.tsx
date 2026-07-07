import { useEffect, useState } from 'react'
import { QuizImporter } from './components/QuizImporter'
import { ProgressBar } from './components/ProgressBar'
import { QuizCard } from './components/QuizCard'
import { QuizSetup } from './components/QuizSetup'
import { ResultScreen } from './components/ResultScreen'
import { ThemeToggle } from './components/ThemeToggle'
import { useQuiz } from './hooks/useQuiz'
import { useTheme } from './hooks/useTheme'
import { useTimer } from './hooks/useTimer'
import type { QuizQuestion, QuizSession } from './types/quiz'
import { formatTime } from './utils/quiz'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const quiz = useQuiz()
  // Questions loaded from JSON but not yet started (setup phase).
  const [pendingQuestions, setPendingQuestions] = useState<QuizQuestion[] | null>(null)

  const { session } = quiz

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            🎯 Drill<span className="text-indigo-600 dark:text-indigo-400">MCQ</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Paste questions. Get a quiz. Entirely in your browser.
          </p>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        {session === null && pendingQuestions === null && (
          <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <QuizImporter onLoad={setPendingQuestions} />
          </div>
        )}

        {session === null && pendingQuestions !== null && (
          <QuizSetup
            questions={pendingQuestions}
            onStart={(settings) => {
              quiz.startQuiz(pendingQuestions, settings)
              setPendingQuestions(null)
            }}
            onDiscard={() => setPendingQuestions(null)}
          />
        )}

        {session !== null && session.status === 'active' && (
          <ActiveQuiz session={session} quiz={quiz} />
        )}

        {session !== null && session.status === 'finished' && (
          <ResultScreen session={session} onRetry={quiz.retryQuiz} onNewQuiz={quiz.resetQuiz} />
        )}
      </main>
    </div>
  )
}

interface ActiveQuizProps {
  session: QuizSession
  quiz: ReturnType<typeof useQuiz>
}

/** The in-progress quiz view: timer, progress, current question, navigation. */
function ActiveQuiz({ session, quiz }: ActiveQuizProps) {
  const { questions, currentIndex, answers } = session
  const question = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const answeredCount = Object.keys(answers).length
  const [confirmFinish, setConfirmFinish] = useState(false)

  const remaining = useTimer(session.startedAt, session.timerMinutes, true, quiz.finishQuiz)

  // Keyboard navigation: ←/→ move between questions, 1–8 or A–H pick an option.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in an input.
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (event.key === 'ArrowRight') quiz.next()
      else if (event.key === 'ArrowLeft') quiz.previous()
      else {
        // Number keys 1-8
        const num = Number(event.key)
        let optionIndex = Number.isInteger(num) && num >= 1 ? num - 1 : -1
        // Letter keys a-h
        if (optionIndex === -1 && /^[a-h]$/i.test(event.key)) {
          optionIndex = event.key.toLowerCase().charCodeAt(0) - 97
        }
        if (optionIndex >= 0 && optionIndex < question.options.length) {
          quiz.selectAnswer(question.id, question.options[optionIndex])
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [quiz, question])

  const handleFinish = () => {
    // Ask for confirmation when questions are still unanswered,
    // so a stray click can't throw the attempt away.
    if (answeredCount < questions.length && !confirmFinish) {
      setConfirmFinish(true)
      return
    }
    quiz.finishQuiz()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ProgressBar current={currentIndex + 1} total={questions.length} answered={answeredCount} />
        </div>
        {remaining !== null && (
          <div
            aria-label="Time remaining"
            className={`rounded-xl border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums ${
              remaining <= 60
                ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            ⏱ {formatTime(remaining)}
          </div>
        )}
      </div>

      <QuizCard
        question={question}
        selectedAnswer={answers[question.id]}
        onSelect={(option) => quiz.selectAnswer(question.id, option)}
      />

      {confirmFinish && (
        <div
          role="alert"
          className="animate-fade-slide-in rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400"
        >
          {questions.length - answeredCount} question(s) are still unanswered. Click{' '}
          <strong>Finish</strong> again to submit anyway.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={quiz.previous}
          disabled={currentIndex === 0}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          ← Previous
        </button>

        <button
          type="button"
          onClick={quiz.resetQuiz}
          className="text-sm font-medium text-slate-500 hover:text-red-600 hover:underline dark:text-slate-400"
        >
          Quit
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleFinish}
            className="rounded-xl bg-green-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-green-700"
          >
            Finish ✓
          </button>
        ) : (
          <button
            type="button"
            onClick={quiz.next}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Next →
          </button>
        )}
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Tip: use ← → to navigate, 1–{Math.min(question.options.length, 8)} or A–
        {String.fromCharCode(64 + Math.min(question.options.length, 8))} to answer
      </p>
    </div>
  )
}
