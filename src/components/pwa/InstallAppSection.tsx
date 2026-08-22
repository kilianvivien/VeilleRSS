import { Check, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { usePwaInstall } from '@/lib/pwa/pwaService'
import { IosInstallSteps } from './IosInstallSteps'

/**
 * Point d'entrée explicite d'installation, dans les paramètres.
 *
 * La bannière flottante est soumise à un délai d'engagement et à un rejet de
 * 14 jours : sans cette section, un utilisateur qui l'a fermée une fois n'a
 * plus aucun moyen d'installer l'application depuis l'interface.
 */
export function InstallAppSection() {
  const { canPromptInstall, needsIosInstructions, isStandalone, install } = usePwaInstall()
  const [isInstalling, setIsInstalling] = useState(false)

  const handleInstall = async () => {
    setIsInstalling(true)
    try {
      await install()
    } finally {
      setIsInstalling(false)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="rss-section-label text-[var(--text-secondary)]">APPLICATION</h3>

      {isStandalone ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <Check className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" />
          Application installée — elle s’ouvre en plein écran depuis votre écran d’accueil.
        </p>
      ) : canPromptInstall ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">
            Installez l’outil pour le lancer en un geste, en plein écran, et garder vos articles
            consultables hors connexion.
          </p>
          <Button
            size="sm"
            variant="primary"
            isLoading={isInstalling}
            onClick={() => void handleInstall()}
          >
            {!isInstalling && <Download className="h-3.5 w-3.5" aria-hidden="true" />}
            Installer l’application
          </Button>
        </div>
      ) : needsIosInstructions ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">
            Dans Safari, ajoutez l’application à votre écran d’accueil :
          </p>
          <IosInstallSteps />
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">
          Utilisez le menu de votre navigateur pour installer l’application sur cet appareil.
        </p>
      )}
    </section>
  )
}
