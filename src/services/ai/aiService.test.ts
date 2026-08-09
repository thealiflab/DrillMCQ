import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig, AIProviderId } from '../../types/ai'
import { redactKey, sendAIRequest, testAIConnection } from './aiService'
import { toGeminiSchema } from './providers/gemini'
import type { AIRequest } from './types'

const KEY = 'sk-test-SUPERSECRET-000'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer'],
  properties: { answer: { type: 'string' } },
}

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    enabled: true,
    provider: 'openai',
    model: 'gpt-5-mini',
    customModel: false,
    rememberKey: false,
    maxBatchQuestions: 50,
    ...overrides,
  }
}

function makeRequest(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    kind: 'verification',
    system: 'SYSTEM-PROMPT-MARKER',
    user: 'USER-PROMPT-MARKER',
    schema: SCHEMA,
    schemaName: 'answer_schema',
    maxOutputTokens: 1024,
    ...overrides,
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function failure(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

/** Provider-shaped success payloads carrying `{"answer":"yes"}`. */
const PAYLOAD = '{"answer":"yes"}'
const responses: Record<AIProviderId, unknown> = {
  openai: { choices: [{ message: { content: PAYLOAD } }], usage: { prompt_tokens: 5, completion_tokens: 7 } },
  gemini: {
    candidates: [{ content: { parts: [{ text: PAYLOAD }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
  },
  anthropic: {
    content: [{ type: 'text', text: PAYLOAD }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 5, output_tokens: 7 },
  },
}

/** The single fetch call the mock recorded, decoded. */
function lastCall(): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }
}

describe('preflight guards', () => {
  it('refuses when AI is disabled, without touching the network', async () => {
    const result = await sendAIRequest(makeRequest(), {
      config: makeConfig({ enabled: false }),
      apiKey: KEY,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.kind).toBe('disabled')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses when there is no key, without touching the network', async () => {
    const result = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: '   ' })
    expect(!result.ok && result.error.kind).toBe('no-key')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses when no model is chosen', async () => {
    const result = await sendAIRequest(makeRequest(), {
      config: makeConfig({ model: '' }),
      apiKey: KEY,
    })
    expect(!result.ok && result.error.kind).toBe('bad-request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets a connection test run while AI is still switched off', async () => {
    fetchMock.mockResolvedValue(ok(responses.openai))
    const result = await testAIConnection({ config: makeConfig({ enabled: false }), apiKey: KEY })
    expect(result.ok).toBe(true)
  })
})

describe('OpenAI provider', () => {
  beforeEach(() => fetchMock.mockResolvedValue(ok(responses.openai)))

  it('posts to the chat completions endpoint with a bearer token', async () => {
    await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    const { url, headers } = lastCall()
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(headers.Authorization).toBe(`Bearer ${KEY}`)
  })

  it('asks for strict json_schema output', async () => {
    await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    const { body } = lastCall()
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'answer_schema', strict: true, schema: SCHEMA },
    })
  })

  it('carries the system and user prompts', async () => {
    await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(JSON.stringify(lastCall().body)).toContain('SYSTEM-PROMPT-MARKER')
    expect(JSON.stringify(lastCall().body)).toContain('USER-PROMPT-MARKER')
  })

  it('parses the message content and reports usage', async () => {
    const result = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.data).toEqual({ answer: 'yes' })
    expect(result.value.usage).toEqual({ inputTokens: 5, outputTokens: 7 })
  })

  it('fails cleanly on an empty message', async () => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '' } }] }))
    const result = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('malformed')
  })
})

