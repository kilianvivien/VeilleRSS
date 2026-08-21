import type { RssItem } from '@/types/rss'

export const RSS_ITEMS_PER_FEED_LIMIT = 200

function itemKey(item: Pick<RssItem, 'feedId' | 'guid' | 'link'>): string {
  return `${item.feedId}|${item.guid || item.link}`
}

function isSameItem(a: RssItem, b: RssItem): boolean {
  return a.feedId === b.feedId && (a.guid === b.guid || (!!a.link && a.link === b.link))
}

export function mergeRssItems(
  existingItems: RssItem[],
  incomingItems: RssItem[],
  itemsPerFeedLimit = RSS_ITEMS_PER_FEED_LIMIT
): RssItem[] {
  const merged = [...existingItems]

  for (const incoming of incomingItems) {
    const index = merged.findIndex((item) => isSameItem(item, incoming))
    if (index >= 0) {
      merged[index] = {
        ...incoming,
        id: merged[index].id,
        readAt: merged[index].readAt,
        savedAt: merged[index].savedAt,
        importedReviewIds: merged[index].importedReviewIds,
        importedAt: merged[index].importedAt,
      }
    } else {
      merged.push(incoming)
    }
  }

  return capRssItemsPerFeed(merged, itemsPerFeedLimit)
}

export function capRssItemsPerFeed(items: RssItem[], itemsPerFeedLimit = RSS_ITEMS_PER_FEED_LIMIT): RssItem[] {
  const byFeed = new Map<string, RssItem[]>()
  for (const item of items) {
    byFeed.set(item.feedId, [...(byFeed.get(item.feedId) ?? []), item])
  }

  return Array.from(byFeed.values()).flatMap((feedItems) => {
    const retained = feedItems.filter((item) => item.savedAt || item.importedAt || item.importedReviewIds.length > 0)
    const retainedKeys = new Set(retained.map(itemKey))
    const capped = feedItems
      .filter((item) => !retainedKeys.has(itemKey(item)))
      .sort((a, b) => (b.publishedAt ?? b.fetchedAt) - (a.publishedAt ?? a.fetchedAt))
      .slice(0, itemsPerFeedLimit)

    return [...retained, ...capped]
  })
}
