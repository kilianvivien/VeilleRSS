import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, BellPlus, BellRing, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { TrendReport, TrendTerm } from '@/lib/rss/trendAnalysis'
import { buildTopicGraph, neighbourKeys, type TopicGraph } from '@/lib/rss/topicGraph'
import type { RssFeed, RssItem } from '@/types/rss'
import { formatRelativeDate } from './rssFormatting'
import { TREND_TONE_COLOR, formatTrendDelta, trendTone } from './trendTone'

interface ConstellationViewProps {
  report: TrendReport
  itemById: Map<string, RssItem>
  feedById: Map<string, RssFeed>
  activeKey: string | null
  watchedTerms: string[]
  onSelectTerm: (term: TrendTerm) => void
  onClearSelection: () => void
  onOpenItem: (item: RssItem) => void
  /** Bascule vers la liste, déjà filtrée sur le sujet sélectionné. */
  onViewArticles: () => void
  onWatchTerm: (term: string) => void
  /** Version mobile : carte plus petite, sans flux ni indicateurs. */
  compact?: boolean
  /** Commandes de l'en-tête au bureau : fenêtre d'analyse, affinage IA. */
  toolbar?: ReactNode
  /** Bandeau d'état sous l'en-tête (affinage IA actif, erreur). */
  banner?: ReactNode
  /** Détail chiffré du sujet sélectionné (évolution, comparaison), au bureau. */
  focusPanel?: ReactNode
  /** Mot-clé suivi actuellement sélectionné, le cas échéant. */
  activeWatched?: string | null
  onSelectWatched?: (term: string) => void
  onUnwatchTerm?: (term: string) => void
}

const STREAM_SERIES = 5
const STREAM_COLORS = ['#8b7cff', '#3dd6d0', '#ffb547', '#f472b6', '#7dd3fc']

/**
 * Vue « Constellation » : les sujets du moment en graphe animé, leur flux dans
 * le temps et le détail du sujet sélectionné. Toutes les données viennent du
 * rapport de tendances local ; rien n'est recalculé côté IA.
 */
