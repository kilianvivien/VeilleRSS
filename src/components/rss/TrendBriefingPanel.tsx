import { Check, Copy, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui'
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
  /** Sujets du moment proposés en un clic pour cadrer le briefing. */
  topicSuggestions?: string[]
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
  topicSuggestions = [],
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

  const generateLabel = briefing ? 'Régénérer' : 'Générer le briefing'
  const generateTitle = available
    ? `Rédiger le briefing avec ${providerLabel}`
    : 'Configurez un fournisseur dans Paramètres → IA'

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold sm:text-[26px] tracking-[-0.02em] text-[var(--text-primary)]">Briefing IA</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {briefing
                ? `${briefing.providerLabel} · ${formatGeneratedAt(briefing.generatedAt)}`
                : `${currentItemCount} article${currentItemCount > 1 ? 's' : ''} disponibles sur ${formatWindow(windowHours)}`}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <SegmentedControl<string>
              size="sm"
              className="flex-1 sm:flex-none"
              value={String(windowHours)}
              onChange={(value) => onWindowChange(Number(value))}
              options={BRIEFING_WINDOW_OPTIONS.map((hours) => ({
                value: String(hours),
                label: formatWindow(hours),
              }))}
            />
            <Button
              variant="primary"
              onClick={onGenerate}
              disabled={!available || loading}
              title={generateTitle}
              aria-label={loading ? 'Rédaction en cours' : generateLabel}
              className="h-10 w-10 shrink-0 rounded-full p-0 sm:w-auto sm:rounded-xl sm:px-4"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{loading ? 'Rédaction…' : generateLabel}</span>
            </Button>
          </div>
        </header>

        {/* Le sujet est facultatif : vide, le briefing couvre toute la période. */}
        <div className="flex flex-col gap-2.5 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
          <label className="flex h-12 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 focus-within:border-[var(--accent)]">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--link)]" aria-hidden="true" />
            <input
              value={topic}
              onChange={(event) => onTopicChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && available && !loading) onGenerate()
              }}
              placeholder="Sur quel sujet ? (facultatif)"
              aria-label="Limiter le briefing à un sujet"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            {topic ? (
              <button
                type="button"
                onClick={() => onTopicChange('')}
                aria-label="Briefer toute la période"
                title="Briefer toute la période"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          {topicSuggestions.length > 0 ? (
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
              <span className="mr-1 shrink-0 text-[11px] text-[var(--text-muted)]">Sujets du moment</span>
              {topicSuggestions.map((suggestion) => {
                const active = trimmedTopic.toLowerCase() === suggestion.toLowerCase()
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onTopicChange(active ? '' : suggestion)}
                    aria-pressed={active}
                    className={cn(
                      'h-8 shrink-0 rounded-full border px-3 text-xs whitespace-nowrap transition-colors',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)] pointer-fine:hover:bg-[var(--hover)]'
                    )}
                  >
                    {suggestion}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="status" className="rounded-2xl border border-[color-mix(in_srgb,var(--error)_35%,transparent)] px-4 py-2.5 text-xs text-[var(--error)]">
            {error}
          </p>
        ) : null}

        {loading ? (
          <BriefingSkeleton />
        ) : briefing === null ? (
          <div className="cst-rise flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-[var(--border-strong)] px-5 py-8 text-center sm:px-6 sm:py-14">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
              <Sparkles className="h-6 w-6 text-[var(--link)]" aria-hidden="true" />
            </span>
            <p className="font-serif text-xl font-medium text-[var(--text-primary)] sm:text-2xl">
              {trimmedTopic ? `Le point sur « ${trimmedTopic} »` : 'Votre revue de presse, en un clic'}
            </p>
            <p className="max-w-lg text-sm leading-relaxed text-[var(--text-muted)]">
              {available
                ? trimmedTopic
                  ? `${providerLabel} rédigera une synthèse factuelle de « ${trimmedTopic} » à partir des extraits RSS des ${formatWindow(windowHours)} écoulées. Les articles sont d’abord filtrés localement.`
                  : `${providerLabel} rédigera une synthèse détaillée des événements à partir d’une sélection locale d’extraits parmi les ${currentItemCount} article${currentItemCount > 1 ? 's' : ''} collecté${currentItemCount > 1 ? 's' : ''} sur ${formatWindow(windowHours)}.`
                : 'Choisissez un fournisseur dans Paramètres → IA, section « Fournisseurs par fonctionnalité », ligne « Veille presse ».'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <article className="cst-rise flex min-w-0 flex-col gap-5 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="rss-section-label uppercase text-[var(--text-muted)]">
                    Synthèse éditoriale · {formatWindow(briefing.windowHours)}
                    {briefing.topic ? ` · ${briefing.topic}` : ''}
                  </p>
                  <h2 className="mt-1.5 font-serif text-[28px] leading-tight font-medium text-[var(--text-primary)]">
                    {briefing.topic ? `Le point sur « ${briefing.topic} »` : 'L’essentiel de la période'}
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    aria-label={copied ? 'Briefing copié' : 'Copier le briefing'}
                    title="Copier le briefing"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
                  >
                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={onClear}
                    aria-label="Effacer le briefing"
                    title="Effacer le briefing"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {stale ? (
                <p className="rounded-xl border border-[color-mix(in_srgb,var(--trend-hot)_40%,transparent)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  Résultat pour {formatWindow(briefing.windowHours)}
                  {briefing.topic ? ` · « ${briefing.topic} »` : ''}. La sélection actuelle est{' '}
                  {formatWindow(windowHours)}
                  {trimmedTopic ? ` · « ${trimmedTopic} »` : ' · sans sujet'}. Régénérez pour l’aligner.
                </p>
              ) : null}

              <section aria-label="Briefing rédigé par l’IA">
                <ol className="flex flex-col">
                  {briefing.lines.map((line, index) => (
                    <li
                      key={`${index}-${line.slice(0, 24)}`}
                      className="cst-rise grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-t border-[var(--border)] py-4 first:border-t-0 first:pt-0"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <span className="font-mono text-sm text-[var(--link)] tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="font-serif text-[17px] leading-[1.6] text-[var(--text-primary)]">{line}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </article>

            <aside aria-label="Données du briefing" className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-0">
              <BriefingStatsBar stats={briefing.stats} windowHours={briefing.windowHours} />
              <VolumeChart stats={briefing.stats} windowHours={briefing.windowHours} />
              <TopTermsChart stats={briefing.stats} />
              <TopSourcesChart stats={briefing.stats} />
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

/** Silhouette animée pendant la rédaction : la page ne reste jamais figée. */
function BriefingSkeleton() {
  return (
    <div role="status" aria-label="Rédaction du briefing en cours" className="flex flex-col gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
      <span className="cst-shimmer h-3 w-40 rounded-full" />
      <span className="cst-shimmer h-7 w-2/3 rounded-full" />
      {[92, 84, 96, 78, 88].map((width, index) => (
        <span key={index} className="cst-shimmer h-4 rounded-full" style={{ width: `${width}%`, animationDelay: `${index * 0.12}s` }} />
      ))}
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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="font-mono text-lg font-medium text-[var(--text-primary)] tabular-nums">{value}</p>
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
              fill="var(--trend-calm)"
              opacity={0.85}
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
                className="cst-grow mt-1 h-1.5 rounded-full bg-[var(--trend-hot)]"
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
                className="cst-grow mt-1 h-1.5 rounded-full bg-[var(--trend-new)] opacity-80"
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
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="rss-section-label mb-3 text-[var(--text-muted)] uppercase">{title}</h3>
        {children}
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">{caption}</p>
      </div>
    </section>
  )
}
