import type { ParsedRssFeed } from '@/types/rss'
import { sanitizeRichHtml } from '@/lib/utils/sanitizeHtml'

function textContent(element: Element | Document, selector: string): string {
  return element.querySelector(selector)?.textContent?.trim() ?? ''
}

function firstText(element: Element, selectors: string[]): string {
  for (const selector of selectors) {
    const value = textContent(element, selector)
    if (value) return value
  }
  return ''
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function htmlToText(value: string): string {
  if (!value) return ''
  const sanitized = sanitizeRichHtml(value)
  const doc = new DOMParser().parseFromString(`<div>${sanitized}</div>`, 'text/html')
  return collapseWhitespace(doc.body.textContent ?? '')
}

function parseDate(value: string): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(16)
}

function getAtomLink(entry: Element): string {
  const alternate = Array.from(entry.querySelectorAll('link')).find((link) => {
    const rel = link.getAttribute('rel')
    return !rel || rel === 'alternate'
  })
  return alternate?.getAttribute('href')?.trim() ?? textContent(entry, 'link')
}

function getRssLink(item: Element): string {
  return textContent(item, 'link') || textContent(item, 'guid')
}

function fallbackGuid(feedUrl: string, link: string, title: string, publishedAt: number | null): string {
  return `fallback-${stableHash([feedUrl, link, title, publishedAt ?? ''].join('|'))}`
}

/**
 * Un article sans date de publication lisible n'est pas affichable : il serait
 * daté de sa collecte, donc présenté comme paraissant à l'instant, et pèserait
 * d'autant sur les tendances. Le cache ne retient que les articles datés.
 */
export function isDatedRssItem<T extends { publishedAt: number | null }>(item: T): boolean {
  return typeof item.publishedAt === 'number' && Number.isFinite(item.publishedAt)
}

function parseRssChannel(doc: Document, feedUrl: string): ParsedRssFeed {
  const channel = doc.querySelector('channel')
  if (!channel) {
    throw new Error('Flux RSS invalide: canal manquant.')
  }

  // RSS 1.0/RDF places <item> elements next to <channel>, whereas RSS 2.0
  // nests them inside it. Query the document so both layouts are ingested.
  const items = Array.from(doc.querySelectorAll('item')).map((item) => {
    const title = firstText(item, ['title']) || 'Sans titre'
    const link = getRssLink(item)
    // Un article sans date lisible est écarté à l'entrée du cache : mieux vaut
    // lire tous les champs de date en usage avant de le condamner.
    const publishedAt = parseDate(
      firstText(item, [
        'pubDate',
        'dc\\:date',
        'dcterms\\:created',
        'date',
        'published',
        'updated',
        'a10\\:updated',
      ])
    )
    const rawSummary = firstText(item, ['description', 'summary', 'content\\:encoded'])
    const summary = htmlToText(rawSummary)
    const guid = firstText(item, ['guid']) || fallbackGuid(feedUrl, link, title, publishedAt)

    return {
      guid,
      title: htmlToText(title) || title,
      link,
      author: firstText(item, ['author', 'dc\\:creator']) || undefined,
      publishedAt,
      summary,
      contentSnippet: summary.slice(0, 500),
      categories: Array.from(item.querySelectorAll('category, dc\\:subject'))
        .map((category) => collapseWhitespace(category.textContent ?? ''))
        .filter(Boolean),
    }
  })

  return {
    title: textContent(channel, 'title') || new URL(feedUrl).hostname,
    siteUrl: textContent(channel, 'link') || undefined,
    description: htmlToText(textContent(channel, 'description')) || undefined,
    items,
  }
}

function parseAtomFeed(doc: Document, feedUrl: string): ParsedRssFeed {
  const feed = doc.querySelector('feed')
  if (!feed) {
    throw new Error('Flux Atom invalide: racine manquante.')
  }

  const items = Array.from(feed.querySelectorAll('entry')).map((entry) => {
    const title = firstText(entry, ['title']) || 'Sans titre'
    const link = getAtomLink(entry)
    const publishedAt = parseDate(firstText(entry, ['published', 'updated']))
    const rawSummary = firstText(entry, ['summary', 'content'])
    const summary = htmlToText(rawSummary)
    const guid = firstText(entry, ['id']) || fallbackGuid(feedUrl, link, title, publishedAt)

    return {
      guid,
      title: htmlToText(title) || title,
      link,
      author: firstText(entry, ['author name', 'author']) || undefined,
      publishedAt,
      summary,
      contentSnippet: summary.slice(0, 500),
      categories: Array.from(entry.querySelectorAll('category'))
        .map((category) => category.getAttribute('term') || collapseWhitespace(category.textContent ?? ''))
        .filter(Boolean),
    }
  })

  return {
    title: textContent(feed, 'title') || new URL(feedUrl).hostname,
    siteUrl: Array.from(feed.querySelectorAll('link')).find((link) => {
      const rel = link.getAttribute('rel')
      return !rel || rel === 'alternate'
    })?.getAttribute('href') ?? undefined,
    description: htmlToText(textContent(feed, 'subtitle')) || undefined,
    items,
  }
}

export function parseRssFeed(xml: string, feedUrl: string): ParsedRssFeed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('Flux XML invalide ou illisible.')
  }

  const rootName = doc.documentElement.nodeName.toLowerCase()
  if (rootName === 'rss' || doc.querySelector('channel')) {
    return parseRssChannel(doc, feedUrl)
  }
  if (rootName === 'feed') {
    return parseAtomFeed(doc, feedUrl)
  }

  throw new Error('Format de flux non pris en charge. Utilisez RSS 1.0, RSS 2.0 ou Atom.')
}
