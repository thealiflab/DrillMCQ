import { useCallback, useEffect, useRef, useState } from 'react'
import { QuizImporter } from './components/QuizImporter'
import { ProgressBar } from './components/ProgressBar'
import { QuizCard } from './components/QuizCard'
import { QuizHistory } from './components/QuizHistory'
import { QuizSetup } from './components/QuizSetup'
import { RecentResults } from './components/RecentResults'
import { ResultScreen } from './components/ResultScreen'
import { SavedQuizList } from './components/SavedQuizList'
import { SaveQuizPanel } from './components/SaveQuizPanel'
import { ThemeToggle } from './components/ThemeToggle'
import { useQuiz } from './hooks/useQuiz'
import { useQuizHistory } from './hooks/useQuizHistory'
import { useSavedQuizzes } from './hooks/useSavedQuizzes'
import { useTheme } from './hooks/useTheme'
import { useTimer } from './hooks/useTimer'
import { isStorageAvailable } from './services/storage'
import type { QuizAttempt, QuizQuestion, QuizSession, SavedQuiz } from './types/quiz'
import { attemptToSession, formatDateTime, progressToSession } from './utils/library'
import { formatTime, isMultiAnswer } from './utils/quiz'

/** How many entries the main-screen "recent results" strip shows. */
const RECENT_RESULTS_LIMIT = 5

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const quiz = useQuiz()
  const library = useSavedQuizzes()
  const history = useQuizHistory()

  // Questions loaded from an import (or picked from the library) but not yet
  // started — the setup phase.
  const [pendingQuestions, setPendingQuestions] = useState<QuizQuestion[] | null>(null)
  // Set when the pending questions belong to a saved quiz, so the resulting
  // attempt is filed against it.
  const [pendingQuiz, setPendingQuiz] = useState<SavedQuiz | null>(null)
  // Which saved quiz's history is open, and which attempt is being reviewed.
  const [historyQuizId, setHistoryQuizId] = useState<string | null>(null)
  const [reviewAttempt, setReviewAttempt] = useState<QuizAttempt | null>(null)
  const [storageAvailable] = useState(isStorageAvailable)

  const { session } = quiz
  const { saveProgress, completeProgress, refresh: refreshLibrary } = library
  const { recordSession, refresh: refreshHistory } = history

  // Mirror an in-progress run onto its saved quiz so the library can show it
  // as "In progress" and resume it later.
  useEffect(() => {
    if (session && session.status === 'active' && session.quizId) saveProgress(session)
  }, [session, saveProgress])

  // Convert a submitted session into a permanent result, exactly once per
  // attempt (the ref guards re-renders; storage guards reloads).
  const recordedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!session || session.status !== 'finished') return
    if (recordedRef.current.has(session.attemptId)) return
    recordedRef.current.add(session.attemptId)
    const attempt = recordSession(session)
    if (session.quizId) completeProgress(session.quizId, attempt.id)
  }, [session, recordSession, completeProgress])

  /** Send a question bank to the setup screen, optionally tied to a saved quiz. */
  const openSetup = useCallback((questions: QuizQuestion[], saved: SavedQuiz | null) => {
    setPendingQuestions(questions)
    setPendingQuiz(saved)
    setHistoryQuizId(null)
    setReviewAttempt(null)
  }, [])

  const clearSetup = useCallback(() => {
    setPendingQuestions(null)
    setPendingQuiz(null)
  }, [])

  const handleResume = useCallback(
    (saved: SavedQuiz) => {
      if (!saved.progress) return
      setHistoryQuizId(null)
      setReviewAttempt(null)
      quiz.resumeSession(progressToSession(saved, saved.progress))
    },
    [quiz],
  )

  const handleDeleteQuiz = useCallback(
    (saved: SavedQuiz) => {
      library.removeQuiz(saved.id)
      // Storage drops the quiz's attempts with it — resync the history state.
      refreshHistory()
      if (historyQuizId === saved.id) setHistoryQuizId(null)
      if (reviewAttempt?.quizId === saved.id) setReviewAttempt(null)
      if (session?.quizId === saved.id) quiz.resetQuiz()
      if (pendingQuiz?.id === saved.id) clearSetup()
    },
    [library, refreshHistory, historyQuizId, reviewAttempt, session, quiz, pendingQuiz, clearSetup],
  )

  const handleDeleteAttempt = useCallback(
    (attempt: QuizAttempt) => {
      history.removeAttempt(attempt.id)
      if (reviewAttempt?.id === attempt.id) setReviewAttempt(null)
      // The quiz may have pointed at this attempt as its latest.
      refreshLibrary()
    },
    [history, reviewAttempt, refreshLibrary],
  )

  /** Leave the finished-result screen for the quiz's history view. */
  const openHistoryFor = useCallback(
    (quizId: string) => {
      quiz.resetQuiz()
      clearSetup()
      setReviewAttempt(null)
      setHistoryQuizId(quizId)
    },
    [quiz, clearSetup],
  )

  const historyQuiz = historyQuizId ? library.quizzes.find((q) => q.id === historyQuizId) ?? null : null

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
        {/* 1. Reviewing a stored attempt — reuses the live result screen. */}
        {reviewAttempt !== null && (
          <ResultScreen
            session={attemptToSession(reviewAttempt)}
            onNewQuiz={() => setReviewAttempt(null)}
            newQuizLabel={historyQuizId !== null ? 'Back to history' : 'Back to My Quizzes'}
            subtitle={`${reviewAttempt.quizName} · ${formatDateTime(reviewAttempt.completedAt)}`}
          />
        )}

        {/* 2. A saved quiz's results history. */}
        {reviewAttempt === null && historyQuiz !== null && (
          <QuizHistory
            quiz={historyQuiz}
            attempts={history.forQuiz(historyQuiz.id)}
            onBack={() => setHistoryQuizId(null)}
            onRetake={() => openSetup(historyQuiz.questions, historyQuiz)}
            onReview={setReviewAttempt}
            onDeleteAttempt={handleDeleteAttempt}
          />
        )}

        {/* 3. An in-progress quiz. */}
        {reviewAttempt === null && historyQuiz === null && session?.status === 'active' && (
          <ActiveQuiz session={session} quiz={quiz} />
        )}

        {/* 4. The result of the run just submitted. */}
        {reviewAttempt === null && historyQuiz === null && session?.status === 'finished' && (
          <FinishedQuiz
            session={session}
            onRetry={quiz.retryQuiz}
            onNewQuiz={quiz.resetQuiz}
            onViewHistory={openHistoryFor}
          />
        )}

        {/* 5. Setup for a freshly imported or freshly picked quiz. */}
        {reviewAttempt === null && historyQuiz === null && session === null && pendingQuestions !== null && (
          <div className="space-y-4">
            <SaveQuizPanel
              questionCount={pendingQuestions.length}
              duplicate={pendingQuiz ?? library.findSavedDuplicate(pendingQuestions)}
              savedName={pendingQuiz?.name ?? null}
              storageAvailable={storageAvailable}
              onSave={(name) => setPendingQuiz(library.saveQuiz(name, pendingQuestions))}
              onUpdate={(quizId) => setPendingQuiz(library.updateQuiz(quizId, pendingQuestions))}
            />
            <QuizSetup
              questions={pendingQuestions}
              onStart={(settings) => {
                quiz.startQuiz(pendingQuestions, settings, {
                  quizId: pendingQuiz?.id,
                  quizName: pendingQuiz?.name,
                })
                clearSetup()
              }}
              onDiscard={clearSetup}
            />
          </div>
        )}

        {/* 6. Home: import, library, recent results. */}
        {reviewAttempt === null && historyQuiz === null && session === null && pendingQuestions === null && (
          <div className="space-y-8">
            <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
              <QuizImporter onLoad={(questions) => openSetup(questions, null)} />
            </div>

            <SavedQuizList
              quizzes={library.quizzes}
              statsFor={history.statsFor}
              onStart={(saved) => openSetup(saved.questions, saved)}
              onResume={handleResume}
              onViewResults={(saved) => setHistoryQuizId(saved.id)}
              onDelete={handleDeleteQuiz}
            />

            <RecentResults
              attempts={history.recent(RECENT_RESULTS_LIMIT)}
              onReview={setReviewAttempt}
              onDelete={handleDeleteAttempt}
            />
          </div>
        )}
      </main>
    </div>
  )
}

