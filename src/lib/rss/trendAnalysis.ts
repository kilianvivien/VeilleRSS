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

export interface TrendFocusSelection {
  key: string
  label: string
  /** Les mots-clés suivis recherchent aussi dans les résumés. */
  kind?: 'term' | 'keyword'
}

export interface TrendFocus extends TrendFocusSelection {
  count: number
  previousCount: number
  sourceCount: number
  previousSourceCount: number
  unreadCount: number
  latestPublishedAt: number | null
  buckets: number[]
  previousBuckets: number[]
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
  /** Détail du sujet sélectionné, même s’il sort du classement ou devient vide. */
  focus?: TrendFocus
}

export interface ComputeTrendsOptions {
  items: RssItem[]
  windowHours: number
  watchedKeywords?: string[]
  /** Restreint l’analyse à ces flux ; vide ou absent = tous les flux. */
  feedIds?: string[]
  termLimit?: number
  now?: number
  focus?: TrendFocusSelection | null
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
  focus,
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

  return {
    generatedAt: now,
    windowHours,
    bucketCount: SPARKLINE_BUCKETS,
    bucketHours: windowHours / SPARKLINE_BUCKETS,
    itemCount: currentItems.length,
    previousItemCount: previousItems.length,
    sourceCount: sources.size,
    volumeBuckets,
    terms: dropRedundantTerms(foldNameVariants(sortTrendTerms(terms)), termLimit),
    watched: computeWatchedStats({
      watchedKeywords,
      currentItems,
      previousItems,
      windowStart,
      bucketMs,
    }),
    focus: focus ? computeFocus({ focus, currentItems, previousItems, boilerplate, windowStart, bucketMs }) : undefined,
  }
}

/** Même corpus, mêmes bornes et mêmes exclusions que le classement global. */
function computeFocus({ focus, currentItems, previousItems, boilerplate, windowStart, bucketMs }: {
  focus: TrendFocusSelection
  currentItems: RssItem[]
  previousItems: RssItem[]
  boilerplate: Map<string, Set<string>>
  windowStart: number
  bucketMs: number
}): TrendFocus {
  const matches = (item: RssItem) => focus.kind === 'keyword'
    ? matchesKeyword(keywordText(item), focus.label)
    : !boilerplate.get(item.feedId)?.has(focus.key)
      && extractTerms(trendText(item)).some((term) => term.key === focus.key)
  const current = currentItems.filter(matches)
  const previous = previousItems.filter(matches)
  const buckets = new Array<number>(SPARKLINE_BUCKETS).fill(0)
  const previousBuckets = new Array<number>(SPARKLINE_BUCKETS).fill(0)
  let latestPublishedAt: number | null = null
  for (const item of current) {
    const timestamp = itemTimestamp(item)
    buckets[bucketIndex(timestamp, windowStart, bucketMs)] += 1
    latestPublishedAt = Math.max(latestPublishedAt ?? timestamp, timestamp)
  }
  for (const item of previous) {
    previousBuckets[bucketIndex(itemTimestamp(item), windowStart - bucketMs * SPARKLINE_BUCKETS, bucketMs)] += 1
  }
  return {
    key: focus.key,
    label: focus.label,
    kind: focus.kind,
    count: current.length,
    previousCount: previous.length,
    sourceCount: new Set(current.map((item) => item.feedId)).size,
    previousSourceCount: new Set(previous.map((item) => item.feedId)).size,
    unreadCount: current.filter((item) => !item.readAt).length,
    latestPublishedAt,
    buckets,
    previousBuckets,
  }
}

export function filterItemsByKeyword(items: RssItem[], keyword: string): RssItem[] {
  return items.filter((item) => matchesKeyword(keywordText(item), keyword))
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

  return dropRedundantTerms(sortTrendTerms(candidates), termLimit)
}

