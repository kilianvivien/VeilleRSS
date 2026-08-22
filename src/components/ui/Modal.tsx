import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  bodyClassName?: string
  hideCloseButton?: boolean
  disableDismiss?: boolean
}

/**
 * Modal dialog component using Radix UI
 * Features smooth liquid-glass animation without background blur
 * Supports custom sizes and footer actions
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  bodyClassName,
  hideCloseButton = false,
  disableDismiss = false,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 pointer-events-none modal-overlay'
          )}
        />

        {/* Content — sur mobile : feuille glissant du bas ; ≥ sm : carte centrée. */}
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            if (disableDismiss) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (disableDismiss) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (disableDismiss) {
              event.preventDefault()
            }
          }}
          className={cn(
            'fixed inset-0 z-50 grid pointer-events-none modal-content-root',
            'items-end sm:items-center',
            'p-0 sm:p-6'
          )}
        >
          <div
            className={cn(
              'relative pointer-events-auto w-full glass-surface-strong modal-glass-shell modal-content-shell',
              'border border-[var(--glass-border)]',
              'transform-gpu will-change-[transform,opacity]',
              'rounded-t-overlay border-b-0 sm:border-b sm:rounded-b-overlay sm:rounded-overlay',
              'max-h-[92dvh] overflow-y-auto sm:max-h-none sm:overflow-hidden',
              {
                'sm:max-w-sm': size === 'sm',
                'sm:max-w-md': size === 'md',
                'sm:max-w-2xl': size === 'lg',
                'sm:max-w-4xl': size === 'xl',
              },
              className
            )}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(255,255,255,0.16),transparent_56%)]"
            />

            {/* Hidden description for accessibility - required by Radix UI */}
            {!title && (
              <Dialog.Title className="sr-only">
                {description || 'Fenêtre de dialogue'}
              </Dialog.Title>
            )}
            <Dialog.Description className="sr-only">
              {description || 'Modal dialog'}
            </Dialog.Description>

            {/* Header */}
            {(title || description) && (
              <div className="relative z-10 px-6 pt-6 pb-4 pr-14">
                {title && (
                  <Dialog.Title className="text-[17px] font-semibold text-[var(--text-primary)] leading-snug">
                    {title}
                  </Dialog.Title>
                )}
                {description && (
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {description}
                  </p>
                )}
              </div>
            )}

            {/* Close button — macOS pill style */}
            {!hideCloseButton && (
              <Dialog.Close
                className={cn(
                  'absolute right-4 top-4 z-20 w-7 h-7 rounded-full flex items-center justify-center',
                  'bg-[var(--surface-alt)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                  'hover:bg-[var(--hover)] transition-all duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]'
                )}
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Fermer</span>
              </Dialog.Close>
            )}

            {/* Body */}
            {children && (
              <div
                className={cn(
                  'relative z-10 px-6 pb-4',
                  !(title || description) && 'pt-6',
                  bodyClassName
                )}
              >
                {children}
              </div>
            )}

            {/* Footer — marge basse étendue au-dessus de la barre de geste mobile. */}
            {footer && (
              <div className="relative z-10 flex items-center justify-end gap-2 border-t border-[var(--glass-border)] px-6 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
                {footer}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
