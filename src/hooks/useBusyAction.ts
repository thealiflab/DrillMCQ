import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run synchronous work with a busy flag the browser actually gets to paint.
 *
 * Building a quiz — filtering by category, shuffling, writing the session to
 * localStorage, then rendering a screen full of questions — is fast but not
 * free, and on a large bank it blocks the main thread long enough to feel like
 * a stall. Flipping a `useState` flag immediately before the work does nothing
 * visible, because React batches that update into the same frame the work
 * blocks. Waiting two animation frames guarantees the spinner is on screen
 * first.
 *
 * Returns `[busy, run]`. `run` ignores a second call while one is pending, so a
 * double click can't start the work twice.
 */
export function useBusyAction(): [boolean, (work: () => void) => void] {
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback((work: () => void) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setBusy(true)

    // One frame to commit the render, a second to be sure it has been painted
    // before the work takes the thread.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          work()
        } finally {
          pendingRef.current = false
          // The work often unmounts this component (an import moves the app to
          // the setup screen), so only touch state if it is still around.
          if (mountedRef.current) setBusy(false)
        }
      })
    })
  }, [])

  return [busy, run]
}
