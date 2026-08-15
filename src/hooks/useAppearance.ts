import { useCallback, useEffect, useState } from 'react'
import { defaultAppearance, loadAppearance, saveAppearance } from '../services/storage'
import type { AppearancePrefs } from '../types/appearance'
import { applyAppearance } from '../utils/appearance'

/**
 * Font, text size and background preset.
 *
 * Shaped exactly like `useTheme`: state seeded from storage, one effect that
 * both applies the preference to <html> and persists it, memoized mutators.
 * The difference is that `main.tsx` also applies these once before the first
 * render — a wrong font *size* on screen for a frame is far more jarring than
 * a wrong colour, and `applyAppearance` is idempotent so the effect below just
 * writes the same values again.
 */
export function useAppearance() {
  const [appearance, setAppearance] = useState<AppearancePrefs>(loadAppearance)

  useEffect(() => {
    applyAppearance(document.documentElement, appearance)
    saveAppearance(appearance)
  }, [appearance])

  /** One patch callback rather than three setters — the controls are one group. */
  const updateAppearance = useCallback((patch: Partial<AppearancePrefs>) => {
    setAppearance((current) => ({ ...current, ...patch }))
  }, [])

  const resetAppearance = useCallback(() => {
    setAppearance(defaultAppearance())
  }, [])

  return { appearance, updateAppearance, resetAppearance }
}
