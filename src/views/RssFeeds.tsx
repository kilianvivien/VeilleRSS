import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCheck,
  Download,
  FileDown,
  Inbox,
  Info,
  Library,
  Menu,
  Network,
  Newspaper,
  Plus,
  Radar,
  RefreshCw,
  Rows2,
  Rows3,
  ScrollText,
  Settings,
  Upload,
  X,
} from 'lucide-react'
import { Button, Input, Modal, Select } from '@/components/ui'
import { SlidingTabBar } from '@/components/ui/SlidingTabBar'
import { SearchBar } from '@/components/search'
import {
  FeedCatalogModal,
  FeedRail,
  RssArticleRow,
  RssReadingPane,
  TrendBriefingPanel,
  TrendMapView,
  TrendPanel,
  formatRefreshInterval,
  type FeedRailGroup,
  type SmartView,
} from '@/components/rss'
import { computeFeedStats, getFeedHealth, useRssStore, type RssFeedHealth } from '@/stores/rssStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { SettingsModal } from '@/components/settings/SettingsModal'
import type { RssDensity, RssFeed, RssItem, RssItemTranslation, RssSortMode } from '@/types/rss'
import { cn } from '@/lib/utils/cn'
import { validateRssFeedUrl } from '@/lib/rss/rssUrlValidation'
import { exportFeedsToOpml, parseOpml } from '@/lib/rss/opml'
import { computeTrends, filterItemsByTerm } from '@/lib/rss/trendAnalysis'
import { applyStoredTrendSelection } from '@/lib/rss/trendRefinementService'
import { foldForMatching } from '@/lib/rss/textAnalysis'
import type { CatalogFeed } from '@/lib/rss/feedCatalog'
import { openFileDialog, saveFile } from '@/lib/platform/fileService'
import { confirmDialog } from '@/lib/platform/dialogService'
import { translateText, type LanguageCode } from '@/lib/ai/translationService'
import { isAbortError } from '@/lib/ai/requestControl'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import {
  getEffectiveProvider,
  getProviderLabel,
  isProviderConfigured,
} from '@/lib/utils/aiProvider'
import { aiErrorToUserMessage } from '@/lib/ai/aiProviderError'

const REFRESH_OFF = 'off'
const REFRESH_OPTIONS = [
  { value: REFRESH_OFF, label: 'Désactivée' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 heure' },
  { value: '180', label: '3 heures' },
  { value: '360', label: '6 heures' },
]

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'oldest', label: 'Plus anciens' },
  { value: 'source', label: 'Par source' },
]

const UNCATEGORIZED = 'Sources'

/** Volets du panneau de droite ; « map » ouvre la cartographie en plein écran. */
type RightPane = 'article' | 'trends' | 'briefing'

async function openExternalUrl(url: string) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function itemTime(item: RssItem): number {
  return item.publishedAt ?? item.fetchedAt
}

