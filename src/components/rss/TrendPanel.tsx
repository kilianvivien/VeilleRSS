import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellPlus,
  BellRing,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sparkline } from './Sparkline'
import { cn } from '@/lib/utils/cn'
import {
  TREND_WINDOW_OPTIONS,
  type TrendReport,
  type TrendTerm,
  type WatchedKeywordStat,
} from '@/lib/rss/trendAnalysis'

const WINDOW_LABELS: Record<number, string> = {
  6: '6 h',
  24: '24 h',
  72: '3 j',
  168: '7 j',
}

interface TrendPanelProps {
  report: TrendReport
  windowHours: number
  onWindowChange: (hours: number) => void
  watchedTerms: string[]
  onWatchTerm: (term: string) => void
  onUnwatchTerm: (term: string) => void
  /** Section « Mots-clés suivis » repliée ; l’état est conservé dans les réglages. */
  watchedCollapsed: boolean
  onToggleWatchedCollapsed: () => void
  /** Filtre la liste d’articles sur ce terme. */
  onSelectTerm: (term: TrendTerm) => void
  onSelectWatched: (term: string) => void
  activeTermKey: string | null
  aiRefinement: {
    available: boolean
    loading: boolean
    active: boolean
    providerLabel: string
    error: string | null
  }
  onRefineWithAi: () => void
  onClearAiRefinement: () => void
}

function formatDelta(term: Pick<TrendTerm, 'delta' | 'changeRatio' | 'isNew'>): string {
  if (term.isNew) return 'Nouveau'
  if (term.delta === 0) return 'Stable'
  const sign = term.delta > 0 ? '+' : '−'
  const percentage =
    term.changeRatio === null ? null : `${Math.round(Math.abs(term.changeRatio) * 100)} %`
  return percentage ? `${sign}${percentage}` : `${sign}${Math.abs(term.delta)}`
}

function DeltaBadge({ term }: { term: Pick<TrendTerm, 'delta' | 'changeRatio' | 'isNew'> }) {
  const rising = term.isNew || term.delta > 0
  const falling = !term.isNew && term.delta < 0
  const Icon = term.isNew ? Sparkles : rising ? ArrowUpRight : falling ? ArrowDownRight : ArrowRight

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        rising &&
          'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-900/35 dark:text-emerald-200',
        falling &&
          'border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700/70 dark:bg-orange-900/35 dark:text-orange-200',
        !rising && !falling && 'bg-[var(--hover)] text-[var(--text-muted)]'
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {formatDelta(term)}
    </span>
  )
}

/**
 * Tableau de bord des tendances : volume global, termes en hausse et mots-clés
 * suivis. Tout est calculé localement à partir des articles déjà téléchargés.
 */