/**
 * Classement : d’abord la poussée (nouveaux termes et fortes hausses), puis la
 * largeur de couverture, puis le volume brut. Un sujet repris par six titres
 * pèse plus qu’un sujet martelé par un seul.
 */
function compareScoredTrendTerms(a: TrendTerm, scoreA: number, b: TrendTerm, scoreB: number): number {
  if (scoreB !== scoreA) return scoreB - scoreA
  if (b.count !== a.count) return b.count - a.count
  return trendLabelCollator.compare(a.label, b.label)
}

const trendLabelCollator = new Intl.Collator('fr')

/** Trie par score décroissant, en calculant chaque score une seule fois. */
function sortTrendTerms(terms: TrendTerm[]): TrendTerm[] {
  return terms
    .map((term) => ({ term, score: trendScore(term) }))
    .sort((a, b) => compareScoredTrendTerms(a.term, a.score, b.term, b.score))
    .map(({ term }) => term)
}

function trendScore(term: TrendTerm): number {
  const momentum = term.previousCount === 0 ? term.count * 1.5 : term.count - term.previousCount
  const breadth = term.sourceCount * 1.5
  // Une expression stable est plus parlante qu’un mot isolé. Les trigrammes
  // gagnent légèrement sur les bigrammes quand leur couverture est identique.
  const wordCount = term.key.split(' ').length
  const specificity = wordCount === 3 ? 2.5 : wordCount === 2 ? 1.5 : 0
  // Un sujet qui se concentre sur le dernier quart de la fenêtre est en train
  // d'émerger ; une répartition uniforme ne rapporte presque rien.
  const recent = term.buckets.slice(-RECENT_BUCKETS).reduce((sum, value) => sum + value, 0)
  const acceleration = term.count >= 3 ? (recent / term.count) * 2 : 0
  // Le volume d'une seule source ne compte pas : c'est sa ligne éditoriale,
  // pas une tendance de l'actualité.
  const volume = term.sourceCount > 1 ? term.count * 0.5 : 0
  return momentum + breadth + specificity + acceleration + volume
}

/** Tranches finales de la courbe (sur 12) qui définissent l'actualité « récente ». */
const RECENT_BUCKETS = 3

/**
 * Regroupe les variantes d'un même nom propre : « Emmanuel Macron » et
 * « Macron » désignent la même personne et ne doivent pas occuper deux places
 * du classement. L'expression est absorbée par le mot seul, qui couvre déjà
 * tous ses articles ; quand elle représente au moins la moitié des mentions,
 * sa forme complète devient le libellé, plus lisible.
 *
 * Seules les expressions de deux mots à majuscules initiales, dont le second
 * mot est lui-même un sujet du classement, sont concernées (prénom + nom) :
 * « équipe de France » reste distincte de « France ».
 */
function foldNameVariants(terms: TrendTerm[]): TrendTerm[] {
  const wordTerms = new Map(terms.filter((term) => !term.isPhrase).map((term) => [term.key, term]))
  const absorbed = new Set<string>()
  const labels = new Map<string, string>()

  for (const term of terms) {
    if (!term.isPhrase) continue
    const words = term.key.split(' ')
    const displayWords = term.label.split(/\s+/)
    if (words.length !== 2 || displayWords.length !== 2) continue
    if (!displayWords.every((word) => /^\p{Lu}/u.test(word))) continue
    const surname = wordTerms.get(words[1])
    if (!surname || surname.count < term.count) continue

    absorbed.add(term.key)
    if (!labels.has(surname.key) && term.count * 2 >= surname.count) {
      labels.set(surname.key, term.label)
    }
  }

  if (absorbed.size === 0) return terms
  return terms
    .filter((term) => !absorbed.has(term.key))
    .map((term) => (labels.has(term.key) ? { ...term, label: labels.get(term.key)! } : term))
}