export function RssFeeds() {
  const feeds = useRssStore((state) => state.feeds)
  const items = useRssStore((state) => state.items)
  const selectedItemIds = useRssStore((state) => state.selectedItemIds)
  const isRefreshing = useRssStore((state) => state.isRefreshing)
  const refreshingFeedIds = useRssStore((state) => state.refreshingFeedIds)
  const settings = useRssStore((state) => state.settings)
  const addFeed = useRssStore((state) => state.addFeed)
  const importFeeds = useRssStore((state) => state.importFeeds)
  const addCatalogFeeds = useRssStore((state) => state.addCatalogFeeds)
  const updateRssSettings = useRssStore((state) => state.updateSettings)
  const updateFeed = useRssStore((state) => state.updateFeed)
  const deleteFeed = useRssStore((state) => state.deleteFeed)
  const refreshFeed = useRssStore((state) => state.refreshFeed)
  const refreshAllFeeds = useRssStore((state) => state.refreshAllFeeds)
  const markRead = useRssStore((state) => state.markRead)
  const markUnread = useRssStore((state) => state.markUnread)
  const markAllRead = useRssStore((state) => state.markAllRead)
  const toggleSaved = useRssStore((state) => state.toggleSaved)
  const setSelectedItems = useRssStore((state) => state.setSelectedItems)
  const markSelectedImported = useRssStore((state) => state.markSelectedImported)
  const getSelectedItemsAsMagicReviewText = useRssStore(
    (state) => state.getSelectedItemsAsMagicReviewText
  )
  const setItemTranslation = useRssStore((state) => state.setItemTranslation)
  const watchKeyword = useRssStore((state) => state.watchKeyword)
  const unwatchKeyword = useRssStore((state) => state.unwatchKeyword)
  const aiTrendSelection = useRssStore((state) => state.aiTrendSelection)
  const setAiTrendSelection = useRssStore((state) => state.setAiTrendSelection)
  const clearAiTrendSelection = useRssStore((state) => state.clearAiTrendSelection)
  const trendBriefing = useRssStore((state) => state.trendBriefing)
  const setTrendBriefing = useRssStore((state) => state.setTrendBriefing)
  const clearTrendBriefing = useRssStore((state) => state.clearTrendBriefing)
  const aiSettings = useSettingsStore()
  const translationProvider = getEffectiveProvider(
    aiSettings.translationAiProvider,
    aiSettings.aiProvider
  )
  const translationProviderReady = isProviderConfigured(translationProvider, aiSettings)
  const trendProvider = getEffectiveProvider(aiSettings.rssAiProvider, aiSettings.aiProvider)
  const trendProviderLabel = getProviderLabel(trendProvider)
  const trendProviderReady =
    trendProvider !== 'heuristic' && isProviderConfigured(trendProvider, aiSettings)

  const [feedUrl, setFeedUrl] = useState('')
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null)
  const [smartView, setSmartView] = useState<SmartView>('all')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<RssSortMode>('recent')
  const [activeTerm, setActiveTerm] = useState<{ key: string; label: string } | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isAddingFeed, setIsAddingFeed] = useState(false)
  const [showAddFeedModal, setShowAddFeedModal] = useState(false)
  const [addFeedError, setAddFeedError] = useState<string | null>(null)
  const [editingFeed, setEditingFeed] = useState<RssFeed | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editRefreshInterval, setEditRefreshInterval] = useState<number | null>(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  /**
   * Cartographie des tendances : montée/démontée différée pour animer
   * l'entrée (fondu + léger zoom) et la sortie. `isTrendMapMounted` garde
   * l'overlay dans le DOM pendant la transition de sortie.
   */
  const [isTrendMapMounted, setIsTrendMapMounted] = useState(false)
  const [isTrendMapVisible, setIsTrendMapVisible] = useState(false)
  const trendMapUnmountTimer = useRef<number | null>(null)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [translationErrors, setTranslationErrors] = useState<Record<string, string>>({})
  const [showOriginalIds, setShowOriginalIds] = useState<Set<string>>(new Set())
  const [isRefiningTrends, setIsRefiningTrends] = useState(false)
  const [trendRefinementError, setTrendRefinementError] = useState<string | null>(null)
  const trendRefinementAbortRef = useRef<AbortController | null>(null)
  const [rightPane, setRightPane] = useState<RightPane>(
    settings.showTrendsByDefault === false ? 'article' : 'trends'
  )
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false)
  const [briefingError, setBriefingError] = useState<string | null>(null)
  const briefingAbortRef = useRef<AbortController | null>(null)

  /**
   * Composition mobile (< 1024 px) : un seul volet à l'écran, navigation par
   * onglets bas + tiroir de sources. Le bureau conserve la grille trois
   * colonnes ; `isDesktop` évite de monter deux fois les mêmes composants.
   */
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [isSourcesOpen, setIsSourcesOpen] = useState(false)

  useEffect(() => {
    if (isDesktop) setIsSourcesOpen(false)
  }, [isDesktop])

  useEffect(() => {
    if (!isSourcesOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSourcesOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSourcesOpen])

  const normalizedQuery = query.trim()
  const density: RssDensity = settings.density ?? 'comfortable'
  const trendWindowHours = settings.trendWindowHours ?? 24
  const watchedKeywords = useMemo(
    () => (settings.watchedKeywords ?? []).map((keyword) => keyword.term),
    [settings.watchedKeywords]
  )

  const selectedIds = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const refreshingSet = useMemo(() => new Set(refreshingFeedIds), [refreshingFeedIds])
  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds])
  const feedStats = useMemo(() => computeFeedStats(items), [items])

  const latestItemByFeed = useMemo(() => {
    const latest = new Map<string, number>()
    for (const item of items) {
      const timestamp = itemTime(item)
      const current = latest.get(item.feedId)
      if (current === undefined || timestamp > current) latest.set(item.feedId, timestamp)
    }
    return latest
  }, [items])

  const feedHealth = useMemo(() => {
    const health = new Map<string, RssFeedHealth>()
    for (const feed of feeds) {
      health.set(feed.id, getFeedHealth(feed, latestItemByFeed.get(feed.id) ?? null))
    }
    return health
  }, [feeds, latestItemByFeed])

  const railGroups = useMemo<FeedRailGroup[]>(() => {
    const byCategory = new Map<string, RssFeed[]>()
    for (const feed of feeds) {
      const category = feed.category?.trim() || UNCATEGORIZED
      byCategory.set(category, [...(byCategory.get(category) ?? []), feed])
    }
    return Array.from(byCategory.entries())
      .map(([category, groupFeeds]) => ({
        category,
        feeds: [...groupFeeds].sort((a, b) => a.title.localeCompare(b.title, 'fr')),
      }))
      .sort((a, b) => {
        // La catégorie fourre-tout reste en bas, les régions sont alphabétiques.
        if (a.category === UNCATEGORIZED) return 1
        if (b.category === UNCATEGORIZED) return -1
        return a.category.localeCompare(b.category, 'fr')
      })
  }, [feeds])

  const totals = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((item) => !item.readAt).length,
      saved: items.filter((item) => item.savedAt).length,
    }),
    [items]
  )

  const visibleItems = useMemo(() => {
    const foldedQuery = foldForMatching(normalizedQuery)

    let filtered = items.filter((item) => {
      if (activeFeedId && item.feedId !== activeFeedId) return false
      if (smartView === 'unread' && item.readAt) return false
      if (smartView === 'saved' && !item.savedAt) return false
      if (!foldedQuery) return true

      const feed = feedById.get(item.feedId)
      return foldForMatching(
        [item.title, item.summary, item.contentSnippet, item.author, feed?.title]
          .filter(Boolean)
          .join(' ')
      ).includes(foldedQuery)
    })

    if (activeTerm) {
      filtered = filterItemsByTerm(filtered, activeTerm.key)
    }

    return [...filtered].sort((a, b) => {
      if (sortMode === 'oldest') return itemTime(a) - itemTime(b)
      if (sortMode === 'source') {
        const titleA = feedById.get(a.feedId)?.title ?? ''
        const titleB = feedById.get(b.feedId)?.title ?? ''
        const byTitle = titleA.localeCompare(titleB, 'fr')
        if (byTitle !== 0) return byTitle
      }
      return itemTime(b) - itemTime(a)
    })
  }, [activeFeedId, activeTerm, feedById, items, normalizedQuery, smartView, sortMode])

  const trendReport = useMemo(
    () =>
      computeTrends({
        items,
        windowHours: trendWindowHours,
        watchedKeywords,
        feedIds: activeFeedId ? [activeFeedId] : undefined,
      }),
    [activeFeedId, items, trendWindowHours, watchedKeywords]
  )

  // Le tri IA est rejoué sur chaque rapport recalculé : il survit donc à
  // l’arrivée de nouveaux articles, à un changement de fenêtre et à toute
  // interaction dans l’interface. Seul le bouton « Local » l’annule.
  const displayedTrendReport = useMemo(
    () =>
      aiTrendSelection ? applyStoredTrendSelection(trendReport, aiTrendSelection) : trendReport,
    [aiTrendSelection, trendReport]
  )

  useEffect(() => () => trendRefinementAbortRef.current?.abort(), [])
  useEffect(() => () => briefingAbortRef.current?.abort(), [])
  useEffect(
    () => () => {
      if (trendMapUnmountTimer.current) window.clearTimeout(trendMapUnmountTimer.current)
    },
    []
  )

  const openTrendMap = useCallback(() => {
    if (trendMapUnmountTimer.current) {
      window.clearTimeout(trendMapUnmountTimer.current)
      trendMapUnmountTimer.current = null
    }
    setIsTrendMapMounted(true)
    // Double rAF : laisse le navigateur peindre l'état initial (transparent,
    // décalé) avant de basculer vers l'état visible, sinon aucune transition.
    requestAnimationFrame(() => requestAnimationFrame(() => setIsTrendMapVisible(true)))
  }, [])

  const closeTrendMap = useCallback(() => {
    setIsTrendMapVisible(false)
    trendMapUnmountTimer.current = window.setTimeout(() => {
      setIsTrendMapMounted(false)
      trendMapUnmountTimer.current = null
    }, 320)
  }, [])

  // Un échec d’affinage porte sur un rapport précis : il n’a plus de sens dès
  // que les articles ou la fenêtre changent. La sélection, elle, reste.
  useEffect(() => setTrendRefinementError(null), [trendReport])

  const handleRefineTrends = useCallback(async () => {
    if (!trendProviderReady || isRefiningTrends) return

    trendRefinementAbortRef.current?.abort()
    const controller = new AbortController()
    trendRefinementAbortRef.current = controller
    setIsRefiningTrends(true)
    setTrendRefinementError(null)

    try {
      const { refineTrendReportWithAi, toStoredTrendSelection } = await import(
        '@/lib/rss/trendRefinementService'
      )
      const refinement = await refineTrendReportWithAi({
        report: trendReport,
        items,
        feeds,
        provider: trendProvider,
        settings: aiSettings,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      setAiTrendSelection(
        toStoredTrendSelection(refinement, {
          providerLabel: getProviderLabel(refinement.provider),
          windowHours: trendWindowHours,
        })
      )
      setActiveTerm((current) =>
        current && refinement.rejectedKeys.includes(current.key) ? null : current
      )
    } catch (refinementError) {
      if (controller.signal.aborted || isAbortError(refinementError)) return
      setTrendRefinementError(aiErrorToUserMessage(refinementError, trendProviderLabel))
    } finally {
      if (trendRefinementAbortRef.current === controller) {
        trendRefinementAbortRef.current = null
        setIsRefiningTrends(false)
      }
    }
  }, [
    aiSettings,
    feeds,
    isRefiningTrends,
    items,
    setAiTrendSelection,
    trendProvider,
    trendProviderLabel,
    trendProviderReady,
    trendReport,
    trendWindowHours,
  ])

  // Le briefing a sa propre période : on ne veut pas qu’un réglage de la
  // fenêtre des tendances change la portée d’un briefing déjà rédigé.
  const briefingWindowHours = settings.briefingWindowHours ?? 24
  const briefingTopic = settings.briefingTopic ?? ''
  const briefingReport = useMemo(
    () =>
      briefingWindowHours === trendWindowHours
        ? trendReport
        : computeTrends({
            items,
            windowHours: briefingWindowHours,
            watchedKeywords,
            feedIds: activeFeedId ? [activeFeedId] : undefined,
          }),
    [activeFeedId, briefingWindowHours, items, trendReport, trendWindowHours, watchedKeywords]
  )

  const displayedBriefingReport = useMemo(
    () =>
      aiTrendSelection
        ? applyStoredTrendSelection(briefingReport, aiTrendSelection)
        : briefingReport,
    [aiTrendSelection, briefingReport]
  )

  const handleGenerateBriefing = useCallback(async () => {
    if (!trendProviderReady || isGeneratingBriefing) return

    briefingAbortRef.current?.abort()
    const controller = new AbortController()
    briefingAbortRef.current = controller
    setIsGeneratingBriefing(true)
    setBriefingError(null)

    try {
      const { generateTrendBriefing } = await import('@/lib/rss/trendBriefingService')
      const briefing = await generateTrendBriefing({
        report: displayedBriefingReport,
        items,
        feeds,
        feedIds: activeFeedId ? [activeFeedId] : undefined,
        topic: briefingTopic,
        provider: trendProvider,
        settings: aiSettings,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      setTrendBriefing({
        lines: briefing.lines,
        stats: briefing.stats,
        windowHours: briefingWindowHours,
        topic: briefingTopic.trim(),
        generatedAt: briefing.generatedAt,
        providerLabel: getProviderLabel(briefing.provider),
      })
    } catch (generationError) {
      if (controller.signal.aborted || isAbortError(generationError)) return
      setBriefingError(aiErrorToUserMessage(generationError, trendProviderLabel))
    } finally {
      if (briefingAbortRef.current === controller) {
        briefingAbortRef.current = null
        setIsGeneratingBriefing(false)
      }
    }
  }, [
    activeFeedId,
    aiSettings,
    briefingTopic,
    briefingWindowHours,
    displayedBriefingReport,
    feeds,
    isGeneratingBriefing,
    items,
    setTrendBriefing,
    trendProvider,
    trendProviderLabel,
    trendProviderReady,
  ])

  const activeFeed = activeFeedId ? feedById.get(activeFeedId) : null
  const openItem = openItemId ? (items.find((item) => item.id === openItemId) ?? null) : null
  const selectedCount = selectedItemIds.length

  // Un article retiré du cache ou d’un flux supprimé ne doit pas laisser le volet
  // de lecture sur un identifiant fantôme.
  useEffect(() => {
    if (openItemId && !items.some((item) => item.id === openItemId)) {
      setOpenItemId(null)
    }
  }, [items, openItemId])

  const handleOpenItem = useCallback(
    (item: RssItem) => {
      setOpenItemId(item.id)
      setRightPane('article')
      if (settings.markReadOnOpen !== false && !item.readAt) {
        markRead([item.id])
      }
    },
    [markRead, settings.markReadOnOpen]
  )

  const handleAddFeed = async () => {
    setAddFeedError(null)
    setNotice(null)
    const validation = validateRssFeedUrl(feedUrl)
    let allowHttp = false

    if (!validation.ok) {
      const httpValidation = validateRssFeedUrl(feedUrl, { allowHttp: true })
      if (httpValidation.ok && httpValidation.isHttp) {
        allowHttp = await confirmDialog(
          'Ce flux utilise HTTP, donc son contenu peut être observé ou modifié sur le réseau. Voulez-vous quand même l’ajouter ?',
          {
            title: 'Flux non sécurisé',
            okLabel: 'Ajouter',
            cancelLabel: 'Annuler',
            kind: 'warning',
          }
        )
        if (!allowHttp) return
      } else {
        setAddFeedError(validation.error)
        return
      }
    }

    setIsAddingFeed(true)
    try {
      const id = await addFeed(feedUrl, { allowHttp })
      setFeedUrl('')
      setActiveFeedId(id)
      setShowAddFeedModal(false)
    } catch (addError) {
      setAddFeedError(
        addError instanceof Error ? addError.message : 'Impossible d’ajouter ce flux.'
      )
    } finally {
      setIsAddingFeed(false)
    }
  }

  const closeAddFeedModal = () => {
    setShowAddFeedModal(false)
    setFeedUrl('')
    setAddFeedError(null)
  }

  const handleAddCatalogFeeds = useCallback(
    (catalogFeeds: CatalogFeed[], category: string) => {
      setError(null)
      const result = addCatalogFeeds(catalogFeeds, category)
      if (result.added === 0) {
        setNotice('Ces sources sont déjà dans votre liste.')
        return
      }

      setNotice(
        `${result.added} source${result.added > 1 ? 's' : ''} ajoutée${result.added > 1 ? 's' : ''}. Chargement en cours…`
      )
      void Promise.allSettled(result.feedIds.map((feedId) => refreshFeed(feedId))).then(() => {
        setNotice(
          `${result.added} source${result.added > 1 ? 's' : ''} ajoutée${result.added > 1 ? 's' : ''}.`
        )
      })
    },
    [addCatalogFeeds, refreshFeed]
  )

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedItems(
      checked ? [...selectedItemIds, id] : selectedItemIds.filter((itemId) => itemId !== id)
    )
  }

  const handleSelectVisible = () => {
    const visibleIds = visibleItems.map((item) => item.id)
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    setSelectedItems(
      allVisibleSelected
        ? selectedItemIds.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...selectedItemIds, ...visibleIds]))
    )
  }

  const handleExportSelection = async () => {
    const markdown = getSelectedItemsAsMagicReviewText()
    if (!markdown.trim()) return

    try {
      await saveFile(markdown, 'veille-selection.md', 'text/markdown')
      markSelectedImported()
      setNotice('Sélection exportée en Markdown.')
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'Impossible d’exporter la sélection.'
      )
    }
  }

  const startEditFeed = (feed: RssFeed) => {
    setEditingFeed(feed)
    setEditTitle(feed.title)
    setEditUrl(feed.url)
    setEditCategory(feed.category ?? '')
    setEditRefreshInterval(feed.refreshIntervalMinutes)
  }

  const saveFeedEdit = () => {
    if (!editingFeed) return
    const validation = validateRssFeedUrl(editUrl, { allowHttp: true })
    if (!validation.ok) {
      setError(validation.error)
      return
    }
    updateFeed(editingFeed.id, {
      title: editTitle.trim() || new URL(validation.url).hostname,
      url: validation.url,
      category: editCategory.trim() || undefined,
      refreshIntervalMinutes: editRefreshInterval,
    })
    setEditingFeed(null)
  }

  const handleDeleteFeed = async (feed: RssFeed) => {
    const confirmed = await confirmDialog(
      `Supprimer le flux « ${feed.title} » ? Les articles non sauvegardés seront retirés.`,
      {
        title: 'Supprimer ce flux ?',
        okLabel: 'Supprimer',
        cancelLabel: 'Annuler',
        kind: 'warning',
      }
    )
    if (confirmed) {
      deleteFeed(feed.id)
      if (activeFeedId === feed.id) {
        setActiveFeedId(null)
      }
    }
  }

  const handleMarkAllRead = async () => {
    const scopeLabel = activeFeed ? `« ${activeFeed.title} »` : 'tous les flux'
    const unreadCount = activeFeed ? (feedStats.get(activeFeed.id)?.unread ?? 0) : totals.unread
    if (unreadCount === 0) return

    const confirmed = await confirmDialog(
      unreadCount === 1
        ? `Marquer comme lu l’unique article non lu de ${scopeLabel} ?`
        : `Marquer comme lus les ${unreadCount} articles non lus de ${scopeLabel} ?`,
      {
        title: 'Tout marquer comme lu ?',
        okLabel: 'Marquer lu',
        cancelLabel: 'Annuler',
      }
    )
    if (confirmed) {
      markAllRead(activeFeedId)
    }
  }

  const handleImportOpml = async () => {
    setError(null)
    setNotice(null)
    try {
      const files = await openFileDialog({
        multiple: false,
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
      })
      const file = files?.[0]
      if (!file) return

      const entries = parseOpml(await file.text())
      const containsHttp = entries.some((entry) =>
        entry.url.trim().toLowerCase().startsWith('http://')
      )
      const allowHttp = containsHttp
        ? await confirmDialog(
            'Cet OPML contient au moins un flux HTTP non chiffré. Voulez-vous importer ces flux quand même ?',
            {
              title: 'Flux non sécurisés',
              okLabel: 'Importer',
              cancelLabel: 'Annuler',
              kind: 'warning',
            }
          )
        : false
      const result = importFeeds(entries, { allowHttp })
      if (settings.refreshImportedFeeds && result.feedIds.length > 0) {
        await Promise.allSettled(result.feedIds.map((feedId) => refreshFeed(feedId)))
      }

      setNotice(
        result.added > 0
          ? `${result.added} flux importé${result.added > 1 ? 's' : ''}. ${result.skipped} ignoré${result.skipped > 1 ? 's' : ''}.`
          : `Aucun nouveau flux importé. ${result.skipped} ignoré${result.skipped > 1 ? 's' : ''}.`
      )
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : 'Impossible d’importer cet OPML.'
      )
    }
  }

  const handleTranslateItem = useCallback(
    async (item: RssItem) => {
      if (translatingId) return
      const targetLanguage = (settings.translationTargetLanguage || 'fr') as LanguageCode
      const cached = item.translation
      if (cached && cached.targetLanguage === targetLanguage) {
        setShowOriginalIds((prev) => {
          const next = new Set(prev)
          if (next.has(item.id)) next.delete(item.id)
          else next.add(item.id)
          return next
        })
        return
      }

      if (!translationProviderReady) {
        setTranslationErrors((prev) => ({
          ...prev,
          [item.id]:
            'Configurez un fournisseur IA dans les paramètres pour traduire.',
        }))
        return
      }

      setTranslatingId(item.id)
      setTranslationErrors((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })

      const sourceSummary = item.summary || item.contentSnippet || ''
      const composed = sourceSummary ? `${item.title}\n\n${sourceSummary}` : item.title
      try {
        const result = await translateText({
          sourceText: composed,
          sourceLanguage: 'auto',
          targetLanguage,
          settings: aiSettings,
        })
        const lines = result.translatedText.split(/\n{2,}/)
        const translatedTitle = (lines[0] ?? '').trim() || item.title
        const translatedSummary = lines.slice(1).join('\n\n').trim()
        const translation: RssItemTranslation = {
          title: translatedTitle,
          summary: translatedSummary,
          targetLanguage,
          detectedSourceLanguage: result.detectedSourceLanguage,
          translatedAt: Date.now(),
        }
        setItemTranslation(item.id, translation)
        setShowOriginalIds((prev) => {
          if (!prev.has(item.id)) return prev
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      } catch (translationError) {
        if (isAbortError(translationError)) return
        const message =
          translationError instanceof Error ? translationError.message : 'La traduction a échoué.'
        setTranslationErrors((prev) => ({ ...prev, [item.id]: message }))
      } finally {
        setTranslatingId((current) => (current === item.id ? null : current))
      }
    },
    [
      aiSettings,
      settings.translationTargetLanguage,
      setItemTranslation,
      translatingId,
      translationProviderReady,
    ]
  )

  const handleExportOpml = async () => {
    setError(null)
    setNotice(null)
    try {
      await saveFile(exportFeedsToOpml(feeds), 'diplorevue-flux-rss.opml', 'text/x-opml+xml')
      setNotice(`${feeds.length} flux exporté${feeds.length > 1 ? 's' : ''} en OPML.`)
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : 'Impossible d’exporter les flux OPML.'
      )
    }
  }

  const targetLanguage = (settings.translationTargetLanguage || 'fr') as LanguageCode
  const subscribedUrls = useMemo(() => new Set(feeds.map((feed) => feed.url)), [feeds])
  const listTitle = activeFeed
    ? activeFeed.title
    : smartView === 'unread'
      ? 'Non lus'
      : smartView === 'saved'
        ? 'Sauvegardés'
        : 'Tous les articles'

  /** Ferme la lecture : bouton retour du volet mobile. */
  const closeReader = useCallback(() => setOpenItemId(null), [])

  /** Navigation mobile : re-taper l'onglet actif ramène à la racine (liste). */
  const handleMobileTab = useCallback(
    (value: RightPane | 'map') => {
      if (value === 'map') {
        openTrendMap()
        return
      }
      if (value === rightPane) {
        if (value === 'article' && openItemId) setOpenItemId(null)
        return
      }
      setRightPane(value)
    },
    [openItemId, openTrendMap, rightPane]
  )

  /** Sur mobile, filtrer sur une tendance bascule vers la liste filtrée. */
  const selectTerm = useCallback(
    (term: { key: string; label: string }) => {
      setActiveTerm(term)
      setQuery('')
      if (!isDesktop) setRightPane('article')
    },
    [isDesktop]
  )

  // ── Blocs partagés entre la composition bureau et la composition mobile ──

  /** Rail des sources : colonne de gauche au bureau, tiroir sur mobile. */
  const feedRailElement = (
    <FeedRail
      groups={railGroups}
      stats={feedStats}
      health={feedHealth}
      refreshingFeedIds={refreshingSet}
      activeFeedId={activeFeedId}
      smartView={smartView}
      totals={totals}
      variant={isDesktop ? 'sidebar' : 'drawer'}
      onSelectSmartView={(view) => {
        setSmartView(view)
        if (!isDesktop) setIsSourcesOpen(false)
      }}
      onSelectFeed={(feedId) => {
        setActiveFeedId(feedId)
        if (!isDesktop) setIsSourcesOpen(false)
      }}
      onRefreshFeed={(feedId) => void refreshFeed(feedId)}
      onToggleFeed={(feed) => updateFeed(feed.id, { enabled: !feed.enabled })}
      onEditFeed={(feed) => {
        // Le formulaire d'édition s'ouvre en modal au-dessus du tiroir :
        // on replie le tiroir pour laisser la place sur mobile.
        if (!isDesktop) setIsSourcesOpen(false)
        startEditFeed(feed)
      }}
      onDeleteFeed={(feed) => void handleDeleteFeed(feed)}
    />
  )

  const railActionBar = (
    <div
      className={cn(
        'flex flex-shrink-0 items-center border-t border-[var(--border)]',
        isDesktop ? 'gap-1 px-2 py-1.5' : 'justify-around gap-2 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]'
      )}
    >
      <Button
        size="sm"
        variant="ghost"
        className={cn('shrink-0 p-0', isDesktop ? 'h-9 w-9' : 'h-11 w-11')}
        onClick={() => {
          setAddFeedError(null)
          setShowAddFeedModal(true)
          if (!isDesktop) setIsSourcesOpen(false)
        }}
        title="Ajouter un flux RSS"
        aria-label="Ajouter un flux RSS"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={cn('shrink-0 p-0', isDesktop ? 'h-9 w-9' : 'h-11 w-11')}
        onClick={() => void handleImportOpml()}
        title="Importer un OPML"
        aria-label="Importer un OPML"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={cn('shrink-0 p-0', isDesktop ? 'h-9 w-9' : 'h-11 w-11')}
        onClick={() => void handleExportOpml()}
        disabled={feeds.length === 0}
        title="Exporter en OPML"
        aria-label="Exporter en OPML"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )

  const sourcesColumn = (
    <aside className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-2">{feedRailElement}</div>
      {railActionBar}
    </aside>
  )

  const articleListSection = (
    <section className="flex h-full min-h-0 flex-col" aria-label="Articles">
        <div className="flex flex-shrink-0 flex-col gap-2 border-b border-[var(--border)] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2
              className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--text-primary)]"
              title={listTitle}
            >
              {listTitle}
            </h2>
            <span className="shrink-0 rounded-full bg-[var(--hover)] px-2 py-0.5 text-xs text-[var(--text-muted)] tabular-nums">
              {visibleItems.length}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Rechercher…"
              className="min-w-0 flex-1"
            />
            <Select
              size="sm"
              value={sortMode}
              onValueChange={(value) => setSortMode(value as RssSortMode)}
              options={SORT_OPTIONS}
              aria-label="Trier les articles"
              className="w-[112px] shrink-0"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-10 w-10 shrink-0 p-0 lg:h-9 lg:w-9"
              onClick={() =>
                updateRssSettings({ density: density === 'compact' ? 'comfortable' : 'compact' })
              }
              title={density === 'compact' ? 'Affichage confortable' : 'Affichage compact'}
              aria-label={density === 'compact' ? 'Affichage confortable' : 'Affichage compact'}
            >
              {density === 'compact' ? (
                <Rows2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Rows3 className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {activeTerm ? (
          <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--accent-muted)] px-3 py-1.5">
            <Radar className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
              Filtré sur « {activeTerm.label} »
            </span>
            <button
              type="button"
              onClick={() => setActiveTerm(null)}
              aria-label="Retirer le filtre de tendance"
              className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {visibleItems.length === 0 ? (
            <EmptyState hasFeeds={feeds.length > 0} onOpenCatalog={() => setShowCatalog(true)} />
          ) : (
            <ul>
              {visibleItems.map((item) => {
                const cached =
                  item.translation && item.translation.targetLanguage === targetLanguage
                    ? item.translation
                    : null
                const showTranslated = Boolean(cached) && !showOriginalIds.has(item.id)
                return (
                  <RssArticleRow
                    key={item.id}
                    item={item}
                    feed={feedById.get(item.feedId)}
                    selected={selectedIds.has(item.id)}
                    active={openItemId === item.id}
                    density={density}
                    displayTitle={showTranslated && cached ? cached.title : item.title}
                    displaySummary={
                      showTranslated && cached
                        ? cached.summary || item.contentSnippet || item.summary
                        : item.contentSnippet || item.summary
                    }
                    onOpen={() => handleOpenItem(item)}
                    onSelectedChange={(checked) => handleSelectItem(item.id, checked)}
                    onToggleSaved={() => toggleSaved(item.id)}
                  />
                )
              })}
            </ul>
          )}
        </div>

        {/* Sur mobile, masquer les actions inactives quand la liste est vide
            évite une barre à deux lignes qui concurrence l'état vide. */}
        {isDesktop || visibleItems.length > 0 ? (
          <div className="flex flex-shrink-0 items-center gap-1.5 border-t border-[var(--border)] px-3 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectVisible}
              disabled={visibleItems.length === 0}
              aria-label="Sélectionner les articles visibles"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sélection visible</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleMarkAllRead()}
              disabled={totals.unread === 0}
              title="Marquer tout comme lu"
              aria-label="Marquer tout comme lu"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Tout lu</span>
            </Button>
            <Button
              size="sm"
              variant={selectedCount > 0 ? 'primary' : 'ghost'}
              className="ml-auto"
              onClick={() => void handleExportSelection()}
              disabled={selectedCount === 0}
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              <span className="sm:hidden">
                Exporter{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </span>
              <span className="hidden sm:inline">
                Exporter la sélection{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </span>
            </Button>
          </div>
        ) : null}
      </section>
  )

  const trendsPanelElement = (
    <TrendPanel
      report={displayedTrendReport}
      windowHours={trendWindowHours}
      onWindowChange={(hours) => updateRssSettings({ trendWindowHours: hours })}
      watchedTerms={watchedKeywords}
      onWatchTerm={watchKeyword}
      onUnwatchTerm={unwatchKeyword}
      watchedCollapsed={settings.collapseWatchedKeywords === true}
      onToggleWatchedCollapsed={() =>
        updateRssSettings({
          collapseWatchedKeywords: settings.collapseWatchedKeywords !== true,
        })
      }
      onSelectTerm={selectTerm}
      onSelectWatched={(term) => {
        setActiveTerm(null)
        setQuery(term)
        if (!isDesktop) setRightPane('article')
      }}
      activeTermKey={activeTerm?.key ?? null}
      aiRefinement={{
        available: trendProviderReady,
        loading: isRefiningTrends,
        active: aiTrendSelection !== null,
        providerLabel: aiTrendSelection?.providerLabel ?? trendProviderLabel,
        error: trendRefinementError,
      }}
      onRefineWithAi={() => void handleRefineTrends()}
      onClearAiRefinement={() => {
        clearAiTrendSelection()
        setTrendRefinementError(null)
      }}
    />
  )

  const briefingPanelElement = (
    <TrendBriefingPanel
      briefing={trendBriefing}
      windowHours={briefingWindowHours}
      onWindowChange={(hours) => updateRssSettings({ briefingWindowHours: hours })}
      topic={briefingTopic}
      onTopicChange={(value) => updateRssSettings({ briefingTopic: value })}
      currentItemCount={briefingReport.itemCount}
      available={trendProviderReady}
      loading={isGeneratingBriefing}
      providerLabel={trendProviderLabel}
      error={briefingError}
      onGenerate={() => void handleGenerateBriefing()}
      onClear={() => {
        clearTrendBriefing()
        setBriefingError(null)
      }}
    />
  )

  const readingPaneElement = (
    <RssReadingPane
      item={openItem}
      feed={openItem ? feedById.get(openItem.feedId) : undefined}
      targetLanguage={targetLanguage}
      isTranslating={translatingId === openItem?.id}
      translationError={openItem ? translationErrors[openItem.id] : undefined}
      showOriginal={openItem ? showOriginalIds.has(openItem.id) : false}
      onBack={isDesktop ? undefined : closeReader}
      onTranslate={() => {
        if (openItem) void handleTranslateItem(openItem)
      }}
      onToggleRead={() => {
        if (!openItem) return
        if (openItem.readAt) markUnread([openItem.id])
        else markRead([openItem.id])
      }}
      onToggleSaved={() => {
        if (openItem) toggleSaved(openItem.id)
      }}
      onOpenOriginal={() => {
        if (openItem) void openExternalUrl(openItem.link)
      }}
    />
  )

  /** Volet droit bureau : lecture, tendances ou briefing selon l'onglet. */
  const rightPaneContent =
    rightPane === 'trends'
      ? trendsPanelElement
      : rightPane === 'briefing'
        ? briefingPanelElement
        : readingPaneElement

  const rightColumn = (
    <section className="flex min-h-0 flex-col" aria-label="Lecture et tendances">
      <div className="flex flex-shrink-0 items-center border-b border-[var(--border)] px-3 py-2">
        <SlidingTabBar<RightPane | 'map'>
          size="xs"
          value={rightPane}
          onChange={(value) => {
            if (value === 'map') {
              openTrendMap()
              return
            }
            setRightPane(value)
          }}
          tabs={[
            { value: 'article', label: 'Article', icon: <Newspaper className="h-3.5 w-3.5" /> },
            { value: 'trends', label: 'Tendances', icon: <Radar className="h-3.5 w-3.5" /> },
            {
              value: 'map',
              label: 'Carte',
              ariaLabel: 'Cartographie',
              title: 'Cartographie des tendances',
              icon: <Network className="h-3.5 w-3.5" />,
            },
            {
              value: 'briefing',
              label: 'Briefing',
              ariaLabel: 'Briefing IA',
              title: 'Briefing IA',
              icon: <ScrollText className="h-3.5 w-3.5" />,
            },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{rightPaneContent}</div>
    </section>
  )

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--bg-primary)]">
      {isDesktop ? (
        /* En-tête flottant, transparent au repos comme les barres d'action des autres vues. */
        <header className="relative z-20 flex flex-shrink-0 flex-wrap items-start gap-x-4 gap-y-4 bg-transparent px-8 pt-[calc(env(safe-area-inset-top)+2rem)] pb-6">
          <div className="min-w-0">
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">Outil de veille RSS</h1>
            <p className="mt-2 text-[var(--text-secondary)]">
              {feeds.length === 0
                ? 'Aucune source suivie'
                : `Veille de ${feeds.length} source${feeds.length > 1 ? 's' : ''} · ${totals.unread} article${totals.unread > 1 ? 's' : ''} non lu${totals.unread > 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void refreshAllFeeds()}
              isLoading={isRefreshing}
              disabled={feeds.length === 0}
              title="Rafraîchir toutes les sources"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Rafraîchir
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowCatalog(true)}>
              <Library className="h-4 w-4" aria-hidden="true" />
              Sources
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0"
              title="À propos"
              aria-label="À propos de l’application"
              onClick={() => setShowCreditsModal(true)}
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0"
              title="Paramètres"
              aria-label="Paramètres"
              onClick={() => setShowSettingsModal(true)}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>
      ) : (
        /* En-tête compact mobile : actions en icônes, cibles ≥ 40 px. */
        <header className="relative z-20 flex flex-shrink-0 items-center gap-1 bg-transparent px-2 pt-[calc(env(safe-area-inset-top)+0.625rem)] pb-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0 max-[359px]:h-10 max-[359px]:w-10"
            title="Sources et vues"
            aria-label="Ouvrir les sources et vues"
            onClick={() => setIsSourcesOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-lg font-bold text-[var(--text-primary)] max-[359px]:text-base">
              Veille RSS
            </h1>
            <p className="truncate text-[11px] text-[var(--text-secondary)]">
              {feeds.length === 0
                ? 'Aucune source suivie'
                : `${totals.unread} non lu${totals.unread > 1 ? 's' : ''} · ${feeds.length} source${feeds.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0 max-[359px]:h-10 max-[359px]:w-10"
            onClick={() => void refreshAllFeeds()}
            isLoading={isRefreshing}
            disabled={feeds.length === 0}
            title="Rafraîchir toutes les sources"
            aria-label="Rafraîchir toutes les sources"
          >
            {!isRefreshing ? <RefreshCw className="h-5 w-5" aria-hidden="true" /> : null}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0 max-[359px]:h-10 max-[359px]:w-10"
            title="Catalogue de sources"
            aria-label="Catalogue de sources"
            onClick={() => setShowCatalog(true)}
          >
            <Library className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0 max-[359px]:h-10 max-[359px]:w-10"
            title="À propos"
            aria-label="À propos de l’application"
            onClick={() => setShowCreditsModal(true)}
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0 max-[359px]:h-10 max-[359px]:w-10"
            title="Paramètres"
            aria-label="Paramètres"
            onClick={() => setShowSettingsModal(true)}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>
      )}

      {/* Messages en bandeau fin : ils ne doivent pas repousser les volets */}
      {error || notice ? (
        <div
          className={cn(
            'flex flex-shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs',
            error
              ? 'border-red-500/20 bg-red-500/8 text-red-700 dark:text-red-300'
              : 'border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
          )}
          role="status"
        >
          <span className="min-w-0 flex-1 truncate">{error ?? notice}</span>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setNotice(null)
            }}
            aria-label="Masquer ce message"
            className="rounded p-0.5 hover:bg-[var(--hover)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {isDesktop ? (
        /* Bureau : grille trois colonnes inchangée. */
        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,0.95fr)_minmax(0,1.05fr)] divide-x divide-[var(--border)]">
          {sourcesColumn}
          {articleListSection}
          {rightColumn}
        </div>
      ) : (
        <>
          {/* Mobile : un seul volet à la fois ; la barre d'onglets pilote l'affichage. */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {rightPane === 'article' && !openItem
              ? articleListSection
              : rightPane === 'trends'
                ? trendsPanelElement
                : rightPane === 'briefing'
                  ? briefingPanelElement
                  : readingPaneElement}
          </div>

          <MobileTabBar value={rightPane} onChange={handleMobileTab} />

          {/* Tiroir des sources : le rail habituel dans un panneau coulissant. */}
          {isSourcesOpen ? (
            <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Sources et vues">
              <button
                type="button"
                aria-label="Fermer le tiroir des sources"
                onClick={() => setIsSourcesOpen(false)}
                className="animate-fade-in absolute inset-0 bg-black/45"
              />
              <div className="animate-drawer-in absolute inset-y-0 left-0 flex w-[304px] max-w-[86vw] flex-col border-r border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
                <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] pt-[calc(env(safe-area-inset-top)+0.75rem)] pr-2 pb-3 pl-4">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Sources &amp; vues
                  </h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 shrink-0 p-0"
                    title="Fermer"
                    aria-label="Fermer le tiroir des sources"
                    onClick={() => setIsSourcesOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-2">{feedRailElement}</div>
                {railActionBar}
              </div>
            </div>
          ) : null}
        </>
      )}

      <FeedCatalogModal
        open={showCatalog}
        onOpenChange={setShowCatalog}
        subscribedUrls={subscribedUrls}
        onAddFeeds={handleAddCatalogFeeds}
      />

      <Modal
        open={showAddFeedModal}
        onOpenChange={(open) => {
          if (open) setShowAddFeedModal(true)
          else closeAddFeedModal()
        }}
        title="Ajouter un flux RSS"
        description="Collez le lien du flux RSS ou Atom à suivre."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeAddFeedModal}>
              Annuler
            </Button>
            <Button onClick={() => void handleAddFeed()} isLoading={isAddingFeed}>
              Ajouter
            </Button>
          </div>
        }
      >
        <Input
          autoFocus
          type="url"
          label="URL du flux"
          aria-label="URL du flux"
          value={feedUrl}
          onChange={(event) => {
            setFeedUrl(event.target.value)
            if (addFeedError) setAddFeedError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleAddFeed()
          }}
          placeholder="https://exemple.org/feed.xml"
          error={addFeedError ?? undefined}
        />
      </Modal>

      <Modal
        open={Boolean(editingFeed)}
        onOpenChange={(open) => {
          if (!open) setEditingFeed(null)
        }}
        title="Modifier la source"
        description={
          editingFeed ? formatRefreshInterval(editingFeed.refreshIntervalMinutes) : undefined
        }
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditingFeed(null)}>
              Annuler
            </Button>
            <Button onClick={saveFeedEdit}>Enregistrer</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="Titre"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            placeholder="Titre de la source"
          />
          <Input
            label="URL du flux"
            value={editUrl}
            onChange={(event) => setEditUrl(event.target.value)}
            placeholder="https://exemple.org/feed.xml"
          />
          <Input
            label="Catégorie"
            value={editCategory}
            onChange={(event) => setEditCategory(event.target.value)}
            placeholder="Turquie, International…"
          />
          <Select
            label="Actualisation"
            value={editRefreshInterval !== null ? String(editRefreshInterval) : REFRESH_OFF}
            onValueChange={(value) =>
              setEditRefreshInterval(value === REFRESH_OFF ? null : Number(value))
            }
            options={REFRESH_OPTIONS}
          />
        </div>
      </Modal>

      <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />

      <Modal
        open={showCreditsModal}
        onOpenChange={setShowCreditsModal}
        title="À propos"
        description="Outil de veille RSS"
        size="sm"
        footer={<Button onClick={() => setShowCreditsModal(false)}>Fermer</Button>}
      >
        <div className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
          <p>
            Ce logiciel est distribué sous licence MIT et fourni « en l’état », sans garantie
            d’aucune sorte.
          </p>
          <p>
            Conception et développement :{' '}
            <strong className="font-semibold text-[var(--text-primary)]">Kilian Vivien</strong>.
          </p>
        </div>
      </Modal>

      {/* Cartographie : recouvre la vue principale avec une transition douce. */}
      {isTrendMapMounted ? (
        <div
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--bg-primary)] transition-[opacity,transform] duration-300',
            isTrendMapVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.985] opacity-0'
          )}
          style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <TrendMapView
            report={displayedTrendReport}
            feeds={feeds}
            items={items}
            activeFeedId={activeFeedId}
            smartView={smartView}
            totals={totals}
            windowHours={trendWindowHours}
            onWindowChange={(hours) => updateRssSettings({ trendWindowHours: hours })}
            onSelectFeed={setActiveFeedId}
            onSelectSmartView={setSmartView}
            onOpenTerm={(term) => {
              setActiveTerm({ key: term.key, label: term.label })
              setQuery('')
              setRightPane(isDesktop ? 'trends' : 'article')
              closeTrendMap()
            }}
            onOpenItem={(item) => {
              handleOpenItem(item)
              closeTrendMap()
            }}
            onOpenCatalog={() => setShowCatalog(true)}
            onImportOpml={() => void handleImportOpml()}
            onExportOpml={() => void handleExportOpml()}
            onClose={() => closeTrendMap()}
          />
        </div>
      ) : null}
    </div>
  )
}

