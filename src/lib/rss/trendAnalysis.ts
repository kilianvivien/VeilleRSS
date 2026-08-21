import type { RssItem } from '@/types/rss'
import { extractTerms, matchesKeyword } from './textAnalysis'

/**
 * Calcul local des tendances du flux d’actualité.
 *
 * Tout est calculé en mémoire à partir des articles déjà téléchargés : aucun
 * appel réseau, aucun appel IA. La fenêtre courante est comparée à la fenêtre
 * précédente de même durée, ce qui permet de distinguer un sujet qui monte d’un
 * sujet installé.
 */

export const TREND_WINDOW_OPTIONS = [6, 24, 72, 168] as const
export type TrendWindowHours = (typeof TREND_WINDOW_OPTIONS)[number]

const DEFAULT_TERM_LIMIT = 24
const SPARKLINE_BUCKETS = 12
const HOUR_MS = 3_600_000

export interface TrendTerm {
  /** Clé normalisée, stable entre les rafraîchissements. */
  key: string
  /** Forme affichée, reprise de l’article le plus récent. */
  label: string
  /** Nombre d’articles de la fenêtre courante contenant ce terme. */
  count: number
  /** Même mesure sur la fenêtre précédente de durée identique. */
  previousCount: number
  delta: number
  /** Variation relative ; `null` quand le terme est absent de la période précédente. */
  changeRatio: number | null
  /** Vrai quand le terme n’apparaissait pas du tout sur la période précédente. */
  isNew: boolean
  /** Nombre de sources distinctes qui couvrent le terme. */
  sourceCount: number
  feedIds: string[]
  itemIds: string[]
  /** Nombre d’articles non lus contenant ce terme. */
  unreadCount: number
  /** Répartition dans le temps sur la fenêtre, du plus ancien au plus récent. */
  buckets: number[]
  /** Vrai pour une expression de deux ou trois mots. */
  isPhrase: boolean
}

export interface WatchedKeywordStat {
  term: string
  count: number
  previousCount: number
  delta: number
  unreadCount: number
  sourceCount: number
  itemIds: string[]
  latestPublishedAt: number | null
  buckets: number[]
}

export interface TrendReport {
  generatedAt: number
  windowHours: number
  bucketCount: number
  /** Durée d’un point de la courbe, en heures. */
  bucketHours: number
  /** Articles retenus dans la fenêtre courante. */
  itemCount: number
  previousItemCount: number
  /** Sources distinctes ayant publié dans la fenêtre. */
  sourceCount: number
  /** Volume par tranche horaire, du plus ancien au plus récent. */
  volumeBuckets: number[]
  terms: TrendTerm[]
  watched: WatchedKeywordStat[]
}

export interface ComputeTrendsOptions {
  items: RssItem[]
  windowHours: number
  watchedKeywords?: string[]
  /** Restreint l’analyse à ces flux ; vide ou absent = tous les flux. */
  feedIds?: string[]
  termLimit?: number
  now?: number
}

export interface ComputeRelatedTrendTermsOptions {
  items: RssItem[]
  parentTerm: TrendTerm
  windowHours: number
  termLimit?: number
  now?: number
}

function itemTimestamp(item: RssItem): number {
  return item.publishedAt ?? item.fetchedAt
}

/**
 * Texte retenu pour le classement des tendances : le titre et les rubriques,
 * jamais le résumé. Les résumés de flux sont largement meublés — formule de
 * relance, signature d’agence, phrase d’accroche reprise telle quelle d’un
 * article à l’autre — et ce remplissage, uniforme d’une source à l’autre, prend
 * la tête du classement devant les vrais sujets. Le titre est ce que la
 * rédaction a choisi de dire.
 */
function trendText(item: RssItem): string {
  return [item.title, item.categories.join(' ')].filter(Boolean).join(' ')
}

/**
 * Texte retenu pour les mots-clés suivis : titre, résumé et rubriques. Ici
 * l’utilisateur a nommé le mot cherché, donc une occurrence dans le résumé
 * l’intéresse — c’est une requête, pas un classement.
 */
