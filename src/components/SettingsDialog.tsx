import { useId } from 'react'
import type { Theme } from '../services/storage'
import type { AppearancePrefs } from '../types/appearance'
import type { SoundPrefs } from '../types/sound'
import {
  BACKGROUND_OPTIONS,
  FONT_OPTIONS,
  FONT_SCALES,
  isDefaultAppearance,
} from '../utils/appearance'
import { SOUND_OPTIONS } from '../utils/sound'
import { Modal } from './Modal'

interface SettingsDialogProps {
  theme: Theme
  onToggleTheme: () => void
  appearance: AppearancePrefs
  /** Patch callback — the appearance controls are one group, not three. */
  onAppearanceChange: (patch: Partial<AppearancePrefs>) => void
  onResetAppearance: () => void
  sound: SoundPrefs
  /** Patch callback like `onAppearanceChange`, leaving room for a volume. */
  onSoundChange: (patch: Partial<SoundPrefs>) => void
  /** False when the browser has no Web Audio API. */
  soundSupported: boolean
  /** One line describing the assistant's current state. */
  aiStatus: string
  onOpenAI: () => void
  /** False when the browser is blocking localStorage. */
  storageAvailable: boolean
  onClose: () => void
}

/** Shared by both segmented rows below. */
const SEGMENT =
  'min-h-11 flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
const SEGMENT_ON = 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
const SEGMENT_OFF = 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'

/**
 * The Settings destination. Deliberately shallow: appearance, and a door into
 * the optional AI assistant. The assistant stays an enhancement rather than a
 * top-level destination of its own.
 *
 * Every appearance control writes through immediately — like `AISettings`,
 * there is no Save button. The dialog is itself one of the surfaces being
 * restyled, so each change is its own preview.
 */
export function SettingsDialog({
  theme,
  onToggleTheme,
  appearance,
  onAppearanceChange,
  onResetAppearance,
  sound,
  onSoundChange,
  soundSupported,
  aiStatus,
  onOpenAI,
  storageAvailable,
  onClose,
}: SettingsDialogProps) {
  const titleId = useId()
  const fontLabelId = useId()
  const backgroundLabelId = useId()
  const sizeLabelId = useId()
  const soundLabelId = useId()

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
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">Appearance</h3>
            {!isDefaultAppearance(appearance) && (
              <button
                type="button"
                onClick={onResetAppearance}
                className="rounded-lg px-1 text-xs font-medium text-indigo-600 underline-offset-2 transition-colors hover:underline dark:text-indigo-400"
              >
                Reset
              </button>
            )}
          </div>
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

          {/* Background preset */}
          <p id={backgroundLabelId} className="mt-4 text-sm font-medium">
            Background
          </p>
          <div role="group" aria-labelledby={backgroundLabelId} className="mt-2 grid grid-cols-4 gap-2">
            {BACKGROUND_OPTIONS.map((option) => {
              const active = appearance.background === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onAppearanceChange({ background: option.id })}
                  aria-pressed={active}
                  className={`flex min-h-11 flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                      : 'border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  {/* The swatch opts into the preset's own tokens via data-bg,
                      and into the current mode via the `dark` class — so it
                      previews exactly what the page will become, with no hex
                      duplicated out of index.css. */}
                  <span
                    aria-hidden
                    data-bg={option.id}
                    className={`flex h-6 w-full items-end justify-end rounded-md border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 ${theme === 'dark' ? 'dark' : ''}`}
                  >
                    <span className="h-full w-1/2 rounded-sm border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
                  </span>
                  {option.label}
                </button>
              )
            })}
          </div>

          {/* Font family. Buttons rather than a <select> so each choice can be
              rendered in the face it selects — the same data-attribute trick as
              the swatches, and again with no stack duplicated out of index.css. */}
          <p id={fontLabelId} className="mt-4 text-sm font-medium">
            Font
          </p>
          <div role="group" aria-labelledby={fontLabelId} className="mt-2 grid grid-cols-2 gap-2">
            {FONT_OPTIONS.map((option) => {
              const active = appearance.font === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  data-font={option.id}
                  onClick={() => onAppearanceChange({ font: option.id })}
                  aria-pressed={active}
                  style={{ fontFamily: 'var(--font-sans)' }}
                  className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                      : 'border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          {/* Text size */}
          <p id={sizeLabelId} className="mt-4 text-sm font-medium">
            Text size
          </p>
          <div
            role="group"
            aria-labelledby={sizeLabelId}
            className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60"
          >
            {FONT_SCALES.map((step) => {
              const active = appearance.fontScale === step.value
              return (
                <button
                  key={step.value}
                  type="button"
                  onClick={() => onAppearanceChange({ fontScale: step.value })}
                  aria-pressed={active}
                  className={`${SEGMENT} ${active ? SEGMENT_ON : SEGMENT_OFF}`}
                >
                  {step.label}
                </button>
              )
            })}
          </div>
        </section>

        {/* Its own section, not part of Appearance: `isDefaultAppearance` and
            the Reset link above would otherwise sweep sound up, and resetting
            the *look* of the app must never unmute it. */}
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 id={soundLabelId} className="text-sm font-semibold">
            🔊 Sound effects
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {soundSupported
              ? 'Short tones for answer feedback, results and clicks. Nothing is downloaded — the tones are generated in your browser.'
              : "This browser doesn't support the Web Audio API, so sound is unavailable."}
          </p>
          <div
            role="group"
            aria-labelledby={soundLabelId}
            className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60"
          >
            {SOUND_OPTIONS.map((option) => {
              const active = sound.enabled === option.value
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={!soundSupported}
                  onClick={() => onSoundChange({ enabled: option.value })}
                  aria-pressed={active}
                  className={`${SEGMENT} ${active ? SEGMENT_ON : SEGMENT_OFF} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
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
