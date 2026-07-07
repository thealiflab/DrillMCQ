import { useCallback, useEffect, useState } from 'react'
import type { QuizQuestion, QuizSession, QuizSettings } from '../types/quiz'
import { clearSession, loadSession, saveSession } from '../services/storage'
import { shuffle } from '../utils/quiz'

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
  const startQuiz = useCallback((bank: QuizQuestion[], settings: QuizSettings) => {
    let questions = settings.categories.length
      ? bank.filter((q) => q.category && settings.categories.includes(q.category))
      : [...bank]

    if (settings.shuffleQuestions) questions = shuffle(questions)
    if (settings.shuffleOptions) {
      questions = questions.map((q) => ({ ...q, options: shuffle(q.options) }))
    }

    setSession({
      questions,
      answers: {},
      currentIndex: 0,
      status: 'active',
      startedAt: Date.now(),
      timerMinutes: settings.timerMinutes,
    })
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
    setSession((s) => (s ? { ...s, status: 'finished' } : s))
  }, [])

  /** Restart the same questions with cleared answers and a fresh timer. */
  const retryQuiz = useCallback(() => {
    setSession((s) =>
      s
        ? {
            ...s,
            answers: {},
            currentIndex: 0,
            status: 'active',
            startedAt: Date.now(),
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
    selectAnswer,
    goTo,
    next,
    previous,
    finishQuiz,
    retryQuiz,
    resetQuiz,
  }
}
