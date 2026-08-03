import { beforeEach, describe, expect, it } from 'vitest'
import type { QuizAttempt, QuizQuestion, QuizSettings, SavedQuiz } from '../types/quiz'
import { installMemoryStorage } from '../test/localStorageMock'
import {
  appendAttempt,
  loadAttempts,
  loadSavedQuizzes,
  patchSavedQuiz,
  resetMigrationForTests,
  upsertSavedQuiz,
} from '../services/storage'
import {
  attemptStatus,
  attemptToSession,
  attemptsForQuiz,
  buildSession,
  computeHistoryStats,
  createSavedQuiz,
  findDuplicate,
  progressToSession,
  sessionToAttempt,
  sessionToProgress,
  sortAttemptsByRecency,
} from './library'

const questions: QuizQuestion[] = [
  { id: 1, question: 'Capital of France?', options: ['Paris', 'Rome'], correctAnswer: 'Paris' },
  { id: 2, question: '2 + 2?', options: ['3', '4'], correctAnswer: '4', category: 'Maths' },
  { id: 3, question: 'Largest ocean?', options: ['Pacific', 'Indian'], correctAnswer: 'Pacific', category: 'Geo' },
]

const settings: QuizSettings = {
  shuffleQuestions: false,
  shuffleOptions: false,
  timerMinutes: 0,
  categories: [],
}

function attemptWith(percentage: number, completedAt: number, id: string): QuizAttempt {
  return {
    id,
    quizId: 'quiz_1',
    quizName: 'Geography',
    startedAt: completedAt - 60_000,
    completedAt,
    timeTakenSeconds: 60,
    correct: 0,
    incorrect: 0,
    unanswered: 0,
    total: 10,
    percentage,
    settings,
    questions,
    answers: {},
  }
}

beforeEach(() => {
  installMemoryStorage()
  resetMigrationForTests()
})

describe('starting a saved quiz', () => {
  it('links the session to the saved quiz', () => {
    const quiz = createSavedQuiz('Geography', questions)
    const session = buildSession(questions, settings, { quizId: quiz.id, quizName: quiz.name })

    expect(session.quizId).toBe(quiz.id)
    expect(session.quizName).toBe('Geography')
    expect(session.status).toBe('active')
    expect(session.answers).toEqual({})
    expect(session.currentIndex).toBe(0)
    expect(session.questions).toHaveLength(3)
    expect(session.attemptId).toMatch(/^attempt_/)
  })

  it('applies the category filter and records the settings used', () => {
    const filtered: QuizSettings = { ...settings, categories: ['Maths'], timerMinutes: 15 }
    const session = buildSession(questions, filtered)

    expect(session.questions.map((q) => q.id)).toEqual([2])
    expect(session.timerMinutes).toBe(15)
    expect(session.settings).toEqual(filtered)
  })

  it('keeps the shuffled order fixed on the session', () => {
    const session = buildSession(questions, { ...settings, shuffleQuestions: true })
    expect([...session.questions].map((q) => q.id).sort()).toEqual([1, 2, 3])
  })

  it('gives each run its own attempt id', () => {
    expect(buildSession(questions, settings).attemptId).not.toBe(
      buildSession(questions, settings).attemptId,
    )
  })
})

describe('resuming an unfinished quiz', () => {
  it('preserves answers, position, timer and configuration', () => {
    const quiz = createSavedQuiz('Geography', questions)
    const timed: QuizSettings = { ...settings, timerMinutes: 20, shuffleOptions: true }
    const started = buildSession(questions, timed, { quizId: quiz.id, quizName: quiz.name })
    const inProgress = { ...started, answers: { 1: 'Paris' }, currentIndex: 2 }

    const progress = sessionToProgress(inProgress)
    upsertSavedQuiz({ ...quiz, progress })

    const stored = loadSavedQuizzes()[0]
    expect(stored.progress).toBeDefined()
    expect(attemptStatus(stored, 0)).toBe('in-progress')

    const resumed = progressToSession(stored, stored.progress!)
    expect(resumed.answers).toEqual({ 1: 'Paris' })
    expect(resumed.currentIndex).toBe(2)
    expect(resumed.startedAt).toBe(started.startedAt)
    expect(resumed.timerMinutes).toBe(20)
    expect(resumed.settings.shuffleOptions).toBe(true)
    expect(resumed.attemptId).toBe(started.attemptId)
    expect(resumed.status).toBe('active')
    expect(resumed.quizId).toBe(quiz.id)
  })
})

