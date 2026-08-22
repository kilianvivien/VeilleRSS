import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bookmark,
  Check,
  Download,
  ExternalLink,
  Inbox,
  Info,
  Network,
  PanelRightClose,
  Plus,
  Rss,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { cn } from '@/lib/utils/cn'
import {
  computeRelatedTrendTerms,
  TREND_WINDOW_OPTIONS,
  type TrendReport,
  type TrendTerm,
} from '@/lib/rss/trendAnalysis'
import type { RssFeed, RssItem } from '@/types/rss'
import type { SmartView } from './FeedRail'
import { Sparkline } from './Sparkline'

const WINDOW_LABELS: Record<number, string> = {
  6: '6 h',
  24: '24 h',
  72: '3 j',
  168: '7 j',
}

const TOPIC_POSITIONS = [
  { x: 50, y: 18 },
  { x: 74, y: 31 },
  { x: 82, y: 54 },
  { x: 70, y: 77 },
  { x: 50, y: 86 },
  { x: 28, y: 77 },
  { x: 18, y: 54 },
  { x: 28, y: 31 },
] as const

const SOURCE_COLORS = ['#4c8dff', '#22c55e', '#ef4444', '#f59e0b', '#14b8a6', '#8b5cf6']
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

interface TrendMapViewProps {
  report: TrendReport
  feeds: RssFeed[]
  items: RssItem[]
  activeFeedId: string | null
  smartView: SmartView
  totals: { all: number; unread: number; saved: number }
  windowHours: number
  onWindowChange: (hours: number) => void
  onSelectFeed: (feedId: string | null) => void
  onSelectSmartView: (view: SmartView) => void
  onOpenTerm: (term: TrendTerm) => void
  onOpenItem: (item: RssItem) => void
  onOpenCatalog: () => void
  onImportOpml: () => void
  onExportOpml: () => void
  onClose: () => void
}

function itemTime(item: RssItem): number {
  return item.publishedAt ?? item.fetchedAt
}

function formatGeneratedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatDelta(term: TrendTerm): string {
  if (term.isNew) return 'Nouveau'
  if (term.changeRatio !== null) {
    const percentage = Math.round(Math.abs(term.changeRatio) * 100)
    return `${term.changeRatio >= 0 ? '+' : '−'}${percentage} %`
  }
  return `${term.delta >= 0 ? '+' : '−'}${Math.abs(term.delta)}`
}

function titleCase(value: string): string {
  if (!value) return 'Tous les sujets'
  return value.charAt(0).toLocaleUpperCase('fr') + value.slice(1).toLocaleLowerCase('fr')
}

function topicStyle(index: number): React.CSSProperties {
  const position = TOPIC_POSITIONS[index] ?? TOPIC_POSITIONS[0]
  return { left: `${position.x}%`, top: `${position.y}%` }
}

function sourceStyle(index: number): React.CSSProperties {
  const position = TOPIC_POSITIONS[index] ?? TOPIC_POSITIONS[0]
  const x = 50 + (position.x - 50) * 1.38
  const y = 52 + (position.y - 52) * 1.22
  return { left: `${Math.max(12, Math.min(88, x))}%`, top: `${Math.max(9, Math.min(91, y))}%` }
}

