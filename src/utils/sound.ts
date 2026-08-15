import type { ScheduledTone, SoundName, SoundPrefs, ToneSpec } from '../types/sound'

/**
 * The sound palette, as data — plus every calculation that turns it into
 * something playable.
 *
 * Pure on purpose: no `AudioContext`, no React, no storage. The tests run in a
 * node environment with no DOM and no Web Audio, so describing a sound as a
 * list of notes is what makes it checkable at all. `scheduleTones` then does
 * every unit conversion, envelope time and gain multiplication *here*, which
 * leaves `services/sound.ts` a branchless "create node, set values, start,
 * stop" loop with nothing left worth testing.
 *
 * The design rule behind the notes: a **rising** interval reads as "yes" and a
 * **falling** one as "no", which is why `correct`/`save` climb and
 * `incorrect`/`fail` descend. Nothing is a buzzer — a wrong answer on a
 * practice quiz is normal, and a punishing sound is the first thing a user
 * mutes.
 */

/** Note frequencies in Hz, equal-tempered against A4 = 440. */
const D4 = 293.66
const DS4 = 311.13
const F4 = 349.23
const G4 = 392
const A4 = 440
const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

/** Everything is scaled by this, so one number controls overall loudness. */
export const MASTER_GAIN = 0.18

/** Linear ramp up to peak, long enough to stop a note clicking on. */
export const ATTACK_MS = 8

/**
 * `exponentialRampToValueAtTime` cannot target zero, so the decay lands here
 * and the oscillator stops. Small enough to be inaudible.
 */
export const MIN_GAIN = 0.0001

/** The same sound can't retrigger faster than this — see `shouldPlay`. */
export const MIN_REPEAT_GAP_MS = 60

/** Anything longer than this nags rather than cues. */
export const MAX_CUE_MS = 250

/** The two sounds allowed past `MAX_CUE_MS`, because they end the quiz. */
export const LONG_SOUNDS: readonly SoundName[] = ['pass', 'fail']

/**
 * `as const satisfies` buys compile-time exhaustiveness, like `FONT_OPTIONS` in
 * `utils/appearance.ts`: adding a `SoundName` without a spec fails the build.
 */
export const SOUND_SPECS = {
  /** Rising major third — the smallest, most consonant "yes" two notes make. */
  correct: [
    { at: 0, freq: C5, duration: 90, type: 'triangle', gain: 0.7 },
    { at: 70, freq: E5, duration: 130, type: 'triangle', gain: 0.6 },
  ],
  /** Descending minor third, low and soft. A sine, deliberately not a buzzer. */
  incorrect: [
    { at: 0, freq: G4, duration: 110, type: 'sine', gain: 0.55 },
    { at: 90, freq: DS4, duration: 150, type: 'sine', gain: 0.5 },
  ],
  /** Major triad resolving to the octave — the fanfare, with the confetti. */
  pass: [
    { at: 0, freq: C5, duration: 140, type: 'triangle', gain: 0.7 },
    { at: 110, freq: E5, duration: 140, type: 'triangle', gain: 0.7 },
    { at: 220, freq: G5, duration: 140, type: 'triangle', gain: 0.7 },
    { at: 330, freq: C6, duration: 300, type: 'triangle', gain: 0.6 },
  ],
  /**
   * A descending minor outline: shorter, quieter and lower than the fanfare.
   * The audio equivalent of the result screen's "a failed run gets colour and
   * words, no animation" — acknowledgement, never a sting.
   */
  fail: [
    { at: 0, freq: A4, duration: 160, type: 'sine', gain: 0.5 },
    { at: 140, freq: F4, duration: 160, type: 'sine', gain: 0.45 },
    { at: 280, freq: D4, duration: 220, type: 'sine', gain: 0.4 },
  ],
  /**
   * The most frequently heard sound, so the shortest and quietest. Pitched
   * inside the `correct` chord, so a run of selections followed by a verdict
   * stays harmonically coherent instead of clashing.
   */
  select: [{ at: 0, freq: E5, duration: 45, type: 'triangle', gain: 0.35 }],
  /**
   * One blip for both directions on purpose: Previous is mostly used to
   * re-read, and a distinct "backwards" tone would imply undo or error.
   */
  navigate: [{ at: 0, freq: C5, duration: 45, type: 'sine', gain: 0.3 }],
  /**
   * Rising perfect fourth — resolved and filed. A different interval from
   * `correct`'s third precisely so a save can't be heard as a right answer.
   */
  save: [
    { at: 0, freq: G4, duration: 70, type: 'sine', gain: 0.5 },
    { at: 60, freq: C5, duration: 140, type: 'sine', gain: 0.45 },
  ],
  /**
   * Low, dull and fast-decaying: "gone". Not a warning — the user already
   * decided in a confirm dialog, so this is a receipt.
   */
  destructive: [{ at: 0, freq: 220, duration: 140, type: 'sine', gain: 0.5 }],
} as const satisfies Record<SoundName, readonly ToneSpec[]>

/** Sound is on until the user says otherwise. */
export function defaultSoundPrefs(): SoundPrefs {
  return { enabled: true }
}

/** Wall-clock length of a sound in ms — where its last note ends. */
export function soundDurationMs(spec: readonly ToneSpec[]): number {
  return spec.reduce((end, tone) => Math.max(end, tone.at + tone.duration), 0)
}

/** The loudest single note in a spec, before `MASTER_GAIN`. */
export function peakGain(spec: readonly ToneSpec[]): number {
  return spec.reduce((peak, tone) => Math.max(peak, tone.gain), 0)
}

/**
 * Resolve a spec against an `AudioContext` clock. All the arithmetic in the
 * feature lives here, which is what keeps the service untestable-but-trivial.
 */
export function scheduleTones(spec: readonly ToneSpec[], startSec: number): ScheduledTone[] {
  return spec.map((tone) => {
    const toneStart = startSec + tone.at / 1000
    return {
      type: tone.type,
      freq: tone.freq,
      startSec: toneStart,
      attackEndSec: toneStart + ATTACK_MS / 1000,
      stopSec: toneStart + tone.duration / 1000,
      peak: tone.gain * MASTER_GAIN,
    }
  })
}

/**
 * Rate-limit one sound. Holding a number key repeats the keydown, and without
 * this the `select` tone would machine-gun.
 *
 * A clock that jumps backwards (a system time change) returns true rather than
 * muting until it catches up — failing open is the safe direction here.
 */
export function shouldPlay(
  lastPlayedAt: number | null,
  now: number,
  gapMs: number = MIN_REPEAT_GAP_MS,
): boolean {
  if (lastPlayedAt === null) return true
  if (now < lastPlayedAt) return true
  return now - lastPlayedAt >= gapMs
}

/** Rendered by the settings control, like `FONT_SCALES`. */
export const SOUND_OPTIONS = [
  { value: true, label: 'On' },
  { value: false, label: 'Off' },
] as const satisfies readonly { value: boolean; label: string }[]
