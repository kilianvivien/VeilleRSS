import { Check, ChevronDown, Copy, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Input } from '@/components/ui'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { cn } from '@/lib/utils/cn'
import { copyToClipboard } from '@/lib/platform/clipboardService'
import { BRIEFING_WINDOW_OPTIONS } from '@/lib/rss/trendBriefingService'
import type { RssBriefingStats, RssTrendBriefing } from '@/types/rss'

const WINDOW_LABELS: Record<number, string> = {
  24: '24 h',
  72: '3 j',
  168: '7 j',
  720: '30 j',
}

interface TrendBriefingPanelProps {
  briefing: RssTrendBriefing | null
  windowHours: number
  onWindowChange: (hours: number) => void
  /** Sujet demandé ; vide pour un briefing de toute la période. */
  topic: string
  onTopicChange: (topic: string) => void
  /** Volume actuel de la période sélectionnée, pour prévenir avant de lancer l'IA. */
  currentItemCount: number
  available: boolean
  loading: boolean
  providerLabel: string
  error: string | null
  onGenerate: () => void
  onClear: () => void
}

function formatWindow(hours: number): string {
  return WINDOW_LABELS[hours] ?? `${hours} h`
}

function formatDelta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? 'nouveau' : 'stable'
  const ratio = Math.round(((current - previous) / previous) * 100)
  if (ratio === 0) return 'stable'
  return `${ratio > 0 ? '+' : '−'}${Math.abs(ratio)} %`
}

function formatGeneratedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Volet « Briefing IA » : une dizaine de lignes rédigées par le fournisseur
 * choisi dans Paramètres → IA, adossées à des graphiques calculés localement.
 * L'IA n'écrit que le texte ; aucun chiffre affiché ne vient d'elle.
 */
