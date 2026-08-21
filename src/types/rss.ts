export interface RssFeed {
  id: string
  title: string
  url: string
  siteUrl?: string
  description?: string
  category?: string
  enabled: boolean
  refreshIntervalMinutes: number | null
  lastFetchedAt: number | null
  lastSuccessAt: number | null
  lastError: string | null
  /** Échecs consécutifs, remis à zéro au premier succès. Alimente l’état de santé du flux. */
  consecutiveFailures: number
  /** Identifiant du catalogue intégré quand la source en vient. */
  catalogId?: string
  createdAt: number
  updatedAt: number
}

export interface RssItemTranslation {
  title: string
  summary: string
  targetLanguage: string
  detectedSourceLanguage?: string
  translatedAt: number
}

export interface RssItem {
  id: string
  feedId: string
  guid: string
  title: string
  link: string
  author?: string
  publishedAt: number | null
  summary: string
  contentSnippet: string
  categories: string[]
  readAt: number | null
  savedAt: number | null
  importedReviewIds: string[]
  importedAt: number | null
  fetchedAt: number
  translation?: RssItemTranslation | null
}

/**
 * Sélection de tendances validée par l’IA.
 *
 * Elle est conservée telle quelle : le rapport de tendances est recalculé à
 * chaque changement d’articles ou de fenêtre, mais le tri et les rejets de
 * l’IA lui sont réappliqués. L’utilisateur ne revient aux tendances locales
 * que s’il le demande explicitement.
 */
export interface RssTrendAiSelection {
  /** Clés retenues, du sujet le plus important au moins important. */
  keptKeys: string[]
  /** Libellés réécrits par l’IA, indexés par clé. */
  labels: Record<string, string>
  /** Clés soumises à l’IA et écartées : elles restent masquées tant que la sélection vit. */
  rejectedKeys: string[]
  /** Nom du fournisseur ayant produit la sélection, pour le bandeau du panneau. */
  providerLabel: string
  refinedAt: number
  /** Fenêtre d’analyse au moment de l’affinage, en heures. */
  windowHours: number
}

/** Briefing IA conservé entre deux visites du lecteur. */
export interface RssTrendBriefing {
  /** Lignes du briefing, environ dix, en français. */
  lines: string[]
  /** Fenêtre analysée, en heures. */
  windowHours: number
  /** Sujet demandé, vide pour un briefing de toute la période. */
  topic: string
  generatedAt: number
  providerLabel: string
  /** Statistiques calculées localement, figées avec le texte qu’elles accompagnent. */
  stats: RssBriefingStats
}

/** Chiffres du briefing : tous mesurés localement, jamais produits par l’IA. */
export interface RssBriefingStats {
  itemCount: number
  previousItemCount: number
  sourceCount: number
  /** Volume par tranche, du plus ancien au plus récent. */
  volumeBuckets: number[]
  /** Durée d’une tranche, en heures. */
  bucketHours: number
  /** Sujets dominants avec leur volume. */
  topTerms: Array<{ label: string; count: number; previousCount: number; sourceCount: number }>
  /** Sources les plus actives sur la période. */
  topSources: Array<{ title: string; count: number }>
  /** Mots-clés suivis ayant au moins une occurrence. */
  watched: Array<{ term: string; count: number; previousCount: number }>
}

/** Mot-clé suivi dans le tableau de tendances. */
export interface RssWatchedKeyword {
  term: string
  createdAt: number
}

export type RssDensity = 'compact' | 'comfortable'

export type RssSortMode = 'recent' | 'oldest' | 'source'

export interface RssSettings {
  defaultRefreshIntervalMinutes: number | null
  itemsPerFeedLimit: number
  refreshImportedFeeds: boolean
  translationTargetLanguage: string
  /** Conservé pour la compatibilité ascendante ; la source de vérité est `watchedKeywords`. */
  savedKeywordSearches: string[]
  watchedKeywords: RssWatchedKeyword[]
  /** Densité de la liste d’articles. */
  density: RssDensity
  /** Fenêtre d’analyse des tendances, en heures. */
  trendWindowHours: number
  /** Ouvre le panneau Tendances au chargement de la vue. */
  showTrendsByDefault: boolean
  /** Marque un article comme lu dès qu’il est ouvert dans le volet de lecture. */
  markReadOnOpen: boolean
  /** Replie la section « Mots-clés suivis » du panneau Tendances. */
  collapseWatchedKeywords: boolean
  /** Période analysée par le Briefing IA, en heures. */
  briefingWindowHours: number
  /** Dernier sujet demandé au Briefing IA ; vide pour toute la période. */
  briefingTopic: string
}

export interface ParsedRssFeed {
  title: string
  siteUrl?: string
  description?: string
  items: Array<Omit<RssItem, 'id' | 'feedId' | 'readAt' | 'savedAt' | 'importedReviewIds' | 'importedAt' | 'fetchedAt'>>
}
