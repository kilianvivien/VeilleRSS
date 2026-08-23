import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  RssDensity,
  RssFeed,
  RssItem,
  RssItemTranslation,
  RssSettings,
  RssTrendAiSelection,
  RssTrendBriefing,
  RssWatchedKeyword,
} from '@/types/rss'
import { STORAGE_KEY } from '@/lib/constants/storageConstants'
import { createIndexedDBStorage } from '@/lib/storage/indexedDBStorage'
import { generateId } from '@/lib/utils/id'
import { fetchRssFeedXml } from '@/lib/rss/rssFetchService'
import { isDatedRssItem, parseRssFeed } from '@/lib/rss/rssParser'
import { mergeRssItems } from '@/lib/rss/rssDeduplication'
import { formatRssItemsForMagicReview } from '@/lib/rss/rssImportFormatter'
import { RECOMMENDED_REFRESH_MINUTES } from '@/lib/rss/refreshIntervals'
import { validateRssFeedUrl } from '@/lib/rss/rssUrlValidation'
import { isOnline } from '@/lib/hooks/useOnlineStatus'
import type { OpmlFeedEntry } from '@/lib/rss/opml'
import type { CatalogFeed } from '@/lib/rss/feedCatalog'
import { foldForMatching } from '@/lib/rss/textAnalysis'

/** Nombre de flux rafraîchis simultanément, pour ne pas saturer le réseau. */
const REFRESH_CONCURRENCY = 4

export interface RssFeedStats {
  total: number
  unread: number
  saved: number
}

interface RssState {
  feeds: RssFeed[]
  items: RssItem[]
  selectedItemIds: string[]
  isRefreshing: boolean
  /** Flux en cours de rafraîchissement, pour l’indicateur par source. */
  refreshingFeedIds: string[]
  settings: RssSettings
  /**
   * Tri IA des tendances, conservé jusqu’à ce que l’utilisateur revienne aux
   * tendances locales. Il survit donc au recalcul du rapport, à un changement
   * de fenêtre et au redémarrage de l’application.
   */
  aiTrendSelection: RssTrendAiSelection | null
  /** Dernier Briefing IA produit, conservé avec ses statistiques. */
  trendBriefing: RssTrendBriefing | null

  addFeed: (url: string, options?: { allowHttp?: boolean }) => Promise<string>
  importFeeds: (entries: OpmlFeedEntry[], options?: { allowHttp?: boolean }) => { added: number; skipped: number; feedIds: string[] }
  addCatalogFeeds: (feeds: CatalogFeed[], category?: string) => { added: number; skipped: number; feedIds: string[] }
  updateSettings: (updates: Partial<RssSettings>) => void
  updateFeed: (id: string, updates: Partial<RssFeed>) => void
  deleteFeed: (id: string) => void
  refreshFeed: (id: string) => Promise<void>
  refreshAllFeeds: () => Promise<void>
  markRead: (ids: string[]) => void
  markUnread: (ids: string[]) => void
  markAllRead: (feedId?: string | null) => void
  toggleSaved: (id: string) => void
  setSelectedItems: (ids: string[]) => void
  markSelectedImported: () => void
  getSelectedItemsAsMagicReviewText: () => string
  setItemTranslation: (id: string, translation: RssItemTranslation | null) => void
  watchKeyword: (term: string) => void
  unwatchKeyword: (term: string) => void
  setAiTrendSelection: (selection: RssTrendAiSelection) => void
  clearAiTrendSelection: () => void
  setTrendBriefing: (briefing: RssTrendBriefing) => void
  clearTrendBriefing: () => void
}

