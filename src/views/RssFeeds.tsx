import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCheck,
  Download,
  FileDown,
  Inbox,
  ListChecks,
  Loader2,
  Library,
  Link2,
  Menu,
  MoreHorizontal,
  Newspaper,
  Plus,
  Radar,
  RefreshCw,
  Rows2,
  Rows3,
  ScrollText,
  Sparkles,
  Settings,
  Upload,
  WifiOff,
  X,
} from 'lucide-react'
import { Button, Input, LoadingSpinner, Modal, Select } from '@/components/ui'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { MenuButton } from '@/components/ui/MenuButton'
import { Sparkline } from '@/components/rss/Sparkline'
import { ConstellationView } from '@/components/rss/ConstellationView'
import { TrendFocusCard } from '@/components/rss/TrendFocusCard'
import { AppNavRail } from '@/components/rss/AppNavRail'
import { TREND_TONE_COLOR, formatTrendDelta, trendTone } from '@/components/rss/trendTone'
import { SearchBar } from '@/components/search'
import {
  FeedRail,
  RssArticleRow,
  RssReadingPane,
  TrendPanel,
  formatRefreshInterval,
  type FeedRailGroup,
  type SmartView,
} from '@/components/rss'
import { computeFeedStats, getFeedHealth, useRssStore, type RssFeedHealth } from '@/stores/rssStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { RssDensity, RssFeed, RssItem, RssItemTranslation, RssSortMode } from '@/types/rss'
import { cn } from '@/lib/utils/cn'
import { validateRssFeedUrl } from '@/lib/rss/rssUrlValidation'
import { exportFeedsToOpml, parseOpml } from '@/lib/rss/opml'
import {
  computeTrends,
  filterItemsByKeyword,
  filterItemsByTerm,
  TREND_WINDOW_OPTIONS,
  type TrendFocusSelection,
} from '@/lib/rss/trendAnalysis'
import { REFRESH_INTERVAL_OPTIONS, REFRESH_OFF } from '@/lib/rss/refreshIntervals'
import { applyStoredTrendSelection } from '@/lib/rss/trendSelection'
import { foldForMatching } from '@/lib/rss/textAnalysis'
import type { CatalogFeed } from '@/lib/rss/feedCatalog'
import { openFileDialog, saveFile } from '@/lib/platform/fileService'
import { confirmDialog } from '@/lib/platform/dialogService'
import type { LanguageCode } from '@/lib/ai/languages'
import { isAbortError } from '@/lib/ai/requestControl'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { usePullToRefresh } from '@/lib/hooks/usePullToRefresh'
import { useHistoryBackGesture } from '@/lib/hooks/useHistoryBackGesture'
import { readLaunchIntent } from '@/lib/pwa/launchIntent'
import {
  getEffectiveProvider,
  getProviderLabel,
  isProviderConfigured,
} from '@/lib/utils/aiProvider'
import { aiErrorToUserMessage } from '@/lib/ai/aiProviderError'

/**
 * Vues secondaires chargées à la demande : le briefing, le catalogue et les paramètres représentent une part importante du bundle pour
 * des écrans qu'une session n'ouvre pas forcément. Import direct (et non via
 * le baril `@/components/rss`) : un export de baril les ramènerait dans le
 * chunk d'entrée.
 */
const FeedCatalogModal = lazy(() =>
  import('@/components/rss/FeedCatalogModal').then((m) => ({ default: m.FeedCatalogModal }))
)
const TrendBriefingPanel = lazy(() =>
  import('@/components/rss/TrendBriefingPanel').then((m) => ({ default: m.TrendBriefingPanel }))
)
const SettingsModal = lazy(() =>
  import('@/components/settings/SettingsModal').then((m) => ({ default: m.SettingsModal }))
)

/** Attente d'un volet paresseux : occupe toute la hauteur pour ne pas sauter. */
const lazyPanelFallback = (
  <div className="flex h-full items-center justify-center">
    <LoadingSpinner size="lg" className="text-[var(--text-muted)]" />
  </div>
)

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'oldest', label: 'Plus anciens' },
  { value: 'source', label: 'Par source' },
]

const UNCATEGORIZED = 'Sources'
const ARTICLE_BATCH_SIZE = 80
const TREND_WINDOW_LABELS: Record<number, string> = { 6: '6 h', 24: '24 h', 72: '3 j', 168: '7 j' }
/** Sujets proposés en pastilles au-dessus de la liste. */
const TREND_CHIP_LIMIT = 4
/** Sujets candidats pour l'étiquette affichée sur chaque article. */
const TOPIC_TAG_TERM_LIMIT = 12
const SMART_VIEW_OPTIONS: { value: SmartView; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'unread', label: 'Non lus' },
  { value: 'saved', label: 'Sauvegardés' },
]

