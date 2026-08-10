import type { Theme } from '../services/storage'
import type { View } from '../types/navigation'
import { VIEWS } from '../types/navigation'
import { Spinner } from './Spinner'
import { ThemeToggle } from './ThemeToggle'

interface AppNavProps {
  view: View
  onNavigate: (view: View) => void
  onOpenSettings: () => void
  theme: Theme
  onToggleTheme: () => void
  /** Drives the badge on the settings button. */
  aiReady: boolean
  aiBusy: boolean
}

const LOGO_SRC = `${import.meta.env.BASE_URL}DrillMCQ_logo.png`

/**
 * Primary navigation: a sticky header on every screen, plus a bottom bar on
 * phones where the header has no room for four labels.
 *
 * Both render the same `VIEWS` list, so a destination can never appear in one
 * and not the other. Neither is rendered while a quiz is being answered —
 * `App` swaps in `QuizTopBar` there so nothing invites an accidental exit.
 */
export function AppNav({
  view,
  onNavigate,
  onOpenSettings,
  theme,
  onToggleTheme,
  aiReady,
  aiBusy,
}: AppNavProps) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            aria-label="DrillMCQ — go to home"
            className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <img src={LOGO_SRC} alt="" className="size-7 rounded-md" />
            <span className="text-lg font-bold tracking-tight">
              Drill<span className="text-indigo-600 dark:text-indigo-400">MCQ</span>
            </span>
          </button>

          {/* Desktop destinations. The phone gets these in the bottom bar. */}
          <nav aria-label="Main" className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {VIEWS.map((item) => {
              const active = view === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Settings"
              title={aiBusy ? 'AI is working…' : aiReady ? 'Settings · AI assistant on' : 'Settings'}
              className="relative flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-lg leading-none shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <span aria-hidden>⚙️</span>
              {/* One badge, two states: spinning while an AI request is in
                  flight, a steady dot when the assistant is merely configured. */}
              {aiBusy ? (
                <Spinner
                  label="AI is working"
                  className="absolute -right-1 -top-1 size-3.5 text-indigo-600 dark:text-indigo-400"
                />
              ) : (
                aiReady && (
                  <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-slate-100 dark:ring-slate-950" />
                )
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Phone destinations. `App` pads the main region so nothing hides
          behind this, and `pb-safe` keeps it clear of the home indicator. */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {VIEWS.map((item) => {
            const active = view === item.id
            return (
              <li key={item.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {item.icon}
                  </span>
                  {item.shortLabel}
                  <span
                    aria-hidden
                    className={`mt-0.5 h-0.5 w-6 rounded-full ${active ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-transparent'}`}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
