import { useEffect, useState } from 'react'

/**
 * Countdown for timed quizzes, anchored to the session's start timestamp so
 * a page refresh doesn't reset the clock.
 *
 * Returns remaining seconds, or null when the quiz is untimed.
 * Calls `onExpire` once when time runs out.
 */
export function useTimer(
  startedAt: number,
  timerMinutes: number,
  active: boolean,
  onExpire: () => void,
): number | null {
  const totalSeconds = timerMinutes * 60

  const compute = () =>
    Math.max(0, totalSeconds - Math.floor((Date.now() - startedAt) / 1000))

  const [remaining, setRemaining] = useState<number>(compute)

  useEffect(() => {
    if (!active || timerMinutes <= 0) return
    setRemaining(compute())
    const id = setInterval(() => setRemaining(compute()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, timerMinutes, active])

  useEffect(() => {
    if (active && timerMinutes > 0 && remaining === 0) onExpire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, active, timerMinutes])

  return timerMinutes > 0 ? remaining : null
}
