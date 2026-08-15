/**
 * Sound domain shapes. A leaf module like `types/appearance.ts` — it must not
 * import storage, utils or React, so the pure palette in `utils/sound.ts` can
 * depend on it without importing upward.
 */

/** Every sound the app can play. One name per *meaning*, not per call site. */
export type SoundName =
  | 'correct'
  | 'incorrect'
  | 'pass'
  | 'fail'
  | 'select'
  | 'navigate'
  | 'save'
  | 'destructive'

/**
 * Our own union rather than the DOM's `OscillatorType`, so the pure layer names
 * no DOM type at all. It is structurally assignable to `osc.type` in the
 * service, which is the only place that matters.
 */
export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth'

/** One note. Plain data, so the palette is testable without any audio API. */
export interface ToneSpec {
  /** Milliseconds after the sound starts. Lets a spec be a short melody. */
  at: number
  /** Pitch in Hz. */
  freq: number
  /** Milliseconds the note sounds for. */
  duration: number
  type: Waveform
  /** Peak gain before `MASTER_GAIN`, 0..1. Kept low — these fire often. */
  gain: number
}

/**
 * A note resolved against an `AudioContext` clock: absolute seconds, final
 * gain, envelope times. Everything the service needs, with nothing left to
 * calculate.
 */
export interface ScheduledTone {
  type: Waveform
  freq: number
  startSec: number
  /** End of the linear attack ramp. */
  attackEndSec: number
  /** End of the exponential decay, and when the oscillator stops. */
  stopSec: number
  /** Already multiplied by `MASTER_GAIN`. */
  peak: number
}

export interface SoundPrefs {
  enabled: boolean
}
