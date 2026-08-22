import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

vi.mock('@/components/rss', () => ({
  FeedRail: () => <div />,
  RssReadingPane: () => <div />,
  TrendPanel: () => <div />,
  formatRefreshInterval: () => '',
  RssArticleRow: ({ item }: { item: RssItem }) => (
    <li data-testid="article-row">{item.title}</li>
  ),
}))

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
})
