import { useState } from 'react'
import { Check, Download, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePwaInstall, usePwaUpdate } from '@/lib/pwa/pwaService'
import { IosInstallSteps } from './IosInstallSteps'

/**
 * Bannières PWA flottantes : mise à jour disponible et invitation à
 * installer. Positionnées au-dessus de la barre de navigation mobile, elles
 * restent discrètes et fermables.
 */
export function PwaPrompts() {
  const { context, install, dismiss } = usePwaInstall()
  const { updateReady, isApplying, applyUpdate } = usePwaUpdate()
  const [hiddenPrompt, setHiddenPrompt] = useState<'install' | 'update' | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  const activePrompt = updateReady ? 'update' : 'install'
  if (hiddenPrompt === activePrompt || (!updateReady && context === 'unsupported')) return null

  const close = () => {
    setHiddenPrompt(activePrompt)
    if (!updateReady) dismiss()
  }

  const handleInstall = async () => {
    setIsInstalling(true)
    const outcome = await install()
    setIsInstalling(false)
    if (outcome === 'dismissed') dismiss()
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+var(--mobile-tabbar-height)+0.75rem)] lg:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <section
        role={updateReady ? 'status' : 'dialog'}
        aria-label={updateReady ? 'Mise à jour disponible' : 'Installer l’application'}
        className="pwa-prompt pointer-events-auto relative flex w-full max-w-[420px] items-start gap-3 overflow-hidden rounded-[22px] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-3.5 shadow-[0_20px_55px_rgba(15,23,42,0.22)] backdrop-blur-2xl"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        <img
          src="/favicon-64.png"
          alt=""
          width={48}
          height={48}
          decoding="async"
          className="h-12 w-12 shrink-0 rounded-[13px] shadow-[0_7px_18px_rgba(47,111,228,0.3)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
            {updateReady ? 'Nouveautés prêtes' : 'Veille RSS'}
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
            {updateReady
              ? 'Une version plus récente est disponible'
              : context === 'native'
                ? 'Gardez votre veille à portée de main'
                : 'Ajoutez l’app à votre écran d’accueil'}
          </h2>
          <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-secondary)]">
            {updateReady
              ? 'Rechargez maintenant pour profiter des dernières améliorations.'
              : context === 'native'
                ? 'Lancez-la en un geste, avec une expérience plein écran plus confortable.'
                : 'Dans Safari, suivez ces deux étapes rapides :'}
          </p>

          {!updateReady && context === 'ios-manual' ? <IosInstallSteps className="mt-2" /> : null}

          <div className="mt-3 flex items-center gap-2">
            {updateReady ? (
              <Button size="sm" variant="primary" isLoading={isApplying} onClick={applyUpdate}>
                {!isApplying && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                {isApplying ? 'Mise à jour…' : 'Mettre à jour'}
              </Button>
            ) : context === 'native' ? (
              <Button
                size="sm"
                variant="primary"
                isLoading={isInstalling}
                onClick={() => void handleInstall()}
              >
                {!isInstalling && <Download className="h-3.5 w-3.5" aria-hidden="true" />}
                Installer
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={close}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> J’ai compris
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={close}>
              Plus tard
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Masquer ce message"
          className="-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    </div>
  )
}
