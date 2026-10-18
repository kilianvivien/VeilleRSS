import { Fragment, useState } from 'react'
import { ChevronRight, Edit3, EyeOff, MoreHorizontal, RefreshCw, Rss, Search, Trash2, X } from 'lucide-react'
import { MenuButton } from '@/components/ui/MenuButton'
import { cn } from '@/lib/utils/cn'
import { foldForMatching } from '@/lib/rss/textAnalysis'
import type { RssFeed } from '@/types/rss'
import type { RssFeedHealth, RssFeedStats } from '@/stores/rssStore'

export type SmartView = 'all' | 'unread' | 'saved'

const HEALTH_STYLES: Record<RssFeedHealth, { className: string; label: string }> = {
  ok: { className: 'bg-[var(--success)]', label: 'À jour' },
  stale: { className: 'bg-[var(--warning)]', label: 'Rien de neuf depuis plus d’une semaine' },
  error: { className: 'bg-[var(--error)]', label: 'Dernier rafraîchissement en échec' },
  never: { className: 'bg-[var(--text-muted)]', label: 'Jamais rafraîchi' },
  disabled: {
    className: 'bg-transparent border border-[var(--border-strong)]',
    label: 'Désactivé',
  },
}

export interface FeedRailGroup {
  category: string
  feeds: RssFeed[]
}

interface FeedRailProps {
  groups: FeedRailGroup[]
  stats: Map<string, RssFeedStats>
  health: Map<string, RssFeedHealth>
  refreshingFeedIds: Set<string>
  activeFeedId: string | null
  smartView: SmartView
  totals: { all: number; unread: number; saved: number }
  /**
   * `sidebar` : colonne fixe du bureau, actions révélées au survol.
   * `drawer` : tiroir tactile — actions toujours visibles, lignes plus hautes.
   */
  variant?: 'sidebar' | 'drawer'
  onSelectSmartView: (view: SmartView) => void
  onSelectFeed: (feedId: string | null) => void
  onRefreshFeed: (feedId: string) => void
  onToggleFeed: (feed: RssFeed) => void
  onEditFeed: (feed: RssFeed) => void
  onDeleteFeed: (feed: RssFeed) => void
}

/**
 * Colonne des sources : vues transversales en haut, puis les flux groupés par
 * catégorie, chacun avec son compteur de non-lus et sa pastille de santé.
 */
