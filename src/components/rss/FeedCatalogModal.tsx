import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CircleCheck,
  Globe,
  Layers,
  Loader2,
  Plus,
  Search,
  Stethoscope,
  X,
} from 'lucide-react'
import { Button, Input, Modal } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import {
  CATALOG_LANGUAGE_LABELS,
  CATALOG_REGIONS,
  getAllCatalogFeeds,
  searchCatalog,
  type CatalogFeed,
  type CatalogPack,
} from '@/lib/rss/feedCatalog'
import { probeFeed, type FeedProbeResult } from '@/lib/rss/feedProbe'

interface FeedCatalogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** URL des flux déjà abonnés, pour griser ce qui est déjà présent. */
  subscribedUrls: Set<string>
  onAddFeeds: (feeds: CatalogFeed[], category: string) => void
}

const ALL_REGIONS = 'all'
const CATALOG_FEED_COUNT = getAllCatalogFeeds().length

/**
 * Fenêtre « Ajouter des sources » : parcourt le catalogue intégré par région,
 * permet d’ajouter un bouquet entier ou une source à la fois.
 */
export function FeedCatalogModal({
  open,
  onOpenChange,
  subscribedUrls,
  onAddFeeds,
}: FeedCatalogModalProps) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<string>(ALL_REGIONS)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const packs = useMemo(() => {
    const found = searchCatalog(query)
    return region === ALL_REGIONS ? found : found.filter((pack) => pack.region === region)
  }, [query, region])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter des sources"
      description={`${CATALOG_FEED_COUNT} sources vérifiées, regroupées en bouquets prêts à l’emploi.`}
      size="xl"
    >
      <div className="min-w-0 space-y-4 overflow-x-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une source (Cumhuriyet, agence, anglais…)"
              aria-label="Rechercher dans le catalogue"
              className={cn('pl-9', query && 'pr-10')}
            />
            {query && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                title="Effacer la recherche"
                onClick={() => {
                  setQuery('')
                  searchInputRef.current?.focus()
                }}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <RegionChip label="Toutes" active={region === ALL_REGIONS} onClick={() => setRegion(ALL_REGIONS)} />
            {CATALOG_REGIONS.map((candidate) => (
              <RegionChip
                key={candidate}
                label={candidate}
                active={region === candidate}
                onClick={() => setRegion(candidate)}
              />
            ))}
          </div>
        </div>

        {packs.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Aucune source du catalogue ne correspond. Vous pouvez ajouter n’importe quelle URL de flux
            depuis la barre du lecteur.
          </p>
        ) : (
          <div className="min-w-0 touch-pan-y space-y-4 overflow-x-hidden pr-1 sm:max-h-[58dvh] sm:overflow-y-auto sm:overscroll-contain">
            {packs.map((pack) => (
              <PackSection
                key={pack.id}
                pack={pack}
                subscribedUrls={subscribedUrls}
                onAddFeeds={onAddFeeds}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function RegionChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-10 rounded-full border px-2.5 py-1 text-xs transition-colors sm:min-h-0',
        active
          ? 'border-[var(--glass-border)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
      )}
    >
      {label}
    </button>
  )
}

function PackSection({
  pack,
  subscribedUrls,
  onAddFeeds,
}: {
  pack: CatalogPack
  subscribedUrls: Set<string>
  onAddFeeds: (feeds: CatalogFeed[], category: string) => void
}) {
  const missing = pack.feeds.filter((feed) => !subscribedUrls.has(feed.url))
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
    <section className="rounded-card min-w-0 max-w-full overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Layers className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            {pack.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{pack.description}</p>
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
            {probing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Stethoscope className="h-4 w-4" aria-hidden="true" />
            )}
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
                Bouquet ajouté
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

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {pack.feeds.map((feed) => {
          const subscribed = subscribedUrls.has(feed.url)
          return (
            <li
              key={feed.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/35 px-2.5 py-2 transition-colors hover:bg-[var(--hover)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--text-primary)]">{feed.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-[var(--text-muted)]">
                  <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {CATALOG_LANGUAGE_LABELS[feed.language]} · {feed.kind}
                </p>
                <ProbeBadge result={probes[feed.id]} />
              </div>
              <Button
                size="sm"
                variant={subscribed ? 'ghost' : 'secondary'}
                disabled={subscribed}
                onClick={() => onAddFeeds([feed], pack.region)}
                aria-label={subscribed ? `${feed.title} déjà ajouté` : `Ajouter ${feed.title}`}
                title={subscribed ? 'Déjà dans vos sources' : `Ajouter ${feed.title}`}
              >
                {subscribed ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              </Button>
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

  const Icon =
    result.status === 'ok' ? CircleCheck : result.status === 'empty' ? AlertTriangle : X

  return (
    <p
      className={cn(
        'mt-1 flex items-start gap-1 text-[11px] leading-4',
        result.status === 'ok'
          ? 'text-emerald-700 dark:text-emerald-300'
          : result.status === 'empty'
            ? 'text-orange-700 dark:text-orange-300'
            : 'text-red-700 dark:text-red-300'
      )}
      role="status"
    >
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{result.message}</span>
    </p>
  )
}
