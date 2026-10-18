import { memo, useCallback, useRef, useState } from 'react'
import { Bookmark, BookmarkCheck, Check, Languages, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { usePointerSwipe } from '@/lib/hooks/usePointerSwipe'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import type { RssDensity, RssFeed, RssItem } from '@/types/rss'
import { formatRelativeDate } from './rssFormatting'

interface RssArticleRowProps {
  item: RssItem
  feed?: RssFeed
  selected: boolean
  active: boolean
  density: RssDensity
  /** Titre traduit affiché à la place de l’original quand une traduction est en cache. */
  displayTitle: string
  displaySummary: string
  /**
   * Les rappels reçoivent l’article : le parent peut ainsi passer des
   * fonctions stables, et `memo` évite de repeindre toute la liste quand un
   * seul article change d’état.
   */
  onOpen: (item: RssItem) => void
  onSelectedChange: (itemId: string, checked: boolean) => void
  onToggleSaved: (itemId: string) => void
  /** Balayage vers la droite : bascule lu / non lu. Mobile uniquement. */
  onSwipeToggleRead?: (item: RssItem) => void
  /** Balayage vers la gauche : sauvegarde. Mobile uniquement. */
  onSwipeToggleSaved?: (itemId: string) => void
}

/** Au-delà, la ligne cesse de suivre le doigt : le geste est déjà lisible. */
const MAX_SWIPE_OFFSET = 120

/**
 * Ligne d’article de la liste centrale. En mode compact, une seule ligne de
 * résumé : on tient deux fois plus de titres à l’écran pour le tri du matin.
 *
 * Sur mobile, la ligne se balaie : à droite pour basculer lu / non lu, à
 * gauche pour sauvegarder. La distance de validation est volontairement plus
 * élevée que pour un retour — une liste se parcourt surtout verticalement, un
 * faux positif y coûte cher.
 */
export const RssArticleRow = memo(function RssArticleRow({
  item,
  feed,
  selected,
  active,
  density,
  displayTitle,
  displaySummary,
  onOpen,
  onSelectedChange,
  onToggleSaved,
  onSwipeToggleRead,
  onSwipeToggleSaved,
}: RssArticleRowProps) {
  const isUnread = !item.readAt
  const isCompact = density === 'compact'

  const rowRef = useRef<HTMLLIElement>(null)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [swipeOffset, setSwipeOffset] = useState(0)
  const swipeEnabled = Boolean(onSwipeToggleRead || onSwipeToggleSaved)

  const handleSwipeRight = useCallback(() => onSwipeToggleRead?.(item), [item, onSwipeToggleRead])
  const handleSwipeLeft = useCallback(() => onSwipeToggleSaved?.(item.id), [item.id, onSwipeToggleSaved])

  usePointerSwipe(rowRef, {
    enabled: swipeEnabled,
    commitDistance: 88,
    // Une ligne n'est pas au bord de l'écran : pas de conflit avec le
    // geste « retour » du système, la garde de bord serait contre-productive.
    edgeGuardPx: 0,
    onSwipeRight: onSwipeToggleRead ? handleSwipeRight : undefined,
    onSwipeLeft: onSwipeToggleSaved ? handleSwipeLeft : undefined,
    onMove: prefersReducedMotion
      ? undefined
      : (state) =>
          setSwipeOffset(Math.max(-MAX_SWIPE_OFFSET, Math.min(MAX_SWIPE_OFFSET, state.dx))),
  })

  return (
    <li
      ref={rowRef}
      // Repère du recentrage quand on sort du lecteur après avoir balayé
      // d'un article à l'autre : la liste doit rouvrir sur le dernier lu.
      data-item-id={item.id}
      className={cn(
        'group relative overflow-hidden border-b border-[var(--border)] transition-colors',
        active ? 'bg-[var(--accent-muted)]' : 'pointer-fine:hover:bg-[var(--hover)]',
        selected && !active && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]',
        swipeEnabled && 'touch-pan-y'
      )}
    >
      {isUnread ? (
        <span className="absolute left-0 top-0 h-full w-0.5 bg-[var(--accent)]" aria-hidden="true" />
      ) : null}

      {/* Intentions révélées derrière la ligne pendant le balayage. */}
      {swipeOffset !== 0 ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-between px-4"
          aria-hidden="true"
        >
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]',
              swipeOffset <= 0 && 'invisible'
            )}
          >
            {item.readAt ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {item.readAt ? 'Non lu' : 'Lu'}
          </span>
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]',
              swipeOffset >= 0 && 'invisible'
            )}
          >
            {item.savedAt ? <Bookmark className="h-4 w-4" /> : <BookmarkCheck className="h-4 w-4" />}
            {item.savedAt ? 'Retirer' : 'Sauver'}
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          'relative flex gap-2.5',
          isCompact ? 'px-3 py-2' : 'px-3 py-3',
          // Un balayage lent ne doit pas démarrer une sélection de texte.
          swipeEnabled && 'select-none',
          // Opaque UNIQUEMENT pendant le balayage, le temps de masquer les
          // intentions révélées dessous. En permanence, cette couche
          // recouvrirait le fond de survol et de sélection porté par le <li>.
          swipeOffset !== 0 && 'bg-[var(--bg-primary)]'
        )}
        style={
          swipeOffset !== 0
            ? { transform: `translate3d(${swipeOffset}px, 0, 0)`, willChange: 'transform' }
            : undefined
        }
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectedChange(item.id, event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--border)] lg:h-4 lg:w-4"
          aria-label={`Sélectionner ${item.title}`}
        />

        <button
          type="button"
          onClick={() => onOpen(item)}
          className="min-w-0 flex-1 text-left"
          aria-label={`Ouvrir : ${displayTitle}`}
        >
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="truncate font-medium text-[var(--accent)]">{feed?.title ?? 'Flux inconnu'}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0 whitespace-nowrap">{formatRelativeDate(item.publishedAt ?? item.fetchedAt)}</span>
            {item.translation ? (
              <Languages className="h-3 w-3 shrink-0" aria-label="Traduction disponible" />
            ) : null}
            {item.importedAt ? (
              <span className="shrink-0 rounded-full bg-blue-500/10 px-1.5 text-blue-700 dark:text-blue-300">
                Importé
              </span>
            ) : null}
          </span>

          <span
            className={cn(
              'mt-0.5 block text-[var(--text-primary)]',
              isCompact ? 'truncate text-sm' : 'line-clamp-2 text-[15px] leading-6',
              isUnread ? 'font-semibold' : 'font-normal'
            )}
          >
            {displayTitle}
          </span>

          {displaySummary ? (
            <span
              className={cn(
                'mt-0.5 block text-[13px] leading-5 text-[var(--text-secondary)]',
                isCompact ? 'truncate' : 'line-clamp-2'
              )}
            >
              {displaySummary}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => onToggleSaved(item.id)}
          aria-label={item.savedAt ? `Retirer ${item.title} des sauvegardés` : `Sauvegarder ${item.title}`}
          title={item.savedAt ? 'Retirer des sauvegardés' : 'Sauvegarder'}
          className={cn(
            // `active:` remplace le retour visuel supprimé par
            // `-webkit-tap-highlight-color: transparent`.
            '-mr-2 h-10 w-10 shrink-0 self-start rounded p-1 text-[var(--text-muted)] transition-colors active:bg-[var(--hover-strong,var(--hover))] pointer-fine:hover:bg-[var(--hover-strong,var(--hover))] pointer-fine:hover:text-[var(--text-primary)] lg:mr-0 lg:h-6 lg:w-auto',
            item.savedAt
              ? 'text-[var(--accent)]'
              : 'opacity-100 lg:opacity-0 lg:focus:opacity-100 lg:group-hover:opacity-100'
          )}
        >
          {item.savedAt ? (
            <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Bookmark className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </li>
  )
})
