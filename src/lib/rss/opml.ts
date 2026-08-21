import type { RssFeed } from '@/types/rss'
import { escapeHtml } from '@/lib/utils/sanitizeHtml'

export interface OpmlFeedEntry {
  title: string
  url: string
  siteUrl?: string
  category?: string
}

function outlineEntries(outline: Element, inheritedCategory?: string): OpmlFeedEntry[] {
  const xmlUrl = outline.getAttribute('xmlUrl')?.trim()
  const title = outline.getAttribute('title')?.trim() || outline.getAttribute('text')?.trim() || ''
  const category = outline.getAttribute('category')?.trim() || inheritedCategory

  const current = xmlUrl
    ? [{
        title: title || xmlUrl,
        url: xmlUrl,
        siteUrl: outline.getAttribute('htmlUrl')?.trim() || undefined,
        category,
      }]
    : []

  const childCategory = xmlUrl ? category : title || inheritedCategory
  const children = Array.from(outline.children).flatMap((child) => outlineEntries(child, childCategory))
  return [...current, ...children]
}

export function parseOpml(opml: string): OpmlFeedEntry[] {
  const doc = new DOMParser().parseFromString(opml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Fichier OPML invalide ou illisible.')
  }

  const root = doc.querySelector('opml')
  if (!root) {
    throw new Error('Le fichier selectionne n’est pas un OPML.')
  }

  const body = root.querySelector('body')
  if (!body) {
    throw new Error('Le fichier OPML ne contient aucun flux.')
  }

  const entries = Array.from(body.children).flatMap((outline) => outlineEntries(outline))
  if (entries.length === 0) {
    throw new Error('Aucun flux RSS n’a ete trouve dans cet OPML.')
  }

  return entries
}

export function exportFeedsToOpml(feeds: RssFeed[]): string {
  const outlines = feeds
    .map((feed) => {
      const attrs = [
        `text="${escapeHtml(feed.title)}"`,
        `title="${escapeHtml(feed.title)}"`,
        'type="rss"',
        `xmlUrl="${escapeHtml(feed.url)}"`,
        feed.siteUrl ? `htmlUrl="${escapeHtml(feed.siteUrl)}"` : null,
        feed.category ? `category="${escapeHtml(feed.category)}"` : null,
      ].filter(Boolean)

      return `    <outline ${attrs.join(' ')} />`
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>DiploRevue RSS Feeds</title>',
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>',
    outlines,
    '  </body>',
    '</opml>',
    '',
  ].join('\n')
}
