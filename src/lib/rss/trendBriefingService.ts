import { generateWithProvider } from '@/lib/ai/pdfGeneration/providerRouter'
import { createRequestControlContext } from '@/lib/ai/requestControl'
import { getLocalAiTimeoutMs } from '@/lib/ai/localAiTimeout'
import { createLogger } from '@/lib/utils/logger'
import type { AiProvider, Settings } from '@/types/settings'
import type { RssBriefingStats, RssFeed, RssItem } from '@/types/rss'
import { matchesKeyword } from './textAnalysis'
import type { TrendReport } from './trendAnalysis'

const logger = createLogger('rss:trend-briefing')

/** Périodes proposées dans le volet Briefing IA, en heures. */
export const BRIEFING_WINDOW_OPTIONS = [24, 72, 168, 720] as const
export type BriefingWindowHours = (typeof BRIEFING_WINDOW_OPTIONS)[number]

const MAX_TOP_TERMS = 8
const MAX_TOP_SOURCES = 6
const MAX_HEADLINES = 16
const TARGET_LINES = 8
const MAX_LINES = 10
const MAX_LINE_LENGTH = 320
const HOUR_MS = 3_600_000

const TOPIC_PROMPT_SUFFIX = `
Ce briefing porte sur un sujet précis, indiqué par le champ « sujet ». Les données ne contiennent que les articles qui le mentionnent.
- traite ce sujet et rien d'autre ;
- si le corpus est trop mince pour ce sujet, dis-le dès la première ligne et écris moins de lignes plutôt que de broder.
`

const SYSTEM_PROMPT = `Tu rédiges le briefing d'une veille presse diplomatique, en français.

Les chiffres te sont fournis : ils ont été mesurés localement sur les articles déjà collectés. Tu ne dois jamais en inventer, ni en modifier un seul.

Règles impératives :
- écris de 5 à ${TARGET_LINES} lignes, une idée par ligne, sans puce ni numérotation ;
- chaque ligne est une phrase complète, en français, au style sobre d'une note diplomatique ;
- cite des chiffres tirés des données fournies (volumes, variations, nombre de sources) dans au moins la moitié des lignes ;
- nomme les sujets et les sources tels qu'ils apparaissent dans les données ;
- commence par le mouvement d'ensemble de la période, puis les sujets dominants, puis ce qui monte ou retombe, puis les mots-clés suivis s'il y en a ;
- n'ajoute ni titre, ni conclusion générique, ni recommandation ;
- si les données sont trop minces pour une observation, dis-le plutôt que de meubler ;
- les titres ont été présélectionnés localement selon les sujets dominants, la récence et la diversité des sources ; n'extrapole pas au-delà de cet échantillon ;
- réponds uniquement avec un objet JSON de la forme {"lines":["ligne 1","ligne 2"]}.
`

export interface GenerateTrendBriefingInput {
  report: TrendReport
  items: RssItem[]
  feeds: RssFeed[]
  /** Restreint l'analyse à ces flux ; absent = toutes les sources. */
  feedIds?: string[]
  /** Restreint le briefing aux articles mentionnant ce sujet ; absent = toute la période. */
  topic?: string
  provider: AiProvider
  settings: Settings
  signal?: AbortSignal
  now?: number
}

export interface TrendBriefingResult {
  lines: string[]
  stats: RssBriefingStats
  generatedAt: number
  provider: AiProvider
}

export interface BriefingHeadline {
  title: string
  source: string
}

/** Texte interrogé pour un briefing thématique : titre, résumé et rubriques. */
function topicText(item: RssItem): string {
  return [item.title, item.summary || item.contentSnippet, item.categories.join(' ')]
    .filter(Boolean)
    .join(' ')
}

/**
 * Restreint un rapport de tendances aux articles mentionnant le sujet demandé.
 *
 * Les volumes sont recomptés à partir des seuls articles retenus : un briefing
 * thématique ne doit jamais citer le volume de toute la période comme s'il
 * était celui du sujet.
 */
export function scopeReportToTopic(
  report: TrendReport,
  items: RssItem[],
  topic: string
): { report: TrendReport; matchingIds: Set<string> } {
  const trimmed = topic.trim()
  if (!trimmed) return { report, matchingIds: new Set(items.map((item) => item.id)) }

  const matchingIds = new Set(
    items.filter((item) => matchesKeyword(topicText(item), trimmed)).map((item) => item.id)
  )

  const terms = report.terms
    .map((term) => {
      const itemIds = term.itemIds.filter((itemId) => matchingIds.has(itemId))
      return { ...term, itemIds, count: itemIds.length }
    })
    .filter((term) => term.count > 0)
    .sort((a, b) => b.count - a.count)

  return {
    report: {
      ...report,
      terms,
      watched: report.watched.filter((watched) =>
        watched.itemIds.some((itemId) => matchingIds.has(itemId))
      ),
    },
    matchingIds,
  }
}

