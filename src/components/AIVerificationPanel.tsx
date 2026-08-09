import { useMemo, useState } from 'react'
import type { UseAI } from '../hooks/useAI'
import type { AIVerification, AIVerificationStatus } from '../types/ai'
import type { QuizQuestion } from '../types/quiz'
import {
  applyManualAnswers,
  applyVerification,
  isVerificationStale,
  questionsWithIssues,
  summarizeVerifications,
} from '../utils/ai/applyVerification'
import { toggleOption } from '../utils/quiz'
import { AI_DISCLAIMER } from './aiDisclaimer'
import { ConfirmDialog } from './ConfirmDialog'

interface AIVerificationPanelProps {
  questions: QuizQuestion[]
  ai: UseAI
  /** Applied on accept or edit — App swaps this in as the pending questions. */
  onApply: (next: QuizQuestion[]) => void
}

/** Verifying more than this in one go gets a confirmation first. */
const CONFIRM_THRESHOLD = 10

const STATUS_STYLE: Record<AIVerificationStatus, { label: string; className: string }> = {
  agrees: {
    label: '✓ Looks right',
    className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  },
  disagrees: {
    label: '⚠ Possible wrong answer',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  uncertain: {
    label: '? AI is unsure',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  invalid: {
    label: '✗ Question looks broken',
    className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
}

/**
 * Optional AI check of a freshly imported question bank, shown at the setup
 * stage. Verification is always user-triggered — never automatic — because
 * every request costs the user money against their own API key.
 *
 * Nothing here writes to the quiz on its own: a verdict becomes a change only
 * when the user picks "Use AI answer" or edits the answers by hand.
 */
export function AIVerificationPanel({ questions, ai, onApply }: AIVerificationPanelProps) {
  const [confirmAll, setConfirmAll] = useState<QuizQuestion[] | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<string[]>([])

  const issueQuestions = useMemo(() => questionsWithIssues(questions), [questions])
  const summary = useMemo(() => summarizeVerifications(ai.verifications), [ai.verifications])

  if (!ai.ready) return null

  const verified = Object.keys(ai.verifications).length
  const running = ai.active?.kind === 'verification'

  const start = (batch: QuizQuestion[]) => {
    if (batch.length > CONFIRM_THRESHOLD) setConfirmAll(batch)
    else void ai.verifyQuestions(batch)
  }

  const beginEdit = (question: QuizQuestion) => {
    setEditing(question.id)
    setDraft(question.correctAnswers)
  }

  const commitEdit = (question: QuizQuestion) => {
    if (draft.length > 0) onApply(applyManualAnswers(questions, question.id, draft))
    setEditing(null)
  }

  return (
    <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">🤖 Check answers with AI</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Optional. The AI works out each answer itself and flags where it disagrees with
            your source. Nothing changes unless you accept it.
          </p>
        </div>
        {verified > 0 && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {verified} of {questions.length} checked
          </span>
        )}
      </div>

      {/* Triggers */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => start(questions)}
          disabled={ai.busy}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verify all ({questions.length})
        </button>
        <button
          type="button"
          onClick={() => start(issueQuestions)}
          disabled={ai.busy || issueQuestions.length === 0}
          title="Multi-answer questions and any without an explanation — the ones the text parser is most likely to have got wrong."
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Verify likely problems ({issueQuestions.length})
        </button>
        {running && (
          <>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {ai.active?.total !== undefined
                ? `Checked ${Math.min(ai.active.done ?? 0, ai.active.total)} of ${ai.active.total}…`
                : 'Checking…'}
            </span>
            <button
              type="button"
              onClick={ai.cancel}
              className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Stop
            </button>
          </>
        )}
        {verified > 0 && !running && (
          <button
            type="button"
            onClick={ai.clearVerifications}
            className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Clear results
          </button>
        )}
      </div>

      {ai.error !== null && (
        <div
          role="alert"
          className="animate-fade-slide-in mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
        >
          {ai.error.message}
          {ai.error.retryable && ' You can try again.'}
        </div>
      )}

      {verified > 0 && (
        <p className="mt-4 flex flex-wrap gap-2 text-xs">
          {(Object.keys(STATUS_STYLE) as AIVerificationStatus[])
            .filter((status) => summary[status] > 0)
            .map((status) => (
              <span
                key={status}
                className={`rounded-full px-3 py-1 font-medium ${STATUS_STYLE[status].className}`}
              >
                {summary[status]} {STATUS_STYLE[status].label}
              </span>
            ))}
        </p>
      )}

      {/* Per-question verdicts. Questions that agree are folded away. */}
      <div className="mt-4 space-y-3">
        {questions.map((question) => {
          const verification = ai.verifications[question.id] as AIVerification | undefined
          if (verification === undefined) return null
          const stale = isVerificationStale(question, verification)
          if (verification.status === 'agrees' && !stale) return null

          const style = STATUS_STYLE[verification.status]
          return (
            <div
              key={question.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/50"
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium leading-snug">{question.question}</p>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    stale ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : style.className
                  }`}
                >
                  {stale ? '✓ Resolved' : style.label}
                </span>
              </div>

              {!stale && (
                <dl className="mb-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Source answer</dt>
                    <dd>{verification.sourceAnswers.join(', ') || '—'}</dd>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                    <dt className="font-medium text-slate-500 dark:text-slate-400">AI answer</dt>
                    <dd>{verification.suggestedAnswers.join(', ')}</dd>
                  </div>
                </dl>
              )}

              <p className="text-slate-600 dark:text-slate-400">{verification.reasoning}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Confidence: {verification.confidence}
              </p>

              {editing === question.id ? (
                <div className="mt-3 space-y-2">
                  {question.options.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.includes(option)}
                        onChange={() => setDraft((current) => toggleOption(current, option))}
                        className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => commitEdit(question)}
                      disabled={draft.length === 0}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save answers
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!stale && verification.status !== 'invalid' && (
                    <button
                      type="button"
                      onClick={() => onApply(applyVerification(questions, verification))}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                      Use AI answer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => ai.dismissVerification(question.id)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    Keep source answer
                  </button>
                  <button
                    type="button"
                    onClick={() => beginEdit(question)}
                    className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Edit answers
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {verified > 0 && (
        <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {AI_DISCLAIMER}
        </p>
      )}

      {confirmAll !== null && (
        <ConfirmDialog
          title="Check these with AI?"
          message={
            <>
              <p>
                This will send {confirmAll.length} questions to {ai.config.provider} in{' '}
                {Math.ceil(confirmAll.length / 5)} request(s), billed to your own API key.
              </p>
              <p className="mt-2">You can stop it part-way through.</p>
            </>
          }
          confirmLabel="Check them"
          onConfirm={() => {
            const batch = confirmAll
            setConfirmAll(null)
            void ai.verifyQuestions(batch)
          }}
          onCancel={() => setConfirmAll(null)}
        />
      )}
    </div>
  )
}
