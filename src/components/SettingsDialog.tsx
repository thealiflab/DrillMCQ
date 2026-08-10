import { useId } from 'react'
import type { Theme } from '../services/storage'
import { Modal } from './Modal'

interface SettingsDialogProps {
  theme: Theme
  onToggleTheme: () => void
  /** One line describing the assistant's current state. */
  aiStatus: string
  onOpenAI: () => void
  /** False when the browser is blocking localStorage. */
  storageAvailable: boolean
  onClose: () => void
}

/**
 * The Settings destination. Deliberately shallow: appearance, and a door into
 * the optional AI assistant. The assistant stays an enhancement rather than a
 * top-level destination of its own.
 */
export function SettingsDialog({
  theme,
  onToggleTheme,
  aiStatus,
  onOpenAI,
  storageAvailable,
  onClose,
}: SettingsDialogProps) {
  const titleId = useId()

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">
          Settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Currently using {theme === 'dark' ? 'dark' : 'light'} mode.
          </p>
          <button
            type="button"
            onClick={onToggleTheme}
            className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            Switch to {theme === 'dark' ? 'light' : 'dark'} mode
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-sm font-semibold">🤖 AI assistant</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{aiStatus}</p>
          <button
            type="button"
            onClick={onOpenAI}
            className="mt-3 min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Configure AI assistant
          </button>
        </section>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {storageAvailable
            ? 'Quizzes, results and preferences are stored in this browser only. Clearing site data removes them.'
            : 'This browser is blocking local storage, so quizzes and results cannot be saved.'}
        </p>
      </div>
    </Modal>
  )
}
