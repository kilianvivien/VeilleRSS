import type { ButtonHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils/cn'
import { LoadingSpinner } from './LoadingSpinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass' | 'tinted'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

/**
 * Multi-variant button component with loading states
 * Supports primary, secondary, danger, ghost, glass, and tinted variants
 * Includes smooth animations and disabled states
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        data-ui-button="true"
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium',
          'transition-all duration-150 active:scale-[0.98]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          {
            // Variants
            // Action principale « Constellation » : pastille pleine, contraste inversé.
            'bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold hover:opacity-90 focus-visible:ring-[var(--focus-ring)]':
              variant === 'primary',
            'bg-transparent text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--hover)] focus-visible:ring-[var(--focus-ring)]':
              variant === 'secondary',
            'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 focus-visible:ring-red-500/40':
              variant === 'danger',
            'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)] focus-visible:ring-[var(--focus-ring)]':
              variant === 'ghost',
            'glass-surface text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] focus-visible:ring-[var(--focus-ring)]':
              variant === 'glass',
            'bg-[var(--accent-muted)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] focus-visible:ring-[var(--focus-ring)]':
              variant === 'tinted',
            // Sizes
            'h-9 px-2.5 text-xs gap-1': size === 'sm',
            'h-9 px-3 text-sm gap-1.5': size === 'md',
            'h-10 px-4 text-sm gap-2': size === 'lg',
          },
          className
        )}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading && <LoadingSpinner size={size === 'lg' ? 'md' : 'sm'} />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
