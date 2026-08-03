import type {
  QuizAttempt,
  QuizQuestion,
  QuizSession,
  QuizSettings,
  SavedQuiz,
  SavedQuizProgress,
} from '../types/quiz'

/**
 * Thin wrapper around localStorage so persistence logic lives in one place
 * and the rest of the app never touches storage keys directly.
 *
 * Everything here is defensive: localStorage can be missing (SSR, sandboxed
 * iframe), blocked (private mode), full (quota), or hold data written by an
 * older version of the app. No read or write is allowed to throw.
 */

const SCHEMA_VERSION_KEY = 'drillmcq_schema_version'
const SAVED_QUIZZES_KEY = 'drillmcq_saved_quizzes.v1'
const RESULTS_KEY = 'drillmcq_quiz_results.v1'
const SESSION_KEY = 'drillmcq_active_session.v1'
const THEME_KEY = 'drillmcq.theme.v1'

/** Pre-library session key. Migrated into SESSION_KEY, then left in place. */
const LEGACY_SESSION_KEY = 'drillmcq.session.v1'

/** Bump when a stored shape changes, and add a step to `migrate` below. */
export const SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Low-level primitives
// ---------------------------------------------------------------------------

/** localStorage access can throw on the very first touch, so probe it once. */
function store(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function readRaw(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    const s = store()
    if (!s) return false
    s.setItem(key, value)
    return true
  } catch {
    // Quota exceeded or storage unavailable — the app keeps working in memory.
    return false
  }
}

function removeRaw(key: string): void {
  try {
    store()?.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Parse a stored JSON value, running it past `validate` before trusting it.
 * A corrupted or outdated entry is dropped rather than crashing a caller.
 */
function readJson<T>(key: string, validate: (value: unknown) => T | null): T | null {
  const raw = readRaw(key)
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    removeRaw(key)
    return null
  }
  const value = validate(parsed)
  if (value === null) removeRaw(key)
  return value
}

function writeJson(key: string, value: unknown): boolean {
  try {
    return writeRaw(key, JSON.stringify(value))
  } catch {
    // Circular structure or a value JSON can't represent — shouldn't happen.
    return false
  }
}

/** True when values written here will actually survive a refresh. */
export function isStorageAvailable(): boolean {
  const probe = '__drillmcq_probe__'
  if (!writeRaw(probe, '1')) return false
  removeRaw(probe)
  return true
}

// ---------------------------------------------------------------------------
// Shape guards — every load path funnels through these
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isQuestion(value: unknown): value is QuizQuestion {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'number' &&
    typeof value.question === 'string' &&
    Array.isArray(value.options) &&
    value.options.every((o) => typeof o === 'string') &&
    typeof value.correctAnswer === 'string'
  )
}

function isQuestionList(value: unknown): value is QuizQuestion[] {
  return Array.isArray(value) && value.length > 0 && value.every(isQuestion)
}

function isAnswerMap(value: unknown): value is Record<number, string> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === 'string')
}

/** Settings are cosmetic on load — fill in defaults rather than reject. */
function normalizeSettings(value: unknown): QuizSettings {
  const raw = isRecord(value) ? value : {}
  return {
    shuffleQuestions: raw.shuffleQuestions === true,
    shuffleOptions: raw.shuffleOptions === true,
    timerMinutes: typeof raw.timerMinutes === 'number' && raw.timerMinutes > 0 ? raw.timerMinutes : 0,
    categories:
      Array.isArray(raw.categories) && raw.categories.every((c) => typeof c === 'string')
        ? (raw.categories as string[])
        : [],
  }
}

/**
 * Accept a stored session, backfilling fields added by the library feature so
 * a session written by an older build resumes instead of being thrown away.
 */
function normalizeSession(value: unknown): QuizSession | null {
  if (!isRecord(value)) return null
  if (!isQuestionList(value.questions)) return null

  const questions = value.questions
  const answers = isAnswerMap(value.answers) ? value.answers : {}
  const timerMinutes =
    typeof value.timerMinutes === 'number' && value.timerMinutes > 0 ? value.timerMinutes : 0
  const settings = normalizeSettings(value.settings)

  return {
    questions,
    answers,
    currentIndex:
      typeof value.currentIndex === 'number' && value.currentIndex >= 0
        ? Math.min(value.currentIndex, questions.length - 1)
        : 0,
    status: value.status === 'finished' ? 'finished' : 'active',
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : Date.now(),
    timerMinutes,
    attemptId: typeof value.attemptId === 'string' ? value.attemptId : createId('attempt'),
    // Legacy sessions predate `settings`; the timer is the one field we can
    // recover, the rest were already baked into the question order.
    settings: { ...settings, timerMinutes: settings.timerMinutes || timerMinutes },
    quizId: typeof value.quizId === 'string' ? value.quizId : undefined,
    quizName: typeof value.quizName === 'string' ? value.quizName : undefined,
    finishedAt: typeof value.finishedAt === 'number' ? value.finishedAt : undefined,
  }
}

