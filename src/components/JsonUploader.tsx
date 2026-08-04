import { useState } from 'react'
import type { QuizQuestion } from '../types/quiz'
import { parseQuizJson } from '../utils/quiz'

interface JsonUploaderProps {
  onLoad: (questions: QuizQuestion[]) => void
}

const SCHEMA_EXAMPLE = `[
  {
    "id": 1,
    "question": "What is the powerhouse of the cell?",
    "options": ["Nucleus", "Ribosomes", "Mitochondria", "Lysosomes"],
    "correctAnswers": ["Mitochondria"],
    "explanation": "The mitochondrion (plural: mitochondria) is the powerhouse of the cell. These tiny, membrane-bound organelles take nutrients like glucose and oxygen and convert them into adenosine triphosphate (ATP), which is the primary energy currency that cells use to power bodily functions.",
    "category": "Biology",
    "difficulty": "easy"
  },
  {
    "id": 2,
    "question": "Which of the following are programming languages?",
    "options": ["Python", "HTML", "Java", "CSS"],
    "correctAnswers": ["Python", "Java"],
    "explanation": "HTML is a markup language and CSS is a stylesheet language.",
    "category": "Computing"
  }
]`

/**
 * Quiz import: paste JSON into the textarea.
 * Validates the payload and surfaces a friendly error when it's malformed.
 */
export function JsonUploader({ onLoad }: JsonUploaderProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const tryLoad = (raw: string) => {
    const result = parseQuizJson(raw)
    if (result.ok) {
      setError(null)
      onLoad(result.questions)
    } else {
      setError(result.error)
    }
  }

  const loadSample = async () => {
    const sample = await import('../data/sampleQuiz.json')
    const raw = JSON.stringify(sample.default, null, 2)
    setText(raw)
    tryLoad(raw)
  }

  return (
    <div className="space-y-4">
      <label htmlFor="quiz-json" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        Paste your quiz JSON
      </label>
      <textarea
        id="quiz-json"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        placeholder={SCHEMA_EXAMPLE}
        rows={10}
        spellCheck={false}
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-600"
      />

      {error && (
        <div
          role="alert"
          className="animate-fade-slide-in rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
        >
          <strong className="font-semibold">Invalid quiz JSON.</strong> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => tryLoad(text)}
          disabled={text.trim() === ''}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Load quiz
        </button>
        <button
          type="button"
          onClick={loadSample}
          className="px-2 py-2.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Try the sample quiz
        </button>
      </div>
    </div>
  )
}