export function TrendMapView({
  report,
  feeds,
  items,
  activeFeedId,
  smartView,
  totals,
  windowHours,
  onWindowChange,
  onSelectFeed,
  onSelectSmartView,
  onOpenTerm,
  onOpenItem,
  onOpenCatalog,
  onImportOpml,
  onExportOpml,
  onClose,
}: TrendMapViewProps) {
  const topLevelTerms = useMemo(() => report.terms.slice(0, TOPIC_POSITIONS.length), [report.terms])
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const focusTerm = useMemo(
    () => topLevelTerms.find((term) => term.key === focusKey) ?? null,
    [focusKey, topLevelTerms]
  )
  const terms = useMemo(
    () =>
      focusTerm
        ? computeRelatedTrendTerms({
            items,
            parentTerm: focusTerm,
            windowHours,
            termLimit: TOPIC_POSITIONS.length,
            now: report.generatedAt,
          })
        : topLevelTerms,
    [focusTerm, items, report.generatedAt, topLevelTerms, windowHours]
  )
  const selectableTerms = useMemo(
    () => (focusTerm ? [focusTerm, ...terms] : terms),
    [focusTerm, terms]
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(topLevelTerms[0]?.key ?? null)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const graphRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusKey || focusTerm) return
    setFocusKey(null)
    setSelectedKey(null)
    setInspectorOpen(false)
  }, [focusKey, focusTerm])

  useEffect(() => {
    if (
      !inspectorOpen ||
      (selectedKey && selectableTerms.some((term) => term.key === selectedKey))
    ) {
      return
    }
    setSelectedKey(selectableTerms[0]?.key ?? null)
  }, [inspectorOpen, selectableTerms, selectedKey])

  const selectedTerm = inspectorOpen
    ? (selectableTerms.find((term) => term.key === selectedKey) ?? selectableTerms[0] ?? null)
    : null
  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const groupedFeeds = useMemo(() => {
    const groups = new Map<string, RssFeed[]>()
    for (const feed of feeds) {
      const category = feed.category?.trim() || 'Sources'
      groups.set(category, [...(groups.get(category) ?? []), feed])
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [feeds])

  const unreadByFeed = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      if (!item.readAt) counts.set(item.feedId, (counts.get(item.feedId) ?? 0) + 1)
    }
    return counts
  }, [items])

  const overviewRootLabel = useMemo(() => {
    if (activeFeedId) return titleCase(feedById.get(activeFeedId)?.category ?? '')
    const categoryCounts = new Map<string, number>()
    for (const feed of feeds) {
      if (!feed.category?.trim()) continue
      categoryCounts.set(feed.category, (categoryCounts.get(feed.category) ?? 0) + 1)
    }
    const dominant = [...categoryCounts].sort((a, b) => b[1] - a[1])[0]?.[0]
    return titleCase(dominant ?? 'Tous les sujets')
  }, [activeFeedId, feedById, feeds])

  const rootLabel = focusTerm?.label ?? overviewRootLabel
  const rootArticleCount = focusTerm?.count ?? report.itemCount

  const selectedArticles = useMemo(() => {
    if (!selectedTerm) return []
    return selectedTerm.itemIds
      .map((id) => itemById.get(id))
      .filter((item): item is RssItem => Boolean(item))
      .sort((a, b) => itemTime(b) - itemTime(a))
  }, [itemById, selectedTerm])

  const sourceBreakdown = useMemo(() => {
    if (!selectedTerm) return []
    const counts = new Map<string, number>()
    for (const item of selectedArticles) {
      counts.set(item.feedId, (counts.get(item.feedId) ?? 0) + 1)
    }
    return [...counts]
      .map(([feedId, count]) => ({ feed: feedById.get(feedId), count }))
      .filter((entry): entry is { feed: RssFeed; count: number } => Boolean(entry.feed))
      .sort((a, b) => b.count - a.count)
  }, [feedById, selectedArticles, selectedTerm])

  useEffect(() => {
    const canvas = canvasRef.current
    const graph = graphRef.current
    if (!canvas || !graph) return

    const draw = () => {
      const { width, height } = graph.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      if (!('CanvasRenderingContext2D' in window)) return
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)

      const styles = getComputedStyle(graph)
      const accent = styles.getPropertyValue('--accent').trim() || '#4c8dff'
      const border = styles.getPropertyValue('--border-strong').trim() || '#d1d5db'
      const center = { x: width * 0.5, y: height * 0.52 }

      context.save()
      context.strokeStyle = border
      context.globalAlpha = 0.6
      context.lineWidth = 1
      context.setLineDash([4, 5])
      for (const scale of [0.22, 0.4]) {
        context.beginPath()
        context.ellipse(center.x, center.y, width * scale, height * scale, 0, 0, Math.PI * 2)
        context.stroke()
      }
      context.restore()

      terms.forEach((term, index) => {
        const position = TOPIC_POSITIONS[index]
        const topic = { x: (width * position.x) / 100, y: (height * position.y) / 100 }
        const selected = term.key === selectedTerm?.key
        context.save()
        context.strokeStyle = accent
        context.globalAlpha = selected ? 0.75 : 0.28
        context.lineWidth = selected ? 2 : 1.25
        context.setLineDash([])
        context.beginPath()
        context.moveTo(center.x, center.y)
        const controlX = center.x + (topic.x - center.x) * 0.52
        const controlY = center.y + (topic.y - center.y) * 0.52
        context.quadraticCurveTo(controlX, controlY, topic.x, topic.y)
        context.stroke()

        if (index !== 2 && index !== 6) {
          const outer = sourceStyle(index)
          const outerX = (width * Number.parseFloat(String(outer.left))) / 100
          const outerY = (height * Number.parseFloat(String(outer.top))) / 100
          context.strokeStyle = border
          context.globalAlpha = selected ? 0.8 : 0.45
          context.lineWidth = 1
          context.beginPath()
          context.moveTo(topic.x, topic.y)
          context.quadraticCurveTo((topic.x + outerX) / 2, (topic.y + outerY) / 2, outerX, outerY)
          context.stroke()
        }
        context.restore()
      })
    }

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw)
    observer?.observe(graph)
    window.addEventListener('resize', draw)
    draw()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', draw)
    }
  }, [selectedTerm?.key, terms])

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden bg-[var(--bg-primary)]"
      aria-label="Cartographie des tendances"
    >
      <aside className="hidden">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Flux RSS
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {feeds.length} source{feeds.length > 1 ? 's' : ''} · {totals.unread} non lu
            {totals.unread > 1 ? 's' : ''}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          <ul className="space-y-0.5">
            <MapRailRow
              icon={<Rss className="h-4 w-4" aria-hidden="true" />}
              label="Tous les articles"
              count={totals.all}
              active={!activeFeedId && smartView === 'all'}
              onClick={() => {
                onSelectFeed(null)
                onSelectSmartView('all')
              }}
            />
            <MapRailRow
              icon={<Inbox className="h-4 w-4" aria-hidden="true" />}
              label="Non lus"
              count={totals.unread}
              active={!activeFeedId && smartView === 'unread'}
              emphasize
              onClick={() => {
                onSelectFeed(null)
                onSelectSmartView('unread')
              }}
            />
            <MapRailRow
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

          <div className="mt-5 space-y-4">
            {groupedFeeds.map(([category, categoryFeeds]) => (
              <section key={category}>
                <h2 className="rss-section-label px-2 pb-1 text-[var(--text-muted)] uppercase">
                  {category}
                </h2>
                <ul className="space-y-0.5">
                  {categoryFeeds.map((feed, index) => {
                    const unread = unreadByFeed.get(feed.id) ?? 0
                    return (
                      <li key={feed.id}>
                        <button
                          type="button"
                          onClick={() => onSelectFeed(activeFeedId === feed.id ? null : feed.id)}
                          aria-pressed={activeFeedId === feed.id}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                            activeFeedId === feed.id
                              ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
                          )}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: SOURCE_COLORS[index % SOURCE_COLORS.length] }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">{feed.title}</span>
                          {unread > 0 ? (
                            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                              {unread}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-[var(--border)] px-2 py-2">
          <Button
            size="sm"
            variant="ghost"
            className="min-w-0 flex-1 justify-start"
            onClick={onOpenCatalog}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Sources
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onImportOpml}
            aria-label="Importer un OPML"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onExportOpml}
            aria-label="Exporter en OPML"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <header className="glass-surface-strong rounded-card relative z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Network className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
              Cartographie des tendances
            </h2>
          </div>
          <div className="flex items-center justify-self-end gap-1">
            {focusTerm ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setFocusKey(null)
                  setSelectedKey(null)
                  setInspectorOpen(false)
                }}
                title="Revenir à la carte générale des tendances"
                aria-label="Retour aux tendances générales"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden lg:inline">Retour aux tendances</span>
              </Button>
            ) : null}
            {selectedTerm ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSelectedKey(null)
                  setInspectorOpen(false)
                }}
                title="Masquer le détail sélectionné et afficher toute la carte"
                aria-label="Afficher la vue d’ensemble"
              >
                <PanelRightClose className="h-4 w-4" aria-hidden="true" />
                <span className="hidden lg:inline">Vue d’ensemble</span>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0"
              onClick={onClose}
              aria-label="Fermer la cartographie"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <SegmentedControl<string>
            size="sm"
            className="w-full max-w-[410px]"
            value={String(windowHours)}
            onChange={(value) => onWindowChange(Number(value))}
            options={TREND_WINDOW_OPTIONS.map((hours) => ({
              value: String(hours),
              label: WINDOW_LABELS[hours],
            }))}
          />
          <p className="flex items-center justify-end gap-1 text-[11px] text-[var(--text-muted)]">
            Données du {formatGeneratedAt(report.generatedAt)}
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </p>
        </header>

        <div className="relative mt-3 flex min-h-0 flex-1 gap-3">
          <section
            ref={graphRef}
            className="relative min-w-0 flex-1 overflow-hidden"
            aria-label="Carte des sujets liés"
          >
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            />

            {terms.length === 0 && !focusTerm ? (
              <div className="absolute inset-0 flex items-center justify-center px-10 text-center">
                <div>
                  <Network
                    className="mx-auto h-8 w-8 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                    Pas encore assez de liens à cartographier
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--text-muted)]">
                    Élargissez la fenêtre d’analyse ou rafraîchissez les sources pour faire émerger
                    des sujets récurrents.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="absolute top-[52%] left-1/2 flex h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--surface-elevated)] text-center shadow-lg">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {focusTerm ? 'Sujet exploré' : `Tendances · ${WINDOW_LABELS[windowHours]}`}
                  </span>
                  <strong className="mt-1 max-w-[108px] truncate text-lg font-semibold text-[var(--text-primary)]">
                    {rootLabel}
                  </strong>
                  <span className="mt-1 text-[10px] text-[var(--text-muted)]">
                    {rootArticleCount} article{rootArticleCount > 1 ? 's' : ''}
                  </span>
                </div>

                {terms.map((term, index) => {
                  const selected = term.key === selectedTerm?.key
                  const source = feedById.get(term.feedIds[0])
                  return (
                    <div key={term.key}>
                      <button
                        type="button"
                        style={topicStyle(index)}
                        onClick={() => {
                          if (!focusTerm) setFocusKey(term.key)
                          setSelectedKey(term.key)
                          setInspectorOpen(true)
                        }}
                        aria-pressed={selected}
                        className={cn(
                          'absolute z-10 max-w-[126px] min-w-[92px] -translate-x-1/2 -translate-y-1/2 rounded-full border bg-[var(--surface-elevated)] px-3 py-2 text-center shadow-sm transition-[border-color,box-shadow,transform] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none',
                          selected
                            ? 'border-2 border-[var(--accent)] shadow-md'
                            : 'border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]'
                        )}
                      >
                        <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                          {term.label}
                        </span>
                        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] text-[var(--text-secondary)] tabular-nums">
                          {term.count}
                        </span>
                      </button>
                      {source && index !== 2 && index !== 6 ? (
                        <div
                          style={sourceStyle(index)}
                          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-[10px] text-[var(--text-secondary)] shadow-sm"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: SOURCE_COLORS[index % SOURCE_COLORS.length] }}
                            aria-hidden="true"
                          />
                          <span className="max-w-[90px] truncate">{source.title}</span>
                          <span className="text-[var(--text-muted)] tabular-nums">
                            {term.count}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </>
            )}

            <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--glass-bg-strong)] px-3 py-2 text-[10px] text-[var(--text-muted)] shadow-sm backdrop-blur-md">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-[var(--accent)]" />
                Sujet central
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-[var(--accent)]" />
                Sujet lié
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="h-px w-5 bg-[var(--border-strong)]" />
                Relation
              </span>
            </div>
          </section>

          {selectedTerm ? (
            <aside
              className="glass-surface-strong rounded-card flex w-[250px] flex-shrink-0 flex-col overflow-hidden max-lg:absolute max-lg:inset-x-3 max-lg:bottom-0 max-lg:z-20 max-lg:h-[min(58%,400px)] max-lg:w-auto max-lg:border max-lg:shadow-lg"
              aria-label={`Détails de la tendance ${selectedTerm.label}`}
            >
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 text-base font-semibold break-words text-[var(--text-primary)]">
                    {selectedTerm.label}
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => setInspectorOpen(false)}
                    aria-label="Masquer les détails"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>

                {focusTerm && selectedTerm.key !== focusTerm.key ? (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Sous-thème de {focusTerm.label}
                  </p>
                ) : null}

                <dl className="mt-5 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Articles</dt>
                    <dd className="font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedTerm.count}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Diversité des sources</dt>
                    <dd className="font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedTerm.sourceCount} /{' '}
                      {Math.max(report.sourceCount, selectedTerm.sourceCount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">
                      Évolution ({WINDOW_LABELS[windowHours]})
                    </dt>
                    <dd
                      className={cn(
                        'font-semibold tabular-nums',
                        selectedTerm.delta >= 0
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : 'text-orange-600 dark:text-orange-300'
                      )}
                    >
                      {formatDelta(selectedTerm)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 border-b border-[var(--border)] pb-4">
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                    Tendance
                  </p>
                  <Sparkline
                    values={selectedTerm.buckets}
                    width={190}
                    height={38}
                    label={`Évolution de ${selectedTerm.label}`}
                  />
                </div>

                <section className="border-b border-[var(--border)] py-4">
                  <h4 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                    Principales sources
                  </h4>
                  <ul className="mt-3 space-y-2">
                    {sourceBreakdown.slice(0, 4).map(({ feed, count }, index) => (
                      <li key={feed.id} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: SOURCE_COLORS[index % SOURCE_COLORS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                          {feed.title}
                        </span>
                        <span className="text-[var(--text-muted)] tabular-nums">{count}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="pt-4">
                  <h4 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                    Articles récents
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {selectedArticles.slice(0, 3).map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onOpenItem(item)}
                          className="group w-full rounded-lg px-1 py-2 text-left hover:bg-[var(--hover)]"
                        >
                          <span className="line-clamp-2 text-xs leading-4 font-medium text-[var(--text-primary)]">
                            {item.title}
                          </span>
                          <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                            <span className="truncate text-[var(--accent)]">
                              {feedById.get(item.feedId)?.title ?? 'Source'}
                            </span>
                            <span>·</span>
                            <span>
                              {RELATIVE_TIME_FORMATTER.format(
                                Math.round((itemTime(item) - Date.now()) / 3_600_000),
                                'hour'
                              )}
                            </span>
                            <ExternalLink
                              className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100"
                              aria-hidden="true"
                            />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <div className="border-t border-[var(--border)] p-3">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => onOpenTerm(selectedTerm)}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Ouvrir les {selectedTerm.count} articles
                </Button>
              </div>
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function MapRailRow({
  icon,
  label,
  count,
  active,
  emphasize,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  emphasize?: boolean
  onClick: () => void
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
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        {count > 0 ? (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
              emphasize ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'
            )}
          >
            {count}
          </span>
        ) : null}
      </button>
    </li>
  )
}
