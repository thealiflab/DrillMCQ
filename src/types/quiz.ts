/** A multiple-choice question. Two or more correct answers = multi-select. */
export interface QuizQuestion {
  id: number
  question: string
  options: string[]
  /**
   * Every option that counts as correct, always at least one. A length above
   * one is what puts the question into multi-select mode — there is no
   * separate "type" flag to keep in sync.
   */
  correctAnswers: string[]
  explanation?: string
  category?: string
  difficulty?: string
}

/** User-configurable options chosen on the setup screen. */
export interface QuizSettings {
  shuffleQuestions: boolean
  shuffleOptions: boolean
  /** Total quiz time in minutes. 0 disables the timer. */
  timerMinutes: number
  /** Categories to include. Empty array means all categories. */
  categories: string[]
  /**
   * Score (0–100) the run must reach to count as a pass. Stored on the run
   * rather than globally so a result — live or replayed from history — is
   * always judged against the threshold it was taken under.
   */
  passPercentage: number
}

/** A running (or finished) quiz session — this is what gets persisted. */
export interface QuizSession {
  /** Questions in play order (already filtered/shuffled). */
  questions: QuizQuestion[]
  /**
   * Map of question id -> selected options. A single-answer question stores a
   * one-element array. A key being present means the question is answered.
   */
  answers: Record<number, string[]>
  /**
   * Options ticked on a multi-select question but not yet submitted with
   * "Check answer". Kept apart from `answers` so "answered" stays a simple key
   * check, and so the lock state (answered = locked) needs no extra field.
   */
  drafts: Record<number, string[]>
  /**
   * Ids of questions the user revealed mid-quiz with "Check answer". Revealing
   * shows the correct answer, so it also freezes the question — the selection
   * recorded in `answers` is final and still counts for scoring exactly as an
   * unchecked one does.
   */
  revealed: number[]
  currentIndex: number
  status: 'active' | 'finished'
  /** Epoch ms when the quiz started (used to restore the timer). */
  startedAt: number
  /** Total time in minutes. 0 = untimed. */
  timerMinutes: number
  /**
   * Identifies this run so a finished session is only ever recorded once in
   * the history, no matter how many times the finish effect re-runs.
   */
  attemptId: string
  /** Settings this run was configured with (kept so an attempt can record them). */
  settings: QuizSettings
  /** Set when the run came from a saved quiz in the library. */
  quizId?: string
  /** Denormalised saved-quiz name, so results read well even after a rename. */
  quizName?: string
  /** Epoch ms when the quiz was submitted. Only set once finished. */
  finishedAt?: number
}

/**
 * Snapshot of an unfinished run stored on the saved quiz, so the library can
 * show "In progress" and resume it. Mirrors the active session — the session
 * stays the live copy, this is just what resume rehydrates from.
 */
export interface SavedQuizProgress {
  attemptId: string
  questions: QuizQuestion[]
  answers: Record<number, string[]>
  drafts: Record<number, string[]>
  revealed: number[]
  currentIndex: number
  startedAt: number
  timerMinutes: number
  settings: QuizSettings
  /** Epoch ms of the last change, for "last active" display. */
  updatedAt: number
}

/** A quiz stored in the user's local library. */
export interface SavedQuiz {
  id: string
  name: string
  questions: QuizQuestion[]
  createdAt: number
  updatedAt: number
  /** Reference to the most recently completed attempt, if any. */
  lastAttemptId?: string
  /** Present only while an attempt is unfinished. */
  progress?: SavedQuizProgress
  /**
   * Hash of the question content, used to spot a re-import of a quiz that is
   * already in the library so it can be updated instead of duplicated.
   */
  fingerprint: string
}

/** A completed attempt, kept forever in the local history. */
export interface QuizAttempt {
  id: string
  quizId?: string
  quizName: string
  /** Epoch ms when the attempt started / was submitted. */
  startedAt: number
  completedAt: number
  /** Seconds spent on the attempt. */
  timeTakenSeconds: number
  correct: number
  incorrect: number
  unanswered: number
  total: number
  percentage: number
  /** Settings the attempt was run with. */
  settings: QuizSettings
  /** Questions in the order they were played, so review is reproducible. */
  questions: QuizQuestion[]
  /** Map of question id -> selected options. Unsubmitted drafts are dropped. */
  answers: Record<number, string[]>
}

/** Aggregate stats across a quiz's attempts. */
export interface HistoryStats {
  attempts: number
  /** Percentage of the newest attempt, or null when there are none. */
  latest: number | null
  best: number | null
  /** Mean percentage, rounded. */
  average: number | null
}

/** How a saved quiz is currently doing, derived from its progress + history. */
export type AttemptStatus = 'not-started' | 'in-progress' | 'completed'

/** Computed outcome of a finished session. */
export interface QuizResult {
  total: number
  correct: number
  incorrect: number
  unanswered: number
  percentage: number
  /** The threshold this result was judged against, copied from the settings. */
  passPercentage: number
  /** `percentage >= passPercentage`. Derived here so nothing else re-decides it. */
  passed: boolean
}
