import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, BellPlus, BellRing, Orbit, Plus, X } from 'lucide-react'
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
  /** Graphe et liste d’articles adaptés à une composition sur une colonne. */
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
  const graphRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const revealDetail = () => {
    if (!compact) return
    requestAnimationFrame(() => {
      detailRef.current?.focus({ preventScroll: true })
      detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  const selectTerm = (term: TrendTerm) => {
    onSelectTerm(term)
    revealDetail()
  }
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
  const watchedStat = activeWatched ? report.watched.find((stat) => stat.term === activeWatched) : undefined
  const focusTerm: TrendTerm | null = watchedStat ? {
    key: report.focus?.key ?? watchedStat.term,
    label: watchedStat.term,
    count: watchedStat.count,
    previousCount: watchedStat.previousCount,
    delta: watchedStat.delta,
    changeRatio: watchedStat.previousCount > 0 ? watchedStat.delta / watchedStat.previousCount : null,
    isNew: watchedStat.count > 0 && watchedStat.previousCount === 0,
    sourceCount: watchedStat.sourceCount,
    feedIds: [...new Set(watchedStat.itemIds.flatMap((id) => itemById.get(id)?.feedId ?? []))],
    itemIds: watchedStat.itemIds,
    unreadCount: watchedStat.unreadCount,
    buckets: watchedStat.buckets,
    isPhrase: watchedStat.term.includes(' '),
  } : report.terms.find((term) => term.key === activeKey) ?? (activeKey || activeWatched ? null : report.terms[0] ?? null)
  const neighbours = useMemo(
    () => {
      if (!focusTerm) return []
      if (!activeWatched) return neighbourKeys(graph, focusTerm.key)
      const ids = new Set(focusTerm.itemIds)
      return graph.nodes.filter((node) => node.term.itemIds.some((id) => ids.has(id))).slice(0, 3).map((node) => node.term.key)
    },
    [focusTerm, graph, activeWatched]
  )

  const graphCard = (
    <section
      ref={graphRef}
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
        activeKey={graph.nodes.some((node) => node.term.key === activeKey) ? activeKey : null}
        neighbours={neighbours}
        onSelect={(term) => (term.key === activeKey ? onClearSelection() : selectTerm(term))}
      />
      <details className="border-t border-[var(--border)] pt-1">
        <summary className="min-h-11 cursor-pointer content-center text-xs text-[var(--text-secondary)]">
          Parcourir les {report.terms.length} sujets
        </summary>
        <ul className="grid gap-1 pb-1 sm:grid-cols-2">
          {report.terms.map((term) => (
            <li key={term.key} className="min-w-0">
              <button type="button" onClick={() => selectTerm(term)} aria-pressed={term.key === activeKey}
                className={cn('flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs hover:bg-[var(--hover-strong)]', term.key === activeKey && 'bg-[var(--accent-muted)]')}>
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: TREND_TONE_COLOR[trendTone(term)] }} />
                <span className="min-w-0 flex-1 break-words text-[var(--text-primary)]">{term.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--text-muted)]">{term.count}</span>
                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )

  const detail = focusTerm ? (
    <TopicDetail
      term={focusTerm}
      isSelected={Boolean(activeWatched) || focusTerm.key === activeKey}
      related={neighbours.map((key) => report.terms.find((term) => term.key === key)).filter((term): term is TrendTerm => Boolean(term))}
      itemById={itemById}
      feedById={feedById}
      watched={watchedTerms.some((watched) => watched.toLowerCase() === focusTerm.label.toLowerCase())}
      onSelectTerm={selectTerm}
      onOpenItem={onOpenItem}
      onViewArticles={() => {
        if (!activeWatched && focusTerm.key !== activeKey) onSelectTerm(focusTerm)
        onViewArticles()
      }}
      onWatch={() => onWatchTerm(focusTerm.label)}
      withHeader={!focusPanel}
    />
  ) : null

  const volumeChange = report.previousItemCount === 0 ? null : Math.round(((report.itemCount - report.previousItemCount) / report.previousItemCount) * 100)

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
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
          onSelect={(term) => {
            onSelectWatched?.(term)
            revealDetail()
          }}
          onRemove={onUnwatchTerm}
          onAdd={onWatchTerm}
        />
        {report.terms.length === 0 && !focusPanel ? (
          <section className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-5 py-12 text-center">
            <Orbit className="h-8 w-8 text-[var(--link)]" aria-hidden="true" />
            <h2 className="font-serif text-2xl font-medium">La constellation se prépare</h2>
            <p className="max-w-md text-sm leading-6 text-[var(--text-muted)]">Pas encore assez d’articles sur la période. Ajoutez des sources ou élargissez la fenêtre d’analyse ci-dessus.</p>
          </section>
        ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            {report.terms.length > 0 ? graphCard : null}
            {compact ? null : <TopicStream report={report} activeKey={activeKey} onSelectTerm={selectTerm} />}
          </div>
          {/* Un seul « sujet » à droite : le détail chiffré quand un sujet est
              choisi, flanqué des liens et articles ; sinon le sujet principal. */}
          <div ref={detailRef} tabIndex={-1} className="flex min-w-0 scroll-mt-4 flex-col gap-4 outline-none">
            {compact && (activeKey || activeWatched) ? (
              <button type="button" className="flex min-h-11 items-center gap-2 self-start rounded-full px-3 text-xs text-[var(--link)] hover:bg-[var(--hover)]" onClick={() => graphRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" /> Retour à la constellation
              </button>
            ) : null}
            {focusPanel ? (
              <div className="cst-rise min-w-0 flex-shrink-0 [&>section]:rounded-[20px] [&>section]:p-5">{focusPanel}</div>
            ) : null}
            {detail}
            {compact ? <TopicStream report={report} activeKey={activeKey} onSelectTerm={selectTerm} /> : null}
          </div>
        </div>
        )}
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
              'flex min-h-11 max-w-full items-center rounded-full border text-xs transition-colors sm:min-h-9',
              isActive ? 'border-[var(--trend-hot)] bg-[var(--hover-strong)]' : 'border-[var(--border)]'
            )}
          >
            <button
              type="button"
              onClick={() => onSelect?.(stat.term)}
              aria-pressed={isActive}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-l-full pr-1 pl-3 text-[var(--text-primary)] sm:min-h-9"
            >
              <span className="truncate font-medium">{stat.term}</span>
              <span className="font-mono tabular-nums text-[var(--text-muted)]">{stat.count}</span>
              {stat.delta > 0 ? (
                <span className="font-mono tabular-nums text-[var(--trend-hot)]">+{stat.delta}</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => onRemove?.(stat.term)}
              aria-label={`Ne plus suivre « ${stat.term} »`}
              className="flex min-h-11 w-10 shrink-0 items-center justify-center rounded-r-full text-[var(--text-muted)] sm:min-h-9 sm:w-8 pointer-fine:hover:text-[var(--text-primary)]"
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
        className="flex min-h-11 max-w-full items-center rounded-full border border-dashed border-[var(--border-strong)] pr-1 pl-3 focus-within:border-[var(--accent)] sm:min-h-9"
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] disabled:opacity-40 sm:h-7 sm:w-7 pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)]"
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
    ['en baisse', TREND_TONE_COLOR.down],
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
            {/* Agrandir la zone de contact sans fausser la taille = volume. */}
            <span aria-hidden="true" className="absolute top-1/2 left-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <span className="cst-node-body absolute inset-0 block" style={{ animationDelay: `${-index * 0.7}s` }}>
              {selected && (tone === 'hot' || tone === 'new') ? (
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
  /** Sans en-tête quand un panneau voisin présente déjà le sujet. */
  withHeader?: boolean
}) {
  const color = TREND_TONE_COLOR[trendTone(term)]
  const articles = term.itemIds
    .map((id) => itemById.get(id))
    .filter((item): item is RssItem => Boolean(item))
    .sort((a, b) => (b.publishedAt ?? b.fetchedAt) - (a.publishedAt ?? a.fetchedAt))
    .slice(0, 3)

  return (
    <aside
      aria-label={withHeader ? 'Sujet sélectionné' : `Liens et articles : ${term.label}`}
      key={term.key}
      className="cst-rise flex min-w-0 flex-col gap-4 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
    >
      {withHeader ? (
      <div className="flex flex-col gap-1.5">
        <span className="rss-section-label uppercase text-[var(--text-muted)]">
          {isSelected ? 'Sujet sélectionné' : 'Sujet principal'}
        </span>
        <h2 className="break-words text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{term.label}</h2>
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
                className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-left text-xs text-[var(--text-primary)] transition-colors sm:min-h-8 pointer-fine:hover:bg-[var(--hover)]"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TREND_TONE_COLOR[trendTone(relatedTerm)] }} aria-hidden="true" />
                {relatedTerm.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {articles.length === 0 ? <p className="text-xs leading-5 text-[var(--text-muted)]">Aucun article sur ce sujet dans la période sélectionnée.</p> : null}
      <ul className="flex flex-col gap-1.5">
        {articles.map((item, index) => (
          <li key={item.id} className="cst-rise" style={{ animationDelay: `${index * 0.06}s` }}>
            <button
              type="button"
              onClick={() => onOpenItem(item)}
              className="flex w-full flex-col gap-0.5 rounded-xl bg-[var(--hover)] px-3 py-2.5 text-left transition-colors pointer-fine:hover:bg-[var(--hover-strong)]"
            >
              <span className="w-full truncate text-[11px] text-[var(--text-muted)]">
                <span className="font-medium text-[var(--link)]">{feedById.get(item.feedId)?.title ?? 'Source'}</span>
                {' · '}
                {formatRelativeDate(item.publishedAt ?? item.fetchedAt)}
              </span>
              <span className="line-clamp-2 text-[13px] leading-snug text-[var(--text-primary)]">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onViewArticles}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] text-sm font-semibold text-[var(--bg-primary)] transition-opacity pointer-fine:hover:opacity-90"
        >
          Explorer les articles
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onWatch}
          disabled={watched}
          aria-label={watched ? 'Mot déjà suivi' : `Suivre « ${term.label} »`}
          title={watched ? 'Mot déjà suivi' : 'Suivre ce mot'}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-primary)] transition-colors disabled:text-[var(--trend-hot)] pointer-fine:hover:bg-[var(--hover)]"
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
              className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] text-[var(--text-primary)] transition-colors sm:min-h-7"
              style={{ borderColor: term.key === activeKey ? STREAM_COLORS[index] : 'var(--border)' }}
            >
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: STREAM_COLORS[index] }} aria-hidden="true" />
              {term.label}
            </button>
          ))}
        </div>
      </div>
      <svg
        className="cst-stream h-[140px] w-full sm:h-[200px]"
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
