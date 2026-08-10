import { extractJson } from '../../../utils/ai/validateAIResponse'
import type { AIProvider, AIRequest, AIResponse } from '../types'
import { aiError, postJson, readPath } from './http'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

/**
 * Without this header the API refuses requests that originate in a browser,
 * and the refusal arrives as an opaque CORS failure with no status code — so
 * it is sent unconditionally, and network errors are reported as `cors` to
 * point the user at the likely cause.
 */
const BROWSER_ACCESS_HEADER = 'anthropic-dangerous-direct-browser-access'

function describeError(payload: unknown, status: number): string | null {
  const message = readPath(payload, ['error', 'message'])
  if (typeof message === 'string' && message !== '') return message
  return status === 401 ? 'That Anthropic API key was rejected.' : null
}

export function createAnthropicProvider(model: string, apiKey: string): AIProvider {
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    [BROWSER_ACCESS_HEADER]: 'true',
  }

  async function call(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<unknown> {
    return postJson({
      url: ENDPOINT,
      headers,
      body,
      signal,
      timeoutMs,
      describeError,
      networkErrorKind: 'cors',
      networkErrorMessage:
        'Could not reach Anthropic from the browser. Check your internet connection, and ' +
        'whether an ad blocker or privacy extension is blocking api.anthropic.com.',
    })
  }

  /** Concatenate the text blocks of a Messages response. */
  function readText(payload: unknown): string {
    const content = readPath(payload, ['content'])
    if (!Array.isArray(content)) return ''
    return content
      .filter(
        (block): block is { type: string; text: string } =>
          typeof block === 'object' &&
          block !== null &&
          (block as { type?: unknown }).type === 'text' &&
          typeof (block as { text?: unknown }).text === 'string',
      )
      .map((block) => block.text)
      .join('')
  }

  return {
    id: 'anthropic',

    async generate(request: AIRequest): Promise<AIResponse> {
      const payload = await call(
        {
          model,
          // `max_tokens` covers thinking as well as the visible answer on
          // current models, so callers pass a generous budget rather than one
          // sized to the JSON alone.
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          // Structured outputs rather than forced tool use: it needs no
          // thinking configuration, and disabling thinking on current models
          // has a failure mode where tool calls arrive as plain text and are
          // silently never executed.
          output_config: { format: { type: 'json_schema', schema: request.schema } },
        },
        request.signal,
        request.timeoutMs,
      )

      const stopReason = readPath(payload, ['stop_reason'])
      if (stopReason === 'refusal') {
        throw aiError('bad-request', 'Claude declined to answer this question.')
      }

      const content = readText(payload)
      if (content.trim() === '') {
        if (stopReason === 'max_tokens') {
          throw aiError('malformed', 'Claude ran out of room before answering. Try a smaller batch.')
        }
        throw aiError('malformed', 'Claude returned an empty response.')
      }

      const parsed = extractJson(content)
      if (!parsed.ok) throw aiError('malformed', parsed.error)

      const usage = readPath(payload, ['usage'])
      return {
        data: parsed.value,
        raw: content,
        model,
        provider: 'anthropic',
        usage: {
          inputTokens: numberOrUndefined(readPath(usage, ['input_tokens'])),
          outputTokens: numberOrUndefined(readPath(usage, ['output_tokens'])),
        },
      }
    },

    async testConnection(signal?: AbortSignal): Promise<boolean> {
      const payload = await call(
        {
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        },
        signal,
      )
      return Array.isArray(readPath(payload, ['content']))
    },
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