function normalizeProgress(value: unknown): SavedQuizProgress | null {
  if (!isRecord(value)) return null
  if (!isQuestionList(value.questions)) return null
  const questions = value.questions
  return {
    attemptId: typeof value.attemptId === 'string' ? value.attemptId : createId('attempt'),
    questions,
    answers: isAnswerMap(value.answers) ? value.answers : {},
    currentIndex:
      typeof value.currentIndex === 'number' && value.currentIndex >= 0
        ? Math.min(value.currentIndex, questions.length - 1)
        : 0,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : Date.now(),
    timerMinutes: typeof value.timerMinutes === 'number' && value.timerMinutes > 0 ? value.timerMinutes : 0,
    settings: normalizeSettings(value.settings),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  }
}

function normalizeSavedQuiz(value: unknown): SavedQuiz | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id === '') return null
  if (!isQuestionList(value.questions)) return null

  const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now()
  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() !== '' ? value.name : 'Untitled quiz',
    questions: value.questions,
    createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : createdAt,
    lastAttemptId: typeof value.lastAttemptId === 'string' ? value.lastAttemptId : undefined,
    progress: normalizeProgress(value.progress) ?? undefined,
    fingerprint:
      typeof value.fingerprint === 'string' && value.fingerprint !== ''
        ? value.fingerprint
        : fingerprintQuestions(value.questions),
  }
}

function normalizeAttempt(value: unknown): QuizAttempt | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id === '') return null
  if (!isQuestionList(value.questions)) return null

  const total = typeof value.total === 'number' ? value.total : value.questions.length
  const correct = typeof value.correct === 'number' ? value.correct : 0
  const completedAt = typeof value.completedAt === 'number' ? value.completedAt : Date.now()
  return {
    id: value.id,
    quizId: typeof value.quizId === 'string' ? value.quizId : undefined,
    quizName: typeof value.quizName === 'string' ? value.quizName : 'Untitled quiz',
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : completedAt,
    completedAt,
    timeTakenSeconds: typeof value.timeTakenSeconds === 'number' ? value.timeTakenSeconds : 0,
    correct,
    incorrect: typeof value.incorrect === 'number' ? value.incorrect : 0,
    unanswered: typeof value.unanswered === 'number' ? value.unanswered : 0,
    total,
    percentage:
      typeof value.percentage === 'number'
        ? value.percentage
        : total === 0
          ? 0
          : Math.round((correct / total) * 100),
    settings: normalizeSettings(value.settings),
    questions: value.questions,
    answers: isAnswerMap(value.answers) ? value.answers : {},
  }
}

/**
 * Read a stored array, keeping the entries that survive validation. One bad
 * record loses that record, not the user's whole library.
 */
function normalizeList<T>(value: unknown, normalize: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return []
  const out: T[] = []
  for (const item of value) {
    const normalized = normalize(item)
    if (normalized !== null) out.push(normalized)
  }
  return out
}

// ---------------------------------------------------------------------------
// Ids and fingerprints
// ---------------------------------------------------------------------------

/** Collision-resistant enough for keys that never leave this browser. */
export function createId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`
    }
  } catch {
    // fall through to the Math.random path
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Content hash of a question bank, used to recognise a re-import of a quiz
 * that is already saved. Order-sensitive on purpose: the questions come from
 * the same paste, so the same paste yields the same fingerprint.
 */
export function fingerprintQuestions(questions: QuizQuestion[]): string {
  const source = questions.map((q) => `${q.id}|${q.question}|${q.options.join('~')}`).join('\n')
  // Small, stable, non-cryptographic hash (FNV-1a), plenty for de-duping.
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${questions.length}-${(hash >>> 0).toString(36)}`
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

let migrated = false

/**
 * Bring storage up to `SCHEMA_VERSION`. Runs at most once per page load and
 * is called by every public read so no caller can see pre-migration data.
 */
