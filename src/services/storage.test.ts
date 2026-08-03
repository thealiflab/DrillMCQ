import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { QuizAttempt, QuizQuestion, QuizSession, SavedQuiz } from '../types/quiz'
import {
  appendAttempt,
  clearSession,
  deleteAttempt,
  deleteSavedQuiz,
  fingerprintQuestions,
  isStorageAvailable,
  loadAttempts,
  loadSavedQuizzes,
  loadSession,
  loadTheme,
  patchSavedQuiz,
  resetMigrationForTests,
  saveSession,
  saveTheme,
  upsertSavedQuiz,
} from './storage'
import { installBlockedStorage, installMemoryStorage, type MemoryStorage } from '../test/localStorageMock'

const SAVED_QUIZZES_KEY = 'drillmcq_saved_quizzes.v1'
const RESULTS_KEY = 'drillmcq_quiz_results.v1'
const SESSION_KEY = 'drillmcq_active_session.v1'
const LEGACY_SESSION_KEY = 'drillmcq.session.v1'

const questions: QuizQuestion[] = [
  { id: 1, question: 'Capital of France?', options: ['Paris', 'Rome'], correctAnswer: 'Paris' },
  { id: 2, question: '2 + 2?', options: ['3', '4'], correctAnswer: '4', category: 'Maths' },
]

function makeQuiz(overrides: Partial<SavedQuiz> = {}): SavedQuiz {
  return {
    id: 'quiz_1',
    name: 'Geography',
    questions,
    createdAt: 1000,
    updatedAt: 1000,
    fingerprint: fingerprintQuestions(questions),
    ...overrides,
  }
}

function makeAttempt(overrides: Partial<QuizAttempt> = {}): QuizAttempt {
  return {
    id: 'attempt_1',
    quizId: 'quiz_1',
    quizName: 'Geography',
    startedAt: 1000,
    completedAt: 2000,
    timeTakenSeconds: 1,
    correct: 1,
    incorrect: 1,
    unanswered: 0,
    total: 2,
    percentage: 50,
    settings: { shuffleQuestions: false, shuffleOptions: false, timerMinutes: 0, categories: [] },
    questions,
    answers: { 1: 'Paris', 2: '3' },
    ...overrides,
  }
}

function makeSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    questions,
    answers: { 1: 'Paris' },
    currentIndex: 1,
    status: 'active',
    startedAt: 5000,
    timerMinutes: 10,
    attemptId: 'attempt_live',
    settings: { shuffleQuestions: true, shuffleOptions: false, timerMinutes: 10, categories: [] },
    quizId: 'quiz_1',
    quizName: 'Geography',
    ...overrides,
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = installMemoryStorage()
  resetMigrationForTests()
})

afterEach(() => {
  installMemoryStorage()
})

