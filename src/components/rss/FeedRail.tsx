import { Fragment } from 'react'
import {
  AlertTriangle,
  Bookmark,
  CircleDashed,
  Edit3,
  EyeOff,
  Inbox,
  Loader2,
  MoonStar,
  RefreshCw,
  Rss,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import type { RssFeed } from '@/types/rss'
import type { RssFeedHealth, RssFeedStats } from '@/stores/rssStore'

export type SmartView = 'all' | 'unread' | 'saved'

const HEALTH_STYLES: Record<RssFeedHealth, { className: string; label: string }> = {
  ok: { className: 'bg-emerald-500', label: 'À jour' },
  stale: { className: 'bg-amber-500', label: 'Rien de neuf depuis plus d’une semaine' },
  error: { className: 'bg-red-500', label: 'Dernier rafraîchissement en échec' },
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

  return (
    <nav aria-label="Sources RSS" className="space-y-4">
      <ul className={cn('space-y-1', isDrawer && 'space-y-1.5')}>
        <SmartViewRow
          icon={<Rss className="h-4 w-4" aria-hidden="true" />}
          label="Tous les articles"
          count={totals.all}
          active={!activeFeedId && smartView === 'all'}
          onClick={() => {
            onSelectFeed(null)
            onSelectSmartView('all')
          }}
        />
        <SmartViewRow
          icon={<Inbox className="h-4 w-4" aria-hidden="true" />}
          label="Non lus"
          count={totals.unread}
          emphasizeCount
          active={!activeFeedId && smartView === 'unread'}
          onClick={() => {
            onSelectFeed(null)
            onSelectSmartView('unread')
          }}
        />
        <SmartViewRow
          icon={<Bookmark className="h-4 w-4" aria-hidden="true" />}
          label="Sauvegardés"
          count={totals.saved}
          active={!activeFeedId && smartView === 'saved'}
          onClick={() => {
            onSelectFeed(null)
            onSelectSmartView('saved')
          }}
        />
      </ul>

      {!hasFeeds ? (
        <p className="px-2 py-3 text-xs leading-5 text-[var(--text-muted)]">
          Aucune source pour l’instant. Ouvrez « Ajouter des sources » pour partir d’un bouquet, ou
          utilisez le bouton + ci-dessous pour en ajouter une.
        </p>
      ) : null}

      {groups.map((group) => (
        <Fragment key={group.category}>
          {group.feeds.length === 0 ? null : (
            <div>
              <h3 className="rss-section-label px-2 pt-1 pb-1 text-[var(--text-muted)] uppercase">
                {group.category}
              </h3>
              <ul className={cn('space-y-0.5', isDrawer && 'space-y-1')}>
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
            </div>
          )}
        </Fragment>
      ))}
    </nav>
  )
}

function SmartViewRow({
  icon,
  label,
  count,
  active,
  onClick,
  emphasizeCount,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
  emphasizeCount?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
          active
            ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
        )}
      >
        <span className="text-[var(--accent)]">{icon}</span>
        <span className="flex-1 truncate font-medium">{label}</span>
        {count > 0 ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
              emphasizeCount
                ? 'bg-[var(--accent)] text-[var(--accent-foreground,#fff)]'
                : 'text-[var(--text-muted)]'
            )}
          >
            {count}
          </span>
        ) : null}
      </button>
    </li>
  )
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
  /** Variante tiroir tactile : actions permanentes, lignes plus hautes. */
  isDrawer: boolean
  onSelect: () => void
  onRefresh: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const unread = stats?.unread ?? 0
  const healthStyle = HEALTH_STYLES[health]

  return (
    <li
      className={cn(
        'group rounded-lg transition-colors',
        active ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--hover)]'
      )}
    >
      <div className={cn('flex items-center gap-1.5 px-2', isDrawer ? 'py-2.5' : 'py-1.5')}>
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', healthStyle.className)}
          title={healthStyle.label}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? 'true' : undefined}
          className="min-w-0 flex-1 py-1 text-left"
          title={feed.lastError ?? feed.title}
        >
          <span
            className={cn(
              'block truncate text-sm',
              feed.enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through',
              unread > 0 && 'font-medium'
            )}
          >
            {feed.title}
          </span>
        </button>

        {isRefreshing ? (
          <Loader2
            className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-muted)]"
            aria-label="Rafraîchissement"
          />
        ) : null}
        {health === 'error' && !isRefreshing ? (
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0 text-red-500"
            aria-label="Erreur de flux"
          />
        ) : null}
        {health === 'stale' && !isRefreshing ? (
          <MoonStar className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Flux silencieux" />
        ) : null}
        {health === 'never' && !isRefreshing ? (
          <CircleDashed
            className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
            aria-label="Jamais rafraîchi"
          />
        ) : null}

        {unread > 0 ? (
          <span
            className={cn(
              'shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums',
              !isDrawer && 'group-hover:hidden'
            )}
          >
            {unread}
          </span>
        ) : null}

        {/* Au survol (bureau) ou en permanence dans le tiroir tactile. */}
        <div
          className={cn(
            'shrink-0 items-center',
            isDrawer ? 'flex' : 'hidden group-focus-within:flex group-hover:flex'
          )}
        >
          <RailAction
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label={`Rafraîchir ${feed.title}`}
            onClick={onRefresh}
          />
          <RailAction
            icon={<EyeOff className="h-3.5 w-3.5" />}
            label={feed.enabled ? `Désactiver ${feed.title}` : `Activer ${feed.title}`}
            onClick={onToggle}
          />
          <RailAction
            icon={<Edit3 className="h-3.5 w-3.5" />}
            label={`Modifier ${feed.title}`}
            onClick={onEdit}
          />
          <RailAction
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={`Supprimer ${feed.title}`}
            onClick={onDelete}
          />
        </div>
      </div>
    </li>
  )
}

function RailAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </Button>
  )
}
