import { Bookmark, BookmarkCheck, Languages } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
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
  onOpen: () => void
  onSelectedChange: (checked: boolean) => void
  onToggleSaved: () => void
}

/**
 * Ligne d’article de la liste centrale. En mode compact, une seule ligne de
 * résumé : on tient deux fois plus de titres à l’écran pour le tri du matin.
 */
export function RssArticleRow({
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
}: RssArticleRowProps) {
  const isUnread = !item.readAt
  const isCompact = density === 'compact'

  return (
    <li
      className={cn(
        'group relative border-b border-[var(--border)] transition-colors',
        active ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--hover)]',
        selected && !active && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]'
      )}
    >
      {isUnread ? (
        <span className="absolute left-0 top-0 h-full w-0.5 bg-[var(--accent)]" aria-hidden="true" />
      ) : null}

      <div className={cn('flex gap-2.5', isCompact ? 'px-3 py-2' : 'px-3 py-3')}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border)]"
          aria-label={`Sélectionner ${item.title}`}
        />

        <button
          type="button"
          onClick={onOpen}
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
          onClick={onToggleSaved}
          aria-label={item.savedAt ? `Retirer ${item.title} des sauvegardés` : `Sauvegarder ${item.title}`}
          title={item.savedAt ? 'Retirer des sauvegardés' : 'Sauvegarder'}
          className={cn(
            'h-6 shrink-0 self-start rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-strong,var(--hover))] hover:text-[var(--text-primary)]',
            item.savedAt
              ? 'text-[var(--accent)]'
              : // Sur tactile il n'y a pas de survol : le marque-page reste visible.
                'opacity-0 focus:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100'
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
}
