import { useCallback, useEffect, useRef, useState } from 'react'
import { sendAIRequest, testAIConnection } from '../services/ai/aiService'
import { defaultModelFor } from '../services/ai/models'
import type { AIError, AIRequest } from '../services/ai/types'
import {
  clearAIKey,
  defaultAIConfig,
  loadAIConfig,
  loadAIKey,
  saveAIConfig,
  saveAIKey,
} from '../services/storage'
import type {
  AIConfig,
  AIExplanation,
  AIFormattingResult,
  AIProviderId,
  AIRequestKind,
  AIVerification,
} from '../types/ai'
import type { QuizQuestion } from '../types/quiz'
import {
  AI_EXPLANATION_SCHEMA,
  AI_EXPLANATION_SYSTEM,
  buildAIExplanationPrompt,
} from '../utils/ai/buildAIExplanationPrompt'
import {
  AI_FORMATTING_SCHEMA,
  AI_FORMATTING_SYSTEM,
  buildAIFormattingPrompt,
} from '../utils/ai/buildAIFormattingPrompt'
import {
  AI_VERIFICATION_SCHEMA,
  AI_VERIFICATION_SYSTEM,
  buildAIVerificationPrompt,
} from '../utils/ai/buildAIVerificationPrompt'
import {
  AI_JSON_REPAIR_SCHEMA,
  AI_JSON_REPAIR_SYSTEM,
  buildAIJsonRepairPrompt,
} from '../utils/ai/buildAIJsonRepairPrompt'
import { chunkRawJson, mergeJsonChunks } from '../utils/ai/chunkRawJson'
import { chunkRawText } from '../utils/ai/chunkRawText'
import {
  validateExplanationResponse,
  validateFormattingResponse,
  validateVerificationResponse,
} from '../utils/ai/validateAIResponse'

/**
 * Owns everything about the optional AI assistant: configuration, the API key,
 * the in-flight request, and the results of each workflow.
 *
 * It lives here rather than in `App` so the app's own state machine doesn't
 * grow. Verification verdicts in particular are deliberately kept here and
 * never written into `QuizSession` — they are pre-quiz, per-page opinions, not
 * part of the user's data.
 */

/** Questions per verification request. Small enough to stay well inside a response budget. */
const VERIFICATION_BATCH_SIZE = 5

/** Output budgets. On Anthropic this covers thinking as well as the answer. */
const MAX_TOKENS = {
  explanation: 4000,
  verification: 8000,
  formatting: 16000,
} as const

/**
 * Per-call HTTP ceilings. Formatting gets the longest one because it rewrites
 * every word it is given, so its response is the slowest to arrive even after
 * chunking.
 */
const TIMEOUT_MS = {
  explanation: 60_000,
  verification: 120_000,
  formatting: 180_000,
} as const

/**
 * Characters of raw text per formatting request.
 *
 * Sized well under `MAX_TOKENS.formatting`: the model has to reproduce its
 * input, so a chunk of this size leaves plenty of room for the reformatted copy
 * plus notes. Sending a whole question bank in one call is what used to time
 * out.
 */
const FORMATTING_CHUNK_CHARS = 8_000

/**
 * Characters of raw JSON per repair request. Smaller than the plain-text
 * budget: JSON is punctuation-heavy, so the same character count costs more
 * tokens both in the prompt and in the rewritten copy coming back.
 */
const JSON_REPAIR_CHUNK_CHARS = 6_000

/** Cap on notes kept across a multi-chunk formatting run. */
const MAX_FORMATTING_NOTES = 20

export interface UseAIRequestState {
  kind: AIRequestKind
  /** The question a single-question ask is about; null for batch work. */
  questionId: number | null
  /** Progress through a batched run, when there is one. */
  done?: number
  total?: number
}

export type AIConnectionStatus = 'idle' | 'testing' | 'ok' | 'failed'

export type UseAI = ReturnType<typeof useAI>

