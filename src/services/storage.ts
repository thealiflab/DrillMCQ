import type { AIConfig, AIProviderId } from '../types/ai'
import type { AppearancePrefs, BackgroundChoice, FontChoice } from '../types/appearance'
import type {
  QuizAttempt,
  QuizQuestion,
  QuizSession,
  QuizSettings,
  SavedQuiz,
  SavedQuizProgress,
} from '../types/quiz'
import type { SoundPrefs } from '../types/sound'
import { clampFontScale } from '../utils/appearance'
import { normalizePassPercentage, normalizeQuestion } from '../utils/quiz'
import { defaultSoundPrefs } from '../utils/sound'

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

/**
 * Font, text size and background preset. Separate from the theme key so the
 * light/dark toggle — which every screen already depends on — keeps its own
 * bare-string entry and can never be disturbed by an appearance write.
 */
const APPEARANCE_KEY = 'drillmcq_appearance.v1'

/**
 * Sound effects on/off. Deliberately not part of the appearance entry — see
 * the load/save pair below.
 */
const SOUND_KEY = 'drillmcq_sound.v1'

/**
 * AI assistant preferences and, only ever on explicit opt-in, the user's API
 * key. Two keys rather than one object on purpose: clearing the key must never
 * rewrite preferences, and nothing that dumps the preferences object can carry
 * the secret along with it.
 */
const AI_PREFS_KEY = 'drillmcq_ai_prefs.v1'
const AI_KEY_KEY = 'drillmcq_ai_key.v1'

/** Pre-library session key. Migrated into SESSION_KEY, then left in place. */
const LEGACY_SESSION_KEY = 'drillmcq.session.v1'

/** Bump when a stored shape changes, and add a step to `migrate` below. */
export const SCHEMA_VERSION = 4

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

/** Accepts both the current `correctAnswers` array and the legacy string. */
function isQuestion(value: unknown): boolean {
  if (!isRecord(value)) return false
  const hasAnswer =
    typeof value.correctAnswer === 'string' ||
    (Array.isArray(value.correctAnswers) &&
      value.correctAnswers.length > 0 &&
      value.correctAnswers.every((a) => typeof a === 'string'))
  return (
    typeof value.id === 'number' &&
    typeof value.question === 'string' &&
    Array.isArray(value.options) &&
    value.options.every((o) => typeof o === 'string') &&
    hasAnswer
  )
}

function isQuestionList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isQuestion)
}

/** Validated question list, upgraded to `correctAnswers` on the way through. */
function normalizeQuestionList(value: unknown): QuizQuestion[] {
  return (value as QuizQuestion[]).map(normalizeQuestion)
}

/**
 * Question id -> selected options. Sessions written before multiple correct
 * answers stored a bare string per question, so widen those to a single-item
 * array rather than discarding the user's progress.
 */
function normalizeAnswerMap(value: unknown): Record<number, string[]> {
  if (!isRecord(value)) return {}
  const out: Record<number, string[]> = {}
  for (const [key, raw] of Object.entries(value)) {
    const id = Number(key)
    if (!Number.isFinite(id)) continue
    if (typeof raw === 'string') out[id] = [raw]
    else if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) out[id] = raw
  }
  return out
}

/**
 * List of question ids (the "answer revealed" set). A session written before
 * "Check answer" existed simply has none, which is the correct reading: nothing
 * was revealed during that run.
 */
function normalizeIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item) && !out.includes(item)) out.push(item)
  }
  return out
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
    // Written before the pass mark existed: the default is the honest reading,
    // since the run was never judged against anything else.
    passPercentage: normalizePassPercentage(raw.passPercentage),
  }
}

/**
 * Accept a stored session, backfilling fields added by the library feature so
 * a session written by an older build resumes instead of being thrown away.
 */
