import type { AIProviderId, AIRequestKind } from '../../types/ai'

/**
 * Transport shapes for the AI boundary.
 *
 * Kept separate from `types/ai.ts` so that `utils/ai` — which is pure and must
 * not know a network exists — has a leaf to import from without reaching into
 * a service module. Nothing outside `services/ai/**` and `hooks/useAI` should
 * import this file.
 */

export type AIErrorKind =
  | 'disabled'
  | 'no-key'
  | 'auth'
  | 'rate-limit'
  | 'quota'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'cors'
  | 'timeout'
  | 'aborted'
  | 'malformed'
  | 'unknown'

/**
 * A normalized failure, safe to render. Messages are passed through
 * `redactKey` before they reach state, and provider modules never log.
 */
export interface AIError {
  kind: AIErrorKind
  message: string
  status?: number
  retryable: boolean
}

export interface AIRequest {
  kind: AIRequestKind
  /** Provider-neutral system instruction. */
  system: string
  /** The prompt body from `utils/ai/build*Prompt`. */
  user: string
  /** JSON Schema the provider is asked to conform to. */
  schema: Record<string, unknown>
  /** Schema name — OpenAI needs one; the others ignore it. */
  schemaName: string
  maxOutputTokens: number
  signal?: AbortSignal
}

/*
 * Note the absence of a `temperature` field. Current Anthropic models reject
 * sampling parameters with a 400, and none of these three request kinds wants
 * creative variance — the schema plus the prompt does the constraining.
 */

export interface AIResponse {
  /** Already `JSON.parse`d, but NOT yet validated — that is `utils/ai`'s job. */
  data: unknown
  /** Raw text as returned, kept for a "show raw response" debug affordance. */
  raw: string
  model: string
  provider: AIProviderId
  usage?: { inputTokens?: number; outputTokens?: number }
}

export interface AIProvider {
  readonly id: AIProviderId
  generate(request: AIRequest): Promise<AIResponse>
  testConnection(signal?: AbortSignal): Promise<boolean>
}
