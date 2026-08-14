/**
 * Appearance preferences: the reading surface, not the quiz data.
 *
 * A leaf module on purpose — `services/storage` and the pure `utils/appearance`
 * layer both import it, so it must not import either of them.
 */

/** Which font stack the app renders in. All are system stacks — see `utils/appearance`. */
export type FontChoice = 'sans' | 'serif' | 'mono' | 'readable'

/**
 * A curated background palette. Presets *compose* with dark mode rather than
 * replacing it: each one defines a light and a dark variant in `index.css`.
 */
export type BackgroundChoice = 'default' | 'warm' | 'cool' | 'contrast'

export interface AppearancePrefs {
  font: FontChoice
  /** Root font-size multiplier. Clamped to [0.8, 1.6] on the way in and out. */
  fontScale: number
  background: BackgroundChoice
}
