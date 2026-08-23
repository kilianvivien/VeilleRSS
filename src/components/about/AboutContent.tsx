import { ExternalLink, Github } from 'lucide-react'

/**
 * Mentions « À propos », rendues au bas du panneau de paramètres — sur mobile
 * comme sur bureau, depuis que l'icône « i » a quitté les barres d'outils.
 */
export function AboutContent() {
  return (
    <div className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-[var(--text-primary)]">Outil de veille RSS</span>
        <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 font-mono text-[11px] leading-4 text-[var(--text-secondary)]">
          v{__APP_VERSION__}
        </span>
      </p>
      <p>
        Application dérivée du projet{' '}
        <strong className="font-semibold text-[var(--text-primary)]">DiploRevue</strong>, dont elle
        reprend le moteur de veille dans une version web autonome.
      </p>
      <p>
        Ce logiciel est distribué sous licence MIT et fourni « en l’état », sans garantie d’aucune
        sorte.
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span>
          Conception et développement :{' '}
          <strong className="font-semibold text-[var(--text-primary)]">Kilian Vivien</strong>.
        </span>
        {/* Lien externe stylé comme un bouton « secondary » : `Button` rend un
            <button>, qui ne peut pas porter de href. */}
        <a
          href="https://github.com/kilianvivien"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-macos border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 active:scale-[0.98]"
        >
          <Github className="h-3.5 w-3.5" aria-hidden="true" />
          GitHub
          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
        </a>
      </p>
    </div>
  )
}