interface FinishedQuizProps {
  session: QuizSession
  onRetry: () => void
  onNewQuiz: () => void
  onViewHistory: (quizId: string) => void
}

/** Result of the run just submitted, with a jump into its history if saved. */
function FinishedQuiz({ session, onRetry, onNewQuiz, onViewHistory }: FinishedQuizProps) {
  const quizId = session.quizId
  return (
    <ResultScreen
      session={session}
      onRetry={onRetry}
      onNewQuiz={onNewQuiz}
      onViewHistory={quizId === undefined ? undefined : () => onViewHistory(quizId)}
    />
  )
}

interface ActiveQuizProps {
  session: QuizSession
  quiz: ReturnType<typeof useQuiz>
}

/** The in-progress quiz view: timer, progress, current question, navigation. */
function ActiveQuiz({ session, quiz }: ActiveQuizProps) {
  const { questions, currentIndex, answers, drafts } = session
  const question = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const answeredCount = Object.keys(answers).length
  const [confirmFinish, setConfirmFinish] = useState(false)

  const multi = isMultiAnswer(question)
  const locked = multi && answers[question.id] !== undefined

  const remaining = useTimer(session.startedAt, session.timerMinutes, true, quiz.finishQuiz)

  // Keyboard navigation: ←/→ move between questions, 1–8 or A–H pick an option.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in an input.
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (event.key === 'ArrowRight') quiz.next()
      else if (event.key === 'ArrowLeft') quiz.previous()
      else if (event.key === 'Enter') {
        // Enter submits a multi-answer question, mirroring "Check answer".
        if (multi && !locked) quiz.commitAnswer(question.id)
      } else {
        // Number keys 1-8
        const num = Number(event.key)
        let optionIndex = Number.isInteger(num) && num >= 1 ? num - 1 : -1
        // Letter keys a-h
        if (optionIndex === -1 && /^[a-h]$/i.test(event.key)) {
          optionIndex = event.key.toLowerCase().charCodeAt(0) - 97
        }
        if (optionIndex >= 0 && optionIndex < question.options.length) {
          const option = question.options[optionIndex]
          // On a multi-answer question the key toggles the draft instead of
          // answering outright; once checked it does nothing.
          if (multi) quiz.toggleDraft(question.id, option)
          else quiz.selectAnswer(question.id, option)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [quiz, question, multi, locked])

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
      {session.quizName !== undefined && (
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{session.quizName}</p>
      )}

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
        selectedAnswers={answers[question.id]}
        draft={drafts[question.id]}
        onSelect={(option) => quiz.selectAnswer(question.id, option)}
        onToggle={(option) => quiz.toggleDraft(question.id, option)}
        onCheck={() => quiz.commitAnswer(question.id)}
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
          title={
            session.quizId
              ? 'Your progress is kept — resume from My Quizzes'
              : 'This attempt will be discarded'
          }
          className="text-sm font-medium text-slate-500 hover:text-red-600 hover:underline dark:text-slate-400"
        >
          Exit
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
        {String.fromCharCode(64 + Math.min(question.options.length, 8))} to{' '}
        {multi ? 'tick options, Enter to check' : 'answer'}
      </p>
    </div>
  )
}
