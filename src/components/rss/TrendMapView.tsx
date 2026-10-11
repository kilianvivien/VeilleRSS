import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Info,
  Network,
  PanelRightClose,
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
import { Sparkline } from './Sparkline'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

const WINDOW_LABELS: Record<number, string> = {
  6: '6 h',
  24: '24 h',
  72: '3 j',
  168: '7 j',
}

const MAX_TOPICS = 8

const SOURCE_COLORS = ['#4c8dff', '#22c55e', '#ef4444', '#f59e0b', '#14b8a6', '#8b5cf6']
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

interface TrendMapViewProps {
  report: TrendReport
  feeds: RssFeed[]
  items: RssItem[]
  activeFeedId: string | null
  windowHours: number
  onWindowChange: (hours: number) => void
  onOpenTerm: (term: TrendTerm) => void
  onOpenItem: (item: RssItem) => void
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

function topicPosition(index: number, total: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, total)
  return { x: 50 + Math.cos(angle) * 32, y: 52 + Math.sin(angle) * 34 }
}

function topicStyle(index: number, total: number): React.CSSProperties {
  const position = topicPosition(index, total)
  return { left: `${position.x}%`, top: `${position.y}%` }
}

function sourceStyle(index: number, total: number): React.CSSProperties {
  const position = topicPosition(index, total)
  const x = 50 + (position.x - 50) * 1.38
  const y = 52 + (position.y - 52) * 1.22
  return { left: `${Math.max(12, Math.min(88, x))}%`, top: `${Math.max(9, Math.min(91, y))}%` }
}