/**
 * Sélection locale et bornée des articles envoyés au modèle.
 *
 * Les sujets déjà calculés donnent la pertinence, puis la récence départage les
 * articles. Une première passe réserve de la place à plusieurs sources avant
 * de compléter avec les meilleurs articles restants. Aucun corps d'article ni
 * résumé n'est transmis : le contexte IA reste petit et prévisible.
 */
export function selectBriefingHeadlines({
  report,
  items,
  feeds,
  feedIds,
  matchingIds,
  now = Date.now(),
}: {
  report: TrendReport
  items: RssItem[]
  feeds: RssFeed[]
  feedIds?: string[]
  matchingIds?: Set<string>
  now?: number
}): BriefingHeadline[] {
  const windowStart = now - Math.max(1, report.windowHours) * HOUR_MS
  const feedFilter = feedIds && feedIds.length > 0 ? new Set(feedIds) : null
  const feedTitleById = new Map(feeds.map((feed) => [feed.id, feed.title]))
  const relevance = new Map<string, number>()

  report.terms.slice(0, MAX_TOP_TERMS).forEach((term, index) => {
    const weight = (MAX_TOP_TERMS - index) * 10
    term.itemIds.forEach((itemId) => relevance.set(itemId, (relevance.get(itemId) ?? 0) + weight))
  })
  report.watched.forEach((watched) => {
    watched.itemIds.forEach((itemId) => relevance.set(itemId, (relevance.get(itemId) ?? 0) + 6))
  })

  const candidates = items
    .filter((item) => {
      if (feedFilter && !feedFilter.has(item.feedId)) return false
      if (matchingIds && !matchingIds.has(item.id)) return false
      const timestamp = item.publishedAt ?? item.fetchedAt
      return timestamp >= windowStart && timestamp <= now
    })
    .sort((a, b) => {
      const scoreDelta = (relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0)
      if (scoreDelta !== 0) return scoreDelta
      return (b.publishedAt ?? b.fetchedAt) - (a.publishedAt ?? a.fetchedAt)
    })

  const sourceCount = new Set(candidates.map((item) => item.feedId)).size
  const firstPassLimit = Math.max(2, Math.ceil(MAX_HEADLINES / Math.max(1, sourceCount)))
  const selected: RssItem[] = []
  const selectedIds = new Set<string>()
  const selectedPerSource = new Map<string, number>()

  for (const item of candidates) {
    if ((selectedPerSource.get(item.feedId) ?? 0) >= firstPassLimit) continue
    selected.push(item)
    selectedIds.add(item.id)
    selectedPerSource.set(item.feedId, (selectedPerSource.get(item.feedId) ?? 0) + 1)
    if (selected.length === MAX_HEADLINES) break
  }

  if (selected.length < MAX_HEADLINES) {
    for (const item of candidates) {
      if (selectedIds.has(item.id)) continue
      selected.push(item)
      if (selected.length === MAX_HEADLINES) break
    }
  }

  return selected.map((item) => ({
    title: item.title,
    source: feedTitleById.get(item.feedId) ?? item.feedId,
  }))
}

interface BriefingPayload {
  lines?: unknown
}

function stripJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

/**
 * Compte les articles par source sur la fenêtre, pour la part de voix.
 * Le classement des sujets vient du rapport de tendances déjà calculé.
 */
export function computeBriefingStats({
  report,
  items,
  feeds,
  feedIds,
  matchingIds,
  now = Date.now(),
}: {
  report: TrendReport
  items: RssItem[]
  feeds: RssFeed[]
  feedIds?: string[]
  /** Articles retenus par le sujet ; absent = toute la période. */
  matchingIds?: Set<string>
  now?: number
}): RssBriefingStats {
  const windowStart = now - Math.max(1, report.windowHours) * HOUR_MS
  const previousStart = windowStart - Math.max(1, report.windowHours) * HOUR_MS
  const feedFilter = feedIds && feedIds.length > 0 ? new Set(feedIds) : null
  const feedTitleById = new Map(feeds.map((feed) => [feed.id, feed.title]))
  const buckets = report.volumeBuckets.length || 1
  const bucketMs = (Math.max(1, report.windowHours) * HOUR_MS) / buckets

  const perSource = new Map<string, number>()
  const scopedBuckets = new Array<number>(buckets).fill(0)
  let scopedCount = 0
  let scopedPreviousCount = 0

  for (const item of items) {
    if (feedFilter && !feedFilter.has(item.feedId)) continue
    if (matchingIds && !matchingIds.has(item.id)) continue
    const timestamp = item.publishedAt ?? item.fetchedAt

    if (timestamp >= previousStart && timestamp < windowStart) {
      scopedPreviousCount += 1
      continue
    }
    if (timestamp < windowStart || timestamp > now) continue

    perSource.set(item.feedId, (perSource.get(item.feedId) ?? 0) + 1)
    scopedCount += 1
    const bucket = Math.min(
      buckets - 1,
      Math.max(0, Math.floor((timestamp - windowStart) / bucketMs))
    )
    scopedBuckets[bucket] += 1
  }

  // Sans sujet, les volumes déjà calculés localement font foi ; avec un sujet,
  // seuls les articles retenus comptent.
  const scoped = matchingIds !== undefined

  return {
    itemCount: scoped ? scopedCount : report.itemCount,
    previousItemCount: scoped ? scopedPreviousCount : report.previousItemCount,
    sourceCount: scoped ? perSource.size : report.sourceCount,
    volumeBuckets: scoped ? scopedBuckets : report.volumeBuckets,
    bucketHours: report.bucketHours,
    topTerms: report.terms.slice(0, MAX_TOP_TERMS).map((term) => ({
      label: term.label,
      count: term.count,
      previousCount: term.previousCount,
      sourceCount: term.sourceCount,
    })),
    topSources: Array.from(perSource.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOP_SOURCES)
      .map(([feedId, count]) => ({ title: feedTitleById.get(feedId) ?? feedId, count })),
    watched: report.watched
      .filter((watched) => watched.count > 0)
      .map((watched) => ({
        term: watched.term,
        count: watched.count,
        previousCount: watched.previousCount,
      })),
  }
}

