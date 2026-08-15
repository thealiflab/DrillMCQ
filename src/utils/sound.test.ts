import { describe, expect, it } from 'vitest'
import type { SoundName } from '../types/sound'
import {
  LONG_SOUNDS,
  MASTER_GAIN,
  MAX_CUE_MS,
  MIN_REPEAT_GAP_MS,
  SOUND_OPTIONS,
  SOUND_SPECS,
  defaultSoundPrefs,
  peakGain,
  scheduleTones,
  shouldPlay,
  soundDurationMs,
} from './sound'

const names = Object.keys(SOUND_SPECS) as SoundName[]

describe('the sound palette', () => {
  it('gives every sound at least one note', () => {
    expect(names.length).toBe(8)
    for (const name of names) {
      expect(SOUND_SPECS[name].length, name).toBeGreaterThan(0)
    }
  })

  it('keeps cues short enough not to nag', () => {
    for (const name of names) {
      const duration = soundDurationMs(SOUND_SPECS[name])
      expect(duration, name).toBeGreaterThan(0)
      // Only the two end-of-quiz flourishes may run long.
      const budget = LONG_SOUNDS.includes(name) ? 800 : MAX_CUE_MS
      expect(duration, name).toBeLessThanOrEqual(budget)
    }
  })

  it('stays quiet enough never to clip or startle', () => {
    for (const name of names) {
      for (const tone of SOUND_SPECS[name]) {
        expect(tone.gain, name).toBeGreaterThan(0)
        expect(tone.gain, name).toBeLessThanOrEqual(0.8)
      }
      expect(peakGain(SOUND_SPECS[name]) * MASTER_GAIN, name).toBeLessThanOrEqual(0.25)
    }
  })

  it('keeps every note in a comfortable register', () => {
    for (const name of names) {
      for (const tone of SOUND_SPECS[name]) {
        // Nothing subsonic (inaudible on a laptop speaker, just distortion)
        // and nothing piercing.
        expect(tone.freq, name).toBeGreaterThanOrEqual(60)
        expect(tone.freq, name).toBeLessThanOrEqual(4000)
      }
    }
  })

  it('never starts a note before the sound begins', () => {
    for (const name of names) {
      for (const tone of SOUND_SPECS[name]) {
        expect(tone.at, name).toBeGreaterThanOrEqual(0)
        expect(tone.duration, name).toBeGreaterThan(0)
      }
    }
  })
})

describe('the musical intent of each sound', () => {
  /** Ratio of the last note to the first — >1 rises, <1 falls. */
  const shape = (name: SoundName) => {
    const spec = SOUND_SPECS[name]
    return spec[spec.length - 1].freq / spec[0].freq
  }

  it('rises for a right answer and falls for a wrong one', () => {
    // Major third up ≈ 1.26; minor third down ≈ 0.79.
    expect(shape('correct')).toBeCloseTo(1.26, 1)
    expect(shape('incorrect')).toBeCloseTo(0.79, 1)
  })

  it('cannot confuse a save with a right answer', () => {
    // A perfect fourth (≈1.33), deliberately a different interval.
    expect(shape('save')).toBeCloseTo(1.33, 1)
    expect(Math.abs(shape('save') - shape('correct'))).toBeGreaterThan(0.05)
  })

  it('climbs through the pass fanfare and descends through the fail tone', () => {
    const ascending = SOUND_SPECS.pass.map((t) => t.freq)
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b))

    const descending = SOUND_SPECS.fail.map((t) => t.freq)
    expect(descending).toEqual([...descending].sort((a, b) => b - a))
  })

  it('keeps the destructive thud below everything else', () => {
    const lowest = (name: SoundName) => Math.min(...SOUND_SPECS[name].map((t) => t.freq))
    expect(lowest('destructive')).toBeLessThan(lowest('select'))
    expect(lowest('destructive')).toBeLessThan(lowest('save'))
  })
})

describe('scheduling a sound against an audio clock', () => {
  it('resolves offsets and gains into absolute values', () => {
    const scheduled = scheduleTones(SOUND_SPECS.correct, 10)
    expect(scheduled).toHaveLength(2)
    expect(scheduled[0].startSec).toBe(10)
    // The second note starts 70 ms in.
    expect(scheduled[1].startSec).toBeCloseTo(10.07, 5)
    expect(scheduled[0].peak).toBeCloseTo(SOUND_SPECS.correct[0].gain * MASTER_GAIN, 5)
  })

  it('orders the envelope within every note', () => {
    for (const name of names) {
      for (const tone of scheduleTones(SOUND_SPECS[name], 5)) {
        expect(tone.startSec, name).toBeLessThan(tone.attackEndSec)
        expect(tone.attackEndSec, name).toBeLessThan(tone.stopSec)
      }
    }
  })

  it('shifts every time by the same offset', () => {
    const base = scheduleTones(SOUND_SPECS.pass, 0)
    const shifted = scheduleTones(SOUND_SPECS.pass, 3.5)
    base.forEach((tone, i) => {
      expect(shifted[i].startSec - tone.startSec).toBeCloseTo(3.5, 5)
      expect(shifted[i].stopSec - tone.stopSec).toBeCloseTo(3.5, 5)
      expect(shifted[i].peak).toBe(tone.peak)
    })
  })
})

describe('throttling a repeated sound', () => {
  it('always plays the first time', () => {
    expect(shouldPlay(null, 1_000)).toBe(true)
  })

  it('swallows a repeat inside the gap', () => {
    expect(shouldPlay(1_000, 1_000 + MIN_REPEAT_GAP_MS - 1)).toBe(false)
  })

  it('plays again once the gap has passed', () => {
    expect(shouldPlay(1_000, 1_000 + MIN_REPEAT_GAP_MS)).toBe(true)
  })

  it('fails open when the clock jumps backwards', () => {
    // A system time change must not mute the app until it catches up.
    expect(shouldPlay(5_000, 1_000)).toBe(true)
  })
})

describe('preferences', () => {
  it('ships with sound on', () => {
    expect(defaultSoundPrefs()).toEqual({ enabled: true })
  })

  it('offers exactly one option per state', () => {
    expect(SOUND_OPTIONS.map((o) => o.value)).toEqual([true, false])
  })
})
