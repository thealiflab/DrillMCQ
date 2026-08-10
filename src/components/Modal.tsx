import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  /** Id of the element naming the dialog. */
  labelledBy: string
  describedBy?: string
  onClose: () => void
  /**
   * Focused on mount. Without it focus goes to the first focusable element,
   * which for a destructive dialog should be its Cancel button.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /** Extra classes for the panel — mostly its max width. */
  panelClassName?: string
  children: React.ReactNode
}

const FOCUSABLE = 'button, [href], input:not([type="hidden"]), select, textarea'

/**
 * The shared modal shell: backdrop, capture-phase Escape, a Tab trap and
 * initial focus. Every dialog in the app (confirmations, settings) renders
 * through this so the mechanics exist once.
 *
 * Sized for a phone first — the panel scrolls internally rather than pushing
 * the page, and never exceeds the visible viewport.
 *
 * Rendered through a portal into `<body>`, which is load-bearing rather than
 * stylistic: several screens sit inside `.animate-fade-slide-in`, whose
 * lingering `transform` makes that element the containing block for
 * `position: fixed` descendants. In place, a dialog would be pinned inside
 * its screen's box instead of covering the viewport.
 */
export function Modal({
  labelledBy,
  describedBy,
  onClose,
  initialFocusRef,
  panelClassName = 'max-w-md',
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target =
      initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null
    target?.focus()
  }, [initialFocusRef])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={(e) => e.stopPropagation()}
        className={`animate-fade-slide-in max-h-[88dvh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6 dark:border-slate-800 dark:bg-slate-900 ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
