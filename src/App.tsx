import { useCallback, useEffect, useRef, useState } from 'react'
import { AIAnswerExplanation } from './components/AIAnswerExplanation'
import { AIBusyOverlay } from './components/AIBusyOverlay'
import { AISettings } from './components/AISettings'
import { AIVerificationPanel } from './components/AIVerificationPanel'
import { AppNav } from './components/AppNav'
import { ConfirmDialog } from './components/ConfirmDialog'
import { HomeDashboard } from './components/HomeDashboard'
import { QuizCard } from './components/QuizCard'
import { QuizHistory } from './components/QuizHistory'
import { QuizImporter } from './components/QuizImporter'
import { QuizSetup } from './components/QuizSetup'
import { QuizTopBar } from './components/QuizTopBar'
import { RecentResults } from './components/RecentResults'
import { ResultScreen, type ResultScreenExtras } from './components/ResultScreen'
import { SavedQuizList } from './components/SavedQuizList'
import { SaveQuizPanel } from './components/SaveQuizPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { StepIndicator } from './components/StepIndicator'
import { useAI } from './hooks/useAI'
import { useAppearance } from './hooks/useAppearance'
import { useQuiz } from './hooks/useQuiz'
import { useQuizHistory } from './hooks/useQuizHistory'
import { useSavedQuizzes } from './hooks/useSavedQuizzes'
import { useTheme } from './hooks/useTheme'
import { useTimer } from './hooks/useTimer'
import { PROVIDERS } from './services/ai/models'
import { isStorageAvailable } from './services/storage'
import type { AIRequestKind } from './types/ai'
import type { View } from './types/navigation'
import type { QuizAttempt, QuizQuestion, QuizSession, SavedQuiz } from './types/quiz'
import {
  attemptToSession,
  findResumable,
  formatDateTime,
  progressToSession,
  sortAttemptsByRecency,
} from './utils/library'
import { isMultiAnswer, isQuestionLocked, isRevealed } from './utils/quiz'

/** How many entries the home dashboard's "recent results" strip shows. */
const RECENT_RESULTS_LIMIT = 5

/**
 * AI workflows that block the screen while they run.
 *
 * These three are started from the import and setup screens, where the pasted
 * text and the pending questions live in component state — navigating away or
 * switching importer tab mid-request would throw both away. An `explanation` is
 * deliberately absent: it can't lose anything, so the results screen stays usable.
 */
