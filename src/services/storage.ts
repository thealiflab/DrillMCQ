import type { QuizSession } from '../types/quiz'

/**
 * Thin wrapper around localStorage so persistence logic lives in one place
 * and the rest of the app never touches storage keys directly.
 */

const SESSION_KEY = 'drillmcq.session.v1'
const THEME_KEY = 'drillmcq.theme.v1'

export function saveSession(session: QuizSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage may be full or unavailable (private mode) — fail silently,
    // the quiz still works, it just won't survive a refresh.
  }
}

export function loadSession(): QuizSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as QuizSession
    // Minimal sanity check so a corrupted entry can't crash the app.
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

export type Theme = 'light' | 'dark'

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // ignore
  }
}

export function loadTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return raw === 'light' || raw === 'dark' ? raw : null
  } catch {
    return null
  }
}
