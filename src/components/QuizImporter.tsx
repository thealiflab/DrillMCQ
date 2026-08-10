import { useState } from 'react'
import type { UseAI } from '../hooks/useAI'
import type { QuizQuestion } from '../types/quiz'
import { JsonUploader } from './JsonUploader'
import { TextUploader } from './TextUploader'

interface QuizImporterProps {
  onLoad: (questions: QuizQuestion[]) => void
  /** Forwarded to both tabs: each has its own AI clean-up for its own format. */
  ai?: UseAI
}

type ImportMode = 'text' | 'json'

/** Tabbed quiz import: plain-text MCQ parsing or raw JSON. */
export function QuizImporter({ onLoad, ai }: QuizImporterProps) {
  const [mode, setMode] = useState<ImportMode>('text')

  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
    }`

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Import mode"
        className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'text'}
          onClick={() => setMode('text')}
          className={tabClass(mode === 'text')}
        >
          📝 Plain text
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'json'}
          onClick={() => setMode('json')}
          className={tabClass(mode === 'json')}
        >
          {'{ }'} JSON
        </button>
      </div>

      {mode === 'text' ? (
        <TextUploader onLoad={onLoad} ai={ai} />
      ) : (
        <JsonUploader onLoad={onLoad} ai={ai} />
      )}
    </div>
  )
}
