import { useState } from 'react'

interface ExplanationPanelProps {
  explanation?: string
  /** Render expanded from the start (used on the review screen). */
  defaultOpen?: boolean
}

/**
 * Expandable explanation. Renders nothing when the question has no
 * explanation, per the schema where `explanation` is optional.
 */
export function ExplanationPanel({ explanation, defaultOpen = false }: ExplanationPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (!explanation) return null

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
      >
        <span aria-hidden>💡</span>
        {open ? 'Hide explanation' : 'Show explanation'}
      </button>
      {open && (
        <div className="animate-fade-slide-in mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-relaxed text-slate-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-slate-300">
          {explanation}
        </div>
      )}
    </div>
  )
}
