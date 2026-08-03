import { useCallback, useEffect, useState } from 'react'
import type { QuizQuestion, QuizSession, QuizSettings } from '../types/quiz'
import { clearSession, createId, loadSession, saveSession } from '../services/storage'
import { buildSession } from '../utils/library'

interface StartOptions {
  /** Set when the run comes from a saved quiz, so the attempt can be filed. */
  quizId?: string
  quizName?: string
}

/**
 * Central quiz state machine.
 *
 * Owns the active session (questions, answers, position, timer) and keeps it
 * mirrored to localStorage so a page refresh restores the quiz exactly where
 * the user left off.
 */
export function useQuiz() {
  // Lazy initializer: restore a previous session on first render.
  const [session, setSession] = useState<QuizSession | null>(() => loadSession())

  // Persist every change; remove the entry when the session is discarded.
  useEffect(() => {
    if (session) saveSession(session)
    else clearSession()
  }, [session])

  /** Build a fresh session from a question bank + user settings. */
  const startQuiz = useCallback(
    (bank: QuizQuestion[], settings: QuizSettings, options: StartOptions = {}) => {
      setSession(buildSession(bank, settings, options))
    },
    [],
  )

  /** Pick up a previously stored run (a saved quiz's progress snapshot). */
  const resumeSession = useCallback((restored: QuizSession) => {
    setSession(restored)
  }, [])

  const selectAnswer = useCallback((questionId: number, option: string) => {
    setSession((s) =>
      s && s.status === 'active'
        ? { ...s, answers: { ...s.answers, [questionId]: option } }
        : s,
    )
  }, [])

  const goTo = useCallback((index: number) => {
    setSession((s) => {
      if (!s || s.status !== 'active') return s
      const clamped = Math.min(Math.max(index, 0), s.questions.length - 1)
      return { ...s, currentIndex: clamped }
    })
  }, [])

  const next = useCallback(() => {
    setSession((s) =>
      s && s.status === 'active' && s.currentIndex < s.questions.length - 1
        ? { ...s, currentIndex: s.currentIndex + 1 }
        : s,
    )
  }, [])

  const previous = useCallback(() => {
    setSession((s) =>
      s && s.status === 'active' && s.currentIndex > 0
        ? { ...s, currentIndex: s.currentIndex - 1 }
        : s,
    )
  }, [])

  const finishQuiz = useCallback(() => {
    setSession((s) =>
      s && s.status === 'active' ? { ...s, status: 'finished', finishedAt: Date.now() } : s,
    )
  }, [])

  /**
   * Restart the same questions with cleared answers and a fresh timer. A new
   * attempt id makes this a separate entry in the results history.
   */
  const retryQuiz = useCallback(() => {
    setSession((s) =>
      s
        ? {
            ...s,
            answers: {},
            currentIndex: 0,
            status: 'active',
            startedAt: Date.now(),
            finishedAt: undefined,
            attemptId: createId('attempt'),
          }
        : s,
    )
  }, [])

  /** Abandon the session entirely and return to the setup screen. */
  const resetQuiz = useCallback(() => {
    setSession(null)
  }, [])

  return {
    session,
    startQuiz,
    resumeSession,
    selectAnswer,
    goTo,
    next,
    previous,
    finishQuiz,
    retryQuiz,
    resetQuiz,
  }
}
