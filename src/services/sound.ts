import type { SoundName } from '../types/sound'
import { MIN_GAIN, SOUND_SPECS, scheduleTones, shouldPlay } from '../utils/sound'

/**
 * The audio output shell.
 *
 * This is the **only** module allowed to construct an `AudioContext`, the same
 * way `services/storage.ts` is the only one allowed to touch localStorage.
 * Everything else calls `playSound(name)` and gets on with it.
 *
 * Why a module singleton rather than a React context: audio output *is* a
 * global, exactly like `<html>`. `useAppearance` doesn't thread its preference
 * down the tree either — its effect calls
 * `applyAppearance(document.documentElement, prefs)`. `useSound` does the same
 * by calling `setSoundEnabled` here, which keeps `playSound` a bare import at
 * every trigger site instead of a prop drilled through ten components. It
 * returns nothing, causes no re-render and never changes identity, so it is a
 * side-effect sink, not state.
 *
 * The module is **inert until the first `playSound`**: no context, no `window`
 * access, no storage read at import time. Everything is defensive — the Web
 * Audio API can be missing, blocked, or refuse to resume, and **no function
 * here may throw**, because a silent app is acceptable and a broken one is not.
 */

/** Mirrors the stored preference. `useSound` is the only writer. */
let enabled = true

let context: AudioContext | null = null
/** Latched once audio proves unavailable, so we stop retrying on every click. */
let unavailable = false
const lastPlayed = new Map<SoundName, number>()

type AudioContextCtor = typeof AudioContext

/** Safari still only exposes the prefixed constructor. */
function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/**
 * Whether audio could work at all. Checks for the constructor without calling
 * it, so asking the question never creates a context.
 */
export function isSoundSupported(): boolean {
  return audioContextCtor() !== null
}

/**
 * The context, created on first use.
 *
 * Never at module load: a browser creates it `suspended` until a user gesture,
 * and a user who has sound switched off should never cause one to exist at all.
 */
function getContext(): AudioContext | null {
  if (unavailable) return null
  if (context !== null) return context

  const Ctor = audioContextCtor()
  if (Ctor === null) {
    unavailable = true
    return null
  }
  try {
    context = new Ctor()
    return context
  } catch {
    unavailable = true
    return null
  }
}

/** Turn sound on or off. Called by `useSound`; nothing else. Idempotent. */
export function setSoundEnabled(on: boolean): void {
  enabled = on
}

export function isSoundEnabled(): boolean {
  return enabled
}

/**
 * Play a sound, if sound is on and audio works. A no-op otherwise.
 *
 * Safe to call from any event handler — every trigger in the app is a user
 * gesture, which is what lets a suspended context resume. Never call it from
 * inside a `setState` updater: React runs those twice under StrictMode.
 */
export function playSound(name: SoundName): void {
  // Checked before `getContext`, so switching sound off means no context is
  // ever constructed.
  if (!enabled) return

  const now = Date.now()
  if (!shouldPlay(lastPlayed.get(name) ?? null, now)) return

  const ctx = getContext()
  if (ctx === null) return
  lastPlayed.set(name, now)

  try {
    // A backgrounded tab gets re-suspended, so this is checked every time
    // rather than once — recovery is then automatic. Deliberately not awaited:
    // `playSound` stays synchronous, and awaiting would move scheduling out of
    // the gesture and add audible latency. A rejected resume just means
    // silence, which the catch already covers.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})

    for (const tone of scheduleTones(SOUND_SPECS[name], ctx.currentTime)) {
      const osc = ctx.createOscillator()
      osc.type = tone.type
      osc.frequency.setValueAtTime(tone.freq, tone.startSec)

      // Short linear attack, then an exponential decay — the attack stops the
      // note clicking on, the decay is what makes it read as an instrument
      // rather than a beep.
      const envelope = ctx.createGain()
      envelope.gain.setValueAtTime(MIN_GAIN, tone.startSec)
      envelope.gain.linearRampToValueAtTime(tone.peak, tone.attackEndSec)
      envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, tone.stopSec)

      osc.connect(envelope)
      envelope.connect(ctx.destination)
      osc.start(tone.startSec)
      osc.stop(tone.stopSec)
      // Release the nodes once they've sounded; a long quiz would otherwise
      // accumulate an oscillator per click for the whole session.
      osc.onended = () => {
        osc.disconnect()
        envelope.disconnect()
      }
    }
  } catch {
    unavailable = true
  }
}

/** Test seam — drops the cached context, the failure latch and the throttle. */
export function resetSoundForTests(): void {
  context = null
  unavailable = false
  enabled = true
  lastPlayed.clear()
}