/** Échappe une valeur pour un sélecteur d'attribut entre guillemets. */
function escapeAttributeValue(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

/** Défilement, en px, au-delà duquel le bouton « Haut de page » apparaît. */
const BACK_TO_TOP_SCROLL_THRESHOLD = 700

/** Durée d'affichage d'un bandeau d'information avant effacement automatique. */
const BANNER_AUTO_DISMISS_MS = 30_000
const EMPTY_RSS_ITEMS: RssItem[] = []

/** Vue principale : liste et lecture, tendances, ou briefing. */
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
  const updateAiSettings = useSettingsStore((state) => state.updateSettings)
  const isDarkTheme = aiSettings.theme === 'dark'
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
  const [activeTerm, setActiveTerm] = useState<TrendFocusSelection | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [error, setErrorState] = useState<string | null>(null)
  const [notice, setNoticeState] = useState<string | null>(null)
  /**
   * Relancé à chaque message affiché. Sans lui, réexporter deux fois d'affilée
   * réafficherait le même texte sans relancer le compte à rebours : le bandeau
   * disparaîtrait aussitôt, 30 s après le premier passage.
   */
  const [bannerNonce, setBannerNonce] = useState(0)

  const setError = useCallback((message: string | null) => {
    setErrorState(message)
    if (message) setBannerNonce((current) => current + 1)
  }, [])

  const setNotice = useCallback((message: string | null) => {
    setNoticeState(message)
    if (message) setBannerNonce((current) => current + 1)
  }, [])

  /**
   * Les bandeaux s'effacent seuls : ils accusent réception d'une action déjà
   * terminée et n'ont pas à occuper la barre jusqu'au prochain clic. La croix
   * reste là pour les congédier plus tôt.
   */
  useEffect(() => {
    if (!error && !notice) return
    const timeout = window.setTimeout(() => {
      setErrorState(null)
      setNoticeState(null)
    }, BANNER_AUTO_DISMISS_MS)
    return () => window.clearTimeout(timeout)
  }, [error, notice, bannerNonce])
  const [isAddingFeed, setIsAddingFeed] = useState(false)
  const [showAddFeedModal, setShowAddFeedModal] = useState(false)
  const [addFeedError, setAddFeedError] = useState<string | null>(null)
  const [editingFeed, setEditingFeed] = useState<RssFeed | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editRefreshInterval, setEditRefreshInterval] = useState<number | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  /**
   * Les modales paresseuses restent montées une fois ouvertes : Radix a besoin
   * du composant dans l'arbre pour animer la fermeture, on ne peut donc pas
   * les conditionner directement sur `open`.
   */
  const [hasOpenedCatalog, setHasOpenedCatalog] = useState(false)
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false)

  useEffect(() => {
    if (showCatalog) setHasOpenedCatalog(true)
  }, [showCatalog])
  useEffect(() => {
    if (showSettingsModal) setHasOpenedSettings(true)
  }, [showSettingsModal])
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
  const [renderedItemCount, setRenderedItemCount] = useState(ARTICLE_BATCH_SIZE)
  const articleListRef = useRef<HTMLDivElement | null>(null)
  /**
   * Le volet Articles se démonte à chaque changement d'onglet mobile et au
   * passage dans le lecteur. Une `ref` seule ne le signale à personne : les
   * effets qui doivent s'attacher au conteneur défilant s'accrochent donc à
   * cet état, réévalué par la callback ref à chaque (dé)montage.
   */
  const [articleListNode, setArticleListNode] = useState<HTMLDivElement | null>(null)
  const setArticleListElement = useCallback((node: HTMLDivElement | null) => {
    articleListRef.current = node
    setArticleListNode(node)
  }, [])
  const listScrollTopRef = useRef(0)
  /**
   * Dernier article atteint en balayant d'un article à l'autre. La position
   * mémorisée à l'ouverture ne dit plus rien après dix articles parcourus :
   * au retour, on recentre la liste sur celui que l'on vient de lire.
   */
  const readerNavigatedIdRef = useRef<string | null>(null)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)

  /**
   * Composition mobile (< 1024 px) : un seul volet à l'écran, navigation par
   * onglets bas + tiroir de sources. Le bureau conserve la grille trois
   * colonnes ; `isDesktop` évite de monter deux fois les mêmes composants.
   */
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isOnline = useOnlineStatus()
  const [isSourcesOpen, setIsSourcesOpen] = useState(false)

  /**
   * Raccourcis d'application et cible de partage (cf. manifeste).
   * Lu une seule fois : `readLaunchIntent` nettoie la query au passage.
   */
  useEffect(() => {
    const intent = readLaunchIntent()

    if (intent.view === 'trends' || intent.view === 'briefing') {
      setRightPane(intent.view)
    } else if (intent.view) {
      setSmartView(intent.view)
      setRightPane('article')
    }

    if (intent.sharedUrl) {
      setFeedUrl(intent.sharedUrl)
      setAddFeedError(null)
      setShowAddFeedModal(true)
    }
  }, [])

  /**
   * Clic sur une notification de mot-clé suivi : le service worker remet la
   * fenêtre au premier plan puis transmet le terme, on filtre la liste dessus.
   */
  useEffect(() => {
    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; term?: string } | null
      if (data?.type !== 'NOTIFICATION_CLICK' || !data.term) return
      setActiveTerm({ key: foldForMatching(data.term), label: data.term, kind: 'keyword' })
      setQuery('')
      setRightPane('article')
      setOpenItemId(null)
    }

    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
  }, [])

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

  const deferredQuery = useDeferredValue(query)
  const deferredTrendItems = useDeferredValue(items, EMPTY_RSS_ITEMS)
  const normalizedQuery = deferredQuery.trim()
  const density: RssDensity = settings.density ?? 'comfortable'
  const trendWindowHours = settings.trendWindowHours ?? 24
  const watchedKeywords = useMemo(
    () => (settings.watchedKeywords ?? []).map((keyword) => keyword.term),
    [settings.watchedKeywords]
  )

  const selectedIds = useMemo(() => new Set(selectedItemIds), [selectedItemIds])
  const refreshingSet = useMemo(() => new Set(refreshingFeedIds), [refreshingFeedIds])
  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
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
      filtered = activeTerm.kind === 'keyword'
        ? filterItemsByKeyword(filtered, activeTerm.label)
        : filterItemsByTerm(filtered, activeTerm.key)
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
        items: deferredTrendItems,
        windowHours: trendWindowHours,
        watchedKeywords,
        feedIds: activeFeedId ? [activeFeedId] : undefined,
        focus: activeTerm,
      }),
    [activeFeedId, activeTerm, deferredTrendItems, trendWindowHours, watchedKeywords]
  )

  // Le tri IA est rejoué sur chaque rapport recalculé : il survit donc à
  // l’arrivée de nouveaux articles, à un changement de fenêtre et à toute
  // interaction dans l’interface. Seul le bouton « Local » l’annule.
  const displayedTrendReport = useMemo(
    () =>
      aiTrendSelection ? applyStoredTrendSelection(trendReport, aiTrendSelection) : trendReport,
    [aiTrendSelection, trendReport]
  )

  // Étiquette de sujet par article : le premier terme du classement qui le
  // contient. Les objets sont créés une fois par rapport, pour que les lignes
  // mémoïsées ne se repeignent pas à chaque rendu.
  const topicByItemId = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>()
    for (const term of displayedTrendReport.terms.slice(0, TOPIC_TAG_TERM_LIMIT)) {
      const topic = { label: term.label, color: TREND_TONE_COLOR[trendTone(term)] }
      for (const itemId of term.itemIds) {
        if (!map.has(itemId)) map.set(itemId, topic)
      }
    }
    return map
  }, [displayedTrendReport])

  const trendChips = useMemo(
    () => displayedTrendReport.terms.slice(0, TREND_CHIP_LIMIT),
    [displayedTrendReport]
  )

  useEffect(() => () => trendRefinementAbortRef.current?.abort(), [])
  useEffect(() => () => briefingAbortRef.current?.abort(), [])


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
            items: deferredTrendItems,
            windowHours: briefingWindowHours,
            watchedKeywords,
            feedIds: activeFeedId ? [activeFeedId] : undefined,
          }),
    [
      activeFeedId,
      briefingWindowHours,
      deferredTrendItems,
      trendReport,
      trendWindowHours,
      watchedKeywords,
    ]
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
  const openItem = openItemId ? (itemById.get(openItemId) ?? null) : null
  const selectedCount = selectedItemIds.length

  // Un article retiré du cache ou d’un flux supprimé ne doit pas laisser le volet
  // de lecture sur un identifiant fantôme.
  useEffect(() => {
    if (openItemId && !itemById.has(openItemId)) {
      setOpenItemId(null)
    }
  }, [itemById, openItemId])

  const handleOpenItem = useCallback(
    (item: RssItem) => {
      // Sur mobile la liste est démontée pendant la lecture : on garde la
      // position pour ne pas renvoyer l'utilisateur en haut au retour.
      listScrollTopRef.current = articleListRef.current?.scrollTop ?? 0
      readerNavigatedIdRef.current = null
      setOpenItemId(item.id)
      setRightPane('article')
      if (settings.markReadOnOpen !== false && !item.readAt) {
        markRead([item.id])
      }
    },
    [markRead, settings.markReadOnOpen]
  )

  /**
   * Rang de l'article ouvert dans la liste filtrée — la même que celle que
   * l'on vient de quitter, filtres et tri compris. Naviguer depuis le lecteur
   * suit donc exactement l'ordre affiché à l'écran.
   */
  const openItemIndex = useMemo(
    () => (openItemId ? visibleItems.findIndex((item) => item.id === openItemId) : -1),
    [openItemId, visibleItems]
  )

  /**
   * Article précédent (-1) ou suivant (+1) depuis le lecteur.
   *
   * À la différence de `handleOpenItem`, on ne touche PAS à la position
   * mémorisée de la liste : sur mobile elle est démontée, son `scrollTop`
   * vaut zéro, et la lire ici ramènerait l'utilisateur en haut au retour.
   */
  const goToAdjacentItem = useCallback(
    (offset: 1 | -1) => {
      if (openItemIndex < 0) return
      const targetIndex = openItemIndex + offset
      const target = visibleItems[targetIndex]
      if (!target) return

      // La liste ne peint qu'un lot à la fois : au-delà, la ligne n'existerait
      // pas au retour et le recentrage tomberait à côté.
      setRenderedItemCount((count) => Math.max(count, targetIndex + 1))
      readerNavigatedIdRef.current = target.id
      setOpenItemId(target.id)
      if (settings.markReadOnOpen !== false && !target.readAt) {
        markRead([target.id])
      }
    },
    [markRead, openItemIndex, settings.markReadOnOpen, visibleItems]
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

  // Lu dans le store au moment du clic : la fonction reste stable et ne
  // force pas chaque ligne mémoïsée à se repeindre à chaque sélection.
  const handleSelectItem = useCallback(
    (id: string, checked: boolean) => {
      const current = useRssStore.getState().selectedItemIds
      setSelectedItems(
        checked ? [...current, id] : current.filter((itemId) => itemId !== id)
      )
    },
    [setSelectedItems]
  )

  const handleSwipeToggleRead = useCallback(
    (item: RssItem) => (item.readAt ? markUnread([item.id]) : markRead([item.id])),
    [markRead, markUnread]
  )

  const handleSelectVisible = () => {
    const visibleIds = visibleItems.map((item) => item.id)
    const visibleIdSet = new Set(visibleIds)
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    setSelectedItems(
      allVisibleSelected
        ? selectedItemIds.filter((id) => !visibleIdSet.has(id))
        : Array.from(new Set([...selectedItemIds, ...visibleIds]))
    )
  }

  const renderedItems = useMemo(
    () => visibleItems.slice(0, renderedItemCount),
    [renderedItemCount, visibleItems]
  )
  const hasMoreItems = renderedItems.length < visibleItems.length

  const loadMoreItems = useCallback(() => {
    setRenderedItemCount((count) =>
      Math.min(count + ARTICLE_BATCH_SIZE, visibleItems.length)
    )
  }, [visibleItems.length])

  // Chaque nouveau périmètre repart d'une première peinture bornée. Les
  // compteurs et les actions de masse continuent d'utiliser `visibleItems`.
  useEffect(() => {
    setRenderedItemCount(ARTICLE_BATCH_SIZE)
    listScrollTopRef.current = 0
  }, [activeFeedId, activeTerm?.key, query, smartView, sortMode])

  /**
   * Restaure la position de la liste au retour du lecteur (mobile).
   * `useLayoutEffect` pour éviter un saut visible, et une seconde passe à la
   * frame suivante : le premier lot d'articles peut être encore en peinture.
   */
  useLayoutEffect(() => {
    if (isDesktop || openItemId) return
    const scroller = articleListRef.current
    if (!scroller) return

    // Sortie après avoir balayé d'un article à l'autre : on se cale sur le
    // dernier lu plutôt que sur le point de départ, devenu sans rapport.
    const navigatedId = readerNavigatedIdRef.current
    readerNavigatedIdRef.current = null
    if (navigatedId) {
      const selector = `[data-item-id="${escapeAttributeValue(navigatedId)}"]`
      const row = scroller.querySelector(selector)
      if (row) {
        const align = () => row.scrollIntoView({ block: 'center' })
        align()
        const frame = requestAnimationFrame(align)
        return () => cancelAnimationFrame(frame)
      }
    }

    const target = listScrollTopRef.current
    if (target === 0) return

    scroller.scrollTop = target
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = target
    })
    return () => cancelAnimationFrame(frame)
  }, [isDesktop, openItemId])

  useEffect(() => {
    const root = articleListNode
    const sentinel = loadMoreSentinelRef.current
    if (!root || !sentinel || !hasMoreItems || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreItems()
      },
      { root, rootMargin: '400px 0px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [articleListNode, hasMoreItems, loadMoreItems])

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
        // Import dynamique : la pile IA (SDK fournisseurs) ne doit pas peser
        // sur le chunk d'entrée, seule la première traduction la télécharge.
        const { translateText } = await import('@/lib/ai/translationService')
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
  const lastRefreshAt = useMemo(
    () => feeds.reduce<number | null>((latest, feed) => (feed.lastSuccessAt && (!latest || feed.lastSuccessAt > latest) ? feed.lastSuccessAt : latest), null),
    [feeds]
  )
  const listTitle = activeFeed
    ? activeFeed.title
    : smartView === 'unread'
      ? 'Non lus'
      : smartView === 'saved'
        ? 'Sauvegardés'
        : 'Tous les articles'

  /** Ferme la lecture : bouton retour du volet mobile. */
  const closeReader = useCallback(() => setOpenItemId(null), [])

  /**
   * Retour système (bouton Android, geste de bord) : referme le panneau
   * ouvert au lieu de quitter l'application — c'est le réflexe le plus
   * courant sur mobile, et il donnait jusqu'ici le pire résultat possible.
   */
  useHistoryBackGesture(!isDesktop && Boolean(openItemId), closeReader)
  useHistoryBackGesture(isSourcesOpen, () => setIsSourcesOpen(false))

  /** Navigation mobile : re-taper l'onglet actif ramène à la racine (liste). */
  const handleMobileTab = useCallback(
    (value: RightPane) => {
      if (value === rightPane) {
        if (value === 'article' && openItemId) setOpenItemId(null)
        return
      }
      setRightPane(value)
    },
    [openItemId, rightPane]
  )

  /** Rester sur les tendances permet de consulter immédiatement le détail du sujet. */
  const selectTerm = useCallback(
    (term: { key: string; label: string }) => {
      setActiveTerm({ key: term.key, label: term.label })
      setQuery('')
    },
    []
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

  /** Pied du tiroir des sources (mobile) : mêmes actions que le rail du bureau. */
  const railActionBar = (
    <div className="flex flex-shrink-0 gap-1.5 border-t border-[var(--border)] px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <button
        type="button"
        onClick={() => {
          setShowCatalog(true)
          setIsSourcesOpen(false)
        }}
        className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] text-sm font-semibold text-[var(--bg-primary)]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Ajouter des sources
      </button>
      <MenuButton
        label="Autres actions sur les sources"
        placement="top"
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-primary)]"
        entries={[
          {
            label: 'Coller l’adresse d’un flux',
            icon: <Link2 className="h-4 w-4" aria-hidden="true" />,
            onSelect: () => {
              setAddFeedError(null)
              setShowAddFeedModal(true)
              setIsSourcesOpen(false)
            },
          },
          { label: 'Importer un fichier OPML', icon: <Upload className="h-4 w-4" aria-hidden="true" />, onSelect: () => void handleImportOpml() },
          {
            label: 'Exporter en OPML',
            icon: <Download className="h-4 w-4" aria-hidden="true" />,
            onSelect: () => void handleExportOpml(),
            disabled: feeds.length === 0,
          },
        ]}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </MenuButton>
    </div>
  )


  /**
   * Tirer pour rafraîchir : seul geste de rafraîchissement sur mobile, le
   * pull-to-refresh natif étant neutralisé globalement. Désarmé au bureau
   * (souris) et hors connexion, où il ne pourrait qu'échouer.
   */
  const pullToRefresh = usePullToRefresh(articleListNode, {
    enabled: !isDesktop && isOnline && feeds.length > 0,
    onRefresh: refreshAllFeeds,
  })

  /**
   * Bouton « Haut de page » : la liste mobile se déroule sur des centaines
   * d'articles, et le geste de remontée au pouce y est long. Réattaché à
   * chaque (re)montage du volet — le conteneur défilant disparaît du DOM dès
   * qu'un autre onglet ou le lecteur prend la place.
   */
  useEffect(() => {
    if (isDesktop) {
      setShowBackToTop(false)
      return
    }
    const scroller = articleListNode
    if (!scroller) return

    // React ignore un `setState` de valeur identique : inutile d'amortir
    // l'écouteur, seuls les passages de seuil provoquent un rendu.
    const onScroll = () => setShowBackToTop(scroller.scrollTop > BACK_TO_TOP_SCROLL_THRESHOLD)

    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [isDesktop, articleListNode])

  const scrollListToTop = useCallback(() => {
    articleListRef.current?.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }, [prefersReducedMotion])

  /** La barre d'actions occupe le bas du volet : le bouton flottant la dégage. */
  // Barre contextuelle : elle n'apparaît qu'avec une sélection, partout.
  const showListActionBar = selectedCount > 0

  const articleListSection = (
    <section className="relative flex h-full min-h-0 flex-col" aria-label="Articles">
        {/* En-tête de liste : trois rangées aérées — titre et actions, recherche,
            vues. Les sujets du moment ouvrent la liste elle-même. */}
        <div className="flex flex-shrink-0 flex-col gap-2.5 border-b border-[var(--border)] px-4 pt-3.5 pb-3">
          <h2 className="sr-only">{listTitle}</h2>
          <div className="flex min-w-0 items-center gap-1">
            <SegmentedControl<SmartView>
              size="sm"
              value={smartView}
              onChange={setSmartView}
              options={SMART_VIEW_OPTIONS}
              className="mr-auto shrink-0"
            />
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors disabled:opacity-40 pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)] hidden lg:flex"
              onClick={handleSelectVisible}
              disabled={visibleItems.length === 0}
              title="Sélectionner les articles visibles"
              aria-label="Sélectionner les articles visibles"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors disabled:opacity-40 pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)]"
              onClick={() => void handleMarkAllRead()}
              disabled={totals.unread === 0}
              title="Marquer tout comme lu"
              aria-label="Marquer tout comme lu"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
            </button>
            <MenuButton
              label={`Trier les articles : ${SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? ''}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors disabled:opacity-40 pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)]"
              entries={SORT_OPTIONS.map((option) => ({
                label: option.label,
                icon: option.value === sortMode ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="block h-4 w-4" />,
                onSelect: () => setSortMode(option.value as RssSortMode),
              }))}
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            </MenuButton>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors disabled:opacity-40 pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)]"
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
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <SearchBar value={query} onChange={setQuery} placeholder="Rechercher…" className="min-w-0 flex-1" />
            <span
              className="shrink-0 font-mono text-xs text-[var(--text-muted)] tabular-nums"
              data-testid="filtered-article-count"
              title={`${visibleItems.length} articles`}
            >
              {visibleItems.length}
            </span>
            {activeFeed ? (
              <span className="flex h-8 max-w-[40%] min-w-0 items-center gap-1.5 rounded-full border border-[var(--border-strong)] pr-1 pl-3 text-xs text-[var(--text-primary)]">
                <span className="truncate font-medium">{activeFeed.title}</span>
                <button
                  type="button"
                  onClick={() => setActiveFeedId(null)}
                  aria-label="Afficher toutes les sources"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ) : null}
            {activeTerm ? (
              <span className="flex h-8 max-w-[40%] min-w-0 items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent-muted)] pr-1 pl-3 text-xs text-[var(--text-primary)]">
                <span className="sr-only">Filtré sur « {activeTerm.label} »</span>
                <span aria-hidden="true" className="truncate font-medium">{activeTerm.label}</span>
                <button
                  type="button"
                  onClick={() => setActiveTerm(null)}
                  aria-label="Retirer le filtre de tendance"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ) : null}
          </div>
        </div>

        <div
          ref={setArticleListElement}
          data-testid="article-scroller"
          className={cn(
            'min-h-0 flex-1 overflow-auto overscroll-contain',
            // Posé en permanence, pas seulement pendant la traction : le
            // compositeur doit savoir dès le premier contact qu'il nous laisse
            // l'horizontale et que le geste vertical peut être intercepté.
            !isDesktop && 'touch-pan-y'
          )}
        >
          {pullToRefresh.pull > 0 || pullToRefresh.refreshing ? (
            <div
              className="pointer-events-none flex items-center justify-center overflow-hidden"
              style={{ height: pullToRefresh.refreshing ? 44 : pullToRefresh.pull }}
              aria-hidden="true"
            >
              {/* Pastille pleine plutôt qu'une icône nue : sur fond sombre, un
                  glyphe de 16 px se perd dans la bande dégagée par la traction. */}
              <span
                data-testid="pull-indicator"
                data-armed={pullToRefresh.armed || pullToRefresh.refreshing ? 'true' : 'false'}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-colors duration-150',
                  pullToRefresh.armed || pullToRefresh.refreshing
                    ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)]'
                )}
              >
                <RefreshCw
                  className={cn('h-4 w-4', pullToRefresh.refreshing && 'animate-spin')}
                  style={
                    prefersReducedMotion || pullToRefresh.refreshing
                      ? undefined
                      : { transform: `rotate(${pullToRefresh.pull * 3}deg)` }
                  }
                />
              </span>
            </div>
          ) : null}
          {visibleItems.length === 0 ? (
            <EmptyState hasFeeds={feeds.length > 0} onOpenCatalog={() => setShowCatalog(true)} />
          ) : (
            <>
              {trendChips.length > 0 && !activeTerm && !normalizedQuery ? (
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none]">
                  <span className="rss-section-label shrink-0 uppercase text-[var(--text-muted)]">En ce moment</span>
                  {trendChips.map((term) => {
                    const color = TREND_TONE_COLOR[trendTone(term)]
                    return (
                      <button
                        key={term.key}
                        type="button"
                        onClick={() => selectTerm(term)}
                        className="rss-trend-chip flex h-8 shrink-0 items-center gap-2 rounded-full border border-[var(--border)] pr-3 pl-2.5 text-xs text-[var(--text-primary)] transition-[background-color,transform] duration-200 pointer-fine:hover:-translate-y-px pointer-fine:hover:bg-[var(--hover)]"
                      >
                        <Sparkline values={term.buckets} width={26} height={11} color={color} lineOnly />
                        <span className="max-w-[9rem] truncate font-medium">{term.label}</span>
                        <span className="font-mono text-[11px] tabular-nums" style={{ color }}>
                          {formatTrendDelta(term)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <ul className="flex flex-col gap-0.5 py-1.5">
                {renderedItems.map((item) => {
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
                      topic={topicByItemId.get(item.id)}
                      highlight={normalizedQuery || undefined}
                      onOpen={handleOpenItem}
                      onSelectedChange={handleSelectItem}
                      onToggleSaved={toggleSaved}
                      onSwipeToggleRead={isDesktop ? undefined : handleSwipeToggleRead}
                      onSwipeToggleSaved={isDesktop ? undefined : toggleSaved}
                    />
                  )
                })}
              </ul>
              {hasMoreItems ? (
                <div className="flex flex-col items-center gap-2 px-3 py-4">
                  <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
                  <Button variant="ghost" size="sm" onClick={loadMoreItems}>
                    Afficher{' '}
                    {Math.min(ARTICLE_BATCH_SIZE, visibleItems.length - renderedItems.length)}{' '}
                    articles supplémentaires
                  </Button>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums" aria-live="polite">
                    {renderedItems.length} sur {visibleItems.length} affichés
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Barre de sélection flottante : n'apparaît qu'avec au moins un
            article coché, pour laisser la place aux contenus le reste du temps. */}
        {showListActionBar ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
            <div className="cst-menu pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] py-1 pr-1 pl-3 shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
              <span className="mr-1 text-xs font-medium whitespace-nowrap text-[var(--text-primary)] tabular-nums">
                {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={handleSelectVisible}
                disabled={visibleItems.length === 0}
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs text-[var(--text-secondary)] transition-colors pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Tout le visible
              </button>
              <button
                type="button"
                onClick={() => setSelectedItems([])}
                className="flex h-9 items-center rounded-full px-3 text-xs text-[var(--text-secondary)] transition-colors pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={() => void handleExportSelection()}
                className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--text-primary)] px-4 text-xs font-semibold text-[var(--bg-primary)] transition-opacity pointer-fine:hover:opacity-90"
              >
                <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                Exporter
              </button>
            </div>
          </div>
        ) : null}

        {/* Haut de page — mobile seulement : au bureau, la molette et la
            barre de défilement rendent le raccourci superflu. */}
        {!isDesktop && showBackToTop ? (
          <button
            type="button"
            onClick={scrollListToTop}
            aria-label="Revenir en haut de la liste"
            className={cn(
              'absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full',
              'glass-surface-strong border border-[var(--glass-border)] text-[var(--text-primary)]',
              'shadow-[0_10px_28px_rgba(15,23,42,0.24)] transition-transform duration-150 active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
              showListActionBar ? 'bottom-16' : 'bottom-4',
              !prefersReducedMotion && 'animate-lift-in'
            )}
          >
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </section>
  )

  const constellationProps = {
    report: displayedTrendReport,
    itemById,
    feedById,
    activeKey: activeTerm && activeTerm.kind !== 'keyword' ? activeTerm.key : null,
    watchedTerms: watchedKeywords,
    onSelectTerm: selectTerm,
    onClearSelection: () => setActiveTerm(null),
    onOpenItem: handleOpenItem,
    onViewArticles: () => {
      if (!isDesktop) setOpenItemId(null)
      setRightPane('article')
    },
    onWatchTerm: watchKeyword,
  }

  const constellationCompactElement = <ConstellationView {...constellationProps} compact />

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
        setActiveTerm({ key: foldForMatching(term), label: term, kind: 'keyword' })
        setQuery('')
      }}
      activeTermKey={activeTerm?.kind === 'keyword' ? null : activeTerm?.key ?? null}
      onClearSelection={() => setActiveTerm(null)}
      onViewArticles={() => {
        if (!isDesktop) setOpenItemId(null)
        setRightPane('article')
      }}
      leading={isDesktop ? undefined : constellationCompactElement}
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

  const trendsToolbarElement = (
    <div className="flex items-center gap-2">
      <SegmentedControl<string>
        size="sm"
        value={String(trendWindowHours)}
        onChange={(value) => updateRssSettings({ trendWindowHours: Number(value) })}
        options={TREND_WINDOW_OPTIONS.map((hours) => ({ value: String(hours), label: TREND_WINDOW_LABELS[hours] ?? `${hours} h` }))}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void handleRefineTrends()}
        disabled={!trendProviderReady || isRefiningTrends}
        title={trendProviderReady ? `Écarter les termes génériques avec ${trendProviderLabel}` : 'Configurez un fournisseur dans Paramètres → IA'}
        aria-label="Affiner les tendances avec l’IA"
      >
        {isRefiningTrends ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
        Affiner avec l’IA
      </Button>
    </div>
  )

  const trendsBannerElement =
    aiTrendSelection || trendRefinementError ? (
      <div
        role="status"
        className={cn(
          'flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs',
          trendRefinementError
            ? 'border-[color-mix(in_srgb,var(--error)_35%,transparent)] text-[var(--error)]'
            : 'border-[color-mix(in_srgb,var(--trend-new)_40%,transparent)] text-[var(--text-secondary)]'
        )}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" style={{ color: trendRefinementError ? undefined : 'var(--trend-new)' }} />
        <span className="min-w-0 flex-1">
          {trendRefinementError ?? `Sélection affinée par ${aiTrendSelection?.providerLabel ?? trendProviderLabel}. Les volumes restent calculés localement.`}
        </span>
        {aiTrendSelection ? (
          <button
            type="button"
            onClick={() => {
              clearAiTrendSelection()
              setTrendRefinementError(null)
            }}
            className="shrink-0 rounded-full px-2.5 py-1 font-medium text-[var(--link)] pointer-fine:hover:bg-[var(--hover)]"
          >
            Revenir au classement local
          </button>
        ) : null}
      </div>
    ) : null

  /** Vue « Tendances » du bureau : la constellation, avec le classement détaillé à droite. */
  const constellationElement = (
    <ConstellationView
      {...constellationProps}
      toolbar={trendsToolbarElement}
      banner={trendsBannerElement}
      activeWatched={activeTerm?.kind === 'keyword' ? activeTerm.label : null}
      onSelectWatched={(term) => {
        if (activeTerm?.kind === 'keyword' && activeTerm.label === term) {
          setActiveTerm(null)
          return
        }
        setActiveTerm({ key: foldForMatching(term), label: term, kind: 'keyword' })
        setQuery('')
      }}
      onUnwatchTerm={unwatchKeyword}
      focusPanel={
        displayedTrendReport.focus ? (
          <TrendFocusCard
            focus={displayedTrendReport.focus}
            report={displayedTrendReport}
            onClear={() => setActiveTerm(null)}
            onViewArticles={() => setRightPane('article')}
          />
        ) : undefined
      }
    />
  )

  const briefingPanelElement = (
    <Suspense fallback={lazyPanelFallback}>
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
        topicSuggestions={displayedTrendReport.terms.slice(0, 6).map((term) => term.label)}
      />
    </Suspense>
  )

  // Le sujet de l'article ouvert et ses voisins, pour le relier à la constellation.
  const readerTopicTerm = useMemo(
    () => (openItem ? displayedTrendReport.terms.slice(0, TOPIC_TAG_TERM_LIMIT).find((term) => term.itemIds.includes(openItem.id)) ?? null : null),
    [displayedTrendReport, openItem]
  )
  const readerTopic = useMemo(() => {
    if (!readerTopicTerm || !openItem) return undefined
    const itemSet = new Set(readerTopicTerm.itemIds)
    const related = displayedTrendReport.terms
      .slice(0, TOPIC_TAG_TERM_LIMIT)
      .filter((term) => term.key !== readerTopicTerm.key && term.itemIds.some((id) => itemSet.has(id)))
      .slice(0, 3)
      .map((term) => ({ label: term.label, color: TREND_TONE_COLOR[trendTone(term)] }))
    const alsoCoveredBy = Array.from(
      new Set(
        readerTopicTerm.feedIds
          .filter((feedId) => feedId !== openItem.feedId)
          .map((feedId) => feedById.get(feedId)?.title)
          .filter((title): title is string => Boolean(title))
      )
    ).slice(0, 4)
    return {
      label: readerTopicTerm.label,
      color: TREND_TONE_COLOR[trendTone(readerTopicTerm)],
      delta: formatTrendDelta(readerTopicTerm),
      related,
      alsoCoveredBy,
    }
  }, [displayedTrendReport, feedById, openItem, readerTopicTerm])
  const readerSuggestions = displayedTrendReport.terms.slice(0, 4).map((term) => ({
    key: term.key,
    label: term.label,
    color: TREND_TONE_COLOR[trendTone(term)],
    delta: formatTrendDelta(term),
    count: term.count,
    onSelect: () => selectTerm(term),
  }))

  const readingPaneElement = (
    <RssReadingPane
      item={openItem}
      feed={openItem ? feedById.get(openItem.feedId) : undefined}
      targetLanguage={targetLanguage}
      isTranslating={translatingId === openItem?.id}
      translationError={openItem ? translationErrors[openItem.id] : undefined}
      showOriginal={openItem ? showOriginalIds.has(openItem.id) : false}
      textSize={settings.readerTextSize}
      onBack={isDesktop ? undefined : closeReader}
      // Navigation d'article en article : mobile uniquement, comme le retour.
      // Aux extrémités de la liste, le rappel est absent — le volet en déduit
      // seul quoi désactiver et jusqu'où résister au balayage.
      onPreviousItem={
        !isDesktop && openItemIndex > 0 ? () => goToAdjacentItem(-1) : undefined
      }
      onNextItem={
        !isDesktop && openItemIndex >= 0 && openItemIndex < visibleItems.length - 1
          ? () => goToAdjacentItem(1)
          : undefined
      }
      position={
        !isDesktop && openItemIndex >= 0
          ? { index: openItemIndex, total: visibleItems.length }
          : undefined
      }
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
      topic={readerTopic}
      onShowTopic={readerTopicTerm ? () => {
        selectTerm(readerTopicTerm)
        setRightPane('trends')
      } : undefined}
      suggestions={readerSuggestions}
    />
  )

  const statusBanner =
    !isOnline ? (
        <div
          className="flex flex-shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/8 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-300"
          role="status"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            Hors connexion — vos articles restent consultables.
          </span>
        </div>
      ) : error || notice ? (
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
      ) : null

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--bg-primary)]">
      {isDesktop ? null : (
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
            disabled={feeds.length === 0 || !isOnline}
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
            title="Paramètres"
            aria-label="Paramètres"
            onClick={() => setShowSettingsModal(true)}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>
      )}

      {/* Messages en bandeau fin : ils ne doivent pas repousser les volets */}
      {isDesktop ? null : statusBanner}

      {isDesktop ? (
        /* Bureau : rail de navigation, puis une vue plein écran. */
        <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)]">
          <AppNavRail
            view={rightPane}
            onNavigate={setRightPane}
            unreadCount={totals.unread}
            feedCount={feeds.length}
            hasRisingTopics={displayedTrendReport.terms.some((term) => {
              const tone = trendTone(term)
              return tone === 'hot' || tone === 'new'
            })}
            isRefreshing={isRefreshing}
            isOnline={isOnline}
            lastRefreshAt={lastRefreshAt}
            isDarkTheme={isDarkTheme}
            onRefresh={() => void refreshAllFeeds()}
            onOpenCatalog={() => setShowCatalog(true)}
            onAddFeedUrl={() => {
              setAddFeedError(null)
              setShowAddFeedModal(true)
            }}
            onImportOpml={() => void handleImportOpml()}
            onExportOpml={() => void handleExportOpml()}
            onToggleTheme={() => updateAiSettings({ theme: isDarkTheme ? 'light' : 'dark' })}
            onOpenSettings={() => setShowSettingsModal(true)}
          >
            {feedRailElement}
          </AppNavRail>
          <main className="flex min-h-0 flex-col border-l border-[var(--border)]">
            {statusBanner}
            <div className="min-h-0 flex-1 overflow-hidden">
              {rightPane === 'trends' ? (
                constellationElement
              ) : rightPane === 'briefing' ? (
                briefingPanelElement
              ) : (
                <div className="grid h-full grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)] divide-x divide-[var(--border)]">
                  {articleListSection}
                  {readingPaneElement}
                </div>
              )}
            </div>
          </main>
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
              {/* Voile : doublon du bouton de fermeture pour un lecteur
                  d'écran, on le retire de l'arbre d'accessibilité. */}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
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

      {hasOpenedCatalog ? (
        <Suspense fallback={null}>
          <FeedCatalogModal
            open={showCatalog}
            onOpenChange={setShowCatalog}
            subscribedUrls={subscribedUrls}
            onAddFeeds={handleAddCatalogFeeds}
            onAddUrl={() => {
              setShowCatalog(false)
              setAddFeedError(null)
              setShowAddFeedModal(true)
            }}
          />
        </Suspense>
      ) : null}

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
            options={REFRESH_INTERVAL_OPTIONS}
          />
        </div>
      </Modal>

      {hasOpenedSettings ? (
        <Suspense fallback={null}>
          <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
        </Suspense>
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
] as const

/**
 * Barre d'onglets basse, à hauteur de pouce ; re-taper « Articles » pendant
 * la lecture ramène à la liste.
 */
function MobileTabBar({
  value,
  onChange,
}: {
  value: RightPane
  onChange: (value: RightPane) => void
}) {
  return (
    <nav
      aria-label="Navigation principale"
      className="relative z-20 flex min-h-[var(--mobile-tabbar-height)] flex-shrink-0 items-stretch gap-1 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-2 pt-1 pb-[calc(env(safe-area-inset-bottom)+0.375rem)]"
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
              'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 font-medium transition-colors',
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
