import type { AIConfig } from '../../types/ai'
import { createAnthropicProvider } from './providers/anthropic'
import { createGeminiProvider } from './providers/gemini'
import { aiError, isAIError } from './providers/http'
import { createOpenAIProvider } from './providers/openai'
import type { AIError, AIProvider, AIRequest, AIResponse } from './types'

/**
 * Provider-agnostic facade. Picks the provider, sends the request, and
 * normalizes both responses and errors so nothing above this layer knows
 * whether it is talking to OpenAI, Gemini or Anthropic.
 *
 * Nothing here throws — every path returns an `AIOutcome`.
 */

export interface AICallOptions {
  config: AIConfig
  apiKey: string
  signal?: AbortSignal
}

export type AIOutcome<T> = { ok: true; value: T } | { ok: false; error: AIError }

export function createProvider(config: AIConfig, apiKey: string): AIProvider {
  switch (config.provider) {
    case 'openai':
      return createOpenAIProvider(config.model, apiKey)
    case 'gemini':
      return createGeminiProvider(config.model, apiKey)
    case 'anthropic':
      return createAnthropicProvider(config.model, apiKey)
  }
}

/**
 * Shortest key worth substring-matching. Anything shorter is more likely to be
 * a typo than a credential, and blindly replacing it mangles ordinary words —
 * a one-character key of "k" turns "Check your connection" into "Chec[redacted]".
 * Real keys from all three providers are far longer than this.
 */
const MIN_REDACTABLE_KEY_LENGTH = 12

/**
 * Remove every occurrence of the key from a string. Providers sometimes echo
 * the offending credential back inside an error message, and that message goes
 * straight into React state and onto the screen.
 */
export function redactKey(text: string, apiKey: string): string {
  const key = apiKey.trim()
  if (key.length < MIN_REDACTABLE_KEY_LENGTH) return text
  return text.split(key).join('[redacted]')
}

export function toAIError(cause: unknown): AIError {
  if (isAIError(cause)) return cause
  if (cause instanceof Error && cause.name === 'AbortError') {
    return aiError('aborted', 'Request cancelled.')
  }
  return aiError('unknown', 'Something went wrong talking to the AI provider.')
}

/** Guards that must pass before any network call is made. */
function preflight(options: AICallOptions): AIError | null {
  if (!options.config.enabled) {
    return aiError('disabled', 'The AI assistant is turned off.')
  }
  if (options.apiKey.trim() === '') {
    return aiError('no-key', 'Add your API key in AI settings first.')
  }
  if (options.config.model.trim() === '') {
    return aiError('bad-request', 'Choose a model in AI settings first.')
  }
  return null
}

function fail(error: AIError, apiKey: string): { ok: false; error: AIError } {
  return { ok: false, error: { ...error, message: redactKey(error.message, apiKey) } }
}

export async function sendAIRequest(
  request: AIRequest,
  options: AICallOptions,
): Promise<AIOutcome<AIResponse>> {
  const blocked = preflight(options)
  if (blocked !== null) return fail(blocked, options.apiKey)

  try {
    const provider = createProvider(options.config, options.apiKey)
    const value = await provider.generate({ ...request, signal: options.signal })
    return { ok: true, value }
  } catch (cause) {
    return fail(toAIError(cause), options.apiKey)
  }
}

export async function testAIConnection(options: AICallOptions): Promise<AIOutcome<true>> {
  // Deliberately skips the `enabled` guard: the user tests the connection while
  // setting AI up, which is precisely when it is not yet switched on.
  if (options.apiKey.trim() === '') {
    return fail(aiError('no-key', 'Add your API key first.'), options.apiKey)
  }
  if (options.config.model.trim() === '') {
    return fail(aiError('bad-request', 'Choose a model first.'), options.apiKey)
  }

  try {
    const provider = createProvider(options.config, options.apiKey)
    const ok = await provider.testConnection(options.signal)
    if (!ok) {
      return fail(
        aiError('malformed', 'The provider answered, but not in a way we could read.'),
        options.apiKey,
      )
    }
    return { ok: true, value: true }
  } catch (cause) {
    return fail(toAIError(cause), options.apiKey)
  }
}