describe('saved quiz library', () => {
  it('starts empty', () => {
    expect(loadSavedQuizzes()).toEqual([])
  })

  it('saves a quiz and loads it back', () => {
    upsertSavedQuiz(makeQuiz())
    const loaded = loadSavedQuizzes()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Geography')
    expect(loaded[0].questions).toHaveLength(2)
  })

  it('saves multiple distinct quizzes', () => {
    upsertSavedQuiz(makeQuiz())
    upsertSavedQuiz(makeQuiz({ id: 'quiz_2', name: 'Maths' }))
    expect(loadSavedQuizzes().map((q) => q.id)).toEqual(['quiz_1', 'quiz_2'])
  })

  it('updates an existing quiz in place instead of duplicating it', () => {
    upsertSavedQuiz(makeQuiz())
    upsertSavedQuiz(makeQuiz({ name: 'Geography v2', updatedAt: 3000 }))
    const loaded = loadSavedQuizzes()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Geography v2')
    expect(loaded[0].updatedAt).toBe(3000)
  })

  it('patches one quiz and leaves the others alone', () => {
    upsertSavedQuiz(makeQuiz())
    upsertSavedQuiz(makeQuiz({ id: 'quiz_2', name: 'Maths' }))
    patchSavedQuiz('quiz_2', (quiz) => ({ ...quiz, name: 'Maths (revised)' }))
    const loaded = loadSavedQuizzes()
    expect(loaded.find((q) => q.id === 'quiz_1')?.name).toBe('Geography')
    expect(loaded.find((q) => q.id === 'quiz_2')?.name).toBe('Maths (revised)')
  })

  it('ignores a patch for an unknown id', () => {
    upsertSavedQuiz(makeQuiz())
    expect(patchSavedQuiz('nope', (quiz) => ({ ...quiz, name: 'x' }))).toHaveLength(1)
    expect(loadSavedQuizzes()[0].name).toBe('Geography')
  })

  it('deletes a quiz together with its attempt history', () => {
    upsertSavedQuiz(makeQuiz())
    upsertSavedQuiz(makeQuiz({ id: 'quiz_2', name: 'Maths' }))
    appendAttempt(makeAttempt())
    appendAttempt(makeAttempt({ id: 'attempt_2', quizId: 'quiz_2' }))

    deleteSavedQuiz('quiz_1')

    expect(loadSavedQuizzes().map((q) => q.id)).toEqual(['quiz_2'])
    expect(loadAttempts().map((a) => a.id)).toEqual(['attempt_2'])
  })

  it('fingerprints identical question banks identically', () => {
    expect(fingerprintQuestions(questions)).toBe(fingerprintQuestions([...questions]))
    expect(fingerprintQuestions(questions)).not.toBe(fingerprintQuestions([questions[0]]))
  })
})

describe('results history', () => {
  it('starts empty', () => {
    expect(loadAttempts()).toEqual([])
  })

  it('keeps every attempt, newest appended', () => {
    appendAttempt(makeAttempt())
    appendAttempt(makeAttempt({ id: 'attempt_2', percentage: 100, completedAt: 3000 }))
    const loaded = loadAttempts()
    expect(loaded).toHaveLength(2)
    expect(loaded.map((a) => a.percentage)).toEqual([50, 100])
  })

  it('does not record the same attempt id twice', () => {
    appendAttempt(makeAttempt())
    appendAttempt(makeAttempt({ percentage: 90 }))
    expect(loadAttempts()).toHaveLength(1)
    expect(loadAttempts()[0].percentage).toBe(50)
  })

  it('deletes a single attempt and keeps the rest', () => {
    appendAttempt(makeAttempt())
    appendAttempt(makeAttempt({ id: 'attempt_2' }))
    deleteAttempt('attempt_1')
    expect(loadAttempts().map((a) => a.id)).toEqual(['attempt_2'])
  })

  it('clears a saved quiz reference to a deleted attempt', () => {
    upsertSavedQuiz(makeQuiz({ lastAttemptId: 'attempt_1' }))
    appendAttempt(makeAttempt())
    deleteAttempt('attempt_1')
    expect(loadSavedQuizzes()[0].lastAttemptId).toBeUndefined()
  })
})

describe('active session', () => {
  it('round-trips a session', () => {
    const session = makeSession()
    saveSession(session)
    const loaded = loadSession()
    expect(loaded?.answers).toEqual({ 1: 'Paris' })
    expect(loaded?.currentIndex).toBe(1)
    expect(loaded?.attemptId).toBe('attempt_live')
    expect(loaded?.quizId).toBe('quiz_1')
    expect(loaded?.settings.timerMinutes).toBe(10)
  })

  it('clears the session', () => {
    saveSession(makeSession())
    clearSession()
    expect(loadSession()).toBeNull()
  })

  it('clamps a current index that points past the questions', () => {
    saveSession(makeSession({ currentIndex: 99 }))
    expect(loadSession()?.currentIndex).toBe(1)
  })
})

