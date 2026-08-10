import type { AIError, AIErrorKind } from '../types'

/**
 * Shared HTTP plumbing for the three providers. Everything here throws an
 * `AIError` rather than a raw `Error`, so `aiService` never has to guess at
 * what went wrong, and nothing here logs — an accidental `console.log` of a
 * request would print the user's API key.
 */

/**
 * Default ceiling on a single provider call. Callers that ask for a lot of
 * output (reformatting a whole paste) pass a longer `timeoutMs` — 60s is sized
 * for a short structured answer, not for a request that has to rewrite
 * thousands of words.
 */
const DEFAULT_TIMEOUT_MS = 60_000

const RETRYABLE: AIErrorKind[] = ['rate-limit', 'server', 'network', 'timeout', 'malformed']

export function aiError(kind: AIErrorKind, message: string, status?: number): AIError {
  return { kind, message, status, retryable: RETRYABLE.includes(kind) }
}

export function isAIError(value: unknown): value is AIError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value &&
    'retryable' in value
  )
}

export function httpErrorKind(status: number): AIErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  if (status >= 400) return 'bad-request'
  return 'unknown'
}

export interface HttpJsonInit {
  url: string
  headers: Record<string, string>
  body: unknown
  signal?: AbortSignal
  /** Overrides `DEFAULT_TIMEOUT_MS` for calls that legitimately take longer. */
  timeoutMs?: number
  /**
   * Turns an error body into a user-facing message. Providers nest their error
   * text differently, so each supplies its own reader.
   */
  describeError?: (payload: unknown, status: number) => string | null
  /** Providers whose CORS setup can fail opaquely map network errors here. */
  networkErrorKind?: AIErrorKind
  networkErrorMessage?: string
}

/** POST JSON, return the parsed body. Throws `AIError` on every failure path. */
export async function postJson(init: HttpJsonInit): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, init.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  // Forward the caller's cancellation onto our own controller so a user abort
  // and a timeout can still be told apart.
  const onCallerAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onCallerAbort)

  try {
    const response = await fetch(init.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...init.headers },
      body: JSON.stringify(init.body),
      signal: controller.signal,
    })

    const text = await response.text()
    let payload: unknown
    try {
      payload = text === '' ? null : JSON.parse(text)
    } catch {
      payload = null
    }

    if (!response.ok) {
      const detail = init.describeError?.(payload, response.status) ?? null
      throw aiError(
        httpErrorKind(response.status),
        detail ?? `The provider rejected the request (HTTP ${response.status}).`,
        response.status,
      )
    }

    if (payload === null) {
      throw aiError('malformed', 'The provider returned an empty response.')
    }
    return payload
  } catch (cause) {
    if (isAIError(cause)) throw cause

    if (cause instanceof Error && cause.name === 'AbortError') {
      if (timedOut) {
        throw aiError(
          'timeout',
          'The provider took too long to respond. A smaller paste, or a faster model, will usually go through.',
        )
      }
      throw aiError('aborted', 'Request cancelled.')
    }

    // fetch rejects with a bare TypeError for DNS failures, offline, and — the
    // common case in a browser — a blocked CORS preflight.
    throw aiError(
      init.networkErrorKind ?? 'network',
      init.networkErrorMessage ??
        'Could not reach the provider. Check your internet connection and try again.',
    )
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', onCallerAbort)
  }
}

/** Read a nested string off an unknown payload without throwing. */
export function readPath(payload: unknown, path: (string | number)[]): unknown {
  let current: unknown = payload
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (typeof key === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[key]
    } else {
      if (typeof current !== 'object' || Array.isArray(current)) return undefined
      current = (current as Record<string, unknown>)[key]
    }
  }
  return current
}
