import { useMemo, useState } from 'react'
import { Moon, Plus, Sparkles, Sun } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AppIcon } from '@/components/rss/AppIcon'
import { ConstellationGraph } from '@/components/rss/ConstellationView'
import { buildTopicGraph, neighbourKeys } from '@/lib/rss/topicGraph'
import type { TrendTerm } from '@/lib/rss/trendAnalysis'
import { useSettingsStore } from '@/stores/settingsStore'
import type { AccentColor } from '@/types/settings'

/**
 * Illustrations du tutoriel, dans la grammaire « Constellation » : cartes
 * sombres ou claires selon le thème, nœuds colorés par tonalité, titres en
 * serif. Ce sont des maquettes vivantes, pas des captures : elles ne
 * vieillissent pas au premier remaniement.
 */

function Panel({ children, className, decorative = false }: { children: React.ReactNode; className?: string; decorative?: boolean }) {
  return (
    <div
      aria-hidden={decorative || undefined}
      className={cn(
        'w-full max-w-[22rem] rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.18)]',
        className
      )}
    >
      {children}
    </div>
  )
}

const TONES = ['var(--trend-hot)', 'var(--trend-new)', 'var(--trend-calm)']

/** 1 — Bienvenue : l'icône au centre d'une petite constellation. */
export function WelcomeVisual() {
  const satellites = [
    { x: -92, y: -38, size: 22, color: TONES[0], delay: 0.2 },
    { x: 96, y: -54, size: 16, color: TONES[1], delay: 0.35 },
    { x: 84, y: 52, size: 26, color: TONES[2], delay: 0.5 },
    { x: -70, y: 62, size: 14, color: TONES[1], delay: 0.65 },
  ]
  return (
    <div className="relative flex h-48 w-72 items-center justify-center" aria-hidden="true">
      {satellites.map((node) => (
        <span
          key={`${node.x}-${node.y}`}
          className="absolute left-1/2 top-1/2 h-px origin-left bg-[color-mix(in_srgb,var(--text-primary)_18%,transparent)]"
          style={{
            width: Math.hypot(node.x, node.y) - 40,
            transform: `rotate(${(Math.atan2(node.y, node.x) * 180) / Math.PI}deg) translateX(40px)`,
          }}
        />
      ))}
      {satellites.map((node) => (
        <span
          key={`n-${node.x}`}
          className="cst-node absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: node.size,
            height: node.size,
            marginLeft: node.x - node.size / 2,
            marginTop: node.y - node.size / 2,
            background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${node.color} 70%, white), ${node.color} 72%)`,
            boxShadow: `0 0 24px color-mix(in srgb, ${node.color} 40%, transparent)`,
            animationDelay: `${node.delay}s`,
          }}
        />
      ))}
      <span className="tour-breathe relative">
        <AppIcon size={80} className="drop-shadow-[0_16px_34px_rgba(106,90,224,0.4)]" />
      </span>
    </div>
  )
}

/** 2 — Sources : le catalogue, ses régions et ses bouquets. */
export function SourcesVisual() {
  const packs = [
    { title: 'Grands quotidiens français', followed: 5, total: 7 },
    { title: 'Presse allemande', followed: 2, total: 7 },
    { title: 'Agences de presse turques', followed: 0, total: 5 },
  ]
  return (
    <Panel decorative>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {['France', 'Europe', 'Turquie', 'Monde'].map((region, index) => (
          <span
            key={region}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[10px]',
              index === 0 ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-muted)]'
            )}
          >
            {region}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {packs.map((pack, index) => (
          <div key={pack.title} className="cst-rise flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2" style={{ animationDelay: `${0.1 + index * 0.1}s` }}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--text-primary)]">{pack.title}</p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--hover)]">
                <div className="cst-grow h-full rounded-full bg-[var(--accent)]" style={{ width: `${(pack.followed / pack.total) * 100}%`, animationDelay: `${0.3 + index * 0.1}s` }} />
              </div>
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)]">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/** 3 — Lecture : la liste qui mène au lecteur. */
export function ReadingVisual() {
  const rows = [
    { source: 'Le Monde', title: 'Au Sénat, la trajectoire des dépenses en débat', topic: 'Budget 2027', tone: TONES[0], unread: true },
    { source: 'Tagesschau', title: 'Berlin plaide pour un calendrier réaliste', topic: 'Élargissement UE', tone: TONES[1], unread: true },
    { source: 'Hürriyet', title: 'Ankara salue une « nouvelle méthode »', topic: 'Grèce – Turquie', tone: TONES[0], unread: false },
  ]
  return (
    <Panel decorative className="p-2">
      {rows.map((row, index) => (
        <div
          key={row.title}
          className={cn('cst-rise flex flex-col gap-1 rounded-xl px-3 py-2.5', index === 0 && 'bg-[var(--accent-muted)] shadow-[inset_3px_0_0_var(--accent)]')}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className={cn('h-1.5 w-1.5 rounded-full', row.unread ? 'bg-[var(--accent)]' : 'bg-transparent')} />
            <span className="font-medium text-[var(--link)]">{row.source}</span>
          </span>
          <span className={cn('pl-3 text-xs leading-snug text-[var(--text-primary)]', row.unread && 'font-semibold')}>{row.title}</span>
          <span className="flex items-center gap-1 pl-3 text-[10px] text-[var(--text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.tone }} />
            {row.topic}
          </span>
        </div>
      ))}
    </Panel>
  )
}

function sampleTerm(key: string, count: number, ids: string[], tone: 'hot' | 'new' | 'calm'): TrendTerm {
  return {
    key,
    label: key,
    count,
    previousCount: tone === 'new' ? 0 : tone === 'hot' ? Math.round(count / 3) : count,
    delta: 0,
    changeRatio: tone === 'new' ? null : tone === 'hot' ? 2 : 0.1,
    isNew: tone === 'new',
    sourceCount: 4,
    feedIds: [],
    itemIds: ids,
    unreadCount: count,
    buckets: [],
    isPhrase: false,
  }
}

const range = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`)

const SAMPLE_TERMS: TrendTerm[] = [
  sampleTerm('Budget', 30, [...range('b', 24), ...range('s', 6)], 'hot'),
  sampleTerm('Sénat', 14, [...range('s', 6), ...range('x', 8)], 'calm'),
  sampleTerm('Élargissement', 22, [...range('u', 18), ...range('k', 4)], 'new'),
  sampleTerm('Balkans', 10, [...range('k', 4), ...range('y', 6)], 'hot'),
  sampleTerm('Égée', 18, [...range('g', 14), ...range('c', 4)], 'hot'),
  sampleTerm('Chypre', 9, [...range('c', 4), ...range('z', 5)], 'new'),
  sampleTerm('Énergie', 12, [...range('e', 10), 'u0', 'u1'], 'calm'),
]

/** 4 — Tendances : la vraie constellation, sur des sujets d'exemple. */
export function TrendsVisual() {
  const graph = useMemo(() => buildTopicGraph(SAMPLE_TERMS, { limit: 7 }), [])
  const [active, setActive] = useState<string | null>('Égée')
  const neighbours = useMemo(() => (active ? neighbourKeys(graph, active) : []), [active, graph])
  return (
    <Panel className="max-w-[24rem] p-3">
      <ConstellationGraph
        graph={graph}
        activeKey={active}
        neighbours={neighbours}
        onSelect={(term) => setActive(term.key === active ? null : term.key)}
      />
    </Panel>
  )
}

/** 5 — Briefing : une synthèse éditoriale, numérotée. */
export function AiVisual() {
  const lines = ['Le Sénat ouvre l’examen du budget', 'Bruxelles prépare le Conseil européen', 'Athènes et Ankara relancent le dialogue']
  return (
    <Panel decorative>
      <p className="rss-section-label flex items-center gap-1.5 uppercase text-[var(--text-muted)]">
        <Sparkles className="h-3 w-3 text-[var(--link)]" /> Synthèse · 24 h
      </p>
      <p className="mt-1.5 font-serif text-lg leading-tight text-[var(--text-primary)]">L’essentiel de la période</p>
      <ol className="mt-3 flex flex-col">
        {lines.map((line, index) => (
          <li key={line} className="cst-rise grid grid-cols-[1.75rem_1fr] gap-2 border-t border-[var(--border)] py-2 first:border-t-0" style={{ animationDelay: `${0.15 + index * 0.12}s` }}>
            <span className="font-mono text-[11px] text-[var(--link)]">{String(index + 1).padStart(2, '0')}</span>
            <span className="font-serif text-[13px] text-[var(--text-primary)]">{line}</span>
          </li>
        ))}
        <li className="grid grid-cols-[1.75rem_1fr] gap-2 border-t border-[var(--border)] pt-2.5">
          <span className="font-mono text-[11px] text-[var(--text-muted)]">04</span>
          <span className="cst-shimmer h-3 w-4/5 rounded-full" />
        </li>
      </ol>
    </Panel>
  )
}

const ACCENTS: { value: AccentColor; label: string; swatch: string }[] = [
  { value: 'violet', label: 'Violet', swatch: 'linear-gradient(135deg, #9a8cff, #6a5ae0)' },
  { value: 'cyan', label: 'Cyan', swatch: 'linear-gradient(135deg, #3dd6d0, #0e8c86)' },
  { value: 'amber', label: 'Ambre', swatch: 'linear-gradient(135deg, #ffb547, #b86a00)' },
  { value: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg, #f472b6, #c2367a)' },
  { value: 'blue', label: 'Bleu', swatch: 'linear-gradient(135deg, #6ba4ff, #2f6fe4)' },
]

/** 6 — Personnalisation : l'accent et le thème, appliqués en direct. */
export function PersonalizeVisual() {
  const accent = useSettingsStore((state) => state.accentColor) ?? 'violet'
  const theme = useSettingsStore((state) => state.theme)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const isDark = theme === 'dark'
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--text-primary)]">Couleur d’accent</span>
        <div role="radiogroup" aria-label="Couleur d’accent" className="flex w-full justify-between sm:w-auto sm:gap-1.5">
          {ACCENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={accent === option.value}
              aria-label={option.label}
              onClick={() => updateSettings({ accentColor: option.value })}
              className={cn(
                'h-7 w-7 rounded-full transition-transform pointer-fine:hover:scale-110',
                accent === option.value && 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--surface)]'
              )}
              style={{ background: option.swatch }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--text-primary)]">Thème</span>
        <div className="flex rounded-full border border-[var(--border)] p-[3px]">
          {[
            { value: 'light' as const, label: 'Clair', icon: Sun },
            { value: 'dark' as const, label: 'Sombre', icon: Moon },
          ].map((option) => {
            const selected = (option.value === 'dark') === isDark
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => updateSettings({ theme: option.value })}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs transition-colors sm:min-h-8',
                  selected ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-muted)]'
                )}
              >
                <option.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
      <div aria-hidden="true" className="flex items-center gap-2.5 rounded-xl bg-[var(--accent-muted)] px-3 py-2.5 shadow-[inset_3px_0_0_var(--accent)]">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        <span className="text-xs text-[var(--text-primary)]">Aperçu : article sélectionné</span>
        <span className="ml-auto rounded-full bg-[var(--text-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--bg-primary)]">Ouvrir</span>
      </div>
    </Panel>
  )
}

/** 7 — Installation : l'icône posée sur l'écran d'accueil. */
export function InstallVisual() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      <span className="absolute h-28 w-28 rounded-full blur-2xl" style={{ background: 'color-mix(in srgb, var(--accent) 24%, transparent)' }} />
      <div className="relative w-[7.5rem] rounded-[1.6rem] border-2 border-[var(--border-strong)] bg-[var(--surface)] p-2.5 pb-2 shadow-[0_16px_38px_rgba(0,0,0,0.25)]">
        <span className="mx-auto mb-2.5 block h-1 w-7 rounded-full bg-[var(--border)]" />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }, (_, index) =>
            index === 4 ? (
              <span key={index} className="flex items-center justify-center rounded-[8px] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]">
                <AppIcon size={30} />
              </span>
            ) : (
              <span key={index} className="rounded-[8px] bg-[var(--hover)]" style={{ aspectRatio: '1 / 1' }} />
            )
          )}
        </div>
        <span className="mx-auto mt-3.5 block h-1 w-10 rounded-full bg-[var(--border)]" />
      </div>
    </div>
  )
}
