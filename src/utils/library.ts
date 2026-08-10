import type {
  AttemptStatus,
  HistoryStats,
  QuizAttempt,
  QuizQuestion,
  QuizSession,
  QuizSettings,
  SavedQuiz,
  SavedQuizProgress,
} from '../types/quiz'
import { createId, fingerprintQuestions } from '../services/storage'
import { computeResult, shuffle } from './quiz'

/**
 * Pure transforms between the three shapes the library juggles: a question
 * bank, a live session, and a recorded attempt. Kept free of React and
 * storage side effects so the hooks stay thin and this stays testable.
 */

interface BuildSessionOptions {
  quizId?: string
  quizName?: string
}

/**
 * Build a fresh session from a question bank + settings: filter by category,
 * then shuffle once so the order is fixed for the whole run.
 */
export function buildSession(
  bank: QuizQuestion[],
  settings: QuizSettings,
  options: BuildSessionOptions = {},
): QuizSession {
  let questions = settings.categories.length
    ? bank.filter((q) => q.category && settings.categories.includes(q.category))
    : [...bank]

  if (settings.shuffleQuestions) questions = shuffle(questions)
  if (settings.shuffleOptions) {
    questions = questions.map((q) => ({ ...q, options: shuffle(q.options) }))
  }

  return {
    questions,
    answers: {},
    drafts: {},
    currentIndex: 0,
    status: 'active',
    startedAt: Date.now(),
    timerMinutes: settings.timerMinutes,
    attemptId: createId('attempt'),
    settings,
    quizId: options.quizId,
    quizName: options.quizName,
  }
}

/** Snapshot a live session for storage on the saved quiz. */
export function sessionToProgress(session: QuizSession): SavedQuizProgress {
  return {
    attemptId: session.attemptId,
    questions: session.questions,
    answers: session.answers,
    drafts: session.drafts,
    currentIndex: session.currentIndex,
    startedAt: session.startedAt,
    timerMinutes: session.timerMinutes,
    settings: session.settings,
    updatedAt: Date.now(),
  }
}

/** Rehydrate a resumable session from a saved quiz's progress snapshot. */
export function progressToSession(quiz: SavedQuiz, progress: SavedQuizProgress): QuizSession {
  return {
    questions: progress.questions,
    answers: progress.answers,
    drafts: progress.drafts,
    currentIndex: progress.currentIndex,
    status: 'active',
    startedAt: progress.startedAt,
    timerMinutes: progress.timerMinutes,
    attemptId: progress.attemptId,
    settings: progress.settings,
    quizId: quiz.id,
    quizName: quiz.name,
  }
}

/** Convert a submitted session into the permanent history record. */
export function sessionToAttempt(session: QuizSession, completedAt = Date.now()): QuizAttempt {
  const result = computeResult(session)
  return {
    id: session.attemptId,
    quizId: session.quizId,
    quizName: session.quizName ?? 'Unsaved quiz',
    startedAt: session.startedAt,
    completedAt,
    timeTakenSeconds: Math.max(0, Math.round((completedAt - session.startedAt) / 1000)),
    correct: result.correct,
    incorrect: result.incorrect,
    unanswered: result.unanswered,
    total: result.total,
    percentage: result.percentage,
    settings: session.settings,
    questions: session.questions,
    answers: session.answers,
  }
}

/**
 * View a stored attempt as a finished session, so `ResultScreen` can render
 * historical results with no second copy of the review logic.
 */
export function attemptToSession(attempt: QuizAttempt): QuizSession {
  return {
    questions: attempt.questions,
    answers: attempt.answers,
    // An attempt only ever stores submitted answers, so there is nothing in
    // flight to restore.
    drafts: {},
    currentIndex: 0,
    status: 'finished',
    startedAt: attempt.startedAt,
    timerMinutes: attempt.settings.timerMinutes,
    attemptId: attempt.id,
    settings: attempt.settings,
    quizId: attempt.quizId,
    quizName: attempt.quizName,
    finishedAt: attempt.completedAt,
  }
}

/** Newest first. Does not mutate the input. */
export function sortAttemptsByRecency(attempts: QuizAttempt[]): QuizAttempt[] {
  return [...attempts].sort((a, b) => b.completedAt - a.completedAt)
}

export function attemptsForQuiz(attempts: QuizAttempt[], quizId: string): QuizAttempt[] {
  return sortAttemptsByRecency(attempts.filter((a) => a.quizId === quizId))
}

/** Latest / best / average percentage across a set of attempts. */
export function computeHistoryStats(attempts: QuizAttempt[]): HistoryStats {
  if (attempts.length === 0) {
    return { attempts: 0, latest: null, best: null, average: null }
  }
  const sorted = sortAttemptsByRecency(attempts)
  const total = sorted.reduce((sum, a) => sum + a.percentage, 0)
  return {
    attempts: sorted.length,
    latest: sorted[0].percentage,
    best: Math.max(...sorted.map((a) => a.percentage)),
    average: Math.round(total / sorted.length),
  }
}

/** How far an unfinished run got — drives every "Continue" affordance. */
export function progressSummary(progress: SavedQuizProgress): {
  answered: number
  total: number
  percent: number
} {
  const total = progress.questions.length
  const answered = Object.keys(progress.answers).length
  return { answered, total, percent: total === 0 ? 0 : Math.round((answered / total) * 100) }
}

/**
 * The quiz to offer as "Continue" on the home screen: the most recently
 * touched one with an unfinished run. Null when there is nothing to resume,
 * which is what hides the section entirely.
 */
export function findResumable(quizzes: SavedQuiz[]): SavedQuiz | null {
  const withProgress = quizzes.filter((q) => q.progress !== undefined)
  if (withProgress.length === 0) return null
  return withProgress.reduce((latest, quiz) =>
    (quiz.progress?.updatedAt ?? 0) > (latest.progress?.updatedAt ?? 0) ? quiz : latest,
  )
}

/** What the library card should say about this quiz. */
export function attemptStatus(quiz: SavedQuiz, attemptCount: number): AttemptStatus {
  if (quiz.progress) return 'in-progress'
  return attemptCount > 0 || quiz.lastAttemptId ? 'completed' : 'not-started'
}

/** Create the library record for a freshly imported quiz. */
export function createSavedQuiz(name: string, questions: QuizQuestion[], now = Date.now()): SavedQuiz {
  return {
    id: createId('quiz'),
    name: name.trim() === '' ? 'Untitled quiz' : name.trim(),
    questions,
    createdAt: now,
    updatedAt: now,
    fingerprint: fingerprintQuestions(questions),
  }
}

/** The saved quiz holding this exact question bank, if the user already has it. */
export function findDuplicate(quizzes: SavedQuiz[], questions: QuizQuestion[]): SavedQuiz | null {
  const fingerprint = fingerprintQuestions(questions)
  return quizzes.find((q) => q.fingerprint === fingerprint) ?? null
}

/** "3 Aug 2026, 14:05" — locale-aware, compact enough for a card. */
export function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Midnight local time on the day containing `epochMs`. */
function startOfDay(epochMs: number): number {
  const date = new Date(epochMs)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * "Today" / "Yesterday" / "3 Aug 2026" — the recency phrasing used on cards
 * and in the results list, where the exact minute is noise.
 */
export function formatRelativeDay(epochMs: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(epochMs)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(epochMs).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
