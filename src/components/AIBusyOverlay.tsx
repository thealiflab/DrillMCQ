import { useId } from 'react'
import type { UseAIRequestState } from '../hooks/useAI'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface AIBusyOverlayProps {
  active: UseAIRequestState
  onCancel: () => void
}

/**
 * Covers the screen while an importer-stage AI request is in flight.
 *
 * The point is protection, not decoration: the pasted text and the pending
 * questions live in component state, so switching the importer tab or using the
 * nav bar mid-request unmounts them and throws away both the paste and the
 * result about to come back. A non-dismissible `Modal` (no `onClose`) blocks
 * clicks with its backdrop and keeps focus trapped on the one way out —
 * Cancel, which aborts the request through `useAI`.
 *
 * Per-question "Ask AI" explanations deliberately don't render this: nothing is
 * lost there, and the results screen stays usable while one is loading.
 */
export function AIBusyOverlay({ active, onCancel }: AIBusyOverlayProps) {
  const titleId = useId()
  const descriptionId = useId()

  const copy = COPY[active.kind]
  const total = active.total
  const done = active.done ?? 0
  const progress =
    total !== undefined && total > 1
      ? active.kind === 'verification'
        ? `Checked ${Math.min(done, total)} of ${total}…`
        : `Part ${Math.min(done + 1, total)} of ${total}…`
      : null

  return (
    <Modal labelledBy={titleId} describedBy={descriptionId} panelClassName="max-w-sm">
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner className="size-9 text-indigo-600 dark:text-indigo-400" label={null} />

        <div role="status" aria-live="polite">
          <h2 id={titleId} className="text-lg font-semibold">
            {copy.title}
          </h2>
          <p id={descriptionId} className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {copy.body}
          </p>
          {progress !== null && (
            <p className="mt-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {progress}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </Modal>
  )
}

/**
 * One entry per request kind, so the map stays exhaustive. Only the three in
 * `BLOCKING_AI_KINDS` reach this component: `explanation` renders inline on the
 * results screen, and a connection test is tracked by `connectionStatus` rather
 * than by `active` and never appears here at all.
 */
const COPY: Record<UseAIRequestState['kind'], { title: string; body: string }> = {
  formatting: {
    title: 'Formatting your questions…',
    body: 'Your pasted text is safe — it comes back as soon as this finishes.',
  },
  'json-repair': {
    title: 'Repairing your JSON…',
    body: 'Your pasted JSON is safe — it comes back as soon as this finishes.',
  },
  verification: {
    title: 'Checking your questions…',
    body: 'The AI is reviewing the answers you imported. Nothing changes until you accept a suggestion.',
  },
  explanation: {
    title: 'Asking the AI…',
    body: 'This only takes a moment.',
  },
  connection: {
    title: 'Testing the connection…',
    body: 'Checking that your provider accepts this key and model.',
  },
}
