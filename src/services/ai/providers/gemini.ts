import { extractJson } from '../../../utils/ai/validateAIResponse'
import type { AIProvider, AIRequest, AIResponse } from '../types'
import { aiError, postJson, readPath } from './http'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Gemini's `responseSchema` is an OpenAPI 3 subset, not JSON Schema: types are
 * uppercase and `additionalProperties` is not accepted. Translate here so the
 * canonical schemas in `utils/ai` stay provider-neutral.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema)
  if (typeof schema !== 'object' || schema === null) return schema

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'additionalProperties') continue
    if (key === 'type' && typeof value === 'string') {
      out.type = value.toUpperCase()
      continue
    }
    out[key] = toGeminiSchema(value)
  }
  return out
}

function describeError(payload: unknown, status: number): string | null {
  const message = readPath(payload, ['error', 'message'])
  if (typeof message === 'string' && message !== '') return message
  return status === 400 ? 'Gemini rejected the request — check the API key and model.' : null
}

export function createGeminiProvider(model: string, apiKey: string): AIProvider {
  // The key goes in a header, never in the query string: a URL ends up in
  // devtools' network list, in Referer headers, and in error strings.
  const headers = { 'x-goog-api-key': apiKey }
  const url = `${BASE}/${encodeURIComponent(model)}:generateContent`

  async function call(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<unknown> {
    return postJson({ url, headers, body, signal, timeoutMs, describeError })
  }

  return {
    id: 'gemini',

    async generate(request: AIRequest): Promise<AIResponse> {
      const payload = await call(
        {
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            responseMimeType: 'application/json',
            responseSchema: toGeminiSchema(request.schema),
          },
        },
        request.signal,
        request.timeoutMs,
      )

      const blockReason = readPath(payload, ['promptFeedback', 'blockReason'])
      if (typeof blockReason === 'string') {
        throw aiError('bad-request', `Gemini declined to answer (${blockReason}).`)
      }

      const finishReason = readPath(payload, ['candidates', 0, 'finishReason'])
      if (finishReason === 'MAX_TOKENS') {
        throw aiError('malformed', 'Gemini ran out of room before finishing. Try a smaller batch.')
      }
      if (finishReason === 'SAFETY') {
        throw aiError('bad-request', 'Gemini declined to answer this question on safety grounds.')
      }

      const content = readPath(payload, ['candidates', 0, 'content', 'parts', 0, 'text'])
      if (typeof content !== 'string' || content.trim() === '') {
        throw aiError('malformed', 'Gemini returned an empty response.')
      }

      const parsed = extractJson(content)
      if (!parsed.ok) throw aiError('malformed', parsed.error)

      const usage = readPath(payload, ['usageMetadata'])
      return {
        data: parsed.value,
        raw: content,
        model,
        provider: 'gemini',
        usage: {
          inputTokens: numberOrUndefined(readPath(usage, ['promptTokenCount'])),
          outputTokens: numberOrUndefined(readPath(usage, ['candidatesTokenCount'])),
        },
      }
    },

    async testConnection(signal?: AbortSignal): Promise<boolean> {
      const payload = await call(
        {
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
          generationConfig: { maxOutputTokens: 16 },
        },
        signal,
      )
      return readPath(payload, ['candidates', 0]) !== undefined
    },
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
