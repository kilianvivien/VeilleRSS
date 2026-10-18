import { cn } from '@/lib/utils/cn'

/**
 * Icône de l'application (journal et ondes RSS) en deux variantes : tuile
 * violette en mode clair, tuile sombre en mode sombre. La bascule suit la
 * classe `.dark` du document, donc le réglage de thème de l'application.
 * Les fichiers sont dérivés des icônes PWA de `public/`.
 */
export function AppIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }} aria-hidden="true">
      <img src="/app-icon-light.png" alt="" width={size} height={size} decoding="async" className="absolute inset-0 dark:hidden" />
      <img src="/app-icon-dark.png" alt="" width={size} height={size} decoding="async" className="absolute inset-0 hidden dark:block" />
    </span>
  )
}
