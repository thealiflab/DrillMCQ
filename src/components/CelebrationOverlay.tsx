import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

interface CelebrationOverlayProps {
  /** Dismiss — by the button, by Escape, or by the auto-dismiss timer. */
  onDismiss: () => void
  /** How long the confetti runs before it clears itself, in ms. */
  durationMs?: number
}

const PIECE_COUNT = 70
const DEFAULT_DURATION_MS = 6000

/** Confetti colours. Deliberately not the pass green — this is decoration. */
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8', '#a855f7']

interface Piece {
  left: number
  delay: number
  duration: number
  drift: number
  spin: number
  color: string
  size: number
  round: boolean
}

/** Deterministic per-mount scatter — regenerated only when the overlay remounts. */
function buildPieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 2.4 + Math.random() * 1.8,
    drift: (Math.random() - 0.5) * 160,
    spin: 360 + Math.random() * 720,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 8,
    round: Math.random() < 0.35,
  }))
}

/**
 * A brief burst of confetti over the whole page, shown when a run passes.
 *
 * Non-blocking on purpose — unlike `Modal` this lets clicks through, so the
 * result underneath stays usable while it plays. It clears itself after
 * `durationMs`, and the Dismiss button (or Escape) ends it sooner.
 *
 * Rendered through a portal into `<body>` for the same reason `Modal` is: the
 * result screen sits inside `.animate-fade-slide-in`, whose lingering
 * `transform` would otherwise become the containing block for `position:
 * fixed` and pin the confetti inside that box.
 *
 * Users who ask for reduced motion get the dismissible banner with no falling
 * pieces at all — the CSS honours `prefers-reduced-motion`.
 */
export function CelebrationOverlay({
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
}: CelebrationOverlayProps) {
  const pieces = useMemo(buildPieces, [])

  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [onDismiss, durationMs])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDismiss])

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      <div className="confetti-field motion-reduce:hidden">
        {pieces.map((piece, index) => (
          <span
            key={index}
            className={`confetti-piece ${piece.round ? 'rounded-full' : 'rounded-[2px]'}`}
            style={
              {
                left: `${piece.left}%`,
                width: `${piece.size}px`,
                height: `${piece.size * (piece.round ? 1 : 1.6)}px`,
                backgroundColor: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
                '--confetti-drift': `${piece.drift}px`,
                '--confetti-spin': `${piece.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* The one interactive part, so the celebration is always escapable. */}
      <div className="pb-safe pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center p-4">
        <button
          type="button"
          onClick={onDismiss}
          className="animate-fade-slide-in min-h-11 rounded-full border border-slate-200 bg-white/95 px-5 py-2.5 text-sm font-semibold shadow-lg backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900/95 dark:hover:bg-slate-900"
        >
          🎉 Dismiss celebration
        </button>
      </div>
    </div>,
    document.body,
  )
}