function createItems(feedId: string, xml: string, feedUrl: string): { feedUpdates: Partial<RssFeed>; items: RssItem[] } {
  const parsed = parseRssFeed(xml, feedUrl)
  const now = Date.now()

  // Sans date de publication, un article était affiché à l'heure de collecte et
  // pesait sur les tendances comme s'il venait de paraître. Il est écarté ici,
  // donc il n'entre ni dans la liste, ni dans les tendances, ni dans le briefing.
  const dated = parsed.items.filter(isDatedRssItem)
  const undatedCount = parsed.items.length - dated.length

  return {
    feedUpdates: {
      title: parsed.title,
      siteUrl: parsed.siteUrl,
      description: parsed.description,
      lastFetchedAt: now,
      lastSuccessAt: now,
      // Un flux dont tous les articles sont sans date ne renverrait rien et
      // paraîtrait simplement muet : on le dit, plutôt que de le laisser vide.
      lastError:
        undatedCount > 0 && dated.length === 0
          ? `Ce flux publie ${undatedCount} article${undatedCount > 1 ? 's' : ''} sans date : aucun n'est affichable.`
          : null,
      consecutiveFailures: 0,
      updatedAt: now,
    },
    items: dated.map((item) => ({
      ...item,
      id: generateId('rss-item'),
      feedId,
      readAt: null,
      savedAt: null,
      importedReviewIds: [],
      importedAt: null,
      fetchedAt: now,
    })),
  }
}

function sortItems(items: RssItem[]): RssItem[] {
  return [...items].sort((a, b) => (b.publishedAt ?? b.fetchedAt) - (a.publishedAt ?? a.fetchedAt))
}

export const defaultRssSettings: RssSettings = {
  defaultRefreshIntervalMinutes: RECOMMENDED_REFRESH_MINUTES,
  itemsPerFeedLimit: 200,
  refreshImportedFeeds: true,
  translationTargetLanguage: 'fr',
  savedKeywordSearches: [],
  watchedKeywords: [],
  density: 'comfortable',
  trendWindowHours: 24,
  showTrendsByDefault: true,
  markReadOnOpen: true,
  collapseWatchedKeywords: false,
  briefingWindowHours: 24,
  briefingTopic: '',
  keywordNotificationsEnabled: false,
}