export function ConstellationView({
  report,
  itemById,
  feedById,
  activeKey,
  watchedTerms,
  onSelectTerm,
  onClearSelection,
  onOpenItem,
  onViewArticles,
  onWatchTerm,
  compact = false,
  toolbar,
  banner,
  focusPanel,
  activeWatched = null,
  onSelectWatched,
  onUnwatchTerm,
}: ConstellationViewProps) {
  const graph = useMemo(
    () =>
      buildTopicGraph(
        report.terms,
        compact
          ? { limit: 7, aspect: 0.95, labelCharWidth: 0.022, maxLabelWidth: 0.42 }
          : { limit: 12 }
      ),
    [compact, report.terms]
  )
  const focusTerm =
    report.terms.find((term) => term.key === activeKey) ?? (activeKey ? null : report.terms[0] ?? null)
  const neighbours = useMemo(
    () => (focusTerm ? neighbourKeys(graph, focusTerm.key) : []),
    [focusTerm, graph]
  )

  if (report.terms.length === 0) {
    return (
      <div className={cn('flex flex-col', compact ? 'py-2' : 'h-full min-h-0 overflow-auto p-6')}>
        <p className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)]">
          Pas encore assez d’articles sur la période pour dessiner la constellation. Ajoutez des
          sources ou élargissez la fenêtre d’analyse.
        </p>
      </div>
    )
  }

  const graphCard = (
    <section
      aria-label="Constellation des sujets"
      className={cn(
        'flex min-w-0 flex-col gap-2 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)]',
        compact ? 'p-3' : 'p-5'
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Constellation des sujets</h2>
        <ToneLegend compact={compact} />
      </div>
      <ConstellationGraph
        graph={graph}
        activeKey={activeKey}
        neighbours={neighbours}
        onSelect={(term) => (term.key === activeKey ? onClearSelection() : onSelectTerm(term))}
      />
    </section>
  )

  const detail = focusTerm ? (
    <TopicDetail
      term={focusTerm}
      isSelected={focusTerm.key === activeKey}
      related={neighbours.map((key) => report.terms.find((term) => term.key === key)).filter((term): term is TrendTerm => Boolean(term))}
      itemById={itemById}
      feedById={feedById}
      watched={watchedTerms.some((watched) => watched.toLowerCase() === focusTerm.label.toLowerCase())}
      onSelectTerm={onSelectTerm}
      onOpenItem={onOpenItem}
      onViewArticles={() => {
        if (focusTerm.key !== activeKey) onSelectTerm(focusTerm)
        onViewArticles()
      }}
      onWatch={() => onWatchTerm(focusTerm.label)}
      compact={compact}
      withHeader={!focusPanel}
    />
  ) : null

  const volumeChange = report.previousItemCount === 0 ? null : Math.round(((report.itemCount - report.previousItemCount) / report.previousItemCount) * 100)

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[26px]">Tendances</h1>
            <p role="region" aria-label="Volume de publication" className="text-sm text-[var(--text-muted)]">
              <span className="font-mono text-[var(--text-primary)] tabular-nums">{report.itemCount}</span> articles ·{' '}
              <span className="font-mono text-[var(--text-primary)] tabular-nums">{report.sourceCount}</span> sources
              {volumeChange !== null ? (
                <>
                  {' · '}
                  <span
                    className="font-mono tabular-nums"
                    style={{ color: volumeChange >= 0 ? 'var(--trend-hot)' : 'var(--trend-down)' }}
                  >
                    {volumeChange >= 0 ? '+' : '−'}
                    {Math.abs(volumeChange)} %
                  </span>{' '}
                  par rapport aux {report.windowHours} h précédentes
                </>
              ) : null}
            </p>
          </div>
          {toolbar}
        </header>
        {banner}
        <WatchedBar
          watched={report.watched}
          active={activeWatched}
          onSelect={onSelectWatched}
          onRemove={onUnwatchTerm}
          onAdd={onWatchTerm}
        />
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            {graphCard}
            {compact ? null : <TopicStream report={report} activeKey={activeKey} onSelectTerm={onSelectTerm} />}
          </div>
          {/* Un seul « sujet » à droite : le détail chiffré quand un sujet est
              choisi, flanqué des liens et articles ; sinon le sujet principal. */}
          <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-0 xl:h-[calc(100dvh-10rem)] xl:min-h-[560px] xl:overflow-y-auto">
            {focusPanel ? (
              <div className="cst-rise min-w-0 flex-shrink-0 [&>section]:rounded-[20px] [&>section]:p-5">{focusPanel}</div>
            ) : null}
            {detail}
            {compact ? <TopicStream report={report} activeKey={activeKey} onSelectTerm={onSelectTerm} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Mots-clés suivis : pastilles cliquables, ajout et retrait en place. */
function WatchedBar({
  watched,
  active,
  onSelect,
  onRemove,
  onAdd,
}: {
  watched: TrendReport['watched']
  active: string | null
  onSelect?: (term: string) => void
  onRemove?: (term: string) => void
  onAdd: (term: string) => void
}) {
  const [draft, setDraft] = useState('')
  const submit = () => {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }
  return (
    <section aria-label="Mots-clés suivis" className="flex flex-wrap items-center gap-2">
      <span className="rss-section-label mr-1 uppercase text-[var(--text-muted)]">Mots suivis</span>
      {watched.map((stat) => {
        const isActive = active === stat.term
        return (
          <span
            key={stat.term}
            className={cn(
              'flex h-9 items-center rounded-full border text-xs transition-colors',
              isActive ? 'border-[var(--trend-hot)] bg-[var(--hover-strong)]' : 'border-[var(--border)]'
            )}
          >
            <button
              type="button"
              onClick={() => onSelect?.(stat.term)}
              aria-pressed={isActive}
              className="flex h-full items-center gap-2 rounded-l-full pr-1 pl-3 text-[var(--text-primary)]"
            >
              <span className="font-medium">{stat.term}</span>
              <span className="font-mono tabular-nums text-[var(--text-muted)]">{stat.count}</span>
              {stat.delta > 0 ? (
                <span className="font-mono tabular-nums text-[var(--trend-hot)]">+{stat.delta}</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => onRemove?.(stat.term)}
              aria-label={`Ne plus suivre « ${stat.term} »`}
              className="flex h-full items-center rounded-r-full pr-2.5 pl-1 text-[var(--text-muted)] pointer-fine:hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        )
      })}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex h-9 items-center rounded-full border border-dashed border-[var(--border-strong)] pr-1 pl-3"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Suivre un mot…"
          aria-label="Nouveau mot-clé à suivre"
          className="w-36 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Suivre ce mot-clé"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] disabled:opacity-40 pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}

function ToneLegend({ compact }: { compact: boolean }) {
  const entries: [string, string][] = [
    ['forte hausse', TREND_TONE_COLOR.hot],
    ['nouveau', TREND_TONE_COLOR.new],
    ['stable', TREND_TONE_COLOR.calm],
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
      {entries.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          {label}
        </span>
      ))}
      {compact ? null : <span>taille = volume · lien = articles communs</span>}
    </div>
  )
}

export function ConstellationGraph({
  graph,
  activeKey,
  neighbours,
  onSelect,
}: {
  graph: TopicGraph
  activeKey: string | null
  neighbours: string[]
  onSelect: (term: TrendTerm) => void
}) {
  const lit = useMemo(() => new Set(activeKey ? [activeKey, ...neighbours] : []), [activeKey, neighbours])
  const position = new Map(graph.nodes.map((node) => [node.term.key, node]))

  return (
    <div className="relative w-full" style={{ aspectRatio: String(graph.aspect) }}>
      {graph.edges.map((edge, index) => {
        const a = position.get(edge.source)!
        const b = position.get(edge.target)!
        // Calcul dans un repère isotrope (largeur = graph.aspect), puis
        // conversion en pourcentage de la largeur pour la longueur.
        const dx = (b.x - a.x) * graph.aspect
        const dy = b.y - a.y
        const length = Math.hypot(dx, dy) / graph.aspect
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        const on = activeKey !== null && (edge.source === activeKey || edge.target === activeKey)
        const thickness = 1 + edge.weight * 3
        return (
          <div
            key={`${edge.source}|${edge.target}`}
            aria-hidden="true"
            className="pointer-events-none absolute origin-left"
            style={{
              left: `${a.x * 100}%`,
              top: `calc(${a.y * 100}% - ${thickness / 2}px)`,
              width: `${length * 100}%`,
              height: thickness,
              transform: `rotate(${angle}deg)`,
            }}
          >
            <div className="cst-edge h-full w-full" style={{ animationDelay: `${0.35 + index * 0.04}s` }}>
              <div
                className={cn('h-full w-full rounded-full transition-opacity duration-500', on && 'cst-edge-flow')}
                style={{
                  backgroundImage: on
                    ? 'linear-gradient(90deg, var(--trend-calm), var(--trend-new), var(--trend-calm))'
                    : `linear-gradient(90deg, color-mix(in srgb, var(--text-primary) ${Math.round(8 + edge.weight * 14)}%, transparent), color-mix(in srgb, var(--text-primary) ${Math.round(8 + edge.weight * 14)}%, transparent))`,
                  opacity: activeKey && !on ? 0.4 : 1,
                }}
              />
            </div>
          </div>
        )
      })}

      {graph.nodes.map((node, index) => {
        const tone = trendTone(node.term)
        const color = TREND_TONE_COLOR[tone]
        const selected = node.term.key === activeKey
        const dimmed = activeKey !== null && !lit.has(node.term.key)
        // Rayon exprimé en fraction de la hauteur : converti en largeur.
        const diameter = ((node.r * 2) / graph.aspect) * 100
        return (
          <button
            key={node.term.key}
            type="button"
            onClick={() => onSelect(node.term)}
            aria-pressed={selected}
            aria-label={`${node.term.label} : ${node.term.count} articles, ${formatTrendDelta(node.term)}`}
            className="cst-node absolute rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--text-primary)]"
            style={{
              left: `${node.x * 100 - diameter / 2}%`,
              top: `${(node.y - node.r) * 100}%`,
              width: `${diameter}%`,
              aspectRatio: '1',
              animationDelay: `${0.08 + index * 0.06}s`,
              opacity: dimmed ? 0.32 : 1,
              transition: 'opacity 450ms',
            }}
          >
            <span className="cst-node-body absolute inset-0 block" style={{ animationDelay: `${-index * 0.7}s` }}>
              {tone === 'hot' || tone === 'new' ? (
                <span className="cst-halo absolute inset-0 rounded-full border-2" style={{ borderColor: color }} aria-hidden="true" />
              ) : null}
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full transition-shadow duration-500"
                style={{
                  background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 72%, white), ${color} 72%)`,
                  boxShadow: `0 0 0 ${selected ? 3 : 0}px var(--text-primary), 0 0 32px color-mix(in srgb, ${color} ${selected ? 55 : 22}%, transparent)`,
                }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium text-[#0b0d12] tabular-nums"
              >
                {node.term.count}
              </span>
              <span
                aria-hidden="true"
                // La mise en page réserve la place de l'étiquette : centrée sous
                // son nœud, elle ne chevauche ni ses voisines ni le bord.
                className="absolute top-full left-1/2 mt-1.5 max-w-[8rem] -translate-x-1/2 truncate whitespace-nowrap text-xs font-medium text-[var(--text-primary)] sm:max-w-[9rem]"
              >
                {node.term.label}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TopicDetail({
  term,
  isSelected,
  related,
  itemById,
  feedById,
  watched,
  onSelectTerm,
  onOpenItem,
  onViewArticles,
  onWatch,
  compact,
  withHeader = true,
}: {
  term: TrendTerm
  isSelected: boolean
  related: TrendTerm[]
  itemById: Map<string, RssItem>
  feedById: Map<string, RssFeed>
  watched: boolean
  onSelectTerm: (term: TrendTerm) => void
  onOpenItem: (item: RssItem) => void
  onViewArticles: () => void
  onWatch: () => void
  compact: boolean
  /** Sans en-tête quand un panneau voisin présente déjà le sujet. */
  withHeader?: boolean
}) {
  const color = TREND_TONE_COLOR[trendTone(term)]
  const articles = term.itemIds
    .map((id) => itemById.get(id))
    .filter((item): item is RssItem => Boolean(item))
    .sort((a, b) => (b.publishedAt ?? b.fetchedAt) - (a.publishedAt ?? a.fetchedAt))
    .slice(0, compact ? 3 : 12)

  return (
    <aside
      aria-label={withHeader ? 'Sujet sélectionné' : `Liens et articles : ${term.label}`}
      key={term.key}
      className="cst-rise flex min-h-0 min-w-0 flex-col gap-4 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 xl:min-h-[420px] xl:flex-1"
    >
      {withHeader ? (
      <div className="flex flex-col gap-1.5">
        <span className="rss-section-label uppercase text-[var(--text-muted)]">
          {isSelected ? 'Sujet sélectionné' : 'Sujet principal'}
        </span>
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{term.label}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="rounded-full px-2.5 py-0.5 font-semibold text-[#0b0d12]" style={{ backgroundColor: color }}>
            {formatTrendDelta(term)}
          </span>
          {term.count} articles · {term.sourceCount} source{term.sourceCount > 1 ? 's' : ''} · {term.unreadCount} non lus
        </div>
      </div>
      ) : (
        <span className="rss-section-label uppercase text-[var(--text-muted)]">Liens et articles</span>
      )}

      {related.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">Sujets liés</span>
          <div className="flex flex-wrap gap-1.5">
            {related.map((relatedTerm) => (
              <button
                key={relatedTerm.key}
                type="button"
                onClick={() => onSelectTerm(relatedTerm)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs text-[var(--text-primary)] transition-colors pointer-fine:hover:bg-[var(--hover)]"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TREND_TONE_COLOR[trendTone(relatedTerm)] }} aria-hidden="true" />
                {relatedTerm.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1 xl:flex-1">
        {articles.map((item, index) => (
          <li key={item.id} className="cst-rise" style={{ animationDelay: `${index * 0.06}s` }}>
            <button
              type="button"
              onClick={() => onOpenItem(item)}
              className="flex w-full flex-col gap-0.5 rounded-xl bg-[var(--hover)] px-3 py-2.5 text-left transition-colors pointer-fine:hover:bg-[var(--hover-strong)]"
            >
              <span className="truncate text-[11px] text-[var(--text-muted)]">
                <span className="font-medium text-[var(--link)]">{feedById.get(item.feedId)?.title ?? 'Source'}</span>
                {' · '}
                {formatRelativeDate(item.publishedAt ?? item.fetchedAt)}
              </span>
              <span className="line-clamp-2 text-[13px] leading-snug text-[var(--text-primary)]">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-shrink-0 gap-2">
        <button
          type="button"
          onClick={onViewArticles}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] text-sm font-semibold text-[var(--bg-primary)] transition-opacity pointer-fine:hover:opacity-90"
        >
          Voir les {term.count} articles
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onWatch}
          disabled={watched}
          aria-label={watched ? 'Mot déjà suivi' : `Suivre « ${term.label} »`}
          title={watched ? 'Mot déjà suivi' : 'Suivre ce mot'}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-primary)] transition-colors disabled:text-[var(--trend-hot)] pointer-fine:hover:bg-[var(--hover)]"
        >
          {watched ? <BellRing className="h-4 w-4" aria-hidden="true" /> : <BellPlus className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </aside>
  )
}

function TopicStream({
  report,
  activeKey,
  onSelectTerm,
}: {
  report: TrendReport
  activeKey: string | null
  onSelectTerm: (term: TrendTerm) => void
}) {
  const series = useMemo(() => report.terms.slice(0, STREAM_SERIES), [report.terms])
  const paths = useMemo(() => streamPaths(series.map((term) => term.buckets)), [series])
  if (series.length === 0 || paths.length === 0) return null

  return (
    <section
      aria-label="Flux des sujets"
      className="flex flex-col gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Flux des sujets · {report.windowHours} h</h2>
        <div className="flex flex-wrap gap-1.5">
          {series.map((term, index) => (
            <button
              key={term.key}
              type="button"
              onClick={() => onSelectTerm(term)}
              aria-pressed={term.key === activeKey}
              className="flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] text-[var(--text-primary)] transition-colors"
              style={{ borderColor: term.key === activeKey ? STREAM_COLORS[index] : 'var(--border)' }}
            >
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: STREAM_COLORS[index] }} aria-hidden="true" />
              {term.label}
            </button>
          ))}
        </div>
      </div>
      <svg
        className="cst-stream h-[200px] w-full"
        viewBox="0 0 1000 220"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Volume d’articles des ${series.length} premiers sujets sur ${report.windowHours} heures`}
      >
        {paths.map((d, index) => (
          <path
            key={series[index].key}
            d={d}
            fill={STREAM_COLORS[index]}
            fillOpacity={activeKey === null || series[index].key === activeKey ? 0.9 : 0.3}
            className="cursor-pointer transition-[fill-opacity] duration-300"
            onClick={() => onSelectTerm(series[index])}
          />
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-[var(--text-muted)]">
        <span>il y a {report.windowHours} h</span>
        <span>il y a {Math.round(report.windowHours / 2)} h</span>
        <span>maintenant</span>
      </div>
    </section>
  )
}

/** Aires empilées autour d'une ligne médiane (« streamgraph »), lissées. */
function streamPaths(values: number[][]): string[] {
  const length = values[0]?.length ?? 0
  if (length < 2) return []
  const totals = Array.from({ length }, (_, i) => values.reduce((sum, serie) => sum + (serie[i] ?? 0), 0))
  const max = Math.max(...totals, 1)
  const scale = 196 / max
  const xs = Array.from({ length }, (_, i) => (i * 1000) / (length - 1))
  const curve = (points: [number, number][]) =>
    points
      .map(([x, y], i) => {
        if (i === 0) return `M${x.toFixed(1)} ${y.toFixed(1)}`
        const [px, py] = points[i - 1]
        const mx = (px + x) / 2
        return `C${mx.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  const cumulative = new Array<number>(length).fill(0)
  return values.map((serie) => {
    const lower = xs.map((x, i): [number, number] => [x, 110 + (-totals[i] / 2 + cumulative[i]) * scale])
    serie.forEach((value, i) => {
      cumulative[i] += value
    })
    const upper = xs.map((x, i): [number, number] => [x, 110 + (-totals[i] / 2 + cumulative[i]) * scale])
    return `${curve(upper)} ${curve(lower.reverse()).replace(/^M/, 'L')} Z`
  })
}
