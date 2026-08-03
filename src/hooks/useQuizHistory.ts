import { useCallback, useState } from 'react'
import type { HistoryStats, QuizAttempt, QuizSession } from '../types/quiz'
import { appendAttempt, deleteAttempt, loadAttempts } from '../services/storage'
import {
  attemptsForQuiz,
  computeHistoryStats,
  sessionToAttempt,
  sortAttemptsByRecency,
} from '../utils/library'

/**
 * Local history of completed attempts. Append-only from the user's point of
 * view — retaking a quiz adds a record, it never replaces one.
 */
export function useQuizHistory() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>(() => loadAttempts())

  const refresh = useCallback(() => {
    setAttempts(loadAttempts())
  }, [])

  /**
   * Record a submitted session. Idempotent on the session's attempt id, so
   * re-running the finish effect can't create a duplicate. Returns the
   * attempt that is now stored.
   */
  const recordSession = useCallback((session: QuizSession): QuizAttempt => {
    const attempt = sessionToAttempt(session, session.finishedAt ?? Date.now())
    setAttempts(appendAttempt(attempt))
    return attempt
  }, [])

  const removeAttempt = useCallback((id: string): void => {
    setAttempts(deleteAttempt(id))
  }, [])

  const hasAttempt = useCallback(
    (id: string): boolean => attempts.some((a) => a.id === id),
    [attempts],
  )

  /** Attempts for one saved quiz, newest first. */
  const forQuiz = useCallback(
    (quizId: string): QuizAttempt[] => attemptsForQuiz(attempts, quizId),
    [attempts],
  )

  const statsFor = useCallback(
    (quizId: string): HistoryStats => computeHistoryStats(attempts.filter((a) => a.quizId === quizId)),
    [attempts],
  )

  /** Everything, newest first — used for the "recent results" strip. */
  const recent = useCallback(
    (limit: number): QuizAttempt[] => sortAttemptsByRecency(attempts).slice(0, limit),
    [attempts],
  )

  return { attempts, refresh, recordSession, removeAttempt, hasAttempt, forQuiz, statsFor, recent }
}
