import { useId, useRef, useState } from 'react'
import type { HistoryStats, SavedQuiz } from '../types/quiz'
import { attemptStatus } from '../utils/library'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import { SavedQuizCard } from './SavedQuizCard'

interface SavedQuizListProps {
  quizzes: SavedQuiz[]
  statsFor: (quizId: string) => HistoryStats
  /** Start a fresh run — goes to the setup screen. */
  onStart: (quiz: SavedQuiz) => void
  /** Pick an unfinished run back up where it was left. */
  onResume: (quiz: SavedQuiz) => void
  /** Throw away an unfinished run and start from question 1. */
  onStartOver: (quiz: SavedQuiz) => void
  onViewResults: (quiz: SavedQuiz) => void
  onRename: (quiz: SavedQuiz, name: string) => void
  onDelete: (quiz: SavedQuiz) => void
  /** Takes the user to the import screen, from the header and the empty state. */
  onCreate: () => void
}

/** The Quiz Library, plus the rename / start-over / delete confirmation flows. */
export function SavedQuizList({
  quizzes,
  statsFor,
  onStart,
  onResume,
  onStartOver,
  onViewResults,
  onRename,
  onDelete,
  onCreate,
}: SavedQuizListProps) {
  const [pendingDelete, setPendingDelete] = useState<SavedQuiz | null>(null)
  const [pendingRename, setPendingRename] = useState<SavedQuiz | null>(null)
  const [pendingStartOver, setPendingStartOver] = useState<SavedQuiz | null>(null)

  // Most recently touched first, so what you're working on stays at the top.
  const ordered = [...quizzes].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <section aria-labelledby="library-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="library-heading" className="text-xl font-bold tracking-tight">
            Quiz Library
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {quizzes.length === 0
              ? 'Saved in this browser only'
              : `${quizzes.length} quiz${quizzes.length === 1 ? '' : 'zes'} saved in this browser`}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          + Create Quiz
        </button>
      </div>

      {quizzes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p aria-hidden className="text-3xl">
            📚
          </p>
          <p className="mt-2 font-semibold">Your Quiz Library is empty</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create your first quiz by pasting your MCQ questions.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 min-h-11 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            + Create Quiz
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ordered.map((quiz) => {
            const stats = statsFor(quiz.id)
            const status = attemptStatus(quiz, stats.attempts)
            return (
              <SavedQuizCard
                key={quiz.id}
                quiz={quiz}
                status={status}
                stats={stats}
                onPrimary={() => (status === 'in-progress' ? onResume(quiz) : onStart(quiz))}
                onStartOver={() => setPendingStartOver(quiz)}
                onViewResults={() => onViewResults(quiz)}
                onRename={() => setPendingRename(quiz)}
                onDelete={() => setPendingDelete(quiz)}
              />
            )
          })}
        </ul>
      )}

      {pendingRename !== null && (
        <RenameDialog
          quiz={pendingRename}
          onSave={(name) => {
            onRename(pendingRename, name)
            setPendingRename(null)
          }}
          onCancel={() => setPendingRename(null)}
        />
      )}

      {pendingStartOver !== null && (
        <ConfirmDialog
          title={`Start “${pendingStartOver.name}” again?`}
          message={
            <>
              <p>You'll start from question 1 with a fresh attempt.</p>
              <p className="mt-2">
                Your unfinished progress on this quiz is discarded. Past results stay in Results.
              </p>
            </>
          }
          confirmLabel="Start from the beginning"
          onConfirm={() => {
            onStartOver(pendingStartOver)
            setPendingStartOver(null)
          }}
          onCancel={() => setPendingStartOver(null)}
        />
      )}

      {pendingDelete !== null && (
        <ConfirmDialog
          title={`Delete “${pendingDelete.name}”?`}
          message={
            <>
              <p>
                This removes the quiz and its {pendingDelete.questions.length} questions from this
                browser.
              </p>
              <p className="mt-2 font-medium text-red-600 dark:text-red-400">
                Its saved results and attempt history will be deleted too. This can't be undone.
              </p>
            </>
          }
          confirmLabel="Delete quiz and results"
          danger
          onConfirm={() => {
            onDelete(pendingDelete)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}

interface RenameDialogProps {
  quiz: SavedQuiz
  onSave: (name: string) => void
  onCancel: () => void
}

/** Rename a saved quiz. Nothing destructive, so focus starts in the field. */
function RenameDialog({ quiz, onSave, onCancel }: RenameDialogProps) {
  const titleId = useId()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(quiz.name)

  const submit = () => {
    if (name.trim() === '') return
    onSave(name)
  }

  return (
    <Modal labelledBy={titleId} onClose={onCancel} initialFocusRef={inputRef}>
      <h2 id={titleId} className="text-lg font-semibold">
        Rename quiz
      </h2>
      <label htmlFor={inputId} className="mt-4 mb-1.5 block text-sm font-medium">
        Quiz name
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={name.trim() === ''}
          className="min-h-11 rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save name
        </button>
      </div>
    </Modal>
  )
}