function createPendingFeed(
  url: string,
  settings: RssSettings,
  options: { title?: string; category?: string; siteUrl?: string; catalogId?: string } = {}
): RssFeed {
  const now = Date.now()
  return {
    id: generateId('rss-feed'),
    title: options.title?.trim() || new URL(url).hostname,
    url,
    siteUrl: options.siteUrl,
    category: options.category,
    catalogId: options.catalogId,
    enabled: true,
    refreshIntervalMinutes: settings.defaultRefreshIntervalMinutes,
    lastFetchedAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** Exécute les rafraîchissements par vagues, pour éviter des dizaines de requêtes simultanées. */
async function runInBatches(feedIds: string[], refresh: (id: string) => Promise<void>): Promise<void> {
  for (let index = 0; index < feedIds.length; index += REFRESH_CONCURRENCY) {
    const batch = feedIds.slice(index, index + REFRESH_CONCURRENCY)
    await Promise.allSettled(batch.map((id) => refresh(id)))
  }
}

function normalizeKeyword(term: string): string {
  return foldForMatching(term.trim())
}

export const useRssStore = create<RssState>()(
  persist(
    (set, get) => ({
      feeds: [],
      items: [],
      selectedItemIds: [],
      isRefreshing: false,
      refreshingFeedIds: [],
      settings: defaultRssSettings,
      aiTrendSelection: null,
      trendBriefing: null,

      addFeed: async (url, options = {}) => {
        const validation = validateRssFeedUrl(url, { allowHttp: options.allowHttp })
        if (!validation.ok) {
          throw new Error(validation.error)
        }

        const existingFeed = get().feeds.find((feed) => feed.url === validation.url)
        if (existingFeed) {
          throw new Error('Ce flux est deja ajoute.')
        }

        const pendingFeed = createPendingFeed(validation.url, get().settings)
        const id = pendingFeed.id

        set((state) => ({ feeds: [pendingFeed, ...state.feeds] }))

        try {
          await get().refreshFeed(id)
        } catch {
          // The feed stays in the list with its stored error so the user can edit or retry it.
        }

        return id
      },

      importFeeds: (entries, options = {}) => {
        let added = 0
        let skipped = 0
        const existingUrls = new Set(get().feeds.map((feed) => feed.url))
        const importedFeeds: RssFeed[] = []
        const settings = get().settings

        for (const entry of entries) {
          const validation = validateRssFeedUrl(entry.url, { allowHttp: options.allowHttp })
          if (!validation.ok || existingUrls.has(validation.url)) {
            skipped += 1
            continue
          }

          existingUrls.add(validation.url)
          importedFeeds.push(
            createPendingFeed(validation.url, settings, {
              title: entry.title,
              category: entry.category,
              siteUrl: entry.siteUrl,
            })
          )
          added += 1
        }

        if (importedFeeds.length > 0) {
          set((state) => ({ feeds: [...importedFeeds, ...state.feeds] }))
        }

        return { added, skipped, feedIds: importedFeeds.map((feed) => feed.id) }
      },

      addCatalogFeeds: (catalogFeeds, category) => {
        let added = 0
        let skipped = 0
        const existingUrls = new Set(get().feeds.map((feed) => feed.url))
        const settings = get().settings
        const newFeeds: RssFeed[] = []

        for (const catalogFeed of catalogFeeds) {
          const validation = validateRssFeedUrl(catalogFeed.url)
          if (!validation.ok || existingUrls.has(validation.url)) {
            skipped += 1
            continue
          }

          existingUrls.add(validation.url)
          newFeeds.push(
            createPendingFeed(validation.url, settings, {
              title: catalogFeed.title,
              category,
              siteUrl: catalogFeed.siteUrl,
              catalogId: catalogFeed.id,
            })
          )
          added += 1
        }

        if (newFeeds.length > 0) {
          set((state) => ({ feeds: [...newFeeds, ...state.feeds] }))
        }

        return { added, skipped, feedIds: newFeeds.map((feed) => feed.id) }
      },

      updateSettings: (updates) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...updates,
          },
          items: updates.itemsPerFeedLimit
            ? sortItems(mergeRssItems(state.items, [], updates.itemsPerFeedLimit))
            : state.items,
        }))
      },

      updateFeed: (id, updates) => {
        set((state) => ({
          feeds: state.feeds.map((feed) =>
            feed.id === id ? { ...feed, ...updates, updatedAt: Date.now() } : feed
          ),
        }))
      },

      deleteFeed: (id) => {
        set((state) => ({
          feeds: state.feeds.filter((feed) => feed.id !== id),
          items: state.items.filter((item) => item.feedId !== id || item.savedAt || item.importedAt),
          selectedItemIds: state.selectedItemIds.filter((itemId) => {
            const item = state.items.find((candidate) => candidate.id === itemId)
            return item && item.feedId !== id
          }),
        }))
      },

      refreshFeed: async (id) => {
        const feed = get().feeds.find((candidate) => candidate.id === id)
        if (!feed) return

        const fetchedAt = Date.now()
        set((state) => ({
          feeds: state.feeds.map((candidate) =>
            candidate.id === id
              ? { ...candidate, lastFetchedAt: fetchedAt, lastError: null }
              : candidate
          ),
          refreshingFeedIds: state.refreshingFeedIds.includes(id)
            ? state.refreshingFeedIds
            : [...state.refreshingFeedIds, id],
        }))

        try {
          const xml = await fetchRssFeedXml(feed.url)
          const result = createItems(id, xml, feed.url)
          set((state) => ({
            feeds: state.feeds.map((candidate) =>
              candidate.id === id ? { ...candidate, ...result.feedUpdates } : candidate
            ),
            items: sortItems(mergeRssItems(state.items, result.items, state.settings.itemsPerFeedLimit)),
            refreshingFeedIds: state.refreshingFeedIds.filter((feedId) => feedId !== id),
          }))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Impossible de rafraichir ce flux.'
          // Hors connexion, TOUS les flux échouent : incrémenter le compteur
          // ferait passer des sources parfaitement saines pour cassées dans le
          // rail, et l'état survivrait au retour du réseau.
          const isNetworkOutage = !isOnline()
          set((state) => ({
            feeds: state.feeds.map((candidate) =>
              candidate.id === id
                ? {
                    ...candidate,
                    lastFetchedAt: fetchedAt,
                    lastError: message,
                    consecutiveFailures: isNetworkOutage
                      ? (candidate.consecutiveFailures ?? 0)
                      : (candidate.consecutiveFailures ?? 0) + 1,
                    updatedAt: Date.now(),
                  }
                : candidate
            ),
            refreshingFeedIds: state.refreshingFeedIds.filter((feedId) => feedId !== id),
          }))
          throw error
        }
      },

      refreshAllFeeds: async () => {
        set({ isRefreshing: true })
        try {
          const enabledFeeds = get().feeds.filter((feed) => feed.enabled)
          await runInBatches(
            enabledFeeds.map((feed) => feed.id),
            (feedId) => get().refreshFeed(feedId)
          )
        } finally {
          set({ isRefreshing: false, refreshingFeedIds: [] })
        }
      },

      markRead: (ids) => {
        const now = Date.now()
        const idSet = new Set(ids)
        set((state) => ({
          items: state.items.map((item) =>
            idSet.has(item.id) ? { ...item, readAt: item.readAt ?? now } : item
          ),
        }))
      },

      markUnread: (ids) => {
        const idSet = new Set(ids)
        set((state) => ({
          items: state.items.map((item) => (idSet.has(item.id) ? { ...item, readAt: null } : item)),
        }))
      },

      markAllRead: (feedId) => {
        const now = Date.now()
        set((state) => ({
          items: state.items.map((item) =>
            (!feedId || item.feedId === feedId) && !item.readAt ? { ...item, readAt: now } : item
          ),
        }))
      },

      toggleSaved: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, savedAt: item.savedAt ? null : Date.now() } : item
          ),
        }))
      },

      setSelectedItems: (ids) => {
        set({ selectedItemIds: ids })
      },

      markSelectedImported: () => {
        const now = Date.now()
        const selected = new Set(get().selectedItemIds)
        set((state) => ({
          items: state.items.map((item) =>
            selected.has(item.id)
              ? { ...item, importedAt: now, readAt: item.readAt ?? now }
              : item
          ),
        }))
      },

      setItemTranslation: (id, translation) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, translation: translation ?? null } : item
          ),
        }))
      },

      watchKeyword: (term) => {
        const trimmed = term.trim()
        if (!trimmed) return
        const normalized = normalizeKeyword(trimmed)

        set((state) => {
          const existing = state.settings.watchedKeywords ?? []
          if (existing.some((keyword) => normalizeKeyword(keyword.term) === normalized)) {
            return state
          }
          const watchedKeywords = [{ term: trimmed, createdAt: Date.now() }, ...existing].slice(0, 30)
          return {
            settings: {
              ...state.settings,
              watchedKeywords,
              savedKeywordSearches: watchedKeywords.map((keyword) => keyword.term),
            },
          }
        })
      },

      unwatchKeyword: (term) => {
        const normalized = normalizeKeyword(term)
        set((state) => {
          const watchedKeywords = (state.settings.watchedKeywords ?? []).filter(
            (keyword) => normalizeKeyword(keyword.term) !== normalized
          )
          return {
            settings: {
              ...state.settings,
              watchedKeywords,
              savedKeywordSearches: watchedKeywords.map((keyword) => keyword.term),
            },
          }
        })
      },

      setAiTrendSelection: (selection) => set({ aiTrendSelection: selection }),

      clearAiTrendSelection: () => set({ aiTrendSelection: null }),

      setTrendBriefing: (briefing) => set({ trendBriefing: briefing }),

      clearTrendBriefing: () => set({ trendBriefing: null }),

      getSelectedItemsAsMagicReviewText: () => {
        const selected = new Set(get().selectedItemIds)
        const items = sortItems(get().items.filter((item) => selected.has(item.id)))
        return formatRssItemsForMagicReview(items, get().feeds)
      },
    }),
    {
      name: `${STORAGE_KEY}-rss`,
      storage: createIndexedDBStorage(`${STORAGE_KEY}-rss`),
      version: 5,
      partialize: (state) => ({
        feeds: state.feeds,
        items: state.items,
        selectedItemIds: state.selectedItemIds,
        isRefreshing: false,
        refreshingFeedIds: [],
        settings: state.settings,
        aiTrendSelection: state.aiTrendSelection,
        trendBriefing: state.trendBriefing,
      }),
      migrate: (state) => {
        const persisted = (state ?? {}) as Partial<RssState>
        const persistedSettings = (persisted.settings ?? {}) as Partial<RssSettings>

        // Les mots-clés enregistrés en v2 étaient de simples chaînes : ils deviennent
        // des mots-clés suivis, avec leurs statistiques dans le tableau de tendances.
        const watchedKeywords: RssWatchedKeyword[] =
          persistedSettings.watchedKeywords ??
          (persistedSettings.savedKeywordSearches ?? []).map((term) => ({
            term,
            createdAt: Date.now(),
          }))

        return {
          ...(persisted as RssState),
          refreshingFeedIds: [],
          // Nouveautés de la v4 : le tri IA et le briefing n’existaient pas avant.
          aiTrendSelection: persisted.aiTrendSelection ?? null,
          trendBriefing: persisted.trendBriefing ?? null,
          // v5 : les articles sans date ne sont plus affichables, donc le cache
          // ne doit plus en garder — ils fausseraient encore les tendances.
          items: (persisted.items ?? []).filter(isDatedRssItem),
          // `consecutiveFailures` n’existait pas avant la v3 : un flux en erreur repart à 1.
          feeds: (persisted.feeds ?? []).map((feed) => ({
            ...feed,
            consecutiveFailures: feed.consecutiveFailures ?? (feed.lastError ? 1 : 0),
          })),
          settings: {
            ...defaultRssSettings,
            ...persistedSettings,
            watchedKeywords,
            savedKeywordSearches: watchedKeywords.map((keyword) => keyword.term),
          },
        }
      },
    }
  )
)