export function TrendMapView({
  report,
  feeds,
  items,
  activeFeedId,
  windowHours,
  onWindowChange,
  onOpenTerm,
  onOpenItem,
  onClose,
}: TrendMapViewProps) {
  const isExtraNarrow = useMediaQuery('(max-width: 359px)')
  const isMobile = useMediaQuery('(max-width: 639px)')
  const topicLimit = isExtraNarrow ? 6 : MAX_TOPICS
  const topLevelTerms = useMemo(() => report.terms.slice(0, topicLimit), [report.terms, topicLimit])
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
            termLimit: topicLimit,
            now: report.generatedAt,
          })
        : topLevelTerms,
    [focusTerm, items, report.generatedAt, topLevelTerms, topicLimit, windowHours]
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
        const position = topicPosition(index, terms.length)
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

        if (!isMobile && index !== 2 && index !== 6) {
          const outer = sourceStyle(index, terms.length)
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
  }, [isMobile, selectedTerm?.key, terms])

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden bg-[var(--bg-primary)]"
      aria-label="Cartographie des tendances"
    >
      <main className="flex min-w-0 flex-1 flex-col px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 sm:p-4">
        <header className="glass-surface-strong rounded-card relative z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-3 sm:gap-x-4 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Network className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
              <span className="sm:hidden">Carte</span>
              <span className="hidden sm:inline">Cartographie des tendances</span>
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
              className="h-10 w-10 p-0 sm:h-9 sm:w-9"
              onClick={onClose}
              aria-label="Fermer la cartographie"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <SegmentedControl<string>
            size="sm"
            className="col-span-2 w-full max-w-none sm:col-span-1 sm:max-w-[410px]"
            value={String(windowHours)}
            onChange={(value) => onWindowChange(Number(value))}
            options={TREND_WINDOW_OPTIONS.map((hours) => ({
              value: String(hours),
              label: WINDOW_LABELS[hours],
            }))}
          />
          <p className="col-span-2 flex items-center justify-start gap-1 text-[11px] text-[var(--text-muted)] sm:col-span-1 sm:justify-end">
            Données du {formatGeneratedAt(report.generatedAt)}
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </p>
        </header>

        <div className="relative mt-3 flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
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
                <div className="absolute top-[52%] left-1/2 flex h-[108px] w-[108px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--surface-elevated)] text-center shadow-lg min-[360px]:h-[132px] min-[360px]:w-[132px]">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {focusTerm ? 'Sujet exploré' : `Tendances · ${WINDOW_LABELS[windowHours]}`}
                  </span>
                  <strong className="mt-1 max-w-[88px] truncate text-base font-semibold text-[var(--text-primary)] min-[360px]:max-w-[108px] min-[360px]:text-lg">
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
                        style={topicStyle(index, terms.length)}
                        onClick={() => {
                          if (!focusTerm) setFocusKey(term.key)
                          setSelectedKey(term.key)
                          setInspectorOpen(true)
                        }}
                        aria-pressed={selected}
                        className={cn(
                          'absolute z-10 max-w-[104px] min-w-[76px] -translate-x-1/2 -translate-y-1/2 rounded-full border bg-[var(--surface-elevated)] px-2 py-1.5 text-center shadow-sm transition-[border-color,box-shadow,transform] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none min-[360px]:max-w-[126px] min-[360px]:min-w-[92px] min-[360px]:px-3 min-[360px]:py-2',
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
                      {!isMobile && source && index !== 2 && index !== 6 ? (
                        <div
                          style={sourceStyle(index, terms.length)}
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

            <div className="absolute bottom-2 left-2 hidden flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass-bg-strong)] px-2 py-1.5 text-[10px] text-[var(--text-muted)] shadow-sm backdrop-blur-md sm:flex sm:gap-4 sm:px-3 sm:py-2">
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
              className="glass-surface-strong rounded-card flex max-h-[44%] w-full flex-shrink-0 flex-col overflow-hidden border shadow-lg lg:h-auto lg:max-h-none lg:w-[250px] lg:border-0 lg:shadow-none"
              aria-label={`Détails de la tendance ${selectedTerm.label}`}
            >
              <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
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

                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs sm:mt-5 sm:block sm:space-y-3">
                  <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-[var(--hover)] p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:bg-transparent sm:p-0">
                    <dt className="text-[var(--text-muted)]">Articles</dt>
                    <dd className="font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedTerm.count}
                    </dd>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-[var(--hover)] p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:bg-transparent sm:p-0">
                    <dt className="truncate text-[var(--text-muted)] sm:whitespace-normal">Sources</dt>
                    <dd className="font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedTerm.sourceCount} /{' '}
                      {Math.max(report.sourceCount, selectedTerm.sourceCount)}
                    </dd>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-[var(--hover)] p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:bg-transparent sm:p-0">
                    <dt className="truncate text-[var(--text-muted)] sm:whitespace-normal">
                      Évolution <span className="hidden sm:inline">({WINDOW_LABELS[windowHours]})</span>
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

                <details className="mt-3 rounded-lg border border-[var(--border)] sm:hidden">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
                    Voir le détail de la tendance
                  </summary>
                  <div className="border-t border-[var(--border)] px-3 pb-3">
                    <TrendDetails
                      term={selectedTerm}
                      sourceBreakdown={sourceBreakdown}
                      selectedArticles={selectedArticles}
                      feedById={feedById}
                      onOpenItem={onOpenItem}
                    />
                  </div>
                </details>

                <div className="mt-5 hidden border-b border-[var(--border)] pb-4 sm:block">
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

                <section className="hidden border-b border-[var(--border)] py-4 sm:block">
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

                <section className="hidden pt-4 sm:block">
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

function TrendDetails({
  term,
  sourceBreakdown,
  selectedArticles,
  feedById,
  onOpenItem,
}: {
  term: TrendTerm
  sourceBreakdown: { feed: RssFeed; count: number }[]
  selectedArticles: RssItem[]
  feedById: Map<string, RssFeed>
  onOpenItem: (item: RssItem) => void
}) {
  return (
    <>
      <div className="border-b border-[var(--border)] py-3">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
          Tendance
        </p>
        <Sparkline
          values={term.buckets}
          width={190}
          height={38}
          label={`Évolution de ${term.label}`}
        />
      </div>

      <section className="border-b border-[var(--border)] py-3">
        <h4 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
          Principales sources
        </h4>
        <ul className="mt-2 space-y-2">
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

      <section className="pt-3">
        <h4 className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
          Articles récents
        </h4>
        <ul className="mt-1 space-y-1">
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
                  <ExternalLink className="ml-auto h-3 w-3" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