function normalizeSession(value: unknown): QuizSession | null {
  if (!isRecord(value)) return null
  if (!isQuestionList(value.questions)) return null

  const questions = normalizeQuestionList(value.questions)
  const answers = normalizeAnswerMap(value.answers)
  const timerMinutes =
    typeof value.timerMinutes === 'number' && value.timerMinutes > 0 ? value.timerMinutes : 0
  const settings = normalizeSettings(value.settings)

  return {
    questions,
    answers,
    drafts: normalizeAnswerMap(value.drafts),
    revealed: normalizeIdList(value.revealed),
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
  const questions = normalizeQuestionList(value.questions)
  return {
    attemptId: typeof value.attemptId === 'string' ? value.attemptId : createId('attempt'),
    questions,
    answers: normalizeAnswerMap(value.answers),
    drafts: normalizeAnswerMap(value.drafts),
    revealed: normalizeIdList(value.revealed),
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
  const questions = normalizeQuestionList(value.questions)
  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() !== '' ? value.name : 'Untitled quiz',
    questions,
    createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : createdAt,
    lastAttemptId: typeof value.lastAttemptId === 'string' ? value.lastAttemptId : undefined,
    progress: normalizeProgress(value.progress) ?? undefined,
    fingerprint:
      typeof value.fingerprint === 'string' && value.fingerprint !== ''
        ? value.fingerprint
        : fingerprintQuestions(questions),
  }
}

function normalizeAttempt(value: unknown): QuizAttempt | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id === '') return null
  if (!isQuestionList(value.questions)) return null

  const questions = normalizeQuestionList(value.questions)
  const total = typeof value.total === 'number' ? value.total : questions.length
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
    questions,
    answers: normalizeAnswerMap(value.answers),
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

const AI_PROVIDER_IDS: AIProviderId[] = ['openai', 'gemini', 'anthropic']

/** Default preferences: AI off, nothing configured, key not persisted. */
export function defaultAIConfig(): AIConfig {
  return {
    enabled: false,
    provider: 'openai',
    // Left empty on purpose — the model catalog lives in `services/ai/models`
    // and storage stays ignorant of it. `useAI` fills in the provider default.
    model: '',
    customModel: false,
    rememberKey: false,
    maxBatchQuestions: 50,
  }
}

/**
 * Preferences are cosmetic on load, like `QuizSettings`: repair rather than
 * reject, so a hand-edited or half-written entry can never disable the app.
 */
function normalizeAIConfig(value: unknown): AIConfig {
  const raw = isRecord(value) ? value : {}
  const defaults = defaultAIConfig()
  const provider =
    typeof raw.provider === 'string' && (AI_PROVIDER_IDS as string[]).includes(raw.provider)
      ? (raw.provider as AIProviderId)
      : defaults.provider
  return {
    enabled: raw.enabled === true,
    provider,
    model: typeof raw.model === 'string' ? raw.model : defaults.model,
    customModel: raw.customModel === true,
    rememberKey: raw.rememberKey === true,
    maxBatchQuestions:
      typeof raw.maxBatchQuestions === 'number' && Number.isFinite(raw.maxBatchQuestions)
        ? Math.min(200, Math.max(1, Math.round(raw.maxBatchQuestions)))
        : defaults.maxBatchQuestions,
  }
}

const FONT_CHOICES: FontChoice[] = ['sans', 'serif', 'mono', 'readable']
const BACKGROUND_CHOICES: BackgroundChoice[] = ['default', 'warm', 'cool', 'contrast']

/** The look as shipped: system sans, unscaled text, the slate palette. */
export function defaultAppearance(): AppearancePrefs {
  return { font: 'sans', fontScale: 1, background: 'default' }
}

/**
 * Cosmetic on load, like `AIConfig`: repair rather than reject. An unreadable
 * appearance entry must cost the user their font choice, never the app.
 */
function normalizeAppearance(value: unknown): AppearancePrefs {
  const raw = isRecord(value) ? value : {}
  const defaults = defaultAppearance()
  return {
    font:
      typeof raw.font === 'string' && (FONT_CHOICES as string[]).includes(raw.font)
        ? (raw.font as FontChoice)
        : defaults.font,
    background:
      typeof raw.background === 'string' && (BACKGROUND_CHOICES as string[]).includes(raw.background)
        ? (raw.background as BackgroundChoice)
        : defaults.background,
    fontScale:
      typeof raw.fontScale === 'number' && Number.isFinite(raw.fontScale)
        ? clampFontScale(raw.fontScale)
        : defaults.fontScale,
  }
}

/**
 * One boolean, but normalized like everything else: a non-boolean entry means
 * a corrupted or hand-edited value, and defaulting it back to "on" is kinder
 * than leaving the app mysteriously silent.
 */
