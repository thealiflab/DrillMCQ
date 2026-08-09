import { extractJson } from '../../../utils/ai/validateAIResponse'
import type { AIProvider, AIRequest, AIResponse } from '../types'
import { aiError, postJson, readPath } from './http'

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

function describeError(payload: unknown, status: number): string | null {
  const message = readPath(payload, ['error', 'message'])
  if (typeof message === 'string' && message !== '') return message
  return status === 401 ? 'That OpenAI API key was rejected.' : null
}

export function createOpenAIProvider(model: string, apiKey: string): AIProvider {
  const headers = { Authorization: `Bearer ${apiKey}` }

  async function call(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    return postJson({ url: ENDPOINT, headers, body, signal, describeError })
  }

  return {
    id: 'openai',

    async generate(request: AIRequest): Promise<AIResponse> {
      const payload = await call(
        {
          model,
          // No `temperature`: the schema constrains the output, and omitting it
          // keeps one request shape across all three providers.
          max_completion_tokens: request.maxOutputTokens,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: request.schemaName, strict: true, schema: request.schema },
          },
        },
        request.signal,
      )

      const content = readPath(payload, ['choices', 0, 'message', 'content'])
      if (typeof content !== 'string' || content.trim() === '') {
        throw aiError('malformed', 'OpenAI returned an empty message.')
      }

      const parsed = extractJson(content)
      if (!parsed.ok) throw aiError('malformed', parsed.error)

      const usage = readPath(payload, ['usage'])
      return {
        data: parsed.value,
        raw: content,
        model,
        provider: 'openai',
        usage: {
          inputTokens: numberOrUndefined(readPath(usage, ['prompt_tokens'])),
          outputTokens: numberOrUndefined(readPath(usage, ['completion_tokens'])),
        },
      }
    },

    async testConnection(signal?: AbortSignal): Promise<boolean> {
      // A real request against the real endpoint, so this exercises auth, the
      // model id, and CORS rather than just pinging a listing endpoint.
      const payload = await call(
        {
          model,
          max_completion_tokens: 16,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        },
        signal,
      )
      return typeof readPath(payload, ['choices', 0, 'message', 'content']) === 'string'
    },
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