export function useAI() {
  const [config, setConfig] = useState<AIConfig>(() => {
    const stored = loadAIConfig()
    // Storage stays ignorant of the model catalog, so fill the default here.
    return stored.model === ''
      ? { ...stored, model: defaultModelFor(stored.provider) }
      : stored
  })

  // The key lives in memory unless the user opted into persisting it.
  const [apiKey, setApiKeyState] = useState<string>(() => loadAIKey() ?? '')
  const [keyPersisted, setKeyPersisted] = useState<boolean>(() => loadAIKey() !== null)

  const [active, setActive] = useState<UseAIRequestState | null>(null)
  const [error, setError] = useState<AIError | null>(null)
  /**
   * Which question an "Ask AI" error belongs to. Tracked separately because
   * `active` is cleared as soon as the request settles, so it can't be used to
   * place the message next to the question that asked for it.
   *
   * Only explanation requests set this. A verification batch of one question
   * would otherwise pin its error to that question and leave it showing on the
   * results screen long after the import it came from.
   */
  const [errorQuestionId, setErrorQuestionId] = useState<number | null>(null)
  const [requestCount, setRequestCount] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<AIConnectionStatus>('idle')

  const [explanations, setExplanations] = useState<Record<number, AIExplanation>>({})
  const [verifications, setVerifications] = useState<Record<number, AIVerification>>({})

  // Refs mirror state that async work needs to read without going stale.
  const configRef = useRef(config)
  const keyRef = useRef(apiKey)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  configRef.current = config
  keyRef.current = apiKey

  const busy = active !== null || connectionStatus === 'testing'
  const ready = config.enabled && apiKey.trim() !== ''

  // Abort anything still in flight when the app unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  const persist = useCallback((next: AIConfig) => {
    setConfig(next)
    configRef.current = next
    saveAIConfig(next)
    setConnectionStatus('idle')
  }, [])

  const setProvider = useCallback(
    (provider: AIProviderId) => {
      // A model id is provider-specific, so switching providers resets it.
      persist({
        ...configRef.current,
        provider,
        model: defaultModelFor(provider),
        customModel: false,
      })
    },
    [persist],
  )

  const setModel = useCallback(
    (model: string, custom: boolean) => {
      persist({ ...configRef.current, model, customModel: custom })
    },
    [persist],
  )

  const setEnabled = useCallback(
    (enabled: boolean) => {
      persist({ ...configRef.current, enabled })
    },
    [persist],
  )

  const setMaxBatchQuestions = useCallback(
    (max: number) => {
      persist({ ...configRef.current, maxBatchQuestions: max })
    },
    [persist],
  )

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key)
    keyRef.current = key
    setConnectionStatus('idle')
    if (configRef.current.rememberKey) {
      if (key.trim() === '') {
        clearAIKey()
        setKeyPersisted(false)
      } else {
        saveAIKey(key)
        setKeyPersisted(true)
      }
    }
  }, [])

  const setRememberKey = useCallback(
    (remember: boolean) => {
      persist({ ...configRef.current, rememberKey: remember })
      if (remember && keyRef.current.trim() !== '') {
        saveAIKey(keyRef.current)
        setKeyPersisted(true)
      } else {
        // Unticking removes the stored copy immediately, not on next save.
        clearAIKey()
        setKeyPersisted(false)
      }
    },
    [persist],
  )

  const forgetKey = useCallback(() => {
    setApiKeyState('')
    keyRef.current = ''
    clearAIKey()
    setKeyPersisted(false)
    setConnectionStatus('idle')
    setError(null)
  }, [])

  // -------------------------------------------------------------------------
  // Request lifecycle
  // -------------------------------------------------------------------------

  const clearError = useCallback(() => {
    setError(null)
    setErrorQuestionId(null)
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /**
   * Run one provider call. Returns the validated value or null, having already
   * put any failure into `error`. Refuses to start while another call is in
   * flight so a double click can't fan out into two billable requests.
   */
  const run = useCallback(
    async <T,>(
      state: UseAIRequestState,
      request: Omit<AIRequest, 'signal'>,
      validate: (data: unknown) => { ok: true; value: T } | { ok: false; error: string },
      controller: AbortController,
    ): Promise<T | null> => {
      setActive(state)
      const outcome = await sendAIRequest(request, {
        config: configRef.current,
        apiKey: keyRef.current,
        signal: controller.signal,
      })

      if (!outcome.ok) {
        setError(outcome.error)
        setErrorQuestionId(state.kind === 'explanation' ? state.questionId : null)
        return null
      }

      setRequestCount((count) => count + 1)

      const validated = validate(outcome.value.data)
      if (!validated.ok) {
        setError({ kind: 'malformed', message: validated.error, retryable: true })
        setErrorQuestionId(state.kind === 'explanation' ? state.questionId : null)
        return null
      }
      return validated.value
    },
    [],
  )

  /** Wrap a workflow in the single-flight guard and abort plumbing. */
  const withRequest = useCallback(
    async <T,>(work: (controller: AbortController) => Promise<T | null>): Promise<T | null> => {
      if (busyRef.current) return null
      busyRef.current = true
      setError(null)
      setErrorQuestionId(null)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        return await work(controller)
      } finally {
        busyRef.current = false
        abortRef.current = null
        setActive(null)
      }
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Connection test
  // -------------------------------------------------------------------------

  const testConnection = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setError(null)
    setConnectionStatus('testing')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const outcome = await testAIConnection({
        config: configRef.current,
        apiKey: keyRef.current,
        signal: controller.signal,
      })
      if (outcome.ok) {
        setConnectionStatus('ok')
        setRequestCount((count) => count + 1)
      } else {
        setConnectionStatus('failed')
        setError(outcome.error)
      }
    } finally {
      busyRef.current = false
      abortRef.current = null
    }
  }, [])

  // -------------------------------------------------------------------------
  // Workflow A — explain one answered question
  // -------------------------------------------------------------------------

  const askAboutQuestion = useCallback(
    async (question: QuizQuestion, selected?: string[]) => {
      await withRequest(async (controller) => {
        const explanation = await run(
          { kind: 'explanation', questionId: question.id },
          {
            kind: 'explanation',
            system: AI_EXPLANATION_SYSTEM,
            user: buildAIExplanationPrompt({ question, selected }),
            schema: AI_EXPLANATION_SCHEMA as unknown as Record<string, unknown>,
            schemaName: 'mcq_explanation',
            maxOutputTokens: MAX_TOKENS.explanation,
            timeoutMs: TIMEOUT_MS.explanation,
          },
          (data) => validateExplanationResponse(data, question),
          controller,
        )
        if (explanation !== null) {
          setExplanations((current) => ({ ...current, [question.id]: explanation }))
        }
        return explanation
      })
    },
    [run, withRequest],
  )

  const clearExplanation = useCallback((questionId: number) => {
    setExplanations((current) => {
      const next = { ...current }
      delete next[questionId]
      return next
    })
  }, [])

  // -------------------------------------------------------------------------
  // Workflow B — verify imported questions
  // -------------------------------------------------------------------------

  const verifyQuestions = useCallback(
    async (questions: QuizQuestion[]) => {
      if (questions.length === 0) return
      const capped = questions.slice(0, configRef.current.maxBatchQuestions)

      await withRequest(async (controller) => {
        for (let i = 0; i < capped.length; i += VERIFICATION_BATCH_SIZE) {
          if (controller.signal.aborted) break
          const batch = capped.slice(i, i + VERIFICATION_BATCH_SIZE)

          const result = await run(
            {
              kind: 'verification',
              questionId: batch.length === 1 ? batch[0].id : null,
              done: i,
              total: capped.length,
            },
            {
              kind: 'verification',
              system: AI_VERIFICATION_SYSTEM,
              user: buildAIVerificationPrompt(batch),
              schema: AI_VERIFICATION_SCHEMA as unknown as Record<string, unknown>,
              schemaName: 'mcq_verification',
              maxOutputTokens: MAX_TOKENS.verification,
              timeoutMs: TIMEOUT_MS.verification,
            },
            (data) => validateVerificationResponse(data, batch),
            controller,
          )

          // Stop the run on the first failure rather than burning the user's
          // quota on batches that will probably fail the same way.
          if (result === null) break

          setVerifications((current) => {
            const next = { ...current }
            for (const verification of result.verifications) {
              next[verification.questionId] = verification
            }
            return next
          })
        }
        return null
      })
    },
    [run, withRequest],
  )

  const clearVerifications = useCallback(() => setVerifications({}), [])

  const dismissVerification = useCallback((questionId: number) => {
    setVerifications((current) => {
      const next = { ...current }
      delete next[questionId]
      return next
    })
  }, [])

  // -------------------------------------------------------------------------
  // Workflows C and D — rewrite what the user pasted
  // -------------------------------------------------------------------------

  /**
   * Run a rewrite workflow over pre-split chunks and stitch the pieces back
   * together.
   *
   * Both rewrite workflows send several requests for one button press, because
   * a rewrite reproduces its own input and a whole question bank exceeds both
   * the output budget and the request timeout. They differ only in the prompt
   * and in how the pieces rejoin, so the loop — progress reporting, abort
   * checks, note merging, and the rule that a part-way failure returns the
   * untouched remainder rather than swallowing it — lives here once.
   */
  const runRewrite = useCallback(
    async (
      chunks: string[],
      spec: {
        kind: AIRequestKind
        system: string
        schema: Record<string, unknown>
        schemaName: string
        buildPrompt: (chunk: string) => string
        join: (parts: string[]) => string
        /** What a partial run is called in the note shown to the user. */
        verb: string
      },
    ): Promise<AIFormattingResult | null> => {
      if (chunks.length === 0) return null

      return withRequest(async (controller) => {
        const parts: string[] = []
        const notes: string[] = []
        // Index of the chunk we never got through, or -1 if the run completed.
        let stoppedAt = -1

        for (let i = 0; i < chunks.length; i++) {
          if (controller.signal.aborted) {
            stoppedAt = i
            break
          }

          const result = await run(
            { kind: spec.kind, questionId: null, done: i, total: chunks.length },
            {
              kind: spec.kind,
              system: spec.system,
              user: spec.buildPrompt(chunks[i]),
              schema: spec.schema,
              schemaName: spec.schemaName,
              maxOutputTokens: MAX_TOKENS.formatting,
              timeoutMs: TIMEOUT_MS.formatting,
            },
            validateFormattingResponse,
            controller,
          )

          if (result === null) {
            stoppedAt = i
            break
          }

          parts.push(result.text)
          for (const note of result.notes) {
            if (notes.length < MAX_FORMATTING_NOTES && !notes.includes(note)) notes.push(note)
          }
        }

        if (parts.length === 0) return null

        // A part-way failure must never eat the user's paste: hand back what was
        // rewritten followed by the rest exactly as it came in. The error is
        // already in state, so the panel explains itself.
        if (stoppedAt !== -1) {
          parts.push(...chunks.slice(stoppedAt))
          notes.unshift(
            `Only the first ${stoppedAt} of ${chunks.length} parts were ${spec.verb} — ` +
              'the rest is unchanged from what you pasted.',
          )
        }

        return { text: spec.join(parts), notes }
      })
    },
    [run, withRequest],
  )

  /** Workflow C — tidy up pasted plain text for `parseMcqText`. */
  const formatText = useCallback(
    async (rawText: string): Promise<AIFormattingResult | null> =>
      runRewrite(chunkRawText(rawText, FORMATTING_CHUNK_CHARS), {
        kind: 'formatting',
        system: AI_FORMATTING_SYSTEM,
        schema: AI_FORMATTING_SCHEMA as unknown as Record<string, unknown>,
        schemaName: 'mcq_formatting',
        buildPrompt: buildAIFormattingPrompt,
        join: (parts) => parts.join('\n\n'),
        verb: 'reformatted',
      }),
    [runRewrite],
  )

  /** Workflow D — repair pasted quiz JSON for `parseQuizJson`. */
  const repairJson = useCallback(
    async (rawJson: string): Promise<AIFormattingResult | null> =>
      runRewrite(chunkRawJson(rawJson, JSON_REPAIR_CHUNK_CHARS), {
        kind: 'json-repair',
        system: AI_JSON_REPAIR_SYSTEM,
        schema: AI_JSON_REPAIR_SCHEMA as unknown as Record<string, unknown>,
        schemaName: 'quiz_json_repair',
        buildPrompt: buildAIJsonRepairPrompt,
        // Each chunk comes back as its own array, so they merge as arrays
        // rather than by concatenating text.
        join: mergeJsonChunks,
        verb: 'repaired',
      }),
    [runRewrite],
  )

  return {
    // configuration
    config,
    setProvider,
    setModel,
    setEnabled,
    setMaxBatchQuestions,
    apiKey,
    setApiKey,
    setRememberKey,
    forgetKey,
    keyPersisted,
    /** The single gate every piece of AI UI checks before rendering. */
    ready,

    // request lifecycle
    busy,
    active,
    error,
    errorQuestionId,
    clearError,
    cancel,
    requestCount,

    // connection test
    connectionStatus,
    testConnection,

    // workflow A
    explanations,
    askAboutQuestion,
    clearExplanation,

    // workflow B
    verifications,
    verifyQuestions,
    clearVerifications,
    dismissVerification,

    // workflows C and D
    formatText,
    repairJson,
  }
}

export { VERIFICATION_BATCH_SIZE }
export { defaultAIConfig }
