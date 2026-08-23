import { useState } from 'react'
import { ChevronDown, Copy, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react'
import { copyToClipboard } from '@/lib/platform/clipboardService'
import { cn } from '@/lib/utils/cn'

/**
 * Écran de récupération affiché par `AppErrorBoundary`.
 *
 * Volontairement sans dépendance au reste de l'application : si un store ou
 * un composant partagé est la cause du plantage, l'écran censé le rattraper
 * ne doit pas tomber avec lui. D'où le HTML nu plutôt que `Button`/`Modal`,
 * et les jetons de thème employés directement.
 */
export function AppCrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)

  // V8 préfixe déjà la pile par « Nom: message » — on évite le doublon.
  const headline = `${error.name}: ${error.message}`
  const stack = error.stack ?? ''
  const report = [
    `Outil de veille RSS — v${__APP_VERSION__}`,
    stack.startsWith(headline) ? stack : [headline, stack].filter(Boolean).join('\n'),
  ].join('\n')

  const handleCopy = async () => {
    try {
      await copyToClipboard(report)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Presse-papiers refusé : le texte reste sélectionnable à la main. */
    }
  }

  /**
   * Sortie de secours quand un réglage corrompu fait replanter à chaque
   * chargement. Ne touche qu'au `localStorage` : les articles vivent dans
   * IndexedDB et survivent à l'opération.
   */
  const handleReset = () => {
    try {
      window.localStorage.clear()
    } catch {
      /* Stockage indisponible — le rechargement reste la seule option. */
    }
    window.location.reload()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg-primary)] px-5 py-10">
      <main className="w-full max-w-lg">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.14)] sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </div>

          <h1 className="mt-5 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
            L’application s’est interrompue
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Un incident inattendu a coupé l’affichage. Vos flux, vos articles et vos réglages sont
            enregistrés dans ce navigateur : ils n’ont pas été perdus.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-macos border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-muted)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_26%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Recharger l’application
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-macos border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Réessayer
            </button>
          </div>

          {/* Détails techniques : repliés par défaut, à copier pour un rapport. */}
          <div className="mt-5 overflow-hidden rounded-lg border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setDetailsOpen((current) => !current)}
              aria-expanded={detailsOpen}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            >
              <span className="min-w-0 flex-1">Détails techniques</span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-200',
                  detailsOpen && 'rotate-180'
                )}
              />
            </button>
            {detailsOpen ? (
              <div className="space-y-2 border-t border-[var(--border)] p-3">
                <pre className="max-h-52 overflow-auto rounded-md bg-[var(--hover)] p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-[var(--text-secondary)]">
                  {report}
                </pre>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-macos border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied ? 'Copié' : 'Copier les détails'}
                </button>
              </div>
            ) : null}
          </div>

          {/* Dernier recours, en deux temps : un seul clic ne peut pas
              emporter les clés API par mégarde. */}
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            {resetArmed ? (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  Cette réinitialisation efface vos réglages et vos clés API. Vos flux et vos
                  articles enregistrés sont conservés.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex h-9 items-center rounded-macos border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400"
                  >
                    Confirmer la réinitialisation
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetArmed(false)}
                    className="inline-flex h-9 items-center rounded-macos px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setResetArmed(true)}
                className="text-xs font-medium text-[var(--text-muted)] underline underline-offset-2 transition-colors hover:text-[var(--text-secondary)]"
              >
                Le problème persiste à chaque chargement ? Réinitialiser les réglages
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
