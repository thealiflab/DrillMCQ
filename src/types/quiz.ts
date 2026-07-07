/** A single multiple-choice question. */
export interface QuizQuestion {
  id: number
  question: string
  options: string[]
  correctAnswer: string
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
}

/** A running (or finished) quiz session — this is what gets persisted. */
export interface QuizSession {
  /** Questions in play order (already filtered/shuffled). */
  questions: QuizQuestion[]
  /** Map of question id -> selected option. */
  answers: Record<number, string>
  currentIndex: number
  status: 'active' | 'finished'
  /** Epoch ms when the quiz started (used to restore the timer). */
  startedAt: number
  /** Total time in minutes. 0 = untimed. */
  timerMinutes: number
}

/** Computed outcome of a finished session. */
export interface QuizResult {
  total: number
  correct: number
  incorrect: number
  unanswered: number
  percentage: number
}
