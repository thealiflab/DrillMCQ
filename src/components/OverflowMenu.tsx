import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface MenuAction {
  label: string
  onSelect: () => void
  /** Rendered in red — still routed through `ConfirmDialog` by the caller. */
  danger?: boolean
  disabled?: boolean
  /** Explains a disabled item on hover. */
  title?: string
}

interface OverflowMenuProps {
  /** Screen-reader name for the trigger, e.g. "More actions for Biology MCQ". */
  label: string
  actions: MenuAction[]
}

/** Gap between the trigger and the panel, and the minimum breathing room at the viewport edges. */
const GAP = 4
const EDGE = 8

interface Placement {
  top: number
  left: number
  maxHeight: number
}

/**
 * The "⋮" menu that keeps secondary card actions off the surface without
 * hiding them. One clear primary button stays visible next to it; everything
 * else lives here so a card never becomes a wall of equal-weight buttons.
 *
 * The panel is **portalled into `<body>` and positioned `fixed`** rather than
 * absolutely inside the trigger's card. Cards clip their own corners with
 * `overflow-hidden` (the results list does), which would slice an absolutely
 * positioned panel in half; the portal escapes that, and `<body>` is also the
 * only reliable containing block for `fixed` on screens whose animation
 * transforms would otherwise capture it. Placement is measured every time the
 * menu opens — and re-measured on scroll and resize — so the last row of a list
 * flips its menu **upward** instead of pushing it off the bottom of the screen.
 */
export function OverflowMenu({ label, actions }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /**
   * The panel's unconstrained height, captured on the first (hidden) measuring
   * pass of each open cycle. Re-measuring later would read the height *after*
   * `maxHeight` clamped it, and the flip decision would then feed on its own
   * output — a menu that fitted below once would look like it always fits.
   */
  const naturalHeightRef = useRef(0)

  const close = useCallback((refocus = false) => {
    setOpen(false)
    setPlacement(null)
    naturalHeightRef.current = 0
    if (refocus) triggerRef.current?.focus()
  }, [])

  const reposition = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (trigger === null || menu === null) return

    const anchor = trigger.getBoundingClientRect()
    const rect = menu.getBoundingClientRect()
    if (naturalHeightRef.current === 0) naturalHeightRef.current = rect.height
    const height = naturalHeightRef.current
    const width = rect.width
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth

    const spaceBelow = viewportH - anchor.bottom - GAP - EDGE
    const spaceAbove = anchor.top - GAP - EDGE
    // Below by default; upward only when it doesn't fit below and genuinely
    // fits better above. Either way the panel scrolls internally rather than
    // spilling past the viewport, so every item stays reachable.
    const openUp = height > spaceBelow && spaceAbove > spaceBelow
    const maxHeight = Math.max(96, openUp ? spaceAbove : spaceBelow)
    const shownHeight = Math.min(height, maxHeight)

    const top = openUp ? Math.max(EDGE, anchor.top - GAP - shownHeight) : anchor.bottom + GAP
    // Right-aligned to the trigger, then clamped so a card near the left edge
    // (narrow phones) can't push the panel off-screen.
    const left = Math.min(
      Math.max(EDGE, anchor.right - width),
      Math.max(EDGE, viewportW - width - EDGE),
    )

    setPlacement((prev) =>
      prev !== null && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight },
    )
  }, [])

  // Layout effect: measure and place before the browser paints, so the panel
  // never appears in the wrong spot for a frame.
  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    // A click anywhere else dismisses. Done with a document listener rather
    // than a full-screen backdrop element, because several screens sit inside
    // a transformed ancestor that would clip a `position: fixed` backdrop.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      close()
    }
    // `true` on scroll catches scrolling containers, not just the window.
    const onReflow = () => reposition()

    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open, close, reposition])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-lg leading-none text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <span aria-hidden>⋮</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={
              placement === null
                ? // First pass: laid out but not painted, purely to be measured.
                  { top: 0, left: 0, visibility: 'hidden' }
                : { top: placement.top, left: placement.left, maxHeight: placement.maxHeight }
            }
            className="fixed z-50 min-w-44 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                title={action.title}
                onClick={() => {
                  close()
                  action.onSelect()
                }}
                className={`block w-full px-4 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  action.danger
                    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