function keywordText(item: RssItem): string {
  return [item.title, item.summary || item.contentSnippet, item.categories.join(' ')]
    .filter(Boolean)
    .join(' ')
}

function bucketIndex(timestamp: number, windowStart: number, bucketMs: number): number {
  const index = Math.floor((timestamp - windowStart) / bucketMs)
  if (index < 0) return 0
  return Math.min(index, SPARKLINE_BUCKETS - 1)
}

interface TermAccumulator {
  key: string
  label: string
  labelAt: number
  itemIds: string[]
  feedIds: Set<string>
  unreadCount: number
  buckets: number[]
  isPhrase: boolean
}

/**
 * Un terme n’est intéressant que s’il revient : un mot vu une seule fois sur la
 * fenêtre n’est pas une tendance, seulement une occurrence.
 */
const MIN_TERM_COUNT = 2

/**
 * Part des articles d’une source au-delà de laquelle un terme est considéré
 * comme sa formule maison, et non comme un sujet.
 */
const BOILERPLATE_RATIO = 0.7

/**
 * En dessous de ce nombre d’articles, une source est trop courte pour conclure :
 * trois mentions sur quatre dépêches peuvent être un sujet brûlant, pas une formule.
 */
const BOILERPLATE_MIN_ITEMS = 8

/**
 * Repère, source par source, les termes présents dans presque tous ses articles.
 * Beaucoup de flux répètent une formule dans chaque résumé — mention de
 * copyright, « lire la suite sur », nom de rubrique — et ces mots écraseraient
 * le classement en cumulant un article sur deux du corpus. Le terme reste
 * comptabilisé pour les sources qui ne le répètent pas.
 */
function findBoilerplateTerms(items: RssItem[]): Map<string, Set<string>> {
  const itemsPerFeed = new Map<string, number>()
  const termCountsPerFeed = new Map<string, Map<string, number>>()

  for (const item of items) {
    itemsPerFeed.set(item.feedId, (itemsPerFeed.get(item.feedId) ?? 0) + 1)
    const counts = termCountsPerFeed.get(item.feedId) ?? new Map<string, number>()
    for (const term of extractTerms(trendText(item))) {
      counts.set(term.key, (counts.get(term.key) ?? 0) + 1)
    }
    termCountsPerFeed.set(item.feedId, counts)
  }

  const boilerplate = new Map<string, Set<string>>()
  for (const [feedId, counts] of termCountsPerFeed) {
    const total = itemsPerFeed.get(feedId) ?? 0
    if (total < BOILERPLATE_MIN_ITEMS) continue

    const threshold = total * BOILERPLATE_RATIO
    const feedBoilerplate = new Set<string>()
    for (const [key, count] of counts) {
      if (count >= threshold) feedBoilerplate.add(key)
    }
    if (feedBoilerplate.size > 0) boilerplate.set(feedId, feedBoilerplate)
  }

  return boilerplate
}