/** Compte les articles par flux : total, non lus, sauvegardés. */
export function computeFeedStats(items: RssItem[]): Map<string, RssFeedStats> {
  const stats = new Map<string, RssFeedStats>()
  for (const item of items) {
    const current = stats.get(item.feedId) ?? { total: 0, unread: 0, saved: 0 }
    current.total += 1
    if (!item.readAt) current.unread += 1
    if (item.savedAt) current.saved += 1
    stats.set(item.feedId, current)
  }
  return stats
}

export type RssFeedHealth = 'ok' | 'stale' | 'error' | 'never' | 'disabled'

/**
 * État de santé d’une source, pour la pastille de la barre latérale.
 * « stale » signale un flux qui répond mais n’a rien publié depuis longtemps —
 * souvent le signe d’une URL de flux abandonnée par l’éditeur.
 */
export function getFeedHealth(feed: RssFeed, latestItemAt: number | null, now = Date.now()): RssFeedHealth {
  if (!feed.enabled) return 'disabled'
  if (feed.lastError) return 'error'
  if (!feed.lastSuccessAt) return 'never'
  const reference = latestItemAt ?? feed.lastSuccessAt
  const sevenDays = 7 * 24 * 3_600_000
  return now - reference > sevenDays ? 'stale' : 'ok'
}

export type { RssDensity }