describe('corrupted and hostile storage', () => {
  it('recovers from a session entry that is not JSON', () => {
    storage.setItem(SESSION_KEY, '{not json')
    expect(loadSession()).toBeNull()
    expect(storage.getItem(SESSION_KEY)).toBeNull()
  })

  it('rejects a session whose questions are missing', () => {
    storage.setItem(SESSION_KEY, JSON.stringify({ answers: {}, currentIndex: 0 }))
    expect(loadSession()).toBeNull()
  })

  it('backfills fields missing from a pre-library session', () => {
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        questions,
        answers: { 1: 'Paris' },
        currentIndex: 0,
        status: 'active',
        startedAt: 42,
        timerMinutes: 5,
      }),
    )
    const loaded = loadSession()
    expect(loaded).not.toBeNull()
    expect(loaded?.attemptId).toMatch(/^attempt_/)
    expect(loaded?.settings.timerMinutes).toBe(5)
    expect(loaded?.quizId).toBeUndefined()
  })

  it('returns an empty library when the stored value is not an array', () => {
    storage.setItem(SAVED_QUIZZES_KEY, JSON.stringify({ nope: true }))
    expect(loadSavedQuizzes()).toEqual([])
  })

  it('drops only the invalid entries from a partly corrupted library', () => {
    storage.setItem(
      SAVED_QUIZZES_KEY,
      JSON.stringify([makeQuiz(), { id: 'broken' }, null, makeQuiz({ id: 'quiz_3' })]),
    )
    expect(loadSavedQuizzes().map((q) => q.id)).toEqual(['quiz_1', 'quiz_3'])
  })

  it('drops only the invalid entries from a partly corrupted history', () => {
    storage.setItem(RESULTS_KEY, JSON.stringify([makeAttempt(), 'garbage']))
    expect(loadAttempts().map((a) => a.id)).toEqual(['attempt_1'])
  })

  it('repairs a saved quiz that lost its fingerprint', () => {
    storage.setItem(SAVED_QUIZZES_KEY, JSON.stringify([{ ...makeQuiz(), fingerprint: undefined }]))
    expect(loadSavedQuizzes()[0].fingerprint).toBe(fingerprintQuestions(questions))
  })

  it('keeps working when writes fail because storage is full', () => {
    storage.full = true
    expect(() => upsertSavedQuiz(makeQuiz())).not.toThrow()
    expect(() => appendAttempt(makeAttempt())).not.toThrow()
    expect(() => saveSession(makeSession())).not.toThrow()
    expect(isStorageAvailable()).toBe(false)
    expect(loadSavedQuizzes()).toEqual([])
  })

  it('keeps working when localStorage access throws', () => {
    installBlockedStorage()
    resetMigrationForTests()
    expect(isStorageAvailable()).toBe(false)
    expect(loadSavedQuizzes()).toEqual([])
    expect(loadAttempts()).toEqual([])
    expect(loadSession()).toBeNull()
    expect(loadTheme()).toBeNull()
    expect(() => saveTheme('dark')).not.toThrow()
    expect(() => deleteSavedQuiz('quiz_1')).not.toThrow()
  })
})

describe('migration', () => {
  it('adopts a session written by the pre-library build', () => {
    storage.setItem(
      LEGACY_SESSION_KEY,
      JSON.stringify({
        questions,
        answers: { 1: 'Paris' },
        currentIndex: 1,
        status: 'active',
        startedAt: 7,
        timerMinutes: 0,
      }),
    )

    const loaded = loadSession()

    expect(loaded?.answers).toEqual({ 1: 'Paris' })
    expect(loaded?.currentIndex).toBe(1)
    expect(storage.getItem('drillmcq_schema_version')).toBe('1')
  })

  it('does not clobber an existing session with the legacy one', () => {
    storage.setItem(SESSION_KEY, JSON.stringify(makeSession({ attemptId: 'current' })))
    storage.setItem(LEGACY_SESSION_KEY, JSON.stringify(makeSession({ attemptId: 'legacy' })))
    expect(loadSession()?.attemptId).toBe('current')
  })

  it('leaves an already-migrated store untouched', () => {
    storage.setItem('drillmcq_schema_version', '1')
    storage.setItem(LEGACY_SESSION_KEY, JSON.stringify(makeSession({ attemptId: 'legacy' })))
    expect(loadSession()).toBeNull()
  })
})
