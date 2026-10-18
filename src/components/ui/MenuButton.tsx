import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export interface MenuEntry {
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Action destructrice : affichée en couleur d'erreur. */
  danger?: boolean
}

interface MenuButtonProps {
  /** Nom accessible du bouton d'ouverture. */
  label: string
  entries: MenuEntry[]
  children: ReactNode
  className?: string
  /** Ouverture vers le haut (pied de rail) ou vers le bas (lignes de liste). */
  placement?: 'top' | 'bottom'
  align?: 'start' | 'end'
}

/**
 * Menu d'actions léger : un bouton, une liste flottante, fermeture au clic
 * extérieur ou sur Échap. Suffisant pour des actions secondaires, sans
 * dépendance supplémentaire.
 */
export function MenuButton({
  label,
  entries,
  children,
  className,
  placement = 'bottom',
  align = 'end',
}: MenuButtonProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(open && 'bg-[var(--hover)]', className)}
      >
        {children}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'cst-menu absolute z-40 w-60 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-1.5',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {entries.map((entry) => (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              disabled={entry.disabled}
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                entry.onSelect()
              }}
              className={cn(
                'flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] transition-colors disabled:opacity-40 pointer-fine:enabled:hover:bg-[var(--hover)]',
                entry.danger ? 'text-[var(--error)]' : 'text-[var(--text-primary)]'
              )}
            >
              {entry.icon ? (
                <span className={entry.danger ? 'text-[var(--error)]' : 'text-[var(--text-muted)]'}>{entry.icon}</span>
              ) : null}
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