function normalizeSoundPrefs(value: unknown): SoundPrefs {
  const raw = isRecord(value) ? value : {}
  const defaults = defaultSoundPrefs()
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
  }
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

  // v1 -> v2: questions gained `correctAnswers: string[]` in place of
  // `correctAnswer: string`, and answers became arrays. The normalizers read
  // both shapes, so upgrading is a read-and-write-back through them — the keys
  // themselves stay put, which is what keeps existing libraries and history
  // intact instead of orphaning them behind a new suffix.
  if (storedVersion < 2) {
    const session = readJson(SESSION_KEY, normalizeSession)
    if (session) writeJson(SESSION_KEY, session)
    const quizzes = readJson(SAVED_QUIZZES_KEY, (v) => normalizeList(v, normalizeSavedQuiz))
    if (quizzes) writeJson(SAVED_QUIZZES_KEY, quizzes)
    const attempts = readJson(RESULTS_KEY, (v) => normalizeList(v, normalizeAttempt))
    if (attempts) writeJson(RESULTS_KEY, attempts)
  }

  // v2 -> v3: a session (and a saved quiz's progress snapshot) gained
  // `revealed`, the set of questions checked mid-quiz. An older run has none,
  // which `normalizeIdList` supplies, so this is another read-and-write-back
  // under the same keys — no library or history is orphaned. Attempts are
  // untouched: a finished attempt never carried reveals.
  if (storedVersion < 3) {
    const session = readJson(SESSION_KEY, normalizeSession)
    if (session) writeJson(SESSION_KEY, session)
    const quizzes = readJson(SAVED_QUIZZES_KEY, (v) => normalizeList(v, normalizeSavedQuiz))
    if (quizzes) writeJson(SAVED_QUIZZES_KEY, quizzes)
  }

  // v3 -> v4: `QuizSettings` gained `passPercentage`. `normalizeSettings`
  // supplies the default for a record written without one, so this is a third
  // read-and-write-back under the same keys. Attempts are included this time:
  // unlike `revealed`, the pass mark is what a stored result is judged against
  // when it is replayed on the result screen.
  if (storedVersion < 4) {
    const session = readJson(SESSION_KEY, normalizeSession)
    if (session) writeJson(SESSION_KEY, session)
    const quizzes = readJson(SAVED_QUIZZES_KEY, (v) => normalizeList(v, normalizeSavedQuiz))
    if (quizzes) writeJson(SAVED_QUIZZES_KEY, quizzes)
    const attempts = readJson(RESULTS_KEY, (v) => normalizeList(v, normalizeAttempt))
    if (attempts) writeJson(RESULTS_KEY, attempts)
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

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

/*
 * A new key, so — like the AI keys below — `migrate` needs no extra step and
 * `SCHEMA_VERSION` stays where it is. A missing entry reads back as defaults.
 */

export function loadAppearance(): AppearancePrefs {
  migrate()
  return readJson(APPEARANCE_KEY, normalizeAppearance) ?? defaultAppearance()
}

export function saveAppearance(prefs: AppearancePrefs): void {
  migrate()
  writeJson(APPEARANCE_KEY, prefs)
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

/*
 * Its own key rather than a field on the appearance entry, for the same reason
 * appearance is separate from the theme: sound is not a *look*, so the
 * appearance Reset must not silence the app, and clearing one preference must
 * never rewrite the other. Another new key, so `migrate` needs no step.
 */

export function loadSoundPrefs(): SoundPrefs {
  migrate()
  return readJson(SOUND_KEY, normalizeSoundPrefs) ?? defaultSoundPrefs()
}

export function saveSoundPrefs(prefs: SoundPrefs): void {
  migrate()
  writeJson(SOUND_KEY, prefs)
}

// ---------------------------------------------------------------------------
// AI assistant preferences and key
// ---------------------------------------------------------------------------

/*
 * These keys are new, so there is no older shape to repair and `migrate` needs
 * no extra step — `SCHEMA_VERSION` stays where it is. A missing entry simply
 * reads back as the defaults.
 */

export function loadAIConfig(): AIConfig {
  migrate()
  return readJson(AI_PREFS_KEY, normalizeAIConfig) ?? defaultAIConfig()
}

export function saveAIConfig(config: AIConfig): void {
  migrate()
  writeJson(AI_PREFS_KEY, config)
}

/**
 * The API key is stored separately and only when the user ticks "remember on
 * this device". Callers must gate on `AIConfig.rememberKey` — storage does not
 * second-guess them, but nothing else in the app may call `saveAIKey`.
 */
export function loadAIKey(): string | null {
  const raw = readRaw(AI_KEY_KEY)
  return raw !== null && raw !== '' ? raw : null
}

export function saveAIKey(key: string): void {
  writeRaw(AI_KEY_KEY, key)
}

export function clearAIKey(): void {
  removeRaw(AI_KEY_KEY)
}

/** Test helper: forget that migration already ran on this page. */
export function resetMigrationForTests(): void {
  migrated = false
}
