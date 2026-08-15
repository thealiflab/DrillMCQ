import { useEffect, useState } from 'react'

interface ScoreRingProps {
  /** Score to fill the ring to, 0–100. */
  percentage: number
  /** Threshold marked on the track, 0–100. */
  passPercentage: number
  passed: boolean
}

/** Geometry of the SVG. Everything scales off the viewBox, not pixels. */
const SIZE = 120
const STROKE = 10
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Point on the ring for a percentage, in the SVG's own frame — 0% at 3
 * o'clock, like `stroke-dasharray`. The `-rotate-90` on the `<svg>` turns both
 * of them up to 12 o'clock together.
 */
function pointAt(percentage: number, radius: number): { x: number; y: number } {
  const angle = (percentage / 100) * 2 * Math.PI
  return {
    x: SIZE / 2 + radius * Math.cos(angle),
    y: SIZE / 2 + radius * Math.sin(angle),
  }
}

/**
 * The score as a circular progress ring with the percentage in the middle, and
 * a tick on the track showing where the pass mark sits — so "82% against a pass
 * mark of 70%" is one glance rather than two numbers to compare.
 *
 * Green when the run passed, amber when it didn't: the ring and the verdict
 * carry the same colour, and neither is the only thing saying which it was.
 */
export function ScoreRing({ percentage, passPercentage, passed }: ScoreRingProps) {
  // Sweep from empty on mount. Held in state rather than done with a CSS
  // keyframe so the target length is whatever this score is.
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const clamped = Math.min(100, Math.max(0, percentage))
  const dash = (clamped / 100) * CIRCUMFERENCE
  const mark = pointAt(Math.min(100, Math.max(0, passPercentage)), RADIUS)

  return (
    <div className="relative mx-auto size-36 sm:size-44">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-full -rotate-90"
        role="img"
        aria-label={`Score ${clamped}%, pass mark ${passPercentage}%`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={CIRCUMFERENCE - (filled ? dash : 0)}
          className={`transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none ${
            passed
              ? 'stroke-green-500 dark:stroke-green-400'
              : 'stroke-amber-500 dark:stroke-amber-400'
          }`}
        />
        {/* Pass-mark tick, drawn last so it stays visible over the fill. */}
        <circle
          cx={mark.x}
          cy={mark.y}
          r={STROKE / 2 - 1.5}
          className="fill-slate-500 dark:fill-slate-300"
        />
      </svg>

      {/* The score only — the pass mark is spelled out beside the ring, and
          repeating it here just crowds the middle. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums sm:text-4xl">{clamped}%</span>
        <span className="mt-0.5 text-[11px] font-medium text-slate-500 sm:text-xs dark:text-slate-400">
          score
        </span>
      </div>
    </div>
  )
}
