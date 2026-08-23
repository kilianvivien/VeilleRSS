import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Info, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Explication de « clé API » à l'usage d'un lecteur non technique.
 *
 * Deux contraintes dictent la mécanique :
 *
 * - **Ouverture au clic**, pas au survol : au doigt, un survol n'existe pas.
 * - **Bulle rendue dans un portail**, positionnée en `fixed`. La carte du
 *   tutoriel porte `overflow: hidden` au-delà de `sm` ; une bulle en
 *   `absolute` s'y ferait trancher net. Le portail la sort de tout conteneur
 *   découpant, au prix d'un calcul de position explicite.
 *
 * Pas de fermeture par Échap : dans la modale du tutoriel la touche appartient
 * déjà à Radix, et la lui disputer fermerait tantôt la bulle, tantôt tout.
 */

const PROVIDERS = [
  { label: 'Google AI Studio', href: 'https://aistudio.google.com/apikey' },
  { label: 'Mistral', href: 'https://console.mistral.ai/api-keys' },
  { label: 'OpenRouter', href: 'https://openrouter.ai/keys' },
]

const PANEL_MAX_WIDTH = 320
const VIEWPORT_MARGIN = 10
/** Hauteur supposée pour choisir un côté avant la première mesure. */
const ESTIMATED_PANEL_HEIGHT = 320

interface PanelPosition {
  top: number
  left: number
  width: number
  arrowLeft: number
  above: boolean
}

export function ApiKeyInfo({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
    const height = panelRef.current?.offsetHeight ?? ESTIMATED_PANEL_HEIGHT

    const spaceBelow = window.innerHeight - rect.bottom
    const above = spaceBelow < height + 16 && rect.top > spaceBelow

    const anchorX = rect.left + rect.width / 2
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(anchorX - width / 2, window.innerWidth - width - VIEWPORT_MARGIN)
    )

    setPosition({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left,
      width,
      // Ramenée dans la bulle : près d'un bord, l'ancre n'est plus au centre.
      arrowLeft: Math.max(14, Math.min(anchorX - left, width - 14)),
      above,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    // `capture` : un défilement dans un conteneur interne ne remonte pas.
    const onReflow = () => updatePosition()

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, updatePosition])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Qu’est-ce qu’une clé API ?"
        className={cn(
          'inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full border align-middle transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
          open
            ? 'border-transparent bg-[var(--accent)] text-white'
            : 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]',
          className
        )}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="note"
              style={{
                position: 'fixed',
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                width: position?.width ?? PANEL_MAX_WIDTH,
                transform: position?.above ? 'translateY(-100%)' : undefined,
                visibility: position ? 'visible' : 'hidden',
              }}
              className="z-[100] max-h-[min(26rem,80vh)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.22)]"
            >
              {/* Pointe rattachant la bulle au bouton. */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute h-2 w-2 rotate-45 border-[var(--border)] bg-[var(--surface-elevated)]',
                  position?.above
                    ? '-bottom-[5px] border-r border-b'
                    : '-top-[5px] border-t border-l'
                )}
                style={{ left: (position?.arrowLeft ?? 0) - 4 }}
              />

              <div className="flex items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}
                >
                  <KeyRound className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Qu’est-ce qu’une clé API ?
                </p>
              </div>

              <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                Une longue suite de caractères qui autorise cette application à utiliser un service
                d’intelligence artificielle en votre nom — un mot de passe réservé à une seule
                application.
              </p>

              <p className="mt-3 text-[11px] font-semibold tracking-[0.08em] text-[var(--text-muted)] uppercase">
                Comment en obtenir une
              </p>
              <ol className="mt-1.5 space-y-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                {[
                  'Créez un compte gratuit chez un fournisseur.',
                  'Ouvrez sa page « API keys » et créez une clé.',
                  'Copiez-la, puis collez-la dans les paramètres.',
                ].map((text, index) => (
                  <li key={text} className="flex gap-2">
                    <span className="font-semibold text-[var(--accent)] tabular-nums">
                      {index + 1}.
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {PROVIDERS.map((provider) => (
                  <a
                    key={provider.href}
                    href={provider.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    {provider.label}
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
                  </a>
                ))}
              </div>

              <p className="mt-3 border-t border-[var(--border)] pt-2 text-[11px] leading-4 text-[var(--text-muted)]">
                Votre clé reste dans ce navigateur et n’est transmise qu’au fournisseur que vous
                choisissez.
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
