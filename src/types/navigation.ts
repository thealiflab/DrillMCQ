/**
 * The app's four top-level destinations.
 *
 * Deliberately not a router: `App` stays a state machine, and every other
 * screen (setup, an active run, a result, a quiz's history, a stored attempt)
 * is a sub-state layered over one of these rather than a fifth destination.
 */
export type View = 'home' | 'create' | 'library' | 'results'

/** Label and icon for each destination — one source of truth for wording. */
export const VIEWS: { id: View; label: string; shortLabel: string; icon: string }[] = [
  { id: 'home', label: 'Home', shortLabel: 'Home', icon: '🏠' },
  { id: 'create', label: 'Create Quiz', shortLabel: 'Create', icon: '➕' },
  { id: 'library', label: 'Quiz Library', shortLabel: 'Library', icon: '📚' },
  { id: 'results', label: 'Results', shortLabel: 'Results', icon: '📊' },
]
