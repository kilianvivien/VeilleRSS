import { useState } from 'react'
import { Download, RefreshCw, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePwaInstall, usePwaUpdate } from '@/lib/pwa/pwaService'

/**
 * Bannières PWA flottantes : mise à jour disponible et invitation à
 * installer. Positionnées au-dessus de la barre de navigation mobile, elles
 * restent discrètes et fermables.
 */
export function PwaPrompts() {
  return (
    <>
      <PwaUpdateBanner />
      <PwaInstallBanner />
    </>
  )
}

function PwaUpdateBanner() {
  const { updateReady, applyUpdate } = usePwaUpdate()
  if (!updateReady) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div
        role="status"
        className="glass-surface-strong flex w-full max-w-md items-center gap-2 rounded-card border border-[var(--glass-border)] px-3 py-2 shadow-lg"
      >
        <RefreshCw className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs text-[var(--text-primary)]">
          Une nouvelle version est disponible.
        </p>
        <Button size="sm" variant="primary" onClick={applyUpdate}>
          Mettre à jour
        </Button>
      </div>
    </div>
  )
}

function PwaInstallBanner() {
  const { context, install, dismiss } = usePwaInstall()
  const [manualDismissed, setManualDismissed] = useState(false)

  if (context === 'unsupported' || manualDismissed) return null

  const close = () => {
    setManualDismissed(true)
    dismiss()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[69] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="glass-surface-strong flex w-full max-w-md items-start gap-2.5 rounded-card border border-[var(--glass-border)] px-3 py-2.5 shadow-lg">
        <Download className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        {context === 'native' ? (
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Installer l’application
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)]">
              Accédez à votre veille en un geste, depuis l’écran d’accueil.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void install()}>
                Installer
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                Plus tard
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Ajouter à l’écran d’accueil
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] leading-4 text-[var(--text-secondary)]">
              Dans Safari : <Share className="inline h-3 w-3 shrink-0" aria-hidden="true" />
              Partager puis{' '}
              <SquarePlus className="inline h-3 w-3 shrink-0" aria-hidden="true" />
              « Sur l’écran d’accueil ».
            </p>
            <div className="mt-2">
              <Button size="sm" variant="ghost" onClick={close}>
                J’ai compris
              </Button>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Masquer ce message"
          className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