export function migrate(): void {
  if (migrated) return
  migrated = true
  if (!store()) return

  const storedVersion = Number(readRaw(SCHEMA_VERSION_KEY) ?? '0')
  if (storedVersion >= SCHEMA_VERSION) return

  // v0 -> v1: the session moved from `drillmcq.session.v1` to its own
  // namespaced key. Copy it across so an in-progress quiz survives the
  // upgrade; the legacy key is left untouched in case the user rolls back.
  if (storedVersion < 1 && readRaw(SESSION_KEY) === null) {
    const legacy = readJson(LEGACY_SESSION_KEY, normalizeSession)
    if (legacy) writeJson(SESSION_KEY, legacy)
  }

  writeRaw(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION))
}

// ---------------------------------------------------------------------------
// Active session
// ---------------------------------------------------------------------------

export function saveSession(session: QuizSession): void {
  migrate()
  writeJson(SESSION_KEY, session)
}

export function loadSession(): QuizSession | null {
  migrate()
  return readJson(SESSION_KEY, normalizeSession)
}

export function clearSession(): void {
  migrate()
  removeRaw(SESSION_KEY)
}

// ---------------------------------------------------------------------------
// Saved quiz library
// ---------------------------------------------------------------------------

export function loadSavedQuizzes(): SavedQuiz[] {
  migrate()
  const list = readJson(SAVED_QUIZZES_KEY, (value) => normalizeList(value, normalizeSavedQuiz))
  return list ?? []
}

function writeSavedQuizzes(quizzes: SavedQuiz[]): boolean {
  return writeJson(SAVED_QUIZZES_KEY, quizzes)
}

/**
 * Insert or replace a saved quiz, returning the full library so callers can
 * refresh their state from a single round trip.
 */
export function upsertSavedQuiz(quiz: SavedQuiz): SavedQuiz[] {
  const quizzes = loadSavedQuizzes()
  const index = quizzes.findIndex((q) => q.id === quiz.id)
  if (index === -1) quizzes.push(quiz)
  else quizzes[index] = quiz
  writeSavedQuizzes(quizzes)
  return quizzes
}

/** Apply a change to one saved quiz. No-op when the id is unknown. */
export function patchSavedQuiz(
  id: string,
  patch: (quiz: SavedQuiz) => SavedQuiz,
): SavedQuiz[] {
  const quizzes = loadSavedQuizzes()
  const index = quizzes.findIndex((q) => q.id === id)
  if (index === -1) return quizzes
  quizzes[index] = patch(quizzes[index])
  writeSavedQuizzes(quizzes)
  return quizzes
}

/** Delete a saved quiz *and* its attempt history — they're worthless alone. */
export function deleteSavedQuiz(id: string): SavedQuiz[] {
  const quizzes = loadSavedQuizzes().filter((q) => q.id !== id)
  writeSavedQuizzes(quizzes)
  writeAttempts(loadAttempts().filter((a) => a.quizId !== id))
  return quizzes
}

// ---------------------------------------------------------------------------
// Results history
// ---------------------------------------------------------------------------

export function loadAttempts(): QuizAttempt[] {
  migrate()
  const list = readJson(RESULTS_KEY, (value) => normalizeList(value, normalizeAttempt))
  return list ?? []
}

function writeAttempts(attempts: QuizAttempt[]): boolean {
  return writeJson(RESULTS_KEY, attempts)
}

/**
 * Append a completed attempt. Previous attempts are never overwritten, and
 * re-appending the same attempt id is a no-op so a repeated finish effect
 * can't double-record a run.
 */
export function appendAttempt(attempt: QuizAttempt): QuizAttempt[] {
  const attempts = loadAttempts()
  if (attempts.some((a) => a.id === attempt.id)) return attempts
  attempts.push(attempt)
  writeAttempts(attempts)
  return attempts
}

export function deleteAttempt(id: string): QuizAttempt[] {
  const attempts = loadAttempts().filter((a) => a.id !== id)
  writeAttempts(attempts)

  // Don't leave a saved quiz pointing at an attempt that no longer exists.
  const quizzes = loadSavedQuizzes()
  if (quizzes.some((q) => q.lastAttemptId === id)) {
    writeSavedQuizzes(
      quizzes.map((q) => (q.lastAttemptId === id ? { ...q, lastAttemptId: undefined } : q)),
    )
  }
  return attempts
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark'

export function saveTheme(theme: Theme): void {
  writeRaw(THEME_KEY, theme)
}

export function loadTheme(): Theme | null {
  const raw = readRaw(THEME_KEY)
  return raw === 'light' || raw === 'dark' ? raw : null
}

/** Test helper: forget that migration already ran on this page. */
export function resetMigrationForTests(): void {
  migrated = false
}