describe('Gemini provider', () => {
  const config = makeConfig({ provider: 'gemini', model: 'gemini-2.5-flash' })
  beforeEach(() => fetchMock.mockResolvedValue(ok(responses.gemini)))

  it('sends the key as a header and never in the URL', async () => {
    await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    const { url, headers } = lastCall()
    expect(headers['x-goog-api-key']).toBe(KEY)
    expect(url).not.toContain('key=')
    expect(url).not.toContain(KEY)
  })

  it('targets the generateContent endpoint for the chosen model', async () => {
    await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(lastCall().url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    )
  })

  it('asks for JSON with a translated response schema', async () => {
    await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    const generationConfig = lastCall().body.generationConfig as Record<string, unknown>
    expect(generationConfig.responseMimeType).toBe('application/json')
    expect(generationConfig.responseSchema).toEqual({
      type: 'OBJECT',
      required: ['answer'],
      properties: { answer: { type: 'STRING' } },
    })
  })

  it('reads the candidate text', async () => {
    const result = await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(result.ok && result.value.data).toEqual({ answer: 'yes' })
  })

  it('reports a truncated answer rather than mangling it', async () => {
    fetchMock.mockResolvedValue(
      ok({ candidates: [{ content: { parts: [{ text: '{"ans' }] }, finishReason: 'MAX_TOKENS' }] }),
    )
    const result = await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('malformed')
    expect(!result.ok && result.error.message).toContain('smaller batch')
  })

  it('surfaces a blocked prompt', async () => {
    fetchMock.mockResolvedValue(ok({ promptFeedback: { blockReason: 'SAFETY' } }))
    const result = await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('bad-request')
  })
})

describe('toGeminiSchema', () => {
  it('uppercases types and drops additionalProperties recursively', () => {
    expect(
      toGeminiSchema({
        type: 'object',
        additionalProperties: false,
        properties: {
          list: { type: 'array', items: { type: 'object', additionalProperties: false } },
        },
      }),
    ).toEqual({
      type: 'OBJECT',
      properties: { list: { type: 'ARRAY', items: { type: 'OBJECT' } } },
    })
  })

  it('preserves enums', () => {
    expect(toGeminiSchema({ type: 'string', enum: ['a', 'b'] })).toEqual({
      type: 'STRING',
      enum: ['a', 'b'],
    })
  })
})

describe('Anthropic provider', () => {
  const config = makeConfig({ provider: 'anthropic', model: 'claude-sonnet-5' })

  // Note: no describe-level default here. A `Response` built for a default and
  // then never consumed (because the test overrides the mock with a rejection)
  // resurfaces at teardown and fails the run, so each test sets its own mock.

  it('sends the browser-access opt-in header', async () => {
    // Without this the API refuses browser requests and the failure arrives as
    // an opaque CORS error with no status to diagnose.
    fetchMock.mockResolvedValue(ok(responses.anthropic))
    await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(lastCall().headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('sends the API version and key headers', async () => {
    fetchMock.mockResolvedValue(ok(responses.anthropic))
    await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    const { url, headers } = lastCall()
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(headers['x-api-key']).toBe(KEY)
    expect(headers['anthropic-version']).toBe('2023-06-01')
  })

  it('uses structured outputs rather than forced tool use', async () => {
    fetchMock.mockResolvedValue(ok(responses.anthropic))
    await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    const { body } = lastCall()
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema: SCHEMA } })
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
  })

  it('concatenates text blocks', async () => {
    fetchMock.mockResolvedValue(
      ok({
        content: [
          { type: 'text', text: '{"ans' },
          { type: 'text', text: 'wer":"yes"}' },
        ],
        stop_reason: 'end_turn',
      }),
    )
    const result = await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(result.ok && result.value.data).toEqual({ answer: 'yes' })
  })

  it('reports a refusal as a bad request rather than a parse failure', async () => {
    fetchMock.mockResolvedValue(ok({ content: [], stop_reason: 'refusal' }))
    const result = await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('bad-request')
  })

  it('maps an opaque network failure to a CORS-flavoured error', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    const result = await sendAIRequest(makeRequest(), { config, apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('cors')
    expect(!result.ok && result.error.message).toContain('api.anthropic.com')
  })
})

describe('no sampling parameters are ever sent', () => {
  // Current Anthropic models reject temperature/top_p/top_k with a 400, so the
  // request shape must not carry them for any provider.
  it.each<[AIProviderId, string]>([
    ['openai', 'gpt-5-mini'],
    ['gemini', 'gemini-2.5-flash'],
    ['anthropic', 'claude-sonnet-5'],
  ])('%s', async (provider, model) => {
    fetchMock.mockResolvedValue(ok(responses[provider]))
    await sendAIRequest(makeRequest(), { config: makeConfig({ provider, model }), apiKey: KEY })
    const serialized = JSON.stringify(lastCall().body)
    expect(serialized).not.toContain('temperature')
    expect(serialized).not.toContain('top_p')
    expect(serialized).not.toContain('top_k')
  })
})

describe('error normalization', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [400, 'bad-request'],
    [500, 'server'],
    [503, 'server'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(failure(status, { error: { message: 'nope' } }))
    const result = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe(kind)
    expect(!result.ok && result.error.status).toBe(status)
  })

  it('maps a bare TypeError to a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('network')
  })

  it('marks transient failures retryable and permanent ones not', async () => {
    fetchMock.mockResolvedValue(failure(429, {}))
    const rateLimited = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(!rateLimited.ok && rateLimited.error.retryable).toBe(true)

    fetchMock.mockResolvedValue(failure(401, {}))
    const unauthorized = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(!unauthorized.ok && unauthorized.error.retryable).toBe(false)
  })

  it('reports a user abort as aborted and not retryable', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }),
    )
    const pending = sendAIRequest(makeRequest(), {
      config: makeConfig(),
      apiKey: KEY,
      signal: controller.signal,
    })
    controller.abort()
    const result = await pending
    expect(!result.ok && result.error.kind).toBe('aborted')
    expect(!result.ok && result.error.retryable).toBe(false)
  })

  it('fails cleanly on a non-JSON success body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }))
    const result = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('malformed')
  })
})

