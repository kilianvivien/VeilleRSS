import type { ReactNode } from 'react'
import { forwardRef } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SelectOption {
  value: string
  label: string
  icon?: ReactNode
  description?: string
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
  error?: string
  disabled?: boolean
  className?: string
}

/**
 * Dropdown select component using Radix UI
 * Supports icons, descriptions, and custom styling
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder = 'Sélectionner...',
      size = 'md',
      label,
      error,
      disabled,
      className,
    },
    ref
  ) => {
    return (
      <div className={cn('w-full', className)}>
        {label && (
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {label}
          </label>
        )}

        <SelectPrimitive.Root
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            className={cn(
              'flex w-full items-center justify-between border bg-[var(--surface)] text-[var(--text-primary)]',
              'transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-offset-1',
              'disabled:bg-[var(--hover)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed',
              {
                'h-8 rounded-macos px-2.5 text-xs': size === 'sm',
                'rounded-lg px-3 py-2 text-sm': size === 'md',
                'h-12 rounded-lg px-3 text-sm': size === 'lg',
              },
              {
                'border-[var(--border)] focus:border-[var(--accent)] focus:ring-[var(--focus-ring)]':
                  !error,
                'border-accent-red focus:border-accent-red focus:ring-accent-red/20':
                  error,
              }
            )}
          >
            <SelectPrimitive.Value placeholder={placeholder} />
            <SelectPrimitive.Icon>
              <ChevronDown
                className={cn('text-[var(--text-muted)]', {
                  'h-3.5 w-3.5': size === 'sm',
                  'h-4 w-4': size === 'md' || size === 'lg',
                })}
              />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              className={cn(
                'relative z-50 min-w-[8rem] overflow-hidden rounded-card glass-surface-strong',
                'animate-in fade-in-80 slide-in-from-top-1'
              )}
              position="popper"
              side="bottom"
              sideOffset={4}
              avoidCollisions={false}
            >
              <SelectPrimitive.Viewport className="p-1 max-h-[min(320px,var(--radix-select-content-available-height))] overflow-y-auto">
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    className={cn(
                      'relative flex w-full cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none text-[var(--text-primary)]',
                      'transition-colors duration-150',
                      'focus:bg-[var(--hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
                    )}
                  >
                    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                      <SelectPrimitive.ItemIndicator>
                        <Check className="h-4 w-4 text-accent-blue" />
                      </SelectPrimitive.ItemIndicator>
                    </span>

                    <div className="flex items-center gap-2">
                      {option.icon && (
                        <span className="text-[var(--text-secondary)]">{option.icon}</span>
                      )}
                      <div className="flex flex-col">
                        <SelectPrimitive.ItemText>
                          {option.label}
                        </SelectPrimitive.ItemText>
                        {option.description && (
                          <span className="text-xs text-[var(--text-secondary)]">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>

        {error && <p className="mt-1.5 text-sm text-accent-red">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
