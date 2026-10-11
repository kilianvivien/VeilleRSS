import { ExternalLink } from 'lucide-react'

/** lucide-react 1.x ne fournit plus d'icônes de marque : le logo est dessiné ici. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

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
          <GithubMark className="h-3.5 w-3.5" />
          GitHub
          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
        </a>
      </p>
    </div>
  )
}