export function computeTrends({
  items,
  windowHours,
  watchedKeywords = [],
  feedIds,
  termLimit = DEFAULT_TERM_LIMIT,
  now = Date.now(),
}: ComputeTrendsOptions): TrendReport {
  const windowMs = Math.max(1, windowHours) * HOUR_MS
  const windowStart = now - windowMs
  const previousStart = windowStart - windowMs
  const bucketMs = windowMs / SPARKLINE_BUCKETS
  const feedFilter = feedIds && feedIds.length > 0 ? new Set(feedIds) : null

  const scoped = feedFilter ? items.filter((item) => feedFilter.has(item.feedId)) : items

  const currentItems: RssItem[] = []
  const previousItems: RssItem[] = []
  for (const item of scoped) {
    const timestamp = itemTimestamp(item)
    if (timestamp >= windowStart && timestamp <= now) {
      currentItems.push(item)
    } else if (timestamp >= previousStart && timestamp < windowStart) {
      previousItems.push(item)
    }
  }

  const volumeBuckets = new Array<number>(SPARKLINE_BUCKETS).fill(0)
  const accumulators = new Map<string, TermAccumulator>()
  const sources = new Set<string>()

  // Détecté sur les deux fenêtres réunies, pour que le seuil soit stable d’un
  // rafraîchissement à l’autre.
  const boilerplate = findBoilerplateTerms([...currentItems, ...previousItems])

  for (const item of currentItems) {
    const timestamp = itemTimestamp(item)
    const bucket = bucketIndex(timestamp, windowStart, bucketMs)
    volumeBuckets[bucket] += 1
    sources.add(item.feedId)
    const feedBoilerplate = boilerplate.get(item.feedId)

    for (const term of extractTerms(trendText(item))) {
      if (feedBoilerplate?.has(term.key)) continue

      let accumulator = accumulators.get(term.key)
      if (!accumulator) {
        accumulator = {
          key: term.key,
          label: term.display,
          labelAt: timestamp,
          itemIds: [],
          feedIds: new Set<string>(),
          unreadCount: 0,
          buckets: new Array<number>(SPARKLINE_BUCKETS).fill(0),
          isPhrase: term.size > 1,
        }
        accumulators.set(term.key, accumulator)
      } else if (timestamp > accumulator.labelAt) {
        accumulator.label = term.display
        accumulator.labelAt = timestamp
      }

      accumulator.itemIds.push(item.id)
      accumulator.feedIds.add(item.feedId)
      accumulator.buckets[bucket] += 1
      if (!item.readAt) accumulator.unreadCount += 1
    }
  }

  const previousCounts = new Map<string, number>()
  for (const item of previousItems) {
    const feedBoilerplate = boilerplate.get(item.feedId)
    for (const term of extractTerms(trendText(item))) {
      if (feedBoilerplate?.has(term.key)) continue
      previousCounts.set(term.key, (previousCounts.get(term.key) ?? 0) + 1)
    }
  }

  const terms = Array.from(accumulators.values())
    .filter((accumulator) => accumulator.itemIds.length >= MIN_TERM_COUNT)
    .map<TrendTerm>((accumulator) => {
      const count = accumulator.itemIds.length
      const previousCount = previousCounts.get(accumulator.key) ?? 0
      return {
        key: accumulator.key,
        label: accumulator.label,
        count,
        previousCount,
        delta: count - previousCount,
        changeRatio: previousCount === 0 ? null : (count - previousCount) / previousCount,
        isNew: previousCount === 0,
        sourceCount: accumulator.feedIds.size,
        feedIds: Array.from(accumulator.feedIds),
        itemIds: accumulator.itemIds,
        unreadCount: accumulator.unreadCount,
        buckets: accumulator.buckets,
        isPhrase: accumulator.isPhrase,
      }
    })
    // Deux mentions d'un mot isolé dans une seule source sont trop fragiles
    // pour être qualifiées de tendance. Une expression précise, une reprise
    // multisource, trois articles actuels ou un historique établi suffisent.
    .filter(
      (term) => term.isPhrase || term.sourceCount >= 2 || term.count >= 3 || term.previousCount > 0
    )
    .sort(compareTrendTerms)

  return {
    generatedAt: now,
    windowHours,
    bucketCount: SPARKLINE_BUCKETS,
    bucketHours: windowHours / SPARKLINE_BUCKETS,
    itemCount: currentItems.length,
    previousItemCount: previousItems.length,
    sourceCount: sources.size,
    volumeBuckets,
    terms: dropRedundantTerms(terms).slice(0, termLimit),
    watched: computeWatchedStats({
      watchedKeywords,
      currentItems,
      previousItems,
      windowStart,
      bucketMs,
    }),
  }
}

/**
 * Recalcule les sujets qui coexistent avec une tendance donnée. Ce second
 * niveau reste entièrement local : seules les manchettes déjà rattachées au
 * terme parent sont analysées, puis les fragments du parent lui-même sont
 * retirés pour éviter une carte circulaire (« Ankara » → « Ankara… »).
 */
