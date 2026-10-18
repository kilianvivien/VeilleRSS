import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, CircleCheck, Link2, Loader2, Plus, Search, Stethoscope, X } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import {
  CATALOG_LANGUAGE_LABELS,
  CATALOG_REGIONS,
  FEED_CATALOG,
  getAllCatalogFeeds,
  searchCatalog,
  type CatalogFeed,
  type CatalogLanguage,
  type CatalogPack,
} from '@/lib/rss/feedCatalog'
import { probeFeed, type FeedProbeResult } from '@/lib/rss/feedProbe'

interface FeedCatalogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** URL des flux déjà abonnés, pour griser ce qui est déjà présent. */
  subscribedUrls: Set<string>
  onAddFeeds: (feeds: CatalogFeed[], category: string) => void
  /** Ouvre la saisie d'une adresse de flux hors catalogue. */
  onAddUrl?: () => void
}

const ALL = 'all'
const CATALOG_FEEDS = getAllCatalogFeeds()

/** Région de chaque source, pour regrouper un panier multi-bouquets. */
const REGION_BY_FEED_ID = new Map(FEED_CATALOG.flatMap((pack) => pack.feeds.map((feed) => [feed.id, pack.region] as const)))

const REGION_COUNTS = new Map(
  CATALOG_REGIONS.map((region) => [
    region,
    FEED_CATALOG.filter((pack) => pack.region === region).reduce((sum, pack) => sum + pack.feeds.length, 0),
  ])
)

const LANGUAGE_COUNTS = CATALOG_FEEDS.reduce((counts, feed) => {
  counts.set(feed.language, (counts.get(feed.language) ?? 0) + 1)
  return counts
}, new Map<CatalogLanguage, number>())

const LANGUAGES = Array.from(LANGUAGE_COUNTS.keys()).sort(
  (a, b) => (LANGUAGE_COUNTS.get(b) ?? 0) - (LANGUAGE_COUNTS.get(a) ?? 0)
)

/**
 * Fenêtre « Ajouter des sources » : régions et langues à gauche, bouquets à
 * droite. On ajoute un bouquet entier, une source, ou un panier composé à
 * travers plusieurs bouquets.
 */
