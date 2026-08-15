import { useCallback, useEffect, useState } from 'react'
import { loadSoundPrefs, saveSoundPrefs } from '../services/storage'
import { playSound, setSoundEnabled } from '../services/sound'
import type { SoundPrefs } from '../types/sound'

/**
 * Whether the app makes any sound.
 *
 * Shaped exactly like `useAppearance`: state seeded from storage, one effect
 * that both applies the preference to a global — here the audio service rather
 * than <html> — and persists it, plus one memoized patch mutator.
 *
 * Unlike appearance there is deliberately **no `main.tsx` pre-apply**. That
 * exists to stop a wrong font size showing for a frame; sound has no such
 * flash, and no user gesture can happen before this hook's mount effect runs,
 * so the service's shipped default is never audible.
 */
export function useSound() {
  const [sound, setSound] = useState<SoundPrefs>(loadSoundPrefs)

  useEffect(() => {
    setSoundEnabled(sound.enabled)
    saveSoundPrefs(sound)
  }, [sound])

  /** A patch callback rather than a setter, leaving room for a volume later. */
  const updateSound = useCallback(
    (patch: Partial<SoundPrefs>) => {
      const next = { ...sound, ...patch }
      // Pushed synchronously as well as in the effect above — otherwise the
      // preview tick below is swallowed by its own state update, since the
      // service would still be muted when it fires. `setSoundEnabled` is
      // idempotent, exactly like `applyAppearance`.
      setSoundEnabled(next.enabled)
      // Switching sound *on* is the one control with no other feedback, so it
      // previews itself. It is also a real click, which is what unlocks the
      // AudioContext.
      if (next.enabled && !sound.enabled) playSound('select')
      setSound(next)
    },
    [sound],
  )

  return { sound, updateSound }
}
