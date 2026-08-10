/**
 * Domain shapes for the optional AI assistant.
 *
 * This module is a leaf, exactly like `types/quiz.ts`: it imports nothing and
 * is imported by `utils/ai`, `services/ai`, `services/storage`, the hook and
 * the components. Transport-level shapes (requests, providers, errors) live in
 * `services/ai/types.ts` instead, so the pure `utils/ai` layer never has to
 * reach up into a service boundary.
 */

export type AIProviderId = 'openai' | 'gemini' | 'anthropic'

/** What the assistant is being asked to do. Picks the prompt and validator. */
export type AIRequestKind =
  | 'explanation'
  | 'verification'
  | 'formatting'
  | 'json-repair'
  | 'connection'

export type AIConfidence = 'high' | 'medium' | 'low'

/**
 * Persisted preferences. Deliberately does **not** hold the API key — that is
 * kept in memory by `useAI` and only written to its own separate storage key
 * when the user explicitly opts in.
 */
export interface AIConfig {
  enabled: boolean
  provider: AIProviderId
  /** The model id actually sent on the wire — a catalog id or a custom one. */
  model: string
  /** True when the user typed a model id instead of picking from the catalog. */
  customModel: boolean
  /** Opt-in: persist the API key to localStorage on this device. */
  rememberKey: boolean
  /** Ceiling on questions sent in one "Verify all" run. */
  maxBatchQuestions: number
}

/** Workflow A: the AI's own reading of one already-answered question. */
export interface AIExplanation {
  questionId: number
  /** Resolved to exact option strings, so it can be compared with the source. */
  aiCorrectOptions: string[]
  /** True when `aiCorrectOptions` is exactly the question's `correctAnswers`. */
  agreesWithSource: boolean
  explanation: string
  /** Per-option notes. May be empty. */
  optionNotes: { option: string; note: string }[]
  confidence: AIConfidence
}

/**
 * `agrees`/`disagrees` are decided by the app comparing answer sets, never by
 * taking the model's word for it. `invalid` means the AI flagged the question
 * itself as broken (no correct option, duplicate options, unanswerable).
 */
export type AIVerificationStatus = 'agrees' | 'disagrees' | 'uncertain' | 'invalid'

/** Workflow B: a verdict on one imported question. Never applied automatically. */
export interface AIVerification {
  questionId: number
  status: AIVerificationStatus
  confidence: AIConfidence
  /** The AI's proposed set, resolved to exact option strings. */
  suggestedAnswers: string[]
  /** The imported answer set, snapshotted so an edit can be detected later. */
  sourceAnswers: string[]
  reasoning: string
  /** Optional replacement explanation the user can accept alongside answers. */
  suggestedExplanation?: string
  checkedAt: number
}

export interface AIVerificationBatch {
  verifications: AIVerification[]
}

/**
 * Workflow C: AI-tidied *text*, fed straight back into the textarea the user
 * pasted into — plain text on the text tab, JSON source on the JSON tab.
 *
 * Never questions. The AI hands back something to re-paste, so `parseMcqText`
 * stays the only producer of question objects on the text path and
 * `parseQuizJson` stays the only gate on the JSON path. Neither validator can
 * be bypassed, and the user sees exactly what will be parsed.
 */
export interface AIFormattingResult {
  text: string
  /** What the model says it changed or dropped. Shown, never trusted. */
  notes: string[]
}
