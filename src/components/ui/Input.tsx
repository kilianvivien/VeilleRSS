import type { InputHTMLAttributes, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

/**
 * Text input component with validation states and icon support.
 * Forwards its ref, so it works with any form library; supports error/helper text.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      className,
      type = 'text',
      disabled,
      id: providedId,
      'aria-describedby': describedBy,
      ...props
    },
    ref
  ) => {
    const hasError = !!error
    const generatedId = useId()
    const id = providedId ?? generatedId

    return (
      <div className="min-w-0 w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            data-ui-text-input="true"
            aria-invalid={hasError || undefined}
            aria-describedby={[describedBy, error || helperText ? `${id}-help` : null].filter(Boolean).join(' ') || undefined}
            type={type}
            disabled={disabled}
            className={cn(
              'w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]',
              'transition-all duration-150',
              'placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:ring-2 focus:ring-offset-1',
              'disabled:bg-[var(--hover)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed',
              {
                // Default state
                'border-[var(--border)] focus:border-[var(--accent)] focus:ring-[var(--focus-ring)]':
                  !hasError,
                // Error state
                'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--focus-ring)]':
                  hasError,
                // Icon padding
                'pl-10': leftIcon,
                'pr-10': rightIcon,
              },
              className
            )}
            {...props}
          />

          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>

        {(error || helperText) && (
          <p
            id={`${id}-help`}
            role={hasError ? 'alert' : undefined}
            className={cn('mt-1.5 text-sm', {
              'text-[var(--error)]': hasError,
              'text-[var(--text-secondary)]': !hasError,
            })}
          >
            {error || helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
