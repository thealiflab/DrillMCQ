import { useState } from 'react'
import type { HistoryStats, SavedQuiz } from '../types/quiz'
import { attemptStatus } from '../utils/library'
import { ConfirmDialog } from './ConfirmDialog'
import { SavedQuizCard } from './SavedQuizCard'

interface SavedQuizListProps {
  quizzes: SavedQuiz[]
  statsFor: (quizId: string) => HistoryStats
  onStart: (quiz: SavedQuiz) => void
  onResume: (quiz: SavedQuiz) => void
  onViewResults: (quiz: SavedQuiz) => void
  onDelete: (quiz: SavedQuiz) => void
}

/** The "My Quizzes" library section, plus the delete confirmation flow. */
export function SavedQuizList({
  quizzes,
  statsFor,
  onStart,
  onResume,
  onViewResults,
  onDelete,
}: SavedQuizListProps) {
  const [pendingDelete, setPendingDelete] = useState<SavedQuiz | null>(null)

  // Most recently touched first, so what you're working on stays at the top.
  const ordered = [...quizzes].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <section aria-labelledby="my-quizzes-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="my-quizzes-heading" className="text-lg font-semibold">
          📚 My Quizzes
        </h2>
        {quizzes.length > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {quizzes.length} saved in this browser
          </p>
        )}
      </div>

      {quizzes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
          No saved quizzes yet. Import a quiz above to add it to your library.
        </p>
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
                onViewResults={() => onViewResults(quiz)}
                onDelete={() => setPendingDelete(quiz)}
              />
            )
          })}
        </ul>
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