export function computeRelatedTrendTerms({
  items,
  parentTerm,
  windowHours,
  termLimit = 8,
  now = Date.now(),
}: ComputeRelatedTrendTermsOptions): TrendTerm[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const relatedItems = parentTerm.itemIds.flatMap((id) => {
    const item = itemById.get(id)
    return item ? [item] : []
  })
  if (relatedItems.length === 0) return []

  const windowMs = Math.max(1, windowHours) * HOUR_MS
  const windowStart = now - windowMs
  const bucketMs = windowMs / SPARKLINE_BUCKETS
  const accumulators = new Map<string, TermAccumulator>()

  const belongsToParent = (key: string): boolean =>
    key === parentTerm.key || parentTerm.key.includes(key) || key.includes(parentTerm.key)

  for (const item of relatedItems) {
    const timestamp = itemTimestamp(item)
    const bucket = bucketIndex(timestamp, windowStart, bucketMs)

    for (const term of extractTerms(trendText(item))) {
      if (belongsToParent(term.key)) continue

      let accumulator = accumulators.get(term.key)
      if (!accumulator) {
        accumulator = {
          key: term.key,
          label: term.display,
          labelAt: timestamp,
          itemIds: [],
          feedIds: new Set<string>(),
          unreadCount: 0,
          buckets: new Array<number>(SPARKLINE_BUCKETS).fill(0),
          isPhrase: term.size > 1,
        }
        accumulators.set(term.key, accumulator)
      } else if (timestamp > accumulator.labelAt) {
        accumulator.label = term.display
        accumulator.labelAt = timestamp
      }

      accumulator.itemIds.push(item.id)
      accumulator.feedIds.add(item.feedId)
      accumulator.buckets[bucket] += 1
      if (!item.readAt) accumulator.unreadCount += 1
    }
  }

  const candidates = Array.from(accumulators.values())
    // Un mot seul doit être partagé par au moins deux articles. Une expression
    // précise peut éclairer un seul angle éditorial du sujet parent.
    .filter((term) => term.itemIds.length >= MIN_TERM_COUNT || term.isPhrase)
    .map<TrendTerm>((term) => ({
      key: term.key,
      label: term.label,
      count: term.itemIds.length,
      previousCount: 0,
      delta: term.itemIds.length,
      changeRatio: null,
      isNew: true,
      sourceCount: term.feedIds.size,
      feedIds: Array.from(term.feedIds),
      itemIds: term.itemIds,
      unreadCount: term.unreadCount,
      buckets: term.buckets,
      isPhrase: term.isPhrase,
    }))
    .sort(compareTrendTerms)

  return dropRedundantTerms(candidates).slice(0, termLimit)
}

/**
 * Classement : d’abord la poussée (nouveaux termes et fortes hausses), puis la
 * largeur de couverture, puis le volume brut. Un sujet repris par six titres
 * pèse plus qu’un sujet martelé par un seul.
 */
function compareTrendTerms(a: TrendTerm, b: TrendTerm): number {
  const scoreA = trendScore(a)
  const scoreB = trendScore(b)
  if (scoreB !== scoreA) return scoreB - scoreA
  if (b.count !== a.count) return b.count - a.count
  return a.label.localeCompare(b.label, 'fr')
}

function trendScore(term: TrendTerm): number {
  const momentum = term.previousCount === 0 ? term.count * 1.5 : term.count - term.previousCount
  const breadth = term.sourceCount * 1.5
  // Une expression stable est plus parlante qu’un mot isolé. Les trigrammes
  // gagnent légèrement sur les bigrammes quand leur couverture est identique.
  const wordCount = term.key.split(' ').length
  const specificity = wordCount === 3 ? 2.5 : wordCount === 2 ? 1.5 : 0
  return momentum + breadth + specificity + term.count * 0.5
}

/**
 * Supprime les mots seuls déjà couverts par une expression mieux classée
 * portant sur exactement les mêmes articles — « ministre » sous « ministre
 * affaires » n’ajoute rien au tableau.
 */
