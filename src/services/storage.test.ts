import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { QuizAttempt, QuizQuestion, QuizSession, SavedQuiz } from '../types/quiz'
import {
  appendAttempt,
  clearAIKey,
  clearSession,
  defaultAIConfig,
  defaultAppearance,
  deleteAttempt,
  deleteSavedQuiz,
  fingerprintQuestions,
  isStorageAvailable,
  loadAIConfig,
  loadAIKey,
  loadAppearance,
  loadAttempts,
  loadSavedQuizzes,
  loadSession,
  loadTheme,
  patchSavedQuiz,
  resetMigrationForTests,
  saveAIConfig,
  saveAIKey,
  saveAppearance,
  saveSession,
  saveTheme,
  SCHEMA_VERSION,
  upsertSavedQuiz,
} from './storage'
import { installBlockedStorage, installMemoryStorage, type MemoryStorage } from '../test/localStorageMock'

const SAVED_QUIZZES_KEY = 'drillmcq_saved_quizzes.v1'
const RESULTS_KEY = 'drillmcq_quiz_results.v1'
const SESSION_KEY = 'drillmcq_active_session.v1'
const LEGACY_SESSION_KEY = 'drillmcq.session.v1'
const AI_PREFS_KEY = 'drillmcq_ai_prefs.v1'
const AI_KEY_KEY = 'drillmcq_ai_key.v1'
const APPEARANCE_KEY = 'drillmcq_appearance.v1'

const questions: QuizQuestion[] = [
  { id: 1, question: 'Capital of France?', options: ['Paris', 'Rome'], correctAnswers: ['Paris'] },
  { id: 2, question: '2 + 2?', options: ['3', '4'], correctAnswers: ['4'], category: 'Maths' },
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
    answers: { 1: ['Paris'], 2: ['3'] },
    ...overrides,
  }
}

function makeSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    questions,
    answers: { 1: ['Paris'] },
    drafts: {},
    revealed: [],
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
    expect(loaded?.answers).toEqual({ 1: ['Paris'] })
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

    expect(loaded?.answers).toEqual({ 1: ['Paris'] })
    expect(loaded?.currentIndex).toBe(1)
    expect(storage.getItem('drillmcq_schema_version')).toBe(String(SCHEMA_VERSION))
  })

  it('upgrades pre-multi-answer questions and answers in place', () => {
    // Exactly what a v1 build wrote: a single `correctAnswer` string per
    // question and a bare string per answer.
    const legacyQuestions = [
      { id: 1, question: 'Capital of France?', options: ['Paris', 'Rome'], correctAnswer: 'Paris' },
    ]
    storage.setItem('drillmcq_schema_version', '1')
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        questions: legacyQuestions,
        answers: { 1: 'Paris' },
        currentIndex: 0,
        status: 'active',
        startedAt: 7,
        timerMinutes: 0,
        attemptId: 'attempt_old',
      }),
    )
    storage.setItem(
      SAVED_QUIZZES_KEY,
      JSON.stringify([{ ...makeQuiz(), questions: legacyQuestions }]),
    )
    storage.setItem(
      RESULTS_KEY,
      JSON.stringify([{ ...makeAttempt(), questions: legacyQuestions, answers: { 1: 'Paris' } }]),
    )

    const session = loadSession()
    expect(session?.questions[0].correctAnswers).toEqual(['Paris'])
    expect(session?.answers).toEqual({ 1: ['Paris'] })
    expect(session?.drafts).toEqual({})
    expect(loadSavedQuizzes()[0].questions[0].correctAnswers).toEqual(['Paris'])
    expect(loadAttempts()[0].answers).toEqual({ 1: ['Paris'] })
    expect(storage.getItem('drillmcq_schema_version')).toBe(String(SCHEMA_VERSION))

    // The upgrade is written back, so the stored copy is already current.
    expect(storage.getItem(SESSION_KEY)).toContain('correctAnswers')
  })

  it('does not clobber an existing session with the legacy one', () => {
    storage.setItem(SESSION_KEY, JSON.stringify(makeSession({ attemptId: 'current' })))
    storage.setItem(LEGACY_SESSION_KEY, JSON.stringify(makeSession({ attemptId: 'legacy' })))
    expect(loadSession()?.attemptId).toBe('current')
  })

  it('backfills an empty reveal set on a session written before "Check Answer"', () => {
    const preReveal: Record<string, unknown> = { ...makeSession() }
    delete preReveal.revealed
    storage.setItem(SESSION_KEY, JSON.stringify(preReveal))

    // The run resumes with nothing revealed, rather than being thrown away.
    expect(loadSession()?.revealed).toEqual([])
    expect(loadSession()?.answers).toEqual({ 1: ['Paris'] })
    expect(storage.getItem('drillmcq_schema_version')).toBe(String(SCHEMA_VERSION))
  })

  it('keeps a stored reveal set, dropping junk entries', () => {
    storage.setItem(
      SESSION_KEY,
      JSON.stringify(makeSession({ revealed: [1, 1, 'two', null, 2] as unknown as number[] })),
    )
    expect(loadSession()?.revealed).toEqual([1, 2])
  })

  it('leaves an already-migrated store untouched', () => {
    storage.setItem('drillmcq_schema_version', String(SCHEMA_VERSION))
    storage.setItem(LEGACY_SESSION_KEY, JSON.stringify(makeSession({ attemptId: 'legacy' })))
    expect(loadSession()).toBeNull()
  })
})