function EmptyState({ hasFeeds, onOpenCatalog }: { hasFeeds: boolean; onOpenCatalog: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--hover)]">
        <Inbox className="h-6 w-6 text-[var(--text-muted)]" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {hasFeeds ? 'Aucun article ne correspond' : 'Aucune source suivie'}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--text-secondary)]">
        {hasFeeds
          ? 'Modifiez la recherche, le filtre ou la source sélectionnée, puis rafraîchissez vos flux.'
          : 'Partez d’un bouquet du catalogue — presse turque, agences, sources internationales — ou collez une URL de flux.'}
      </p>
      {!hasFeeds ? (
        <Button size="sm" variant="primary" className="mt-4" onClick={onOpenCatalog}>
          <Library className="h-4 w-4" aria-hidden="true" />
          Parcourir le catalogue
        </Button>
      ) : null}
    </div>
  )
}

/** Onglets de la barre de navigation mobile. */
const MOBILE_TABS = [
  { value: 'article', label: 'Articles', icon: Newspaper },
  { value: 'trends', label: 'Tendances', icon: Radar },
  { value: 'briefing', label: 'Briefing', icon: ScrollText },
  { value: 'map', label: 'Carte', icon: Network },
] as const

/**
 * Barre d'onglets basse, à hauteur de pouce. « Carte » ouvre l'overlay plein
 * écran ; re-taper « Articles » pendant la lecture ramène à la liste.
 */
function MobileTabBar({
  value,
  onChange,
}: {
  value: RightPane
  onChange: (value: RightPane | 'map') => void
}) {
  return (
    <nav
      aria-label="Navigation principale"
      className="relative z-20 flex flex-shrink-0 items-stretch gap-1 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-2 pt-1 pb-[calc(env(safe-area-inset-bottom)+0.375rem)]"
    >
      {MOBILE_TABS.map((tab) => {
        const active = tab.value === value
        const Icon = tab.icon
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 font-medium transition-colors',
              active
                ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            <Icon
              className={cn('h-5 w-5 shrink-0', active && 'text-[var(--accent)]')}
              aria-hidden="true"
            />
            <span className="max-w-full truncate text-[10px]">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