export function TrendPanel({
  report,
  windowHours,
  onWindowChange,
  watchedTerms,
  onWatchTerm,
  onUnwatchTerm,
  watchedCollapsed,
  onToggleWatchedCollapsed,
  onSelectTerm,
  onSelectWatched,
  activeTermKey,
  aiRefinement,
  onRefineWithAi,
  onClearAiRefinement,
}: TrendPanelProps) {
  const [newKeyword, setNewKeyword] = useState('')
  const watchedSet = new Set(watchedTerms.map((term) => term.toLowerCase()))

  const volumeDelta = report.itemCount - report.previousItemCount
  const volumeRatio = report.previousItemCount === 0 ? null : volumeDelta / report.previousItemCount

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim()
    if (!trimmed) return
    onWatchTerm(trimmed)
    setNewKeyword('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* L’onglet du volet annonce déjà « Tendances » : ici on ne garde que la
          fenêtre d’analyse, qui est le seul réglage du panneau. */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs text-[var(--text-muted)]">Fenêtre</span>
        <SegmentedControl<string>
          size="sm"
          className="flex-1"
          value={String(windowHours)}
          onChange={(value) => onWindowChange(Number(value))}
          options={TREND_WINDOW_OPTIONS.map((hours) => ({
            value: String(hours),
            label: WINDOW_LABELS[hours] ?? `${hours} h`,
          }))}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={onRefineWithAi}
          disabled={!aiRefinement.available || aiRefinement.loading}
          aria-label="Affiner les tendances avec l’IA"
          title={
            aiRefinement.available
              ? `Écarter les termes génériques avec ${aiRefinement.providerLabel}`
              : 'Configurez un fournisseur dans Paramètres → IA'
          }
        >
          {aiRefinement.loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          IA
        </Button>
      </div>

      {aiRefinement.active || aiRefinement.error ? (
        <div
          className={cn(
            'flex items-center gap-2 border-b px-3 py-1.5 text-[11px] font-medium',
            aiRefinement.error
              ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-200'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-200'
          )}
          role="status"
        >
          <span className="min-w-0 flex-1 truncate">
            {aiRefinement.error
              ? aiRefinement.error
              : `Sélection affinée par ${aiRefinement.providerLabel}. Les volumes restent calculés localement.`}
          </span>
          {aiRefinement.active ? (
            <button
              type="button"
              onClick={onClearAiRefinement}
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 hover:bg-black/5 dark:hover:bg-white/8"
              aria-label="Revenir aux tendances locales"
              title="Revenir aux tendances locales"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Local
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <section aria-label="Volume de publication">
          <div className="rounded-card border border-[var(--border)] bg-[var(--surface-alt,var(--surface))] p-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
                  {report.itemCount}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  article{report.itemCount > 1 ? 's' : ''} · {report.sourceCount} source
                  {report.sourceCount > 1 ? 's' : ''}
                </p>
              </div>
              <Sparkline
                values={report.volumeBuckets}
                width={96}
                height={28}
                label={`Volume par tranche de ${report.bucketHours.toFixed(1)} h`}
              />
            </div>
            <div className="mt-2">
              <DeltaBadge
                term={{
                  delta: volumeDelta,
                  changeRatio: volumeRatio,
                  isNew: report.previousItemCount === 0 && report.itemCount > 0,
                }}
              />
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                contre {report.previousItemCount} sur les{' '}
                {WINDOW_LABELS[windowHours] ?? `${windowHours} h`} précédentes
              </span>
            </div>
          </div>
        </section>

        <section aria-label="Mots-clés suivis">
          <button
            type="button"
            onClick={onToggleWatchedCollapsed}
            aria-expanded={!watchedCollapsed}
            aria-controls="rss-watched-keywords"
            className="mb-2 flex w-full items-center gap-1.5 rounded text-left hover:text-[var(--text-primary)]"
          >
            {watchedCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
            )}
            <span className="rss-section-label text-[var(--text-muted)] uppercase">
              Mots-clés suivis
            </span>
            {watchedTerms.length > 0 ? (
              <span className="rounded-full bg-[var(--hover)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--text-secondary)]">
                {watchedTerms.length}
              </span>
            ) : null}
          </button>

          {watchedCollapsed ? null : (
            <div id="rss-watched-keywords">
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(event) => setNewKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddKeyword()
                  }}
                  placeholder="Ex. Chypre, göçmen, OTAN…"
                  aria-label="Ajouter un mot-clé à suivre"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAddKeyword}
                  disabled={!newKeyword.trim()}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Suivre
                </Button>
              </div>

              {report.watched.length === 0 ? (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Aucun mot-clé suivi. Ajoutez-en un, ou cliquez sur la cloche d’un terme en
                  hausse.
                </p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {report.watched.map((watched) => (
                    <WatchedRow
                      key={watched.term}
                      watched={watched}
                      onSelect={() => onSelectWatched(watched.term)}
                      onRemove={() => onUnwatchTerm(watched.term)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section aria-label="Termes en hausse">
          <h3 className="rss-section-label mb-2 text-[var(--text-muted)] uppercase">
            Sujets qui montent
          </h3>
          {report.terms.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Pas encore assez d’articles sur cette période pour dégager une tendance. Élargissez la
              fenêtre ou rafraîchissez vos sources.
            </p>
          ) : (
            <ul className="space-y-1">
              {report.terms.map((term) => (
                <li key={term.key}>
                  <div
                    className={cn(
                      'group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                      activeTermKey === term.key
                        ? 'border-[var(--glass-border)] bg-[var(--accent-muted)]'
                        : 'border-transparent hover:bg-[var(--hover)]'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTerm(term)}
                      className="min-w-0 flex-1 text-left"
                      title={`Filtrer les articles sur « ${term.label} »`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm text-[var(--text-primary)]">
                          {term.label}
                        </span>
                        <DeltaBadge term={term} />
                      </span>
                      <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                        {term.count} article{term.count > 1 ? 's' : ''} · {term.sourceCount} source
                        {term.sourceCount > 1 ? 's' : ''}
                        {term.unreadCount > 0
                          ? ` · ${term.unreadCount} non lu${term.unreadCount > 1 ? 's' : ''}`
                          : ''}
                      </span>
                    </button>
                    <Sparkline values={term.buckets} width={48} height={16} />
                    <button
                      type="button"
                      className={cn(
                        'rounded p-1 text-[var(--text-muted)] transition-opacity hover:bg-[var(--hover)] hover:text-[var(--text-primary)]',
                        watchedSet.has(term.label.toLowerCase())
                          ? 'text-[var(--accent)]'
                          : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                      )}
                      onClick={() => onWatchTerm(term.label)}
                      aria-label={`Suivre le mot-clé ${term.label}`}
                      title={`Suivre « ${term.label} »`}
                    >
                      {watchedSet.has(term.label.toLowerCase()) ? (
                        <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <BellPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function WatchedRow({
  watched,
  onSelect,
  onRemove,
}: {
  watched: WatchedKeywordStat
  onSelect: () => void
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5">
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm text-[var(--text-primary)]">{watched.term}</span>
          <span className="shrink-0 rounded-full bg-[var(--hover)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
            {watched.count}
          </span>
          {watched.count > 0 ? (
            <DeltaBadge
              term={{
                delta: watched.delta,
                changeRatio:
                  watched.previousCount === 0 ? null : watched.delta / watched.previousCount,
                isNew: watched.previousCount === 0,
              }}
            />
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
          {watched.count === 0
            ? 'Aucune occurrence sur la période'
            : `${watched.sourceCount} source${watched.sourceCount > 1 ? 's' : ''}${
                watched.unreadCount > 0
                  ? ` · ${watched.unreadCount} non lu${watched.unreadCount > 1 ? 's' : ''}`
                  : ''
              }`}
        </span>
      </button>
      {watched.count > 0 ? <Sparkline values={watched.buckets} width={40} height={14} /> : null}
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        aria-label={`Ne plus suivre ${watched.term}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  )
}
