import { useId, useRef } from 'react'
import { playSound } from '../services/sound'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  /** Body copy — spell out anything the action destroys. */
  message: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal confirmation. Deliberately a second, focused step: destructive
 * actions in the library are never one click away.
 *
 * Escape or the backdrop cancels (see `Modal`), and focus starts on Cancel so
 * a stray Enter is harmless.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal
      labelledBy={titleId}
      describedBy={descriptionId}
      onClose={onCancel}
      initialFocusRef={cancelRef}
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <div id={descriptionId} className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {message}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          // Gated on `danger`, which is what makes one line here cover every
          // destructive confirm in the app while leaving the benign ones
          // silent — Finish-with-unanswered in particular, where a thud in
          // front of the result fanfare would be absurd. Cancel never sounds.
          onClick={() => {
            if (danger) playSound('destructive')
            onConfirm()
          }}
          className={`min-h-11 rounded-xl px-5 py-2.5 font-medium text-white shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
            danger
              ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-500'
              : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-indigo-500'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