export function TrendBriefingPanel({
  briefing,
  windowHours,
  onWindowChange,
  topic,
  onTopicChange,
  currentItemCount,
  available,
  loading,
  providerLabel,
  error,
  onGenerate,
  onClear,
}: TrendBriefingPanelProps) {
  const [copied, setCopied] = useState(false)
  const trimmedTopic = topic.trim()
  const stale =
    briefing !== null &&
    (briefing.windowHours !== windowHours || (briefing.topic ?? '') !== trimmedTopic)

  const handleCopy = async () => {
    if (!briefing) return
    const header = `Briefing IA${briefing.topic ? ` — ${briefing.topic}` : ''} — ${formatWindow(briefing.windowHours)} — ${briefing.stats.itemCount} articles, ${briefing.stats.sourceCount} sources`
    await copyToClipboard([header, '', ...briefing.lines].join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs text-[var(--text-muted)]">Période</span>
        <SegmentedControl<string>
          size="sm"
          className="flex-1"
          value={String(windowHours)}
          onChange={(value) => onWindowChange(Number(value))}
          options={BRIEFING_WINDOW_OPTIONS.map((hours) => ({
            value: String(hours),
            label: formatWindow(hours),
          }))}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={onGenerate}
          disabled={!available || loading}
          title={
            available
              ? `Rédiger le briefing avec ${providerLabel}`
              : 'Configurez un fournisseur dans Paramètres → IA'
          }
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {briefing ? 'Régénérer' : 'Générer'}
        </Button>
      </div>

      {/* Le sujet est facultatif : vide, le briefing couvre toute la période. */}
      <div className="relative flex-shrink-0 border-b border-[var(--border)] px-3 py-2">
        <Input
          value={topic}
          onChange={(event) => onTopicChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && available && !loading) onGenerate()
          }}
          placeholder="Sujet ou mot-clé (facultatif) — ex. Chypre, énergie, göçmen"
          aria-label="Limiter le briefing à un sujet"
          className={cn('text-xs', topic && 'pr-8')}
        />
        {topic ? (
          <button
            type="button"
            onClick={() => onTopicChange('')}
            aria-label="Briefer toute la période"
            title="Briefer toute la période"
            className="absolute top-1/2 right-5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p
          role="status"
          className="border-b border-red-300 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-800 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {briefing === null ? (
          <div className="rounded-card border border-dashed border-[var(--border)] p-4 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <p className="mt-2 text-sm text-[var(--text-primary)]">
              Aucun briefing pour l’instant.
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {available
                ? trimmedTopic
                  ? `${providerLabel} produira 5 à 8 conclusions sur ce que les ${formatWindow(windowHours)} écoulées disent de « ${trimmedTopic} ». Les articles sont d’abord filtrés localement.`
                  : `${providerLabel} produira 5 à 8 conclusions sur les tendances des ${formatWindow(windowHours)} écoulées. Une sélection locale et bornée sera extraite des ${currentItemCount} article${currentItemCount > 1 ? 's' : ''} collecté${currentItemCount > 1 ? 's' : ''}.`
                : 'Choisissez un fournisseur dans Paramètres → IA, section « Fournisseurs par fonctionnalité », ligne « Veille presse ».'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 text-[11px] text-[var(--text-muted)]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[var(--text-primary)]">Briefing</span>
                  <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 font-medium text-[var(--text-secondary)]">
                    {formatWindow(briefing.windowHours)}
                  </span>
                  {briefing.topic ? (
                    <span className="max-w-28 truncate rounded-full bg-[var(--accent-muted)] px-2 py-0.5 font-medium text-[var(--text-primary)]">
                      {briefing.topic}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate">
                  {briefing.providerLabel} · {formatGeneratedAt(briefing.generatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  aria-label={copied ? 'Briefing copié' : 'Copier le briefing'}
                  className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  title="Copier le briefing"
                >
                  {copied ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  aria-label="Effacer le briefing"
                  className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  title="Effacer le briefing"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>

            {stale ? (
              <p className="rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-800 dark:border-orange-800/70 dark:bg-orange-950/35 dark:text-orange-200">
                Résultat pour {formatWindow(briefing.windowHours)}
                {briefing.topic ? ` · « ${briefing.topic} »` : ''}. La sélection actuelle est{' '}
                {formatWindow(windowHours)}
                {trimmedTopic ? ` · « ${trimmedTopic} »` : ' · sans sujet'}. Régénérez pour
                l’aligner.
              </p>
            ) : null}

            <section aria-label="Briefing rédigé par l’IA">
              <h3 className="rss-section-label mb-2 text-[var(--text-muted)] uppercase">
                Conclusions
              </h3>
              <ol className="space-y-2">
                {briefing.lines.map((line, index) => (
                  <li
                    key={`${index}-${line.slice(0, 24)}`}
                    className="flex gap-2 text-sm leading-6 text-[var(--text-primary)]"
                  >
                    <span className="mt-0.5 shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </section>

            <details className="group rounded-card border border-[var(--border)] bg-[var(--surface-alt,var(--surface))]">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
                <span>Données et graphiques</span>
                <span className="text-[10px] font-normal text-[var(--text-muted)]">
                  {briefing.stats.itemCount} article{briefing.stats.itemCount > 1 ? 's' : ''} ·{' '}
                  {briefing.stats.sourceCount} source{briefing.stats.sourceCount > 1 ? 's' : ''}
                </span>
                <ChevronDown
                  className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-4 border-t border-[var(--border)] p-3">
                <BriefingStatsBar stats={briefing.stats} windowHours={briefing.windowHours} />
                <VolumeChart stats={briefing.stats} windowHours={briefing.windowHours} />
                <TopTermsChart stats={briefing.stats} />
                <TopSourcesChart stats={briefing.stats} />
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )
}

function BriefingStatsBar({
  stats,
  windowHours,
}: {
  stats: RssBriefingStats
  windowHours: number
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatTile label="articles" value={stats.itemCount} hint={formatWindow(windowHours)} />
      <StatTile
        label="sources"
        value={stats.sourceCount}
        hint={`${stats.topTerms.length} sujet${stats.topTerms.length > 1 ? 's' : ''}`}
      />
      <StatTile
        label="vs période précédente"
        value={formatDelta(stats.itemCount, stats.previousItemCount)}
        hint={`${stats.previousItemCount} avant`}
      />
    </div>
  )
}

function StatTile({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="rounded-card border border-[var(--border)] bg-[var(--surface-alt,var(--surface))] p-2.5">
      <p className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">{value}</p>
      <p className="text-[11px] leading-4 text-[var(--text-muted)]">{label}</p>
      <p className="text-[10px] leading-4 text-[var(--text-muted)]">{hint}</p>
    </div>
  )
}

/** Histogramme du volume par tranche, dessiné en SVG inline comme la Sparkline. */
function VolumeChart({ stats, windowHours }: { stats: RssBriefingStats; windowHours: number }) {
  const values = stats.volumeBuckets
  if (values.length === 0) return null

  const max = Math.max(...values, 1)
  const width = 100
  const height = 32
  const gap = 1.2
  const barWidth = Math.max(0.5, width / values.length - gap)

  return (
    <ChartSection
      title="Volume de publication"
      caption={`Un point toutes les ${stats.bucketHours.toFixed(1)} h sur ${formatWindow(windowHours)} · pic à ${max} article${max > 1 ? 's' : ''}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={`Volume par tranche de ${stats.bucketHours.toFixed(1)} heures : ${values.join(', ')}`}
        focusable="false"
      >
        {values.map((value, index) => {
          const barHeight = (value / max) * (height - 2)
          return (
            <rect
              key={index}
              x={index * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={Math.max(barHeight, value > 0 ? 0.8 : 0)}
              fill="var(--accent)"
              opacity={0.75}
              rx={0.4}
            />
          )
        })}
      </svg>
    </ChartSection>
  )
}

function TopTermsChart({ stats }: { stats: RssBriefingStats }) {
  if (stats.topTerms.length === 0) return null
  const max = Math.max(...stats.topTerms.map((term) => term.count), 1)

  return (
    <ChartSection title="Sujets dominants" caption="Nombre d’articles sur la période">
      <ul className="space-y-1.5">
        {stats.topTerms.map((term) => (
          <li key={term.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-[var(--text-primary)]">{term.label}</p>
              <div
                className="mt-1 h-1.5 rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(4, (term.count / max) * 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums">
              {term.count} · {formatDelta(term.count, term.previousCount)}
            </span>
          </li>
        ))}
      </ul>
    </ChartSection>
  )
}

function TopSourcesChart({ stats }: { stats: RssBriefingStats }) {
  if (stats.topSources.length === 0) return null
  const max = Math.max(...stats.topSources.map((source) => source.count), 1)

  return (
    <ChartSection title="Sources les plus actives" caption="Part de voix sur la période">
      <ul className="space-y-1.5">
        {stats.topSources.map((source) => (
          <li key={source.title} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-[var(--text-primary)]">{source.title}</p>
              <div
                className="mt-1 h-1.5 rounded-full bg-[var(--text-muted)] opacity-60"
                style={{ width: `${Math.max(4, (source.count / max) * 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums">
              {source.count}
            </span>
          </li>
        ))}
      </ul>
    </ChartSection>
  )
}

function ChartSection({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title}>
      <h3 className="rss-section-label mb-1 text-[var(--text-muted)] uppercase">{title}</h3>
      <div className="rounded-card border border-[var(--border)] bg-[var(--surface-alt,var(--surface))] p-2.5">
        {children}
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">{caption}</p>
      </div>
    </section>
  )
}
