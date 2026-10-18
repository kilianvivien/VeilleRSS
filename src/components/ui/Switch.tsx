import { cn } from '@/lib/utils/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Libellé accessible : requis quand aucun texte visible n'accompagne le rail. */
  label: string
  disabled?: boolean
  className?: string
}

/**
 * Interrupteur marche/arrêt façon iOS.
 *
 * Un `role="switch"` natif plutôt qu'une case à cocher stylée : la cible fait
 * 44 × 44 px, autour d’un rail visuel de 24 px de haut.
 */
export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-11 w-11 shrink-0 items-center rounded-full',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      <span aria-hidden="true" className={cn('pointer-events-none absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 rounded-full transition-colors duration-200', checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]')} />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none relative inline-block h-5 w-5 rounded-full bg-white shadow-sm',
          'transition-transform duration-200 ease-out',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
