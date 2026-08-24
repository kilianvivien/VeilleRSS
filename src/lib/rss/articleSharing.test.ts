import { describe, expect, it } from 'vitest'
import type { RssFeed, RssItem, RssItemTranslation } from '@/types/rss'
import { buildArticleShareContent } from './articleSharing'

const publishedAt = Date.UTC(2026, 7, 24, 12, 0, 0)

const feed: RssFeed = {
  id: 'feed-1',
  title: 'Hürriyet Daily News',
  url: 'https://example.com/rss.xml',
  siteUrl: 'https://example.com',
  enabled: true,
  refreshIntervalMinutes: 60,
  lastFetchedAt: publishedAt,
  lastSuccessAt: publishedAt,
  lastError: null,
  consecutiveFailures: 0,
  createdAt: publishedAt,
  updatedAt: publishedAt,
}

const item: RssItem = {
  id: 'item-1',
  feedId: feed.id,
  guid: 'guid-1',
  title: 'Ankara revives dialogue with Brussels',
  link: 'https://example.com/articles/1',
  publishedAt,
  summary: 'Talks on the customs union resume after eighteen months.',
  contentSnippet: 'Snippet de repli',
  categories: [],
  readAt: null,
  savedAt: null,
  importedReviewIds: [],
  importedAt: null,
  fetchedAt: publishedAt,
}

const translation: RssItemTranslation = {
  title: 'Ankara relance le dialogue avec Bruxelles',
  summary: 'Les discussions sur l’union douanière reprennent après dix-huit mois.',
  targetLanguage: 'fr',
  translatedAt: publishedAt,
}

describe('buildArticleShareContent', () => {
  it('compose titre, source, date, résumé et lien', () => {
    const content = buildArticleShareContent(item, feed, null)

    expect(content.title).toBe('Ankara revives dialogue with Brussels')
    expect(content.text).toBe(
      [
        '« Ankara revives dialogue with Brussels »',
        'Hürriyet Daily News · 24 août 2026',
        '',
        'Talks on the customs union resume after eighteen months.',
        '',
        'https://example.com/articles/1',
      ].join('\n')
    )
  })

  it('partage la traduction et rappelle le titre original', () => {
    const content = buildArticleShareContent({ ...item, translation }, feed, translation)

    expect(content.title).toBe('Ankara relance le dialogue avec Bruxelles')
    expect(content.text).toContain('« Ankara relance le dialogue avec Bruxelles »')
    expect(content.text).toContain('(titre original : Ankara revives dialogue with Brussels)')
    expect(content.text).toContain('Les discussions sur l’union douanière reprennent')
    expect(content.text).not.toContain('Talks on the customs union')
  })

  it('retombe sur le contenu du flux quand le résumé est vide', () => {
    const content = buildArticleShareContent({ ...item, summary: '' }, feed, null)
    expect(content.text).toContain('Snippet de repli')
  })

  it('omet le bloc résumé quand le flux n’en fournit aucun', () => {
    const content = buildArticleShareContent(
      { ...item, summary: '', contentSnippet: '' },
      feed,
      null
    )

    expect(content.text).toBe(
      ['« Ankara revives dialogue with Brussels »', 'Hürriyet Daily News · 24 août 2026', '', 'https://example.com/articles/1'].join(
        '\n'
      )
    )
  })

  it('réduit la ligne de source quand la date est inconnue', () => {
    const content = buildArticleShareContent({ ...item, publishedAt: null }, feed, null)
    expect(content.text).toContain('\nHürriyet Daily News\n')
    expect(content.text).not.toContain('·')
  })

  it('remplace un lien manquant par le site de la source', () => {
    const content = buildArticleShareContent({ ...item, link: '' }, feed, null)
    expect(content.text.endsWith('https://example.com')).toBe(true)
  })

  it('n’ajoute aucune ligne vide quand ni lien ni site ne sont connus', () => {
    const content = buildArticleShareContent({ ...item, link: '' }, { ...feed, siteUrl: undefined }, null)
    expect(content.text.endsWith('after eighteen months.')).toBe(true)
  })

  it('nomme la source et le titre manquants plutôt que de laisser un trou', () => {
    const content = buildArticleShareContent({ ...item, title: '  ' }, undefined, null)
    expect(content.title).toBe('Sans titre')
    expect(content.text).toContain('« Sans titre »')
    expect(content.text).toContain('Flux inconnu · 24 août 2026')
  })

  it('tronque un long résumé sur une frontière de mot', () => {
    const summary = `${'mot '.repeat(200)}fin`
    const content = buildArticleShareContent({ ...item, summary }, feed, null)
    const shared = content.text.split('\n')[3]

    expect(shared.length).toBeLessThanOrEqual(401)
    expect(shared.endsWith('…')).toBe(true)
    // La coupe tombe entre deux mots : ni mot tronqué, ni espace avant les points.
    expect(shared).toMatch(/mot…$/)
  })
})