function dropRedundantTerms(terms: TrendTerm[]): TrendTerm[] {
  const coveredByLongerPhrase = (term: TrendTerm): boolean => {
    const words = term.key.split(' ')
    if (words.length < 2) return false

    return terms.some((candidate) => {
      const candidateWords = candidate.key.split(' ')
      if (candidateWords.length <= words.length) return false
      if (!candidate.key.includes(term.key)) return false

      const candidateItems = new Set(candidate.itemIds)
      return term.itemIds.every((itemId) => candidateItems.has(itemId))
    })
  }

  const phraseWords = new Map<string, Set<string>>()
  for (const term of terms) {
    if (!term.isPhrase) continue
    for (const word of term.key.split(' ')) {
      const covered = phraseWords.get(word) ?? new Set<string>()
      for (const itemId of term.itemIds) covered.add(itemId)
      phraseWords.set(word, covered)
    }
  }

  const filtered = terms.filter((term) => {
    if (term.isPhrase) return !coveredByLongerPhrase(term)
    const covered = phraseWords.get(term.key)
    if (!covered) return true
    return term.itemIds.some((itemId) => !covered.has(itemId))
  })

  // Deux expressions qui apparaissent dans exactement les mêmes articles et
  // partagent plusieurs mots sont presque toujours deux fenêtres sur le même
  // syntagme (« göçmen kaçakçılarına jandarma » / « kaçakçılarına jandarma
  // darbesi »). Le classement a déjà placé la meilleure en premier.
  const kept: TrendTerm[] = []
  for (const term of filtered) {
    const termWords = new Set(term.key.split(' '))
    const redundantPhrase =
      term.isPhrase &&
      kept.some((candidate) => {
        if (!candidate.isPhrase || candidate.itemIds.length !== term.itemIds.length) return false
        const candidateItems = new Set(candidate.itemIds)
        if (!term.itemIds.every((itemId) => candidateItems.has(itemId))) return false
        const sharedWords = candidate.key.split(' ').filter((word) => termWords.has(word)).length
        return sharedWords >= 2
      })

    if (!redundantPhrase) kept.push(term)
  }

  return kept
}

function computeWatchedStats({
  watchedKeywords,
  currentItems,
  previousItems,
  windowStart,
  bucketMs,
}: {
  watchedKeywords: string[]
  currentItems: RssItem[]
  previousItems: RssItem[]
  windowStart: number
  bucketMs: number
}): WatchedKeywordStat[] {
  return watchedKeywords
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => {
      const buckets = new Array<number>(SPARKLINE_BUCKETS).fill(0)
      const feedIds = new Set<string>()
      const itemIds: string[] = []
      let unreadCount = 0
      let latestPublishedAt: number | null = null

      for (const item of currentItems) {
        if (!matchesKeyword(keywordText(item), term)) continue
        const timestamp = itemTimestamp(item)
        buckets[bucketIndex(timestamp, windowStart, bucketMs)] += 1
        feedIds.add(item.feedId)
        itemIds.push(item.id)
        if (!item.readAt) unreadCount += 1
        if (latestPublishedAt === null || timestamp > latestPublishedAt) {
          latestPublishedAt = timestamp
        }
      }

      const previousCount = previousItems.filter((item) =>
        matchesKeyword(keywordText(item), term)
      ).length

      return {
        term,
        count: itemIds.length,
        previousCount,
        delta: itemIds.length - previousCount,
        unreadCount,
        sourceCount: feedIds.size,
        itemIds,
        latestPublishedAt,
        buckets,
      }
    })
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'fr'))
}

/** Filtre des articles sur un terme de tendance, pour le clic depuis le tableau. */
export function filterItemsByTerm(items: RssItem[], termKey: string): RssItem[] {
  const words = termKey.split(' ').filter(Boolean)
  if (words.length === 0) return items
  return items.filter((item) => {
    const keys = new Set(extractTerms(trendText(item)).map((term) => term.key))
    return keys.has(termKey) || words.every((word) => keys.has(word))
  })
}