describe('AI preferences', () => {
  it('returns defaults when nothing is stored', () => {
    const config = loadAIConfig()
    expect(config.enabled).toBe(false)
    expect(config.provider).toBe('openai')
    expect(config.rememberKey).toBe(false)
    expect(config.maxBatchQuestions).toBe(50)
  })

  it('round-trips preferences', () => {
    saveAIConfig({
      ...defaultAIConfig(),
      enabled: true,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      maxBatchQuestions: 25,
    })
    const loaded = loadAIConfig()
    expect(loaded.enabled).toBe(true)
    expect(loaded.provider).toBe('anthropic')
    expect(loaded.model).toBe('claude-sonnet-5')
    expect(loaded.maxBatchQuestions).toBe(25)
  })

  it('repairs garbage instead of throwing or disabling the app', () => {
    storage.setItem(
      AI_PREFS_KEY,
      JSON.stringify({ enabled: 'yes', provider: 'skynet', model: 42, maxBatchQuestions: -5 }),
    )
    const config = loadAIConfig()
    expect(config.enabled).toBe(false) // only a literal true counts
    expect(config.provider).toBe('openai') // unknown provider falls back
    expect(config.model).toBe('') // non-string model dropped
    expect(config.maxBatchQuestions).toBe(1) // clamped into range
  })

  it('clamps an absurd batch size', () => {
    storage.setItem(AI_PREFS_KEY, JSON.stringify({ maxBatchQuestions: 10_000 }))
    expect(loadAIConfig().maxBatchQuestions).toBe(200)
  })

  it('survives a non-object entry', () => {
    storage.setItem(AI_PREFS_KEY, '"nonsense"')
    expect(() => loadAIConfig()).not.toThrow()
    expect(loadAIConfig().provider).toBe('openai')
  })

  it('does not bump the schema version or add a migration step', () => {
    // The AI keys are new, so there is no older shape to repair — writing
    // preferences must leave the version wherever the quiz shapes put it.
    const before = SCHEMA_VERSION
    saveAIConfig(defaultAIConfig())
    expect(SCHEMA_VERSION).toBe(before)
    expect(storage.getItem('drillmcq_schema_version')).toBe(String(before))
  })
})

describe('appearance preferences', () => {
  it('returns the shipped look when nothing is stored', () => {
    const prefs = loadAppearance()
    expect(prefs.font).toBe('sans')
    expect(prefs.fontScale).toBe(1)
    expect(prefs.background).toBe('default')
  })

  it('round-trips preferences', () => {
    saveAppearance({ font: 'serif', fontScale: 1.3, background: 'warm' })
    const loaded = loadAppearance()
    expect(loaded.font).toBe('serif')
    expect(loaded.fontScale).toBe(1.3)
    expect(loaded.background).toBe('warm')
  })

  it('repairs garbage instead of throwing or disabling the app', () => {
    storage.setItem(
      APPEARANCE_KEY,
      JSON.stringify({ font: 'papyrus', fontScale: 'huge', background: 42 }),
    )
    const prefs = loadAppearance()
    expect(prefs.font).toBe('sans') // unknown font falls back
    expect(prefs.fontScale).toBe(1) // non-numeric scale dropped
    expect(prefs.background).toBe('default')
  })

  it('clamps an absurd text size at both ends', () => {
    storage.setItem(APPEARANCE_KEY, JSON.stringify({ fontScale: 99 }))
    expect(loadAppearance().fontScale).toBe(1.6)
    storage.setItem(APPEARANCE_KEY, JSON.stringify({ fontScale: 0.01 }))
    expect(loadAppearance().fontScale).toBe(0.8)
  })

  it('survives a non-object entry', () => {
    storage.setItem(APPEARANCE_KEY, '"nonsense"')
    expect(() => loadAppearance()).not.toThrow()
    expect(loadAppearance().font).toBe('sans')
  })

  it('does not bump the schema version or add a migration step', () => {
    const before = SCHEMA_VERSION
    saveAppearance(defaultAppearance())
    expect(SCHEMA_VERSION).toBe(before)
    expect(storage.getItem('drillmcq_schema_version')).toBe(String(before))
  })

  it('is independent of the theme key', () => {
    // Separate entries: changing the palette must never disturb dark mode.
    saveTheme('dark')
    saveAppearance({ font: 'mono', fontScale: 0.9, background: 'contrast' })
    expect(loadTheme()).toBe('dark')
    expect(loadAppearance().font).toBe('mono')
  })
})

describe('AI key', () => {
  it('is absent until explicitly saved', () => {
    expect(loadAIKey()).toBeNull()
  })

  it('round-trips and clears', () => {
    saveAIKey('sk-test-123')
    expect(loadAIKey()).toBe('sk-test-123')
    clearAIKey()
    expect(loadAIKey()).toBeNull()
  })

  it('treats an empty stored value as absent', () => {
    storage.setItem(AI_KEY_KEY, '')
    expect(loadAIKey()).toBeNull()
  })

  it('lives in its own key, so clearing it leaves preferences intact', () => {
    saveAIConfig({ ...defaultAIConfig(), enabled: true, provider: 'gemini' })
    saveAIKey('sk-test-123')
    clearAIKey()
    const config = loadAIConfig()
    expect(config.enabled).toBe(true)
    expect(config.provider).toBe('gemini')
  })

  it('never leaks into the preferences entry', () => {
    saveAIConfig({ ...defaultAIConfig(), rememberKey: true })
    saveAIKey('sk-secret-value')
    expect(storage.getItem(AI_PREFS_KEY)).not.toContain('sk-secret-value')
  })

  it('does not throw when storage is full', () => {
    storage.full = true
    expect(() => saveAIKey('sk-test-123')).not.toThrow()
    expect(() => saveAIConfig(defaultAIConfig())).not.toThrow()
  })
})
