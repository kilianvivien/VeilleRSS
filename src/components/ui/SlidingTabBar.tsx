import { useRef, useLayoutEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export interface SlideTab<T extends string> {
  value: T
  label: string
  ariaLabel?: string
  icon?: ReactNode
  title?: string
}

interface SlidingTabBarProps<T extends string> {
  value: T
  onChange: (value: T) => void
  tabs: SlideTab<T>[]
  disabled?: boolean
  /** Size preset controlling padding/font-size */
  size?: 'xs' | 'sm' | 'md'
  /** Class for the outer container (replaces the default glass style) */
  containerClassName?: string
  /** Extra class applied to every tab button */
  tabClassName?: string
}

/**
 * Tab bar where the active highlight slides smoothly between variable-width tabs.
 * Uses DOM measurement so tabs can have different widths.
 */
export function SlidingTabBar<T extends string>({
  value,
  onChange,
  tabs,
  disabled,
  size = 'md',
  containerClassName,
  tabClassName,
}: SlidingTabBarProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [slider, setSlider] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const idx = tabs.findIndex((t) => t.value === value)
    const buttons = container.querySelectorAll<HTMLButtonElement>(':scope > button')
    const btn = buttons[idx]
    if (!btn) return
    setSlider({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [value, tabs])

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-card glass-surface relative inline-flex border border-[var(--glass-border)] p-1',
        containerClassName
      )}
    >
      {/* Sliding highlight pill */}
      {slider && (
        <div
          aria-hidden="true"
          className="rounded-macos pointer-events-none absolute top-1 bottom-1 bg-[var(--accent-muted)] shadow-sm transition-all duration-200 ease-out"
          style={{ left: slider.left, width: slider.width }}
        />
      )}

      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(tab.value)}
            title={tab.title}
            aria-label={tab.ariaLabel}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'rounded-macos relative z-10 flex items-center gap-1.5 font-medium whitespace-nowrap',
              'transition-colors duration-200',
              size === 'xs'
                ? 'px-3 py-1.5 text-xs'
                : size === 'sm'
                  ? 'px-3 py-2 text-xs'
                  : 'px-4 py-2 text-sm',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              tabClassName
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
