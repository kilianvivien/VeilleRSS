import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RssFeed, RssItem } from '@/types/rss'
import { defaultRssSettings, useRssStore } from '@/stores/rssStore'
import { RssFeeds } from './RssFeeds'

let isDesktopViewport = true
vi.mock('@/lib/hooks/useMediaQuery', () => ({
  // `useMediaQuery` sert aussi à `prefers-reduced-motion` : on ne répond
  // `true` que pour la requête de largeur.
  useMediaQuery: (query: string) =>
    query.includes('min-width') ? isDesktopViewport : false,
}))

vi.mock('@/lib/platform/fileService', () => ({
  saveFile: vi.fn(async () => {}),
  openFileDialog: vi.fn(async () => null),
}))

/**
 * Les doublures exposent juste ce que la vue leur passe : c'est ce câblage —
 * quel article est ouvert, à quel rang, et jusqu'où on peut aller — que ces
 * cas vérifient. Le geste lui-même est couvert par `RssReadingPane.test.tsx`.
 */
vi.mock('@/components/rss', async () => ({
  FeedRail: () => <div />,
  RssReadingPane: ({
    item,
    position,
    onPreviousItem,
    onNextItem,
  }: {
    item: RssItem | null
    position?: { index: number; total: number }
    onPreviousItem?: () => void
    onNextItem?: () => void
  }) =>
    item ? (
      <div data-testid="reading-pane">
        <span data-testid="reader-title">{item.title}</span>
        <span data-testid="reader-position">
          {position ? `${position.index + 1}/${position.total}` : ''}
        </span>
        <button type="button" onClick={onPreviousItem} disabled={!onPreviousItem}>
          reader-prev
        </button>
        <button type="button" onClick={onNextItem} disabled={!onNextItem}>
          reader-next
        </button>
      </div>
    ) : (
      <div />
    ),
  TrendPanel: (await import('@/components/rss/TrendPanel')).TrendPanel,
  formatRefreshInterval: () => '',
  RssArticleRow: ({ item, onOpen }: { item: RssItem; onOpen: () => void }) => (
    <li data-testid="article-row">
      <button type="button" onClick={onOpen}>
        Ouvrir {item.title}
      </button>
    </li>
  ),
}))

const BACK_TO_TOP_LABEL = 'Revenir en haut de la liste'

const now = Date.now()
const feed: RssFeed = {
  id: 'feed-1',
  title: 'Synthetic feed',
  url: 'https://example.com/rss.xml',
  enabled: true,
  refreshIntervalMinutes: 60,
  lastFetchedAt: now,
  lastSuccessAt: now,
  lastError: null,
  consecutiveFailures: 0,
  createdAt: now,
  updatedAt: now,
}

function makeItems(count: number): RssItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    feedId: feed.id,
    guid: `guid-${index}`,
    title: `Synthetic article ${index}`,
    link: `https://example.com/articles/${index}`,
    publishedAt: now - index * 1_000,
    summary: `Summary ${index}`,
    contentSnippet: `Snippet ${index}`,
    categories: [],
    readAt: null,
    savedAt: null,
    importedReviewIds: [],
    importedAt: null,
    fetchedAt: now,
  }))
}