describe('key redaction', () => {
  it('strips the key from a provider error that echoes it back', async () => {
    fetchMock.mockResolvedValue(
      failure(401, { error: { message: `Incorrect API key provided: ${KEY}. Check your key.` } }),
    )
    const result = await sendAIRequest(makeRequest(), { config: makeConfig(), apiKey: KEY })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).not.toContain(KEY)
    expect(result.error.message).not.toContain('SUPERSECRET')
    expect(result.error.message).toContain('[redacted]')
  })

  it('redacts every occurrence', () => {
    expect(redactKey(`${KEY} and again ${KEY}`, KEY)).toBe('[redacted] and again [redacted]')
  })

  it('is a no-op for an empty key', () => {
    expect(redactKey('nothing to hide', '')).toBe('nothing to hide')
  })

  it('leaves ordinary words alone when the "key" is too short to be one', () => {
    // Guards a real bug: a one-character key turned "Check your connection"
    // into "Chec[redacted] your connection".
    expect(redactKey('Check your connection', 'k')).toBe('Check your connection')
    expect(redactKey('an ad blocker may be at fault', 'c')).toBe('an ad blocker may be at fault')
  })

  it('still redacts a realistic-length key', () => {
    expect(redactKey(`key is ${KEY} ok`, KEY)).toBe('key is [redacted] ok')
  })
})

describe('connection test', () => {
  it('succeeds against a real endpoint response', async () => {
    fetchMock.mockResolvedValue(ok(responses.openai))
    expect((await testAIConnection({ config: makeConfig(), apiKey: KEY })).ok).toBe(true)
  })

  it('reports a rejected key', async () => {
    fetchMock.mockResolvedValue(failure(401, { error: { message: 'bad key' } }))
    const result = await testAIConnection({ config: makeConfig(), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('auth')
  })

  it('refuses without a key and makes no request', async () => {
    const result = await testAIConnection({ config: makeConfig(), apiKey: '' })
    expect(!result.ok && result.error.kind).toBe('no-key')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
