import { useCallback, useState } from 'react'
import type { QuizAttempt, QuizQuestion, QuizSession, SavedQuiz } from '../types/quiz'
import {
  deleteSavedQuiz,
  fingerprintQuestions,
  loadSavedQuizzes,
  patchSavedQuiz,
  upsertSavedQuiz,
} from '../services/storage'
import {
  attemptToQuestionBank,
  createSavedQuiz,
  findDuplicate,
  findQuizForAttempt,
  sessionToProgress,
} from '../utils/library'

/** Outcome of filing a past attempt in the library — saved, or already there. */
export interface SaveAttemptResult {
  status: 'saved' | 'already-saved'
  quiz: SavedQuiz
}

/**
 * The user's local quiz library.
 *
 * Every mutation writes through `services/storage` and adopts the list that
 * comes back, so React state and localStorage can't drift apart.
 */
export function useSavedQuizzes() {
  const [quizzes, setQuizzes] = useState<SavedQuiz[]>(() => loadSavedQuizzes())

  /** Re-read from storage (used after another hook touches the library). */
  const refresh = useCallback(() => {
    setQuizzes(loadSavedQuizzes())
  }, [])

  /** Save an imported quiz as a new library entry. Returns the new record. */
  const saveQuiz = useCallback((name: string, questions: QuizQuestion[]): SavedQuiz => {
    const quiz = createSavedQuiz(name, questions)
    setQuizzes(upsertSavedQuiz(quiz))
    return quiz
  }, [])

  /**
   * Overwrite an existing entry's questions (and optionally its name).
   * Returns the updated record, or null when the id is unknown.
   */
  const updateQuiz = useCallback(
    (id: string, questions: QuizQuestion[], name?: string): SavedQuiz | null => {
      const updated = patchSavedQuiz(id, (quiz) => ({
        ...quiz,
        name: name?.trim() ? name.trim() : quiz.name,
        questions,
        fingerprint: fingerprintQuestions(questions),
        updatedAt: Date.now(),
        // The stored order no longer matches the new questions.
        progress: undefined,
      }))
      setQuizzes(updated)
      return updated.find((q) => q.id === id) ?? null
    },
    [],
  )

  const renameQuiz = useCallback((id: string, name: string): void => {
    if (name.trim() === '') return
    setQuizzes(patchSavedQuiz(id, (quiz) => ({ ...quiz, name: name.trim(), updatedAt: Date.now() })))
  }, [])

  /** Removes the quiz and its attempt history. */
  const removeQuiz = useCallback((id: string): void => {
    setQuizzes(deleteSavedQuiz(id))
  }, [])

  /** Mirror an in-progress run onto its saved quiz so it can be resumed. */
  const saveProgress = useCallback((session: QuizSession): void => {
    if (!session.quizId) return
    const quizId = session.quizId
    setQuizzes(patchSavedQuiz(quizId, (quiz) => ({ ...quiz, progress: sessionToProgress(session) })))
  }, [])

  /** Drop the resume snapshot and point the quiz at its newest attempt. */
  const completeProgress = useCallback((quizId: string, attemptId: string): void => {
    setQuizzes(
      patchSavedQuiz(quizId, (quiz) => ({
        ...quiz,
        progress: undefined,
        lastAttemptId: attemptId,
      })),
    )
  }, [])

  /** Discard an unfinished run without recording a result. */
  const clearProgress = useCallback((quizId: string): void => {
    setQuizzes(patchSavedQuiz(quizId, (quiz) => ({ ...quiz, progress: undefined })))
  }, [])

  /** Existing entry holding this exact question bank, if any. */
  const findSavedDuplicate = useCallback(
    (questions: QuizQuestion[]): SavedQuiz | null => findDuplicate(quizzes, questions),
    [quizzes],
  )

  /** The library entry a past attempt's questions already live in, if any. */
  const findQuizForPastAttempt = useCallback(
    (attempt: QuizAttempt): SavedQuiz | null => findQuizForAttempt(quizzes, attempt),
    [quizzes],
  )

  /**
   * File a past attempt's questions in the library.
   *
   * Goes through the same `createSavedQuiz` → `upsertSavedQuiz` path as an
   * import, so there is one library and one write path. The attempt itself is
   * never touched: history is append-only, and a saved quiz is a *copy* of the
   * bank, not a reference back to the result.
   */
  const saveAttemptToLibrary = useCallback(
    (attempt: QuizAttempt): SaveAttemptResult => {
      const existing = findQuizForAttempt(quizzes, attempt)
      if (existing) return { status: 'already-saved', quiz: existing }

      const quiz = createSavedQuiz(attempt.quizName, attemptToQuestionBank(attempt))
      setQuizzes(upsertSavedQuiz(quiz))
      return { status: 'saved', quiz }
    },
    [quizzes],
  )

  return {
    quizzes,
    refresh,
    saveQuiz,
    updateQuiz,
    renameQuiz,
    removeQuiz,
    saveProgress,
    completeProgress,
    clearProgress,
    findSavedDuplicate,
    findQuizForPastAttempt,
    saveAttemptToLibrary,
  }
}