export function FeedCatalogModal({ open, onOpenChange, subscribedUrls, onAddFeeds, onAddUrl }: FeedCatalogModalProps) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<string>(ALL)
  const [language, setLanguage] = useState<CatalogLanguage | typeof ALL>(ALL)
  const [basket, setBasket] = useState<Map<string, CatalogFeed>>(() => new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)

  const packs = useMemo(() => {
    const found = searchCatalog(query)
    return found
      .filter((pack) => region === ALL || pack.region === region)
      .map((pack) => (language === ALL ? pack : { ...pack, feeds: pack.feeds.filter((feed) => feed.language === language) }))
      .filter((pack) => pack.feeds.length > 0)
  }, [language, query, region])

  const resultCount = packs.reduce((sum, pack) => sum + pack.feeds.length, 0)
  const followedCount = CATALOG_FEEDS.filter((feed) => subscribedUrls.has(feed.url)).length

  const toggleInBasket = (feed: CatalogFeed) =>
    setBasket((current) => {
      const next = new Map(current)
      if (next.has(feed.id)) next.delete(feed.id)
      else next.set(feed.id, feed)
      return next
    })

  const addBasket = () => {
    const byRegion = new Map<string, CatalogFeed[]>()
    for (const feed of basket.values()) {
      if (subscribedUrls.has(feed.url)) continue
      const feedRegion = REGION_BY_FEED_ID.get(feed.id) ?? 'Autres'
      byRegion.set(feedRegion, [...(byRegion.get(feedRegion) ?? []), feed])
    }
    for (const [feedRegion, feeds] of byRegion) onAddFeeds(feeds, feedRegion)
    setBasket(new Map())
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter des sources"
      description={`${CATALOG_FEEDS.length} médias vérifiés, regroupés en bouquets. Vous en suivez ${followedCount}.`}
      size="xl"
      className="sm:flex sm:max-h-[calc(100dvh-3rem)]! sm:max-w-[1120px] sm:flex-col"
      bodyClassName="sm:flex sm:min-h-0 sm:flex-col sm:pb-0!"
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-4 sm:flex-row sm:gap-6">
        {/* ── Filtres ── */}
        <aside className="flex min-w-0 shrink-0 flex-col gap-4 sm:w-[220px] sm:overflow-y-auto sm:pb-6">
          <div className="hidden flex-col gap-1.5 sm:flex">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--hover)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                style={{ width: `${(followedCount / CATALOG_FEEDS.length) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {followedCount} / {CATALOG_FEEDS.length} sources suivies
            </span>
          </div>

          <nav aria-label="Filtrer par région" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0">
            <FilterRow label="Toutes les régions" count={CATALOG_FEEDS.length} active={region === ALL} onClick={() => setRegion(ALL)} />
            {CATALOG_REGIONS.map((candidate) => (
              <FilterRow
                key={candidate}
                label={candidate}
                count={REGION_COUNTS.get(candidate) ?? 0}
                active={region === candidate}
                onClick={() => setRegion(candidate)}
              />
            ))}
          </nav>

          <div className="flex flex-col gap-2">
            <span className="rss-section-label hidden uppercase text-[var(--text-muted)] sm:block">Langue</span>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="group" aria-label="Filtrer par langue">
              <LanguageChip label="Toutes" active={language === ALL} onClick={() => setLanguage(ALL)} />
              {LANGUAGES.map((candidate) => (
                <LanguageChip
                  key={candidate}
                  label={CATALOG_LANGUAGE_LABELS[candidate]}
                  active={language === candidate}
                  onClick={() => setLanguage(language === candidate ? ALL : candidate)}
                />
              ))}
            </div>
          </div>

          {onAddUrl ? (
            <button
              type="button"
              onClick={onAddUrl}
              className="hidden items-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-2.5 text-left text-xs text-[var(--text-secondary)] transition-colors sm:flex pointer-fine:hover:bg-[var(--hover)]"
            >
              <Link2 className="h-4 w-4 shrink-0 text-[var(--link)]" aria-hidden="true" />
              <span>
                <span className="block font-medium text-[var(--text-primary)]">Une source absente ?</span>
                Collez l’adresse de n’importe quel flux RSS ou Atom.
              </span>
            </button>
          ) : null}
        </aside>

        {/* ── Résultats ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="sticky top-0 z-10 -mx-6 flex shrink-0 items-center gap-2 bg-[var(--surface-elevated)] px-6 py-2 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 focus-within:border-[var(--accent)]">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un média, un pays…"
              aria-label="Rechercher dans le catalogue"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)] tabular-nums">{resultCount}</span>
            {query ? (
              <button
                type="button"
                aria-label="Effacer la recherche"
                title="Effacer la recherche"
                onClick={() => {
                  setQuery('')
                  searchInputRef.current?.focus()
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          {onAddUrl ? (
            <button
              type="button"
              onClick={onAddUrl}
              aria-label="Coller l’adresse d’un flux"
              title="Coller l’adresse d’un flux"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--link)] sm:hidden"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          </div>

          {packs.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">
              Aucune source du catalogue ne correspond. Essayez une autre région ou langue, ou collez
              l’adresse du flux.
            </p>
          ) : (
            <div className="min-w-0 touch-pan-y space-y-3 overflow-x-hidden pr-1 pb-4 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain">
              {packs.map((pack) => (
                <PackSection
                  key={pack.id}
                  pack={pack}
                  subscribedUrls={subscribedUrls}
                  basket={basket}
                  onToggleBasket={toggleInBasket}
                  onAddFeeds={onAddFeeds}
                />
              ))}
            </div>
          )}

          {basket.size > 0 ? (
            <div className="cst-menu sticky bottom-0 flex shrink-0 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] py-2 pr-2 pl-4 shadow-[0_12px_36px_rgba(0,0,0,0.25)] sm:mb-4">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                <span className="font-semibold tabular-nums">{basket.size}</span> source{basket.size > 1 ? 's' : ''} dans la sélection
              </span>
              <Button size="sm" variant="ghost" onClick={() => setBasket(new Map())}>
                Vider
              </Button>
              <Button size="sm" variant="primary" onClick={addBasket}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter la sélection
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

function FilterRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-left text-[13px] whitespace-nowrap transition-colors',
        active
          ? 'bg-[var(--accent-muted)] font-medium text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] pointer-fine:hover:bg-[var(--hover)]'
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">{count}</span>
    </button>
  )
}

function LanguageChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 shrink-0 rounded-full border px-2.5 text-[11px] transition-colors',
        active
          ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] pointer-fine:hover:bg-[var(--hover)]'
      )}
    >
      {label}
    </button>
  )
}

function PackSection({
  pack,
  subscribedUrls,
  basket,
  onToggleBasket,
  onAddFeeds,
}: {
  pack: CatalogPack
  subscribedUrls: Set<string>
  basket: Map<string, CatalogFeed>
  onToggleBasket: (feed: CatalogFeed) => void
  onAddFeeds: (feeds: CatalogFeed[], category: string) => void
}) {
  const missing = pack.feeds.filter((feed) => !subscribedUrls.has(feed.url))
  const followed = pack.feeds.length - missing.length
  const [probes, setProbes] = useState<Record<string, FeedProbeResult>>({})
  const [probing, setProbing] = useState(false)

  // Une source du catalogue peut cesser de publier sans jamais renvoyer
  // d'erreur : ce test lit réellement le flux et compte ses articles, pour ne
  // pas découvrir le problème après l'abonnement.
  const handleProbePack = async () => {
    setProbing(true)
    try {
      const results = await Promise.all(
        pack.feeds.map(async (feed) => [feed.id, await probeFeed(feed.url)] as const)
      )
      setProbes(Object.fromEntries(results))
    } finally {
      setProbing(false)
    }
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{pack.title}</h3>
            <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{pack.region}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{pack.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--hover)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                style={{ width: `${(followed / pack.feeds.length) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {followed}/{pack.feeds.length} suivies
            </span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="min-h-10 sm:min-h-0"
            onClick={() => void handleProbePack()}
            disabled={probing}
            title="Lire chaque flux du bouquet et compter ses articles"
          >
            {probing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Stethoscope className="h-4 w-4" aria-hidden="true" />}
            Vérifier
          </Button>
          <Button
            size="sm"
            variant={missing.length > 0 ? 'primary' : 'ghost'}
            className="min-h-10 sm:min-h-0"
            disabled={missing.length === 0}
            onClick={() => onAddFeeds(missing, pack.region)}
          >
            {missing.length === 0 ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                Bouquet suivi
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {missing.length === 1 ? 'Ajouter la source' : `Ajouter les ${missing.length}`}
              </>
            )}
          </Button>
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {pack.feeds.map((feed) => {
          const subscribed = subscribedUrls.has(feed.url)
          const inBasket = basket.has(feed.id)
          return (
            <li
              key={feed.id}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors',
                inBasket ? 'border-[var(--accent)] bg-[var(--accent-muted)]' : 'border-[var(--border)] pointer-fine:hover:bg-[var(--hover)]'
              )}
            >
              <span className="w-7 shrink-0 rounded-md bg-[var(--hover)] py-0.5 text-center font-mono text-[10px] text-[var(--text-muted)] uppercase">
                {feed.language}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[var(--text-primary)]">{feed.title}</p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {CATALOG_LANGUAGE_LABELS[feed.language]} · {feed.kind}
                </p>
                <ProbeBadge result={probes[feed.id]} />
              </div>
              {subscribed ? (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--success)]"
                  aria-label={`${feed.title} déjà ajouté`}
                  title="Déjà dans vos sources"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onToggleBasket(feed)}
                    aria-pressed={inBasket}
                    aria-label={inBasket ? `Retirer ${feed.title} de la sélection` : `Sélectionner ${feed.title}`}
                    title={inBasket ? 'Retirer de la sélection' : 'Ajouter à la sélection'}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                      inBasket ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]' : 'border-[var(--border-strong)]'
                    )}
                  >
                    {inBasket ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddFeeds([feed], pack.region)}
                    aria-label={`Ajouter ${feed.title}`}
                    title={`Ajouter ${feed.title}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-primary)] transition-colors pointer-fine:hover:bg-[var(--hover-strong)]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Résultat du test d'une source : muet tant que le test n'a pas été lancé. */
function ProbeBadge({ result }: { result?: FeedProbeResult }) {
  if (!result) return null

  const Icon = result.status === 'ok' ? CircleCheck : result.status === 'empty' ? AlertTriangle : X

  return (
    <p
      className={cn(
        'mt-1 flex items-start gap-1 text-[11px] leading-4',
        result.status === 'ok' ? 'text-[var(--success)]' : result.status === 'empty' ? 'text-[var(--warning)]' : 'text-[var(--error)]'
      )}
      role="status"
    >
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{result.message}</span>
    </p>
  )
}
