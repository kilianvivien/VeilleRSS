import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { TrendFocus, TrendReport } from '@/lib/rss/trendAnalysis'
import { cn } from '@/lib/utils/cn'
import { formatRelativeDate } from './rssFormatting'

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function TrendFocusCard({ focus, report, onClear, onViewArticles }: {
  focus: TrendFocus
  report: TrendReport
  onClear: () => void
  onViewArticles?: () => void
}) {
  const delta = focus.count - focus.previousCount
  const change = focus.previousCount === 0
    ? focus.count > 0 ? 'Nouveau sur la période' : 'Aucune publication'
    : delta === 0 ? 'Stable' : `${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta / focus.previousCount) * 100)} %`
  const share = report.itemCount > 0 ? focus.count / report.itemCount * 100 : 0

  return (
    <section aria-label={`Détail du sujet : ${focus.label}`} className="min-w-0 rounded-card border border-[var(--glass-border)] bg-[var(--surface-alt,var(--surface))] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {focus.kind === 'keyword' ? 'Mot-clé suivi' : 'Sujet sélectionné'}
          </p>
          <h3 className="mt-1 break-words text-lg font-semibold text-[var(--text-primary)]">{focus.label}</h3>
        </div>
        <button type="button" onClick={onClear} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Vue globale
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Sur les {report.windowHours} dernières heures · articles en cache</p>

      <dl className="my-3 grid grid-cols-3 gap-2">
        {[
          ['Articles', focus.count],
          ['Sources', focus.sourceCount],
          ['Non lus', focus.unreadCount],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={cn('font-semibold tabular-nums', delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : delta < 0 ? 'text-orange-700 dark:text-orange-300' : 'text-[var(--text-secondary)]')}>{change}</span>
        <span className="text-[var(--text-muted)]">contre {focus.previousCount} article{focus.previousCount > 1 ? 's' : ''} sur les {report.windowHours} h précédentes</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
        {numberFormat.format(share)} % des articles de la période · {focus.sourceCount} source{focus.sourceCount > 1 ? 's' : ''} contre {focus.previousSourceCount} auparavant
      </p>

      <TrendEvolutionChart key={`${focus.kind}:${focus.key}:${report.generatedAt}:${report.windowHours}`} focus={focus} report={report} />

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {focus.latestPublishedAt === null
          ? 'Aucun article sur ce sujet dans la fenêtre sélectionnée.'
          : `Dernier article ${formatRelativeDate(focus.latestPublishedAt, report.generatedAt)}`}
      </p>
      {onViewArticles ? (
        <button type="button" onClick={onViewArticles} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--accent-muted)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          Voir les articles <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}

/** Deux séries sur une même échelle ; chaque tranche est consultable au clavier. */
function TrendEvolutionChart({ focus, report }: { focus: TrendFocus; report: TrendReport }) {
  const peak = Math.max(...focus.buckets, 0)
  const max = Math.max(peak, ...focus.previousBuckets, 1)
  const [selectedBucket, setSelectedBucket] = useState(focus.buckets.length - 1)
  const bucketMs = report.bucketHours * 3_600_000
  const windowStart = report.generatedAt - report.windowHours * 3_600_000
  const interval = (index: number, previous = false) => {
    const start = windowStart + index * bucketMs - (previous ? report.windowHours * 3_600_000 : 0)
    return `${dateFormat.format(start)} – ${dateFormat.format(start + bucketMs)}`
  }
  const current = focus.buckets[selectedBucket] ?? 0
  const previous = focus.previousBuckets[selectedBucket] ?? 0

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-1 text-xs">
        <h4 className="font-medium text-[var(--text-primary)]">Évolution des publications</h4>
        <span className="text-[var(--text-muted)]">Tranches de {numberFormat.format(report.bucketHours)} h · pic : {peak}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--accent)]" />Période actuelle</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--text-muted)] opacity-40" />Période précédente</span>
      </div>
      <div role="group" aria-label={`Évolution de ${focus.label}`} className="mt-3 grid h-24 gap-1 border-b border-[var(--border)]" style={{ gridTemplateColumns: `repeat(${focus.buckets.length}, minmax(0, 1fr))` }}>
        {focus.buckets.map((count, index) => (
          <button
            key={index}
            type="button"
            aria-label={`${interval(index)} : ${count} articles ; période précédente : ${focus.previousBuckets[index] ?? 0} articles`}
            aria-pressed={selectedBucket === index}
            title={`${interval(index)} : ${count} articles`}
            onClick={() => setSelectedBucket(index)}
            onFocus={() => setSelectedBucket(index)}
            className={cn('flex h-full min-w-0 items-end justify-center gap-0.5 rounded-t px-0.5 pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]', selectedBucket === index ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--hover)]')}
          >
            <span aria-hidden="true" className="min-w-0 flex-1 rounded-t-sm bg-[var(--text-muted)] opacity-40" style={{ height: `${(focus.previousBuckets[index] ?? 0) / max * 100}%` }} />
            <span aria-hidden="true" className="min-w-0 flex-1 rounded-t-sm bg-[var(--accent)]" style={{ height: `${count / max * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span>{dateFormat.format(windowStart)}</span><span>{dateFormat.format(report.generatedAt)}</span>
      </div>
      <div className="mt-2 min-h-14 text-[11px] leading-5 text-[var(--text-muted)]" aria-live="polite" aria-atomic="true">
        <p className="text-[var(--text-secondary)]">{interval(selectedBucket)} : <strong>{current} article{current > 1 ? 's' : ''}</strong></p>
        <p>{interval(selectedBucket, true)} : {previous} article{previous > 1 ? 's' : ''}</p>
      </div>
    </div>
  )
}