describe('selected trend summary wiring', () => {
  beforeEach(() => {
    const samples = makeItems(6).map((item, index) => ({
      ...item,
      title: index < 3 ? 'Ankara' : 'London',
      feedId: index === 1 ? 'feed-2' : feed.id,
      publishedAt: now - [1, 8, 30, 2, 3, 4][index] * 3_600_000,
    }))
    useRssStore.setState({
      feeds: [feed, { ...feed, id: 'feed-2', title: 'Second feed' }],
      items: samples, selectedItemIds: [], isRefreshing: false, refreshingFeedIds: [],
      settings: { ...defaultRssSettings, trendWindowHours: 24, showTrendsByDefault: true },
      aiTrendSelection: null, trendBriefing: null,
    })
  })

  afterEach(() => {
    cleanup()
    isDesktopViewport = true
    useRssStore.setState({ feeds: [], items: [], selectedItemIds: [] })
  })

  it('switches the top card to the clicked topic, updates the window, and restores the global view', () => {
    render(<RssFeeds />)
    expect(screen.getByRole('region', { name: 'Volume de publication' })).toHaveTextContent('5')
    const terms = screen.getByRole('region', { name: 'Termes en hausse' })
    fireEvent.click(within(terms).getByRole('button', { name: /^Ankara/ }))
    const card = screen.getByRole('region', { name: 'Détail du sujet : Ankara' })
    expect(within(card).getByText('Articles').nextElementSibling).toHaveTextContent('2')
    expect(within(card).getByText('Sources').nextElementSibling).toHaveTextContent('2')
    expect(card).toHaveTextContent('+100 %')
    expect(card).toHaveTextContent('40 % des articles')
    expect(screen.queryByRole('region', { name: 'Volume de publication' })).not.toBeInTheDocument()
    expect(within(card).getByRole('group', { name: 'Évolution de Ankara' }).querySelectorAll('button')).toHaveLength(12)
    const intervals = within(within(card).getByRole('group', { name: 'Évolution de Ankara' })).getAllByRole('button')
    fireEvent.click(intervals[0])
    expect(intervals[0]).toHaveAttribute('aria-pressed', 'true')
    expect(intervals[11]).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: '6 h' }))
    expect(within(card).getByText('Articles').nextElementSibling).toHaveTextContent('1')
    expect(card).toHaveTextContent('contre 1 article sur les 6 h précédentes')
    expect(card).toHaveTextContent('Stable')

    fireEvent.click(within(card).getByRole('button', { name: 'Vue globale' }))
    expect(screen.getByRole('region', { name: 'Volume de publication' })).toHaveTextContent('4')
    expect(screen.queryByRole('region', { name: 'Détail du sujet : Ankara' })).not.toBeInTheDocument()
    expect(screen.queryByText('Filtré sur « Ankara »')).not.toBeInTheDocument()
  })

  it('keeps the topic detail on mobile and provides a separate route to its articles', () => {
    isDesktopViewport = false
    render(<RssFeeds />)
    fireEvent.click(within(screen.getByRole('region', { name: 'Termes en hausse' })).getByRole('button', { name: /^Ankara/ }))
    const card = screen.getByRole('region', { name: 'Détail du sujet : Ankara' })
    expect(card).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Voir les articles' }))
    expect(screen.getAllByTestId('article-row')).toHaveLength(3)
    expect(screen.getByText('Filtré sur « Ankara »')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navigation principale' })).getByText('Tendances'))
    expect(screen.getByRole('region', { name: 'Détail du sujet : Ankara' })).toBeInTheDocument()
  })

  it('refreshes the selected topic when a new article arrives', () => {
    render(<RssFeeds />)
    fireEvent.click(within(screen.getByRole('region', { name: 'Termes en hausse' })).getByRole('button', { name: /^Ankara/ }))
    act(() => {
      const fresh = { ...makeItems(1)[0], id: 'fresh', title: 'Ankara', publishedAt: Date.now() - 1000 }
      useRssStore.setState({ items: [...useRssStore.getState().items, fresh] })
    })
    const card = screen.getByRole('region', { name: 'Détail du sujet : Ankara' })
    expect(within(card).getByText('Articles').nextElementSibling).toHaveTextContent('3')
    expect(card).toHaveTextContent('+200 %')
    expect(card).toHaveTextContent('50 % des articles')
  })

  it('uses the watched keyword’s summary matches for the detail and article filter', () => {
    const state = useRssStore.getState()
    useRssStore.setState({
      settings: { ...state.settings, watchedKeywords: [{ term: 'Ankara', createdAt: now }] },
      items: state.items.map((item, index) => index === 3 ? { ...item, summary: 'Talks in Ankara' } : item),
    })
    render(<RssFeeds />)
    fireEvent.click(within(screen.getByRole('region', { name: 'Mots-clés suivis' })).getByRole('button', { name: /^Ankara/ }))
    const card = screen.getByRole('region', { name: 'Détail du sujet : Ankara' })
    expect(card).toHaveTextContent('Mot-clé suivi')
    expect(within(card).getByText('Articles').nextElementSibling).toHaveTextContent('3')
    expect(screen.getAllByTestId('article-row')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre de tendance' }))
    expect(screen.getByRole('region', { name: 'Volume de publication' })).toBeInTheDocument()
  })
})

