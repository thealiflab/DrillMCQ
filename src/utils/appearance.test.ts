import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_OPTIONS,
  FONT_OPTIONS,
  FONT_SCALES,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  clampFontScale,
  isDefaultAppearance,
} from './appearance'

describe('clampFontScale', () => {
  it('leaves an in-range scale alone', () => {
    expect(clampFontScale(1)).toBe(1)
    expect(clampFontScale(1.15)).toBe(1.15)
  })

  it('clamps both ends rather than rejecting', () => {
    expect(clampFontScale(0.1)).toBe(MIN_FONT_SCALE)
    expect(clampFontScale(99)).toBe(MAX_FONT_SCALE)
    expect(clampFontScale(-3)).toBe(MIN_FONT_SCALE)
  })

  it('falls back to 1 for a non-finite value rather than clamping it', () => {
    // NaN and Infinity are corruption, not an extreme preference — there is no
    // "nearest legal size" to snap them to, so they read as the default.
    expect(clampFontScale(Number.NaN)).toBe(1)
    expect(clampFontScale(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampFontScale(Number.NEGATIVE_INFINITY)).toBe(1)
  })

  it('rounds to two decimals so the value reaching CSS is short', () => {
    expect(clampFontScale(1.123456)).toBe(1.12)
  })

  it('round-trips every offered step', () => {
    // A step the picker offers but the clamp rewrites would leave no button
    // looking selected.
    for (const step of FONT_SCALES) {
      expect(clampFontScale(step.value)).toBe(step.value)
    }
  })
})

describe('appearance options', () => {
  it('offers a default step, font and background', () => {
    expect(FONT_SCALES.some((s) => s.value === 1)).toBe(true)
    expect(FONT_OPTIONS.some((f) => f.id === 'sans')).toBe(true)
    expect(BACKGROUND_OPTIONS.some((b) => b.id === 'default')).toBe(true)
  })

  it('has no duplicate ids', () => {
    expect(new Set(FONT_OPTIONS.map((f) => f.id)).size).toBe(FONT_OPTIONS.length)
    expect(new Set(BACKGROUND_OPTIONS.map((b) => b.id)).size).toBe(BACKGROUND_OPTIONS.length)
  })
})

/**
 * The option catalog above and the token overrides in index.css are coupled
 * with nothing else enforcing it: a preset whose CSS is missing or misspelled
 * still renders a button, it just silently does nothing. These guard that seam.
 */
describe('index.css backs every option', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

  it('reads the stylesheet at all', () => {
    // Guards the guards: an empty read would make every assertion below pass
    // vacuously, which is exactly how a stubbed CSS import fails.
    expect(css.length).toBeGreaterThan(500)
  })

  it('defines a light and a dark palette for every background preset', () => {
    for (const { id } of BACKGROUND_OPTIONS) {
      if (id === 'default') continue
      expect(css).toContain(`[data-bg='${id}']:not(.dark)`)
      expect(css).toContain(`[data-bg='${id}'].dark`)
    }
  })

  it('defines a font stack for every font', () => {
    for (const { id } of FONT_OPTIONS) {
      expect(css).toContain(`[data-font='${id}']`)
    }
  })

  it('restates the shipped palette and font under the default ids', () => {
    // Redundant on <html>, load-bearing for the Settings previews: a nested
    // `data-bg='default'` swatch would otherwise inherit the active preset and
    // advertise the wrong palette. Same for the "Sans" font button.
    expect(css).toContain(`[data-bg='default']`)
    expect(css).toContain(`[data-font='sans']`)
  })

  it('re-pins text-white so a retinted surface cannot tint button labels', () => {
    // The single non-obvious invariant of the whole design: light presets
    // override --color-white for card surfaces, which `text-white` shares.
    expect(css).toMatch(/\.text-white\s*\{\s*color:\s*#fff/)
  })

  it('scales the root font size from a percentage, not a rem', () => {
    // `1rem` would discard a user who raised their browser's default size.
    expect(css).toMatch(/font-size:\s*calc\(100%\s*\*\s*var\(--app-font-scale/)
  })
})

describe('isDefaultAppearance', () => {
  it('is true only for the shipped look', () => {
    expect(isDefaultAppearance({ font: 'sans', fontScale: 1, background: 'default' })).toBe(true)
    expect(isDefaultAppearance({ font: 'serif', fontScale: 1, background: 'default' })).toBe(false)
    expect(isDefaultAppearance({ font: 'sans', fontScale: 1.3, background: 'default' })).toBe(false)
    expect(isDefaultAppearance({ font: 'sans', fontScale: 1, background: 'warm' })).toBe(false)
  })
})