describe('completing an attempt', () => {
  it('scores the session and records the configuration', () => {
    const session = {
      ...buildSession(questions, { ...settings, timerMinutes: 5 }, {
        quizId: 'quiz_1',
        quizName: 'Geography',
      }),
      answers: { 1: 'Paris', 2: '3' },
      startedAt: 1_000_000,
    }

    const attempt = sessionToAttempt(session, 1_090_000)

    expect(attempt.id).toBe(session.attemptId)
    expect(attempt.quizId).toBe('quiz_1')
    expect(attempt.quizName).toBe('Geography')
    expect(attempt.correct).toBe(1)
    expect(attempt.incorrect).toBe(1)
    expect(attempt.unanswered).toBe(1)
    expect(attempt.total).toBe(3)
    expect(attempt.percentage).toBe(33)
    expect(attempt.timeTakenSeconds).toBe(90)
    expect(attempt.settings.timerMinutes).toBe(5)
    expect(attempt.answers).toEqual({ 1: 'Paris', 2: '3' })
    expect(attempt.questions).toHaveLength(3)
  })

  it('labels an attempt at an unsaved quiz', () => {
    expect(sessionToAttempt(buildSession(questions, settings)).quizName).toBe('Unsaved quiz')
  })

  it('stores retakes side by side instead of overwriting', () => {
    const quiz = createSavedQuiz('Geography', questions)
    upsertSavedQuiz(quiz)

    const runs: Record<number, string>[] = [{ 1: 'Paris' }, { 1: 'Paris', 2: '4' }]
    for (const answers of runs) {
      const finished = { ...buildSession(questions, settings, { quizId: quiz.id, quizName: quiz.name }), answers }
      const attempt = sessionToAttempt(finished)
      appendAttempt(attempt)
      patchSavedQuiz(quiz.id, (q) => ({ ...q, progress: undefined, lastAttemptId: attempt.id }))
    }

    const stored = loadAttempts()
    expect(stored).toHaveLength(2)
    expect(stored.map((a) => a.percentage)).toEqual([33, 67])
    expect(loadSavedQuizzes()[0].progress).toBeUndefined()
    expect(attemptStatus(loadSavedQuizzes()[0], stored.length)).toBe('completed')
  })

  it('reproduces the review screen from a stored attempt', () => {
    const attempt = attemptWith(80, 5_000, 'attempt_1')
    const session = attemptToSession(attempt)

    expect(session.status).toBe('finished')
    expect(session.questions).toEqual(attempt.questions)
    expect(session.answers).toEqual(attempt.answers)
    expect(session.finishedAt).toBe(attempt.completedAt)
  })
})

describe('history statistics', () => {
  const attempts = [
    attemptWith(50, 1_000, 'a1'),
    attemptWith(90, 3_000, 'a3'),
    attemptWith(70, 2_000, 'a2'),
  ]

  it('reports latest, best, average and count', () => {
    const stats = computeHistoryStats(attempts)
    expect(stats.attempts).toBe(3)
    expect(stats.latest).toBe(90)
    expect(stats.best).toBe(90)
    expect(stats.average).toBe(70)
  })

  it('rounds the average', () => {
    const stats = computeHistoryStats([attemptWith(50, 1, 'a'), attemptWith(51, 2, 'b')])
    expect(stats.average).toBe(51)
  })

  it('handles an empty history', () => {
    expect(computeHistoryStats([])).toEqual({ attempts: 0, latest: null, best: null, average: null })
  })

  it('sorts newest first and filters by quiz', () => {
    const other = { ...attemptWith(10, 9_000, 'other'), quizId: 'quiz_2' }
    expect(sortAttemptsByRecency([...attempts, other]).map((a) => a.id)).toEqual([
      'other',
      'a3',
      'a2',
      'a1',
    ])
    expect(attemptsForQuiz([...attempts, other], 'quiz_1').map((a) => a.id)).toEqual(['a3', 'a2', 'a1'])
    expect(attemptsForQuiz(attempts, 'unknown')).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [...attempts]
    sortAttemptsByRecency(input)
    expect(input.map((a) => a.id)).toEqual(['a1', 'a3', 'a2'])
  })
})

describe('library helpers', () => {
  it('creates a saved quiz with ids, timestamps and a fingerprint', () => {
    const quiz = createSavedQuiz('  Geography  ', questions, 1234)
    expect(quiz.id).toMatch(/^quiz_/)
    expect(quiz.name).toBe('Geography')
    expect(quiz.createdAt).toBe(1234)
    expect(quiz.updatedAt).toBe(1234)
    expect(quiz.fingerprint).not.toBe('')
    expect(quiz.progress).toBeUndefined()
  })

  it('falls back to a placeholder name when none is given', () => {
    expect(createSavedQuiz('   ', questions).name).toBe('Untitled quiz')
  })

  it('spots a re-import of a quiz that is already saved', () => {
    const quiz = createSavedQuiz('Geography', questions)
    const library: SavedQuiz[] = [quiz]

    expect(findDuplicate(library, [...questions])?.id).toBe(quiz.id)
    expect(findDuplicate(library, questions.slice(0, 2))).toBeNull()
    expect(findDuplicate([], questions)).toBeNull()
  })

  it('derives the card status', () => {
    const quiz = createSavedQuiz('Geography', questions)
    expect(attemptStatus(quiz, 0)).toBe('not-started')
    expect(attemptStatus(quiz, 2)).toBe('completed')
    expect(attemptStatus({ ...quiz, lastAttemptId: 'a1' }, 0)).toBe('completed')
    expect(
      attemptStatus({ ...quiz, progress: sessionToProgress(buildSession(questions, settings)) }, 3),
    ).toBe('in-progress')
  })
})