describe('RssFeeds progressive article rendering', () => {
  beforeEach(() => {
    useRssStore.setState({
      feeds: [feed],
      items: makeItems(200),
      selectedItemIds: [],
      isRefreshing: false,
      refreshingFeedIds: [],
      settings: defaultRssSettings,
      aiTrendSelection: null,
      trendBriefing: null,
    })
  })

  afterEach(() => {
    cleanup()
    isDesktopViewport = true
    useRssStore.setState({ feeds: [], items: [], selectedItemIds: [] })
  })

  it('mounts bounded batches while count and bulk selection use all filtered items', () => {
    render(<RssFeeds />)

    expect(screen.getAllByTestId('article-row')).toHaveLength(80)
    expect(screen.getByTestId('filtered-article-count')).toHaveTextContent('200')

    fireEvent.click(screen.getByRole('button', { name: /Afficher 80 articles supplémentaires/i }))
    expect(screen.getAllByTestId('article-row')).toHaveLength(160)

    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les articles visibles' }))
    expect(useRssStore.getState().selectedItemIds).toHaveLength(200)
  })
})

/**
 * La composition mobile est un arbre React entièrement distinct, choisi par
 * `isDesktop`. Sans ces cas, tout le travail tactile (barre d'onglets,
 * tiroir, gestes) partirait sans aucune couverture.
 */
