import { Share, SquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Marche à suivre iOS pour l'ajout à l'écran d'accueil.
 *
 * Safari n'expose pas `beforeinstallprompt` : l'installation reste manuelle.
 * Partagé entre la bannière flottante et la section « Application » des
 * paramètres, pour que les deux décrivent exactement les mêmes gestes.
 */
export function IosInstallSteps({ className }: { className?: string }) {
  return (
    <ol
      className={cn(
        'flex flex-wrap gap-1.5 text-[10px] font-medium text-[var(--text-secondary)]',
        className
      )}
    >
      <li className="flex items-center gap-1 rounded-full bg-[var(--hover)] px-2 py-1">
        <span className="text-[var(--accent)]">1</span>
        <Share className="h-3 w-3" aria-hidden="true" /> Partager
      </li>
      <li className="flex items-center gap-1 rounded-full bg-[var(--hover)] px-2 py-1">
        <span className="text-[var(--accent)]">2</span>
        <SquarePlus className="h-3 w-3" aria-hidden="true" /> Sur l’écran d’accueil
      </li>
    </ol>
  )
}
