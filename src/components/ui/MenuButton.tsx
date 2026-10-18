import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
 * Menu d'actions placé hors des zones de défilement pour éviter leur découpe.
 * Navigation au clavier, retour au déclencheur sur Échap, placement borné.
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const focusLast = useRef(false)
  const hasIcons = entries.some((entry) => Boolean(entry.icon))

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const rect = trigger.getBoundingClientRect()
    const margin = 8
    const gap = 6
    const below = window.innerHeight - rect.bottom - margin - gap
    const above = rect.top - margin - gap
    const height = menu.scrollHeight
    const showAbove = placement === 'top' ? above >= height || above > below : below < height && above > below
    const maxHeight = Math.max(44, showAbove ? above : below)
    const top = showAbove ? rect.top - Math.min(height, maxHeight) - gap : rect.bottom + gap
    const left = align === 'end' ? rect.right - menu.offsetWidth : rect.left
    setPosition({ top: Math.max(margin, top), left: Math.max(margin, Math.min(left, window.innerWidth - menu.offsetWidth - margin)), maxHeight })
  }, [open, placement, align])

  useLayoutEffect(() => {
    if (!open || !position) return
    const enabled = menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!enabled) return
    ;(focusLast.current ? enabled[enabled.length - 1] : enabled[0])?.focus({ preventScroll: true })
  }, [open, position])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const close = () => setOpen(false)
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setPosition(null)
          focusLast.current = false
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          focusLast.current = event.key === 'ArrowUp'
          setPosition(null)
          setOpen(true)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(open && 'bg-[var(--hover)]', className)}
      >
        {children}
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="cst-menu fixed z-[90] w-60 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
          style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
          onKeyDown={(event) => {
            const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              buttons[next]?.focus()
            } else if (event.key === 'Escape' || event.key === 'Tab') {
              if (event.key === 'Escape') event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              triggerRef.current?.focus()
            }
          }}
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
                triggerRef.current?.focus()
                entry.onSelect()
              }}
              className={cn(
                'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors outline-none focus-visible:bg-[var(--hover-strong)] disabled:opacity-40 pointer-fine:enabled:hover:bg-[var(--hover)]',
                entry.danger ? 'text-[var(--error)]' : 'text-[var(--text-primary)]'
              )}
            >
              {hasIcons ? (
                <span aria-hidden="true" className={cn('h-4 w-4 shrink-0', entry.danger ? 'text-[var(--error)]' : 'text-[var(--text-muted)]')}>{entry.icon}</span>
              ) : null}
              {entry.label}
            </button>
          ))}
        </div>,
        triggerRef.current?.closest('[role="dialog"]') ?? document.body
      ) : null}
    </div>
  )
}
