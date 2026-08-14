import type { AppearancePrefs, BackgroundChoice, FontChoice } from '../types/appearance'

/**
 * The option tables the settings UI renders from, plus the one function that
 * writes appearance onto the document.
 *
 * Pure: no React, no storage, no API. The *visual* half of every option lives
 * in `src/index.css` as a token override keyed off the `data-font` / `data-bg`
 * attributes written below — adding an option means adding an entry here and a
 * rule there, and touching no component.
 */

export const FONT_OPTIONS = [
  { id: 'sans', label: 'Sans (default)' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Monospace' },
  // Wide letterforms and a tall x-height, which is what makes a face easier to
  // read for long stretches (and for dyslexic readers).
  { id: 'readable', label: 'Readable' },
] as const satisfies readonly { id: FontChoice; label: string }[]

/**
 * Deliberately carries no colour values. The Settings swatches preview a preset
 * by rendering a `<span data-bg={id}>` containing ordinary `bg-slate-100` /
 * `bg-white` children, so `index.css` stays the single source of truth for
 * every hex and a swatch can never drift from the palette it advertises.
 */
export const BACKGROUND_OPTIONS = [
  { id: 'default', label: 'Slate' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'contrast', label: 'Contrast' },
] as const satisfies readonly { id: BackgroundChoice; label: string }[]

/** The offered steps. `fontScale` is stored as a number so it can be clamped. */
export const FONT_SCALES = [
  { value: 0.9, label: 'Small' },
  { value: 1, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Largest' },
] as const

export const MIN_FONT_SCALE = 0.8
export const MAX_FONT_SCALE = 1.6

/**
 * Keeps a hand-edited or half-written entry from shrinking the app to nothing
 * or blowing it up past the viewport. Rounded to 2dp so the value that reaches
 * CSS is always short and comparable.
 */
export function clampFontScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  const bounded = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, scale))
  return Math.round(bounded * 100) / 100
}

/** True when nothing has been changed from the shipped look. */
export function isDefaultAppearance(prefs: AppearancePrefs): boolean {
  return prefs.font === 'sans' && prefs.background === 'default' && prefs.fontScale === 1
}

/**
 * The single place appearance touches the DOM.
 *
 * Called from `useAppearance`'s effect and once from `main.tsx` before the
 * first render, so the app never paints at the wrong size — the two are
 * idempotent by construction.
 */
export function applyAppearance(root: HTMLElement, prefs: AppearancePrefs): void {
  root.dataset.font = prefs.font
  root.dataset.bg = prefs.background
  root.style.setProperty('--app-font-scale', String(clampFontScale(prefs.fontScale)))
}