const BLOCKING_AI_KINDS = new Set<AIRequestKind>(['formatting', 'json-repair', 'verification'])

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { appearance, updateAppearance, resetAppearance } = useAppearance()
  const quiz = useQuiz()
  const library = useSavedQuizzes()
  const history = useQuizHistory()
  // The AI assistant owns its own state so this component doesn't grow one
  // branch per workflow; everything below just reads `ai.ready`.
  const ai = useAI()

  // Which of the four destinations is showing. Everything else on screen is a
  // sub-state layered over one of them — see `types/navigation.ts`.
  const [view, setView] = useState<View>('home')
  // Questions loaded from an import (or picked from the library) but not yet
  // started — the setup phase of the Create Quiz flow.
  const [pendingQuestions, setPendingQuestions] = useState<QuizQuestion[] | null>(null)
  // Set when the pending questions belong to a saved quiz, so the resulting
  // attempt is filed against it.
  const [pendingQuiz, setPendingQuiz] = useState<SavedQuiz | null>(null)
  // Which saved quiz's history is open, and which attempt is being reviewed.
  const [historyQuizId, setHistoryQuizId] = useState<string | null>(null)
  const [reviewAttempt, setReviewAttempt] = useState<QuizAttempt | null>(null)
  const [storageAvailable] = useState(isStorageAvailable)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)

  const { session } = quiz
  const { resetQuiz } = quiz
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

  // Every screen change starts at the top. Without this a tall screen (a long
  // paste, a finished result) leaves the next one scrolled halfway down, which
  // reads as a broken navigation.
  const screenKey = [
    view,
    pendingQuestions === null ? 'import' : 'setup',
    historyQuizId ?? '',
    reviewAttempt?.id ?? '',
    session?.status ?? 'none',
  ].join('|')
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [screenKey])

  const clearSetup = useCallback(() => {
    setPendingQuestions(null)
    setPendingQuiz(null)
    // Verdicts belong to the bank that just went away.
    ai.clearVerifications()
  }, [ai])

  /**
   * Go to a top-level destination, dropping the sub-states layered over it.
   *
   * A finished result is dropped too — the attempt is already recorded in the
   * history, so nothing is lost. A pending import is deliberately *kept*, so
   * checking the library mid-import doesn't throw away a paste.
   */
  const navigate = useCallback(
    (next: View) => {
      setView(next)
      setHistoryQuizId(null)
      setReviewAttempt(null)
      if (session?.status === 'finished') resetQuiz()
    },
    [session, resetQuiz],
  )

  /** Send a question bank to the setup screen, optionally tied to a saved quiz. */
  const openSetup = useCallback((questions: QuizQuestion[], saved: SavedQuiz | null) => {
    setPendingQuestions(questions)
    setPendingQuiz(saved)
    setHistoryQuizId(null)
    setReviewAttempt(null)
    setView('create')
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

  /** Throw away an unfinished run and configure a fresh one. */
  const handleStartOver = useCallback(
    (saved: SavedQuiz) => {
      library.clearProgress(saved.id)
      openSetup(saved.questions, saved)
    },
    [library, openSetup],
  )

  const handleRename = useCallback(
    (saved: SavedQuiz, name: string) => {
      library.renameQuiz(saved.id, name)
      if (pendingQuiz?.id === saved.id) setPendingQuiz({ ...pendingQuiz, name: name.trim() })
    },
    [library, pendingQuiz],
  )

  const handleDeleteQuiz = useCallback(
    (saved: SavedQuiz) => {
      library.removeQuiz(saved.id)
      // Storage drops the quiz's attempts with it — resync the history state.
      refreshHistory()
      if (historyQuizId === saved.id) setHistoryQuizId(null)
      if (reviewAttempt?.quizId === saved.id) setReviewAttempt(null)
      if (session?.quizId === saved.id) resetQuiz()
      if (pendingQuiz?.id === saved.id) clearSetup()
    },
    [library, refreshHistory, historyQuizId, reviewAttempt, session, resetQuiz, pendingQuiz, clearSetup],
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
      resetQuiz()
      clearSetup()
      setReviewAttempt(null)
      setView('library')
      setHistoryQuizId(quizId)
    },
    [resetQuiz, clearSetup],
  )

  /**
   * Leave an active run. A saved quiz keeps its progress (the mirroring effect
   * above already wrote it), so the library is where the user picks it back
   * up; an unsaved one has nowhere to go but home.
   */
  const handleExitQuiz = useCallback(() => {
    const wasSaved = session?.quizId !== undefined
    resetQuiz()
    setView(wasSaved ? 'library' : 'home')
  }, [session, resetQuiz])

  const historyQuiz = historyQuizId ? library.quizzes.find((q) => q.id === historyQuizId) ?? null : null
  const activeSession =
    reviewAttempt === null && historyQuiz === null && session !== null && session.status === 'active'
      ? session
      : null
  const finishedSession =
    reviewAttempt === null && historyQuiz === null && session !== null && session.status === 'finished'
      ? session
      : null

  const resumable = findResumable(library.quizzes)
  const allAttempts = sortAttemptsByRecency(history.attempts)

  /**
   * The optional AI panel under each answer-review block. Passed to both
   * `ResultScreen` call sites, so reviewing a stored attempt gets it too.
   * Renders nothing when the assistant is off.
   */
  const renderQuestionExtras = useCallback(
    (question: QuizQuestion, selected: string[] | undefined) => (
      <AIAnswerExplanation
        question={question}
        ready={ai.ready}
        busy={ai.busy}
        pending={ai.active?.kind === 'explanation' && ai.active.questionId === question.id}
        explanation={ai.explanations[question.id]}
        error={ai.errorQuestionId === question.id ? ai.error : null}
        onAsk={() => void ai.askAboutQuestion(question, selected)}
        onCancel={ai.cancel}
        onDismiss={() => ai.clearExplanation(question.id)}
      />
    ),
    [ai],
  )

  // The library and results screens use their width; reading screens stay
  // narrow so long questions don't run across the whole monitor.
  const wide = reviewAttempt === null && historyQuiz === null && finishedSession === null && view !== 'create'

  const dialogs = (
    <>
      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onToggleTheme={toggleTheme}
          appearance={appearance}
          onAppearanceChange={updateAppearance}
          onResetAppearance={resetAppearance}
          aiStatus={
            ai.ready
              ? `On · ${PROVIDERS[ai.config.provider].label} · ${ai.requestCount} request(s) this session.`
              : 'Off. Optional — bring your own API key to check and explain answers.'
          }
          onOpenAI={() => {
            setSettingsOpen(false)
            setAiSettingsOpen(true)
          }}
          storageAvailable={storageAvailable}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {aiSettingsOpen && <AISettings ai={ai} onClose={() => setAiSettingsOpen(false)} />}
      {/* Last, so it covers the settings dialogs too — an AI request started
          from one of them must not be interrupted by closing it. */}
      {ai.active !== null && BLOCKING_AI_KINDS.has(ai.active.kind) && (
        <AIBusyOverlay active={ai.active} onCancel={ai.cancel} />
      )}
    </>
  )

  // While a quiz is being answered the app navigation is replaced by the
  // quiz's own compact bar, so nothing invites an accidental exit.
  if (activeSession !== null) {
    return (
      <div className="min-h-screen">
        <ActiveQuiz session={activeSession} quiz={quiz} onExit={handleExitQuiz} />
        {dialogs}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AppNav
        view={view}
        onNavigate={navigate}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        aiReady={ai.ready}
        aiBusy={ai.busy}
      />

      <main className={`mx-auto px-4 pt-6 pb-24 md:pb-16 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {/* 1. Reviewing a stored attempt — reuses the live result screen. */}
        {reviewAttempt !== null && (
          <ResultScreen
            session={attemptToSession(reviewAttempt)}
            onNewQuiz={() => setReviewAttempt(null)}
            newQuizLabel={
              historyQuizId !== null
                ? 'Back to history'
                : view === 'home'
                  ? 'Back to Home'
                  : 'Back to Results'
            }
            onHome={() => navigate('home')}
            subtitle={`${reviewAttempt.quizName} · ${formatDateTime(reviewAttempt.completedAt)}`}
            renderQuestionExtras={renderQuestionExtras}
          />
        )}

        {/* 2. A saved quiz's results history. */}
        {reviewAttempt === null && historyQuiz !== null && (
          <QuizHistory
            quiz={historyQuiz}
            attempts={history.forQuiz(historyQuiz.id)}
            onBack={() => setHistoryQuizId(null)}
            backLabel={view === 'results' ? 'Results' : 'Quiz Library'}
            onRetake={() => openSetup(historyQuiz.questions, historyQuiz)}
            onReview={setReviewAttempt}
            onDeleteAttempt={handleDeleteAttempt}
          />
        )}

        {/* 3. The result of the run just submitted. */}
        {finishedSession !== null && (
          <FinishedQuiz
            session={finishedSession}
            onRetry={quiz.retryQuiz}
            onCreateQuiz={() => navigate('create')}
            onLibrary={() => navigate('library')}
            onHome={() => navigate('home')}
            onViewHistory={openHistoryFor}
            renderQuestionExtras={renderQuestionExtras}
          />
        )}

        {/* 4. Create Quiz — paste, then review and configure. */}
        {reviewAttempt === null && historyQuiz === null && finishedSession === null && view === 'create' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <h1 className="text-2xl font-bold tracking-tight">Create Quiz</h1>
              <StepIndicator current={pendingQuestions === null ? 1 : 2} />
            </div>

            {pendingQuestions === null ? (
              <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
                <QuizImporter ai={ai} onLoad={(questions) => openSetup(questions, null)} />
              </div>
            ) : (
              <div className="space-y-4">
                <SaveQuizPanel
                  questionCount={pendingQuestions.length}
                  duplicate={pendingQuiz ?? library.findSavedDuplicate(pendingQuestions)}
                  savedName={pendingQuiz?.name ?? null}
                  storageAvailable={storageAvailable}
                  onSave={(name) => setPendingQuiz(library.saveQuiz(name, pendingQuestions))}
                  onUpdate={(quizId) => setPendingQuiz(library.updateQuiz(quizId, pendingQuestions))}
                />
                <AIVerificationPanel
                  questions={pendingQuestions}
                  ai={ai}
                  onApply={setPendingQuestions}
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
          </div>
        )}

        {/* 5. Quiz Library. */}
        {reviewAttempt === null && historyQuiz === null && finishedSession === null && view === 'library' && (
          <SavedQuizList
            quizzes={library.quizzes}
            statsFor={history.statsFor}
            onStart={(saved) => openSetup(saved.questions, saved)}
            onResume={handleResume}
            onStartOver={handleStartOver}
            onViewResults={(saved) => setHistoryQuizId(saved.id)}
            onRename={handleRename}
            onDelete={handleDeleteQuiz}
            onCreate={() => navigate('create')}
          />
        )}

        {/* 6. Results — every attempt, across every quiz. */}
        {reviewAttempt === null && historyQuiz === null && finishedSession === null && view === 'results' && (
          <RecentResults
            attempts={allAttempts}
            heading="Results"
            subheading="Your attempts, newest first"
            onReview={setReviewAttempt}
            onDelete={handleDeleteAttempt}
            emptyState={
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                <p aria-hidden className="text-3xl">
                  📊
                </p>
                <p className="mt-2 font-semibold">No quiz results yet</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Complete a quiz and your results will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('library')}
                  className="mt-4 min-h-11 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  Browse Quiz Library
                </button>
              </div>
            }
          />
        )}

        {/* 7. Home. */}
        {reviewAttempt === null && historyQuiz === null && finishedSession === null && view === 'home' && (
          <HomeDashboard
            onNavigate={navigate}
            resumable={resumable}
            onResume={handleResume}
            savedCount={library.quizzes.length}
            attemptCount={history.attempts.length}
          >
            <RecentResults
              attempts={history.recent(RECENT_RESULTS_LIMIT)}
              onReview={setReviewAttempt}
              onDelete={handleDeleteAttempt}
              onSeeAll={() => navigate('results')}
            />
          </HomeDashboard>
        )}
      </main>

      {dialogs}
    </div>
  )
}

interface FinishedQuizProps {
  session: QuizSession
  onRetry: () => void
  onCreateQuiz: () => void
  onLibrary: () => void
  onHome: () => void
  onViewHistory: (quizId: string) => void
  renderQuestionExtras?: ResultScreenExtras
}

/** Result of the run just submitted, with a jump into its history if saved. */
function FinishedQuiz({
  session,
  onRetry,
  onCreateQuiz,
  onLibrary,
  onHome,
  onViewHistory,
  renderQuestionExtras,
}: FinishedQuizProps) {
  const quizId = session.quizId
  return (
    <ResultScreen
      session={session}
      onRetry={onRetry}
      onNewQuiz={onCreateQuiz}
      newQuizLabel="Create Quiz"
      onLibrary={onLibrary}
      onHome={onHome}
      onViewHistory={quizId === undefined ? undefined : () => onViewHistory(quizId)}
      renderQuestionExtras={renderQuestionExtras}
      // Only the run just submitted celebrates; reviewing it again from the
      // history (call site 1 above) does not.
      celebrateOnPass
    />
  )
}

interface ActiveQuizProps {
  session: QuizSession
  quiz: ReturnType<typeof useQuiz>
  onExit: () => void
}

/** The in-progress quiz view: compact bar, current question, fixed navigation. */
function ActiveQuiz({ session, quiz, onExit }: ActiveQuizProps) {
  const { questions, currentIndex, answers, drafts } = session
  const question = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const answeredCount = Object.keys(answers).length
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)

  const multi = isMultiAnswer(question)
  const revealed = isRevealed(session, question.id)
  const locked = isQuestionLocked(session, question)
  // What "Check Answer" would judge right now: a single pick is already an
  // answer, a multi-answer selection is still a draft.
  const hasSelection = multi
    ? (answers[question.id] ?? drafts[question.id] ?? []).length > 0
    : answers[question.id] !== undefined

  const remaining = useTimer(session.startedAt, session.timerMinutes, true, quiz.finishQuiz)

  // A long question can leave the next one scrolled past its own heading.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [currentIndex])

  // Keyboard navigation: ←/→ move between questions, 1–8 or A–H pick an option.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in an input.
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (event.key === 'ArrowRight') quiz.next()
      else if (event.key === 'ArrowLeft') quiz.previous()
      else if (event.key === 'Enter') {
        // Enter mirrors the "Check Answer" button, on either kind of question.
        if (!locked && hasSelection) quiz.checkAnswer(question.id)
      } else if (!locked) {
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
  }, [quiz, question, multi, locked, hasSelection])

  const handleFinish = () => {
    // Ask for confirmation when questions are still unanswered, so a stray
    // tap can't throw the attempt away.
    if (answeredCount < questions.length) {
      setConfirmFinish(true)
      return
    }
    quiz.finishQuiz()
  }

  const navButton =
    'min-h-12 flex-1 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <>
      <QuizTopBar
        title={session.quizName ?? 'Quiz'}
        current={currentIndex + 1}
        total={questions.length}
        answered={answeredCount}
        remaining={remaining}
        onExit={() => setConfirmExit(true)}
      />

      <main className="mx-auto max-w-3xl px-4 pt-5 pb-36">
        <QuizCard
          question={question}
          selectedAnswers={answers[question.id]}
          draft={drafts[question.id]}
          revealed={revealed}
          onSelect={(option) => quiz.selectAnswer(question.id, option)}
          onToggle={(option) => quiz.toggleDraft(question.id, option)}
          onCheck={() => quiz.checkAnswer(question.id)}
        />

        <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-600">
          Tip: use ← → to navigate, 1–{Math.min(question.options.length, 8)} or A–
          {String.fromCharCode(64 + Math.min(question.options.length, 8))} to{' '}
          {multi ? 'tick options' : 'answer'}, Enter to check
        </p>
      </main>

      {/* Fixed, so Previous/Next are always a thumb away no matter how long
          the question runs. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={quiz.previous}
            disabled={currentIndex === 0}
            className={`${navButton} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}
          >
            ← Previous
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={handleFinish}
              className={`${navButton} bg-green-600 text-white hover:bg-green-700 focus-visible:outline-green-600`}
            >
              Finish ✓
            </button>
          ) : (
            <button
              type="button"
              onClick={quiz.next}
              className={`${navButton} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-500`}
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {confirmExit && (
        <ConfirmDialog
          title="Leave this quiz?"
          message={
            session.quizId !== undefined ? (
              <p>
                Your progress is saved. You can pick this quiz back up from your Quiz Library or
                from Home.
              </p>
            ) : (
              <p>
                This quiz isn't saved in your library, so this attempt will be discarded and won't
                appear in Results.
              </p>
            )
          }
          confirmLabel="Leave quiz"
          cancelLabel="Keep going"
          danger={session.quizId === undefined}
          onConfirm={onExit}
          onCancel={() => setConfirmExit(false)}
        />
      )}

      {confirmFinish && (
        <ConfirmDialog
          title="Finish with unanswered questions?"
          message={
            <p>
              {questions.length - answeredCount} of {questions.length} questions are still
              unanswered. They'll be marked as skipped.
            </p>
          }
          confirmLabel="Finish quiz"
          cancelLabel="Keep answering"
          onConfirm={() => {
            setConfirmFinish(false)
            quiz.finishQuiz()
          }}
          onCancel={() => setConfirmFinish(false)}
        />
      )}
    </>
  )
}
