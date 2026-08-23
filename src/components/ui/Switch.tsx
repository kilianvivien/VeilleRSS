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
 * 44 px de large, la taille minimale confortable au pouce sur mobile.
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
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm',
          'transition-transform duration-200 ease-out',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