export function FeedRail({
  groups,
  stats,
  health,
  refreshingFeedIds,
  activeFeedId,
  smartView,
  totals,
  variant = 'sidebar',
  onSelectSmartView,
  onSelectFeed,
  onRefreshFeed,
  onToggleFeed,
  onEditFeed,
  onDeleteFeed,
}: FeedRailProps) {
  const hasFeeds = groups.some((group) => group.feeds.length > 0)
  const isDrawer = variant === 'drawer'
  const feedCount = groups.reduce((sum, group) => sum + group.feeds.length, 0)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const folded = foldForMatching(filter.trim())
  const visibleGroups = folded
    ? groups
        .map((group) => ({ ...group, feeds: group.feeds.filter((feed) => foldForMatching(feed.title).includes(folded)) }))
        .filter((group) => group.feeds.length > 0)
    : groups

  const toggleGroup = (category: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })

  return (
    <nav aria-label="Sources RSS" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {/* Les vues « Non lus » et « Sauvegardés » vivent dans la liste
            (contrôle en pilule) : le rail ne garde que le retour à toutes
            les sources. */}
        <li>
          <button
            type="button"
            onClick={() => onSelectFeed(null)}
            aria-current={!activeFeedId ? 'true' : undefined}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] transition-colors',
              isDrawer ? 'h-11' : 'h-9',
              !activeFeedId
                ? 'bg-[var(--accent-muted)] font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] pointer-fine:hover:bg-[var(--hover)]'
            )}
          >
            <Rss className="h-4 w-4 text-[var(--link)]" aria-hidden="true" />
            <span className="flex-1 truncate">Toutes les sources</span>
            <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">{totals.all}</span>
          </button>
        </li>
      </ul>

      {feedCount > 6 ? (
        <label className="mx-0.5 flex h-8 items-center gap-2 rounded-xl border border-[var(--border)] px-2.5 focus-within:border-[var(--accent)]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={`Filtrer ${feedCount} sources…`}
            aria-label="Filtrer les sources"
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {filter ? (
            <button type="button" onClick={() => setFilter('')} aria-label="Effacer le filtre" className="text-[var(--text-muted)]">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      ) : null}

      {!hasFeeds ? (
        <p className="px-2 py-3 text-xs leading-5 text-[var(--text-muted)]">
          Aucune source pour l’instant. « Ajouter des sources » propose plus de 200 médias
          vérifiés, regroupés en bouquets.
        </p>
      ) : null}

      {folded && visibleGroups.length === 0 ? (
        <p className="px-2 text-xs text-[var(--text-muted)]">Aucune source ne correspond.</p>
      ) : null}

      {visibleGroups.map((group) => {
        if (group.feeds.length === 0) return null
        const isCollapsed = !folded && collapsed.has(group.category)
        const groupUnread = group.feeds.reduce((sum, feed) => sum + (stats.get(feed.id)?.unread ?? 0), 0)
        return (
          <Fragment key={group.category}>
            <section aria-label={group.category}>
              <button
                type="button"
                onClick={() => toggleGroup(group.category)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[var(--text-muted)] pointer-fine:hover:text-[var(--text-primary)]"
              >
                <ChevronRight
                  className={cn('h-3 w-3 transition-transform duration-200', !isCollapsed && 'rotate-90')}
                  aria-hidden="true"
                />
                <span className="rss-section-label flex-1 truncate uppercase">{group.category}</span>
                <span className="font-mono text-[10px] tabular-nums">
                  {group.feeds.length}
                  {groupUnread > 0 ? ` · ${groupUnread}` : ''}
                </span>
              </button>
              {isCollapsed ? null : (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {group.feeds.map((feed) => (
                    <FeedRow
                      key={feed.id}
                      feed={feed}
                      stats={stats.get(feed.id)}
                      health={health.get(feed.id) ?? 'never'}
                      isRefreshing={refreshingFeedIds.has(feed.id)}
                      active={activeFeedId === feed.id}
                      isDrawer={isDrawer}
                      onSelect={() => onSelectFeed(feed.id)}
                      onRefresh={() => onRefreshFeed(feed.id)}
                      onToggle={() => onToggleFeed(feed)}
                      onEdit={() => onEditFeed(feed)}
                      onDelete={() => onDeleteFeed(feed)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </Fragment>
        )
      })}
    </nav>
  )
}

/** Teinte stable par source, pour que sa vignette reste reconnaissable. */
function feedHue(title: string): number {
  let hash = 0
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

function FeedRow({
  feed,
  stats,
  health,
  isRefreshing,
  active,
  isDrawer,
  onSelect,
  onRefresh,
  onToggle,
  onEdit,
  onDelete,
}: {
  feed: RssFeed
  stats?: RssFeedStats
  health: RssFeedHealth
  isRefreshing: boolean
  active: boolean
  /** Variante tiroir tactile : lignes plus hautes, menu toujours visible. */
  isDrawer: boolean
  onSelect: () => void
  onRefresh: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const unread = stats?.unread ?? 0
  const healthStyle = HEALTH_STYLES[health]
  const hue = feedHue(feed.title)
  const initial = feed.title.trim().charAt(0).toUpperCase() || '?'

  return (
    <li
      className={cn(
        'group relative flex items-center gap-2.5 rounded-xl pr-1 pl-1.5 transition-colors',
        isDrawer ? 'min-h-12' : 'min-h-10',
        active
          ? 'bg-[var(--accent-muted)] shadow-[inset_3px_0_0_var(--accent)]'
          : 'pointer-fine:hover:bg-[var(--hover)]'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        title={feed.lastError ?? `${feed.title} · ${healthStyle.label}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
      >
        <span
          aria-hidden="true"
          className={cn('relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-[11px] font-bold', !feed.enabled && 'opacity-40')}
          style={{
            backgroundColor: `hsl(${hue} 55% 55% / 0.18)`,
            color: `hsl(${hue} 60% 62%)`,
          }}
        >
          {initial}
          <span
            className={cn(
              'absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-primary)]',
              isRefreshing ? 'animate-pulse bg-[var(--accent)]' : healthStyle.className
            )}
          />
        </span>
        <span className="sr-only">{isRefreshing ? 'Rafraîchissement en cours. ' : `${healthStyle.label}. `}</span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px]',
            feed.enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through',
            unread > 0 ? 'font-medium' : 'font-normal'
          )}
        >
          {feed.title}
        </span>
      </button>

      {unread > 0 ? (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 font-mono text-[10px] leading-5 text-[var(--text-muted)] tabular-nums',
            !isDrawer && 'pointer-fine:group-hover:hidden'
          )}
        >
          {unread > 999 ? '999+' : unread}
        </span>
      ) : null}

      <div
        className={cn(
          'shrink-0',
          isDrawer ? 'block' : 'hidden group-focus-within:block pointer-fine:group-hover:block'
        )}
      >
        <MenuButton
          label={`Actions pour ${feed.title}`}
          className={cn(
            'flex items-center justify-center rounded-lg text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover-strong)] pointer-fine:hover:text-[var(--text-primary)]',
            isDrawer ? 'h-10 w-10' : 'h-7 w-7'
          )}
          entries={[
            { label: 'Rafraîchir', icon: <RefreshCw className="h-4 w-4" aria-hidden="true" />, onSelect: onRefresh },
            { label: feed.enabled ? 'Mettre en pause' : 'Réactiver', icon: <EyeOff className="h-4 w-4" aria-hidden="true" />, onSelect: onToggle },
            { label: 'Modifier', icon: <Edit3 className="h-4 w-4" aria-hidden="true" />, onSelect: onEdit },
            { label: 'Supprimer', icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, onSelect: onDelete, danger: true },
          ]}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </MenuButton>
      </div>
    </li>
  )
}
