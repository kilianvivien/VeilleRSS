import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export interface Segment<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: Segment<T>[]
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Shared segmented control component with glass material and sliding highlight
 * Replaces ad-hoc inline segmented toggles across views
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const selectedIndex = options.findIndex((opt) => opt.value === value)
  const segmentWidthPct = `${100 / options.length}%`

  return (
    <div
      className={cn(
        'relative inline-flex rounded-full border border-[var(--glass-border)] p-[3px] glass-surface',
        className
      )}
    >
      {/* Sliding highlight pill */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[3px] rounded-full"
        style={{ width: segmentWidthPct }}
      >
        <div
          className="h-full w-full rounded-full bg-[var(--text-primary)] shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${selectedIndex * 100}%)` }}
        />
      </div>

      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            style={{ width: segmentWidthPct }}
            className={cn(
              'relative z-10 flex-1 rounded-full font-medium flex items-center justify-center gap-1.5 whitespace-nowrap',
              'transition-colors duration-200',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              active
                ? 'text-[var(--bg-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
