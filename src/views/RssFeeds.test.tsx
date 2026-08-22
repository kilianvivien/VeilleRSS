import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RssFeed, RssItem } from '@/types/rss'
import { defaultRssSettings, useRssStore } from '@/stores/rssStore'
import { RssFeeds } from './RssFeeds'

vi.mock('@/lib/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}))

vi.mock('@/components/rss', () => ({
  FeedCatalogModal: () => null,
  FeedRail: () => <div />,
  RssReadingPane: () => <div />,
  TrendBriefingPanel: () => <div />,
  TrendMapView: () => <div />,
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
