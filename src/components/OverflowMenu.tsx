import { useEffect, useRef, useState } from 'react'

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

/**
 * The "⋮" menu that keeps secondary card actions off the surface without
 * hiding them. One clear primary button stays visible next to it; everything
 * else lives here so a card never becomes a wall of equal-weight buttons.
 */
export function OverflowMenu({ label, actions }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    // A click anywhere else dismisses. Done with a document listener rather
    // than a full-screen backdrop element, because several screens sit inside
    // a transformed ancestor that would clip a `position: fixed` backdrop.
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-lg leading-none text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <span aria-hidden>⋮</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-50 mt-1 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              title={action.title}
              onClick={() => {
                setOpen(false)
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
        </div>
      )}
    </div>
  )
}
