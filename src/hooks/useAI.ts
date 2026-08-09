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
  // Workflow C — tidy up pasted text
  // -------------------------------------------------------------------------

  const formatText = useCallback(
    async (rawText: string): Promise<AIFormattingResult | null> => {
      return withRequest(async (controller) =>
        run(
          { kind: 'formatting', questionId: null },
          {
            kind: 'formatting',
            system: AI_FORMATTING_SYSTEM,
            user: buildAIFormattingPrompt(rawText),
            schema: AI_FORMATTING_SCHEMA as unknown as Record<string, unknown>,
            schemaName: 'mcq_formatting',
            maxOutputTokens: MAX_TOKENS.formatting,
          },
          validateFormattingResponse,
          controller,
        ),
      )
    },
    [run, withRequest],
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

    // workflow C
    formatText,
  }
}

export { VERIFICATION_BATCH_SIZE }
export { defaultAIConfig }