/**
 * Retient les lignes exploitables de la réponse IA. Une réponse vide, ou faite
 * de lignes aberrantes, est une erreur : mieux vaut le dire que d'afficher un
 * briefing tronqué sans le signaler.
 */
export function parseBriefingLines(rawResponse: string): string[] {
  let parsed: BriefingPayload
  try {
    parsed = JSON.parse(stripJsonFence(rawResponse)) as BriefingPayload
  } catch {
    throw new Error("La réponse IA n'est pas un briefing JSON valide.")
  }

  if (!Array.isArray(parsed.lines)) {
    throw new Error('La réponse IA ne contient pas de lignes de briefing.')
  }

  const lines = parsed.lines
    .filter((line): line is string => typeof line === 'string')
    .map((line) =>
      line
        .replace(/^[-–—•*\d.)\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line.length > 0 && line.length <= MAX_LINE_LENGTH)
    .slice(0, MAX_LINES)

  if (lines.length === 0) {
    throw new Error("L'IA n'a produit aucune ligne de briefing exploitable.")
  }

  return lines
}

export async function generateTrendBriefing({
  report,
  items,
  feeds,
  feedIds,
  topic,
  provider,
  settings,
  signal,
  now = Date.now(),
}: GenerateTrendBriefingInput): Promise<TrendBriefingResult> {
  if (provider === 'heuristic') {
    throw new Error('Sélectionnez un fournisseur IA dans Paramètres → IA.')
  }

  const trimmedTopic = topic?.trim() ?? ''
  const scoped = trimmedTopic ? scopeReportToTopic(report, items, trimmedTopic) : null
  const scopedReport = scoped?.report ?? report

  const stats = computeBriefingStats({
    report: scopedReport,
    items,
    feeds,
    feedIds,
    matchingIds: scoped?.matchingIds,
    now,
  })
  if (stats.itemCount === 0) {
    throw new Error(
      trimmedTopic
        ? `Aucun article ne mentionne « ${trimmedTopic} » sur cette période : élargissez la fenêtre ou changez de terme.`
        : 'Aucun article sur cette période : rafraîchissez vos sources ou élargissez la fenêtre.'
    )
  }

  const headlines = selectBriefingHeadlines({
    report: scopedReport,
    items,
    feeds,
    feedIds,
    matchingIds: scoped?.matchingIds,
    now,
  })

  const payload = {
    ...(trimmedTopic ? { sujet: trimmedTopic } : {}),
    periode: {
      heures: scopedReport.windowHours,
      articles: stats.itemCount,
      sources: stats.sourceCount,
    },
    volumePrecedent: stats.previousItemCount,
    volumeParTranche: { heuresParPoint: stats.bucketHours, valeurs: stats.volumeBuckets },
    sujets: stats.topTerms,
    sourcesLesPlusActives: stats.topSources,
    motsClesSuivis: stats.watched,
    selectionLocale: {
      methode: 'sujets dominants, récence et diversité des sources',
      articlesRetenus: headlines.length,
      articlesDisponibles: stats.itemCount,
    },
    titresSelectionnes: headlines,
  }

  const requestControl = createRequestControlContext({
    signal,
    timeoutMs: provider === 'local' ? getLocalAiTimeoutMs(settings) : 90_000,
  })

  try {
    const response = await generateWithProvider(
      provider,
      trimmedTopic ? `${SYSTEM_PROMPT}${TOPIC_PROMPT_SUFFIX}` : SYSTEM_PROMPT,
      JSON.stringify(payload),
      () => undefined,
      requestControl.signal
    )
    return {
      lines: parseBriefingLines(response),
      stats,
      generatedAt: Date.now(),
      provider,
    }
  } catch (error) {
    logger.warn('AI trend briefing failed', { provider, error })
    throw error
  } finally {
    requestControl.cleanup()
  }
}
