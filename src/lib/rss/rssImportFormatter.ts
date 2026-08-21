import type { RssFeed, RssItem } from '@/types/rss'

function formatDate(timestamp: number | null): string {
  if (!timestamp) return 'Date inconnue'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

export function formatRssItemsForMagicReview(items: RssItem[], feeds: RssFeed[]): string {
  const feedById = new Map(feeds.map((feed) => [feed.id, feed]))

  return items
    .map((item) => {
      const feed = feedById.get(item.feedId)
      const source = feed?.title || 'Flux inconnu'
      const summary = item.summary || item.contentSnippet || 'Aucun resume disponible.'

      return [
        `--- Flux RSS: ${source} ---`,
        `Titre: ${item.title || 'Sans titre'}`,
        `Date: ${formatDate(item.publishedAt)}`,
        `URL: ${item.link || feed?.siteUrl || 'URL indisponible'}`,
        '',
        'Resume:',
        summary,
      ].join('\n')
    })
    .join('\n\n')
}

