import { BellRing, Check, Plus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Illustrations du tutoriel : des maquettes abstraites, pas des captures.
 *
 * Une capture d'écran vieillit au premier remaniement d'interface et se lit
 * mal en vignette. Ces blocs reprennent la grammaire visuelle de
 * l'application — cartes arrondies, barres de texte, accent bleu — pour
 * évoquer chaque fonction sans figer un pixel.
 */

/** Barre grise figurant une ligne de texte. */
function Line({ w, strong = false }: { w: string; strong?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block h-1.5 rounded-full',
        strong ? 'bg-[var(--text-muted)] opacity-60' : 'bg-[var(--border)]'
      )}
      style={{ width: w }}
    />
  )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'w-full max-w-[19rem] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_12px_32px_rgba(15,23,42,0.10)]',
        className
      )}
    >
      {children}
    </div>
  )
}

const ACCENT_SOFT = 'color-mix(in srgb, var(--accent) 14%, transparent)'
const ACCENT_LINE = 'color-mix(in srgb, var(--accent) 28%, transparent)'

/** 1 — Bienvenue : l'icône de l'application dans ses ondes de diffusion. */
export function WelcomeVisual() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      <span
        className="tour-breathe absolute h-32 w-32 rounded-full blur-2xl"
        style={{ background: 'color-mix(in srgb, var(--accent) 32%, transparent)' }}
      />

      {/* Anneaux décalés d'un tiers de cycle : l'onde paraît continue. */}
      {[0, 1.13, 2.26].map((delay, index) => (
        <span
          key={delay}
          className="tour-ripple absolute h-36 w-36 rounded-full border"
          style={{
            borderColor:
              index === 0
                ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
                : 'color-mix(in srgb, var(--accent) 28%, transparent)',
            animationDelay: `${delay}s`,
          }}
        />
      ))}

      <img
        src="/favicon-64.png"
        alt=""
        width={72}
        height={72}
        className="tour-breathe relative h-[4.5rem] w-[4.5rem] rounded-[20px] shadow-[0_14px_34px_rgba(47,111,228,0.34)]"
      />
    </div>
  )
}

/** 2 — Sources : des flux qu'on ajoute d'un geste. */
export function SourcesVisual() {
  const rows = [
    { name: '62%', meta: '38%', added: true },
    { name: '48%', meta: '30%', added: false },
    { name: '55%', meta: '34%', added: false },
  ]

  return (
    <Panel>
      <div className="space-y-2" aria-hidden="true">
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2"
            style={{
              borderColor: row.added ? ACCENT_LINE : 'var(--border)',
              background: row.added ? ACCENT_SOFT : 'transparent',
            }}
          >
            <span
              className="h-6 w-6 shrink-0 rounded-lg"
              style={{ background: row.added ? ACCENT_LINE : 'var(--hover)' }}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Line w={row.name} strong={row.added} />
              <Line w={row.meta} />
            </span>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{ background: row.added ? 'var(--accent)' : 'var(--hover)' }}
            >
              {row.added ? (
                <Check className="h-3 w-3 text-white" />
              ) : (
                <Plus className="h-3 w-3 text-[var(--text-muted)]" />
              )}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

/** 3 — Lecture : la rangée que l'on fait glisser pour classer. */
export function ReadingVisual() {
  return (
    <Panel className="overflow-hidden">
      <div className="space-y-2" aria-hidden="true">
        <div className="flex flex-col gap-1.5 rounded-xl px-2.5 py-2">
          <Line w="70%" strong />
          <Line w="44%" />
        </div>

        {/* Rangée en cours de balayage : l'action se découvre derrière. */}
        <div className="relative overflow-hidden rounded-xl">
          <div className="absolute inset-0 flex items-center justify-start bg-emerald-500 pl-3">
            <Check className="h-4 w-4 text-white" />
          </div>
          <div className="relative flex translate-x-9 flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-2">
            <Line w="58%" strong />
            <Line w="36%" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl px-2.5 py-2 opacity-60">
          <Line w="64%" />
          <Line w="40%" />
        </div>
      </div>
    </Panel>
  )
}

/** 4 — Tendances : la courbe des sujets qui montent et les mots-clés suivis. */
export function TrendsVisual() {
  const bars = [34, 52, 41, 68, 88, 74, 100]

  return (
    <Panel>
      <div className="space-y-3" aria-hidden="true">
        <div className="flex h-20 items-end gap-1.5">
          {bars.map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-md"
              style={{
                height: `${height}%`,
                background:
                  index >= bars.length - 2 ? 'var(--accent)' : ACCENT_LINE,
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['2.75rem', '2rem', '2.4rem'].map((width, index) => (
            <span
              key={index}
              className="flex items-center gap-1.5 rounded-full px-2 py-1"
              style={{ background: index === 0 ? ACCENT_SOFT : 'var(--hover)' }}
            >
              {index === 0 ? (
                <BellRing className="h-3 w-3 text-[var(--accent)]" />
              ) : null}
              <Line w={width} />
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}

/** 5 — IA : le briefing rédigé à partir de la veille. */
export function AiVisual() {
  return (
    <Panel>
      <div className="space-y-3" aria-hidden="true">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: ACCENT_SOFT }}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
          </span>
          <Line w="46%" strong />
        </div>
        <div className="space-y-1.5 rounded-xl bg-[var(--hover)] p-2.5">
          <Line w="92%" />
          <Line w="84%" />
          <Line w="66%" />
        </div>
        <div className="flex gap-1.5">
          {['1.6rem', '1.2rem', '1.4rem'].map((width, index) => (
            <span key={index} className="rounded-full bg-[var(--hover)] px-2 py-1">
              <Line w={width} />
            </span>
          ))}
        </div>
      </div>
    </Panel>
  )
}

/** 6 — Installation : l'icône posée sur l'écran d'accueil. */
export function InstallVisual() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      <span
        className="absolute h-28 w-28 rounded-full blur-2xl"
        style={{ background: 'color-mix(in srgb, var(--accent) 24%, transparent)' }}
      />
      <div
        className="relative w-[7rem] rounded-[1.5rem] border-2 bg-[var(--surface)] p-2.5 pb-2 shadow-[0_16px_38px_rgba(15,23,42,0.18)]"
        style={{ borderColor: 'color-mix(in srgb, var(--text-muted) 30%, transparent)' }}
      >
        <span className="mx-auto mb-2.5 block h-1 w-7 rounded-full bg-[var(--border)]" />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }, (_, index) =>
            index === 4 ? (
              <img
                key={index}
                src="/favicon-64.png"
                alt=""
                className="h-full w-full rounded-[7px] shadow-[0_4px_10px_rgba(47,111,228,0.4)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]"
                style={{ aspectRatio: '1 / 1' }}
              />
            ) : (
              <span
                key={index}
                className="rounded-[7px] bg-[var(--hover)]"
                style={{ aspectRatio: '1 / 1' }}
              />
            )
          )}
        </div>
        {/* Barre d'accueil : c'est elle qui fait lire « téléphone » et non « carte ». */}
        <span className="mx-auto mt-3.5 block h-1 w-10 rounded-full bg-[var(--border)]" />
      </div>
    </div>
  )
}