describe('RssFeeds mobile composition', () => {
  beforeEach(() => {
    isDesktopViewport = false
    useRssStore.setState({
      feeds: [feed],
      items: makeItems(10),
      selectedItemIds: [],
      isRefreshing: false,
      refreshingFeedIds: [],
      // Sans cela le volet Tendances s'ouvre par défaut et masque la liste.
      settings: { ...defaultRssSettings, showTrendsByDefault: false },
      aiTrendSelection: null,
      trendBriefing: null,
    })
  })

  afterEach(() => {
    cleanup()
    isDesktopViewport = true
    useRssStore.setState({ feeds: [], items: [], selectedItemIds: [] })
  })

  it('renders the bottom tab bar and the article list in a single pane', () => {
    render(<RssFeeds />)

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(nav).toBeInTheDocument()
    for (const label of ['Articles', 'Tendances', 'Briefing', 'Carte']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }

    expect(screen.getAllByTestId('article-row')).toHaveLength(10)
  })

  it('opens the sources drawer from the header and closes it again', () => {
    render(<RssFeeds />)

    expect(screen.queryByRole('dialog', { name: 'Sources et vues' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les sources et vues' }))
    const drawer = screen.getByRole('dialog', { name: 'Sources et vues' })
    expect(drawer).toBeInTheDocument()

    fireEvent.click(within(drawer).getByRole('button', { name: 'Fermer le tiroir des sources' }))
    expect(screen.queryByRole('dialog', { name: 'Sources et vues' })).not.toBeInTheDocument()
  })

  it('switches panes from the bottom tab bar', () => {
    render(<RssFeeds />)

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    fireEvent.click(within(nav).getByText('Tendances'))

    // Le volet unique a changé : la liste n'est plus montée.
    expect(screen.queryAllByTestId('article-row')).toHaveLength(0)
  })

  /**
   * Naviguer d'un article à l'autre depuis le lecteur suit la liste affichée,
   * filtres et tri compris — pas l'ordre brut du cache.
   */
  it('walks to the next article from the reader and tracks the position', () => {
    render(<RssFeeds />)

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Synthetic article 0' }))
    expect(screen.getByTestId('reader-title')).toHaveTextContent('Synthetic article 0')
    expect(screen.getByTestId('reader-position')).toHaveTextContent('1/10')
    // Rien avant le premier : la vue ne fournit pas de rappel « précédent ».
    expect(screen.getByRole('button', { name: 'reader-prev' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'reader-next' }))
    expect(screen.getByTestId('reader-title')).toHaveTextContent('Synthetic article 1')
    expect(screen.getByTestId('reader-position')).toHaveTextContent('2/10')

    fireEvent.click(screen.getByRole('button', { name: 'reader-prev' }))
    expect(screen.getByTestId('reader-title')).toHaveTextContent('Synthetic article 0')
  })

  it('marks the article reached by navigation as read', () => {
    render(<RssFeeds />)

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Synthetic article 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'reader-next' }))

    const reached = useRssStore.getState().items.find((item) => item.id === 'item-1')
    expect(reached?.readAt).toEqual(expect.any(Number))
  })

  it('stops at the last article of the list', () => {
    render(<RssFeeds />)

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Synthetic article 9' }))
    expect(screen.getByTestId('reader-position')).toHaveTextContent('10/10')
    expect(screen.getByRole('button', { name: 'reader-next' })).toBeDisabled()
  })

  /**
   * Le volet Tendances s'ouvre par défaut : la liste n'est donc PAS montée au
   * premier rendu, et n'apparaît qu'au retour sur l'onglet Articles. C'est le
   * parcours réel sur téléphone, et celui qui a laissé le geste sans écouteur.
   */
  it('arms pull-to-refresh on a list mounted after the first render', async () => {
    const refreshAllFeeds = vi.fn(async () => {})
    useRssStore.setState({
      refreshAllFeeds,
      settings: { ...defaultRssSettings, showTrendsByDefault: true },
    })

    render(<RssFeeds />)
    expect(screen.queryByTestId('article-scroller')).not.toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    fireEvent.click(within(nav).getByText('Articles'))

    const scroller = screen.getByTestId('article-scroller')
    scroller.scrollTop = 0

    expect(screen.queryByTestId('pull-indicator')).not.toBeInTheDocument()

    // Traction courte : la pastille sort, mais le seuil n'est pas atteint.
    await act(async () => {
      fireEvent.touchStart(scroller, { touches: [{ clientY: 0 }] })
      fireEvent.touchMove(scroller, { touches: [{ clientY: 40 }] })
    })
    expect(screen.getByTestId('pull-indicator')).toHaveAttribute('data-armed', 'false')

    // Au-delà du seuil, elle s'arme ; le relâchement déclenche alors le refresh.
    await act(async () => {
      fireEvent.touchMove(scroller, { touches: [{ clientY: 200 }] })
    })
    expect(screen.getByTestId('pull-indicator')).toHaveAttribute('data-armed', 'true')

    await act(async () => {
      fireEvent.touchEnd(scroller, { touches: [] })
    })
    expect(refreshAllFeeds).toHaveBeenCalled()
  })

  it('reveals the back-to-top button past the scroll threshold and scrolls back up', () => {
    render(<RssFeeds />)

    const scroller = screen.getByTestId('article-scroller')
    // jsdom ne fournit pas `scrollTo` : on l'espionne pour vérifier l'appel.
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo as unknown as Element['scrollTo']

    expect(screen.queryByRole('button', { name: BACK_TO_TOP_LABEL })).not.toBeInTheDocument()

    // Sous le seuil : toujours rien.
    scroller.scrollTop = 200
    fireEvent.scroll(scroller)
    expect(screen.queryByRole('button', { name: BACK_TO_TOP_LABEL })).not.toBeInTheDocument()

    scroller.scrollTop = 1200
    fireEvent.scroll(scroller)
    fireEvent.click(screen.getByRole('button', { name: BACK_TO_TOP_LABEL }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    // De retour en haut, le bouton disparaît.
    scroller.scrollTop = 0
    fireEvent.scroll(scroller)
    expect(screen.queryByRole('button', { name: BACK_TO_TOP_LABEL })).not.toBeInTheDocument()
  })
})

describe('RssFeeds desktop composition', () => {
  beforeEach(() => {
    isDesktopViewport = true
    useRssStore.setState({
      feeds: [feed],
      items: makeItems(10),
      selectedItemIds: [],
      isRefreshing: false,
      refreshingFeedIds: [],
      settings: { ...defaultRssSettings, showTrendsByDefault: false },
      aiTrendSelection: null,
      trendBriefing: null,
    })
  })

  afterEach(() => {
    cleanup()
    useRssStore.setState({ feeds: [], items: [], selectedItemIds: [] })
  })

  it('never shows the back-to-top button, whatever the scroll position', () => {
    render(<RssFeeds />)

    const scroller = screen.getByTestId('article-scroller')
    scroller.scrollTop = 4000
    fireEvent.scroll(scroller)

    expect(screen.queryByRole('button', { name: BACK_TO_TOP_LABEL })).not.toBeInTheDocument()
  })

  it('clears the information banner on its own after the dismiss delay', async () => {
    vi.useFakeTimers()
    try {
      render(<RssFeeds />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Exporter en OPML' }))
      })

      expect(screen.getByText('1 flux exporté en OPML.')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(29_000)
      })
      expect(screen.getByText('1 flux exporté en OPML.')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(2_000)
      })
      expect(screen.queryByText('1 flux exporté en OPML.')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
