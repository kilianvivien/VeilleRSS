import { useState } from 'react'
import { Check, Download, MoreHorizontal } from 'lucide-react'
import { usePwaInstall } from '@/lib/pwa/pwaService'
import { IosInstallSteps } from '@/components/pwa/IosInstallSteps'

/**
 * Marche à suivre d'installation, adaptée au navigateur en cours.
 *
 * Chrome/Edge exposent une invite native ; Safari iOS impose le passage par
 * le menu Partager ; le reste n'offre qu'un chemin manuel. Afficher les trois
 * en même temps embrouillerait plus qu'autre chose.
 */
export function InstallStepActions() {
  const { canPromptInstall, needsIosInstructions, isStandalone, install } = usePwaInstall()
  const [isInstalling, setIsInstalling] = useState(false)

  if (isStandalone) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--success)]">
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        C’est déjà fait : vous utilisez l’application installée.
      </p>
    )
  }

  if (canPromptInstall) {
    return (
      <button
        type="button"
        disabled={isInstalling}
        onClick={() => {
          setIsInstalling(true)
          void install().finally(() => setIsInstalling(false))
        }}
        className="inline-flex h-10 items-center gap-2 rounded-macos border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-muted)] px-3.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_26%,transparent)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {isInstalling ? 'Installation…' : 'Installer l’application'}
      </button>
    )
  }

  if (needsIosInstructions) {
    return (
      <div className="space-y-1.5">
        <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
          Dans Safari, touchez le bouton Partager, puis :
        </p>
        <IosInstallSteps className="text-[11px]" />
      </div>
    )
  }

  return (
    <p className="flex items-start gap-1.5 text-[13px] leading-5 text-[var(--text-secondary)]">
      <MoreHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
      <span>
        Ouvrez le menu de votre navigateur, puis « Installer l’application » ou « Ajouter à l’écran
        d’accueil ».
      </span>
    </p>
  )
}