/**
 * Supprime les mots seuls déjà couverts par une expression mieux classée
 * portant sur exactement les mêmes articles — « ministre » sous « ministre
 * affaires » n’ajoute rien au tableau.
 *
 * Les listes d’articles sont construites dans l’ordre du corpus, sans
 * doublon : deux termes couvrent donc le même ensemble d’articles si et
 * seulement si leurs `itemIds` sont identiques. Cette propriété permet de
 * remplacer les comparaisons deux à deux (quadratiques, et qui recréaient un
 * `Set` à chaque paire) par des index. Seuls les `limit` premiers termes
 * retenus sont utiles à l’appelant : la boucle s’arrête dès qu’ils sont trouvés.
 */
function dropRedundantTerms(terms: TrendTerm[], limit = Number.POSITIVE_INFINITY): TrendTerm[] {
  const itemSets = new Map<TrendTerm, Set<string>>()
  const itemSetOf = (term: TrendTerm): Set<string> => {
    let set = itemSets.get(term)
    if (!set) {
      set = new Set(term.itemIds)
      itemSets.set(term, set)
    }
    return set
  }

  const termsByWordCount = new Map<number, TrendTerm[]>()
  let maxWordCount = 0
  for (const term of terms) {
    const wordCount = term.key.split(' ').length
    maxWordCount = Math.max(maxWordCount, wordCount)
    const bucket = termsByWordCount.get(wordCount)
    if (bucket) bucket.push(term)
    else termsByWordCount.set(wordCount, [term])
  }

  const coveredByLongerPhrase = (term: TrendTerm): boolean => {
    const wordCount = term.key.split(' ').length
    if (wordCount < 2) return false

    for (let size = wordCount + 1; size <= maxWordCount; size += 1) {
      for (const candidate of termsByWordCount.get(size) ?? []) {
        if (candidate.itemIds.length < term.itemIds.length) continue
        if (!candidate.key.includes(term.key)) continue
        const candidateItems = itemSetOf(candidate)
        if (term.itemIds.every((itemId) => candidateItems.has(itemId))) return true
      }
    }
    return false
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

  const isKeptCandidate = (term: TrendTerm): boolean => {
    if (term.isPhrase) return !coveredByLongerPhrase(term)
    const covered = phraseWords.get(term.key)
    if (!covered) return true
    return term.itemIds.some((itemId) => !covered.has(itemId))
  }

  // Deux expressions qui partagent des mots et l'essentiel de leurs articles
  // sont deux fenêtres sur le même sujet (« göçmen kaçakçılarına jandarma » /
  // « kaçakçılarına jandarma darbesi », « violences 17 octobre » /
  // « mobilisation 17 octobre »). Le classement a déjà placé la meilleure en
  // premier ; la suivante n'ajouterait qu'un doublon au tableau.
  const kept: TrendTerm[] = []
  const keptPhrases: TrendTerm[] = []
  for (const term of terms) {
    if (kept.length >= limit) break
    if (!isKeptCandidate(term)) continue

    if (term.isPhrase) {
      const termWords = new Set(term.key.split(' '))
      const termItems = itemSetOf(term)
      const duplicate = keptPhrases.some((candidate) => {
        const shared = candidate.key.split(' ').filter((word) => termWords.has(word)).length
        if (shared === 0) return false
        const overlap = jaccard(itemSetOf(candidate), termItems)
        return shared >= 2 ? overlap >= PHRASE_OVERLAP : overlap >= PHRASE_OVERLAP_SINGLE_WORD
      })
      if (duplicate) continue
      keptPhrases.push(term)
    }

    kept.push(term)
  }

  return kept
}

/** Recouvrement d'articles au-delà duquel deux expressions voisines sont un même sujet. */
const PHRASE_OVERLAP = 0.5
/** Avec un seul mot en commun, l'indice lexical est plus faible : on exige davantage. */
const PHRASE_OVERLAP_SINGLE_WORD = 0.75

function jaccard(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let shared = 0
  for (const value of small) if (large.has(value)) shared += 1
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
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
