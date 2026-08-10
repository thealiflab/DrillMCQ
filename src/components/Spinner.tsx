interface SpinnerProps {
  /** Tailwind size class. Defaults to matching the surrounding text. */
  className?: string
  /**
   * Announced to screen readers. Pass `null` when neighbouring text already
   * says what is happening, so it isn't read out twice.
   */
  label?: string | null
}

/**
 * The one spinning circle in the app.
 *
 * `currentColor` throughout, so it takes the colour of whatever it sits in and
 * needs no dark-mode variant. Inline-block and sized in `em` by default, so it
 * lines up with button text without any layout shift when it appears.
 */
export function Spinner({ className = 'size-4', label = 'Working' }: SpinnerProps) {
  return (
    <svg
      className={`inline-block shrink-0 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role={label === null ? undefined : 'status'}
      aria-label={label ?? undefined}
      aria-hidden={label === null}
    >
      {/* The full ring, faint — it's the track the bright arc travels around. */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
