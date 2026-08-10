import type { SavedQuiz } from '../types/quiz'
import type { View } from '../types/navigation'
import { progressSummary } from '../utils/library'

interface HomeDashboardProps {
  onNavigate: (view: View) => void
  /** The quiz to offer as "Continue", or null when nothing is resumable. */
  resumable: SavedQuiz | null
  onResume: (quiz: SavedQuiz) => void
  savedCount: number
  attemptCount: number
  /**
   * The recent-results strip. Injected rather than imported so this screen
   * keeps no dependency on the history layer.
   */
  children?: React.ReactNode
}

interface TileProps {
  icon: string
  title: string
  description: string
  onClick: () => void
  primary?: boolean
}

/** One dashboard destination. The primary tile is the "Create Quiz" CTA. */
function Tile({ icon, title, description, onClick, primary = false }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-28 w-full flex-col items-start gap-1 rounded-2xl border p-5 text-left shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
        primary
          ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800 dark:hover:bg-slate-800'
      }`}
    >
      <span
        aria-hidden
        className={`mb-1 flex size-9 items-center justify-center rounded-xl text-lg leading-none ${
          primary ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
        }`}
      >
        {icon}
      </span>
      <span className="text-base font-semibold">{title}</span>
      <span className={`text-sm ${primary ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
        {description}
      </span>
    </button>
  )
}

/**
 * The home screen: what the app is, the four things you can do, and — only
 * when there is one — the unfinished run waiting to be picked back up.
 */
export function HomeDashboard({
  onNavigate,
  resumable,
  onResume,
  savedCount,
  attemptCount,
  children,
}: HomeDashboardProps) {
  const progress = resumable?.progress ? progressSummary(resumable.progress) : null

  return (
    <div className="animate-fade-slide-in space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Drill<span className="text-indigo-600 dark:text-indigo-400">MCQ</span>
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Practise smarter. Test yourself. Improve. Everything stays in your browser.
        </p>
      </section>

      {/* Only rendered when there is genuinely something to resume. */}
      {resumable !== null && progress !== null && (
        <section
          aria-labelledby="continue-heading"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40"
        >
          <h2
            id="continue-heading"
            className="text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400"
          >
            Continue quiz
          </h2>
          <p className="mt-2 text-lg font-semibold break-words">{resumable.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {progress.answered} / {progress.total} questions answered · {progress.percent}% complete
          </p>
          <div
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${resumable.name} progress`}
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900"
          >
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => onResume(resumable)}
            className="mt-4 min-h-11 w-full rounded-xl bg-amber-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 sm:w-auto"
          >
            ▶ Continue
          </button>
        </section>
      )}

      {/* Creating a quiz is the one thing every other screen depends on, so it
          gets the full width. Continue lives in the banner above when there is
          something to continue — it is deliberately not repeated here. */}
      <section aria-label="Get started" className="space-y-4">
        <Tile
          primary
          icon="➕"
          title="Create Quiz"
          description="Paste your MCQs as plain text or JSON"
          onClick={() => onNavigate('create')}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Tile
            icon="📚"
            title="Quiz Library"
            description={
              savedCount === 0
                ? 'Saved quizzes appear here'
                : `${savedCount} saved quiz${savedCount === 1 ? '' : 'zes'} · start or continue`
            }
            onClick={() => onNavigate('library')}
          />
          <Tile
            icon="📊"
            title="Results"
            description={
              attemptCount === 0
                ? 'Your attempt history'
                : `${attemptCount} attempt${attemptCount === 1 ? '' : 's'} · review any of them`
            }
            onClick={() => onNavigate('results')}
          />
        </div>
      </section>

      {children}
    </div>
  )
}
