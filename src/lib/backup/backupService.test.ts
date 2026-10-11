import { beforeEach, describe, expect, it } from 'vitest'
import type { RssFeed, RssItem } from '@/types/rss'
import { defaultRssSettings, useRssStore } from '@/stores/rssStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { defaultSettings } from '@/lib/constants/settingsDefaults'
import { createBackup, parseBackup, restoreBackup, summarizeBackup } from './backupService'

const feed: RssFeed = {
  id: 'feed-1',
  title: 'Le Monde',
  url: 'https://www.lemonde.fr/rss/une.xml',
  enabled: true,
  refreshIntervalMinutes: 30,
  lastFetchedAt: 1_000,
  lastSuccessAt: 1_000,
  lastError: null,
  consecutiveFailures: 0,
  createdAt: 500,
  updatedAt: 1_000,
}

function item(id: string, overrides: Partial<RssItem> = {}): RssItem {
  return {
    id,
    feedId: 'feed-1',
    guid: `guid-${id}`,
    title: `Titre ${id}`,
    link: `https://www.lemonde.fr/${id}`,
    publishedAt: 2_000,
    summary: 'Résumé',
    contentSnippet: 'Résumé',
    categories: ['Monde'],
    readAt: null,
    savedAt: null,
    importedReviewIds: [],
    importedAt: null,
    fetchedAt: 2_500,
    ...overrides,
  }
}

function resetStores() {
  useRssStore.setState({
    feeds: [],
    items: [],
    selectedItemIds: [],
    settings: defaultRssSettings,
    aiTrendSelection: null,
    trendBriefing: null,
  })
  useSettingsStore.setState({ ...defaultSettings })
}

describe('backupService', () => {
  beforeEach(resetStores)

  it('exporte puis restaure flux, articles, mots-clés et préférences', () => {
    useRssStore.setState({
      feeds: [feed],
      items: [
        item('a', { readAt: 3_000 }),
        item('b', {
          savedAt: 4_000,
          publishedAt: 9_000,
          translation: { title: 'T', summary: 'S', targetLanguage: 'fr', translatedAt: 5_000 },
        }),
      ],
      settings: {
        ...defaultRssSettings,
        density: 'compact',
        watchedKeywords: [{ term: 'Ankara', createdAt: 1 }],
      },
    })
    useSettingsStore.setState({ theme: 'dark', aiProvider: 'mistral', mistralModel: 'mistral-large-latest' })

    const text = JSON.stringify(createBackup(10_000))
    resetStores()
    const backup = parseBackup(text)
    expect(summarizeBackup(backup)).toEqual({
      exportedAt: 10_000,
      feedCount: 1,
      itemCount: 2,
      savedCount: 1,
    })
    restoreBackup(backup)

    const rss = useRssStore.getState()
    expect(rss.feeds).toEqual([feed])
    // Du plus récent au plus ancien, comme après une collecte.
    expect(rss.items.map((entry) => entry.id)).toEqual(['b', 'a'])
    expect(rss.items[0].savedAt).toBe(4_000)
    expect(rss.items[0].translation?.title).toBe('T')
    expect(rss.items[1].readAt).toBe(3_000)
    expect(rss.settings.density).toBe('compact')
    expect(rss.settings.watchedKeywords).toEqual([{ term: 'Ankara', createdAt: 1 }])
    expect(rss.settings.savedKeywordSearches).toEqual(['Ankara'])

    const preferences = useSettingsStore.getState()
    expect(preferences.theme).toBe('dark')
    expect(preferences.aiProvider).toBe('mistral')
    expect(preferences.mistralModel).toBe('mistral-large-latest')
  })

  it('n’écrit ni clé API ni adresse de relais dans la sauvegarde', () => {
    useSettingsStore.setState({
      geminiApiKey: 'SECRET-GEMINI',
      mistralApiKey: 'SECRET-MISTRAL',
      openrouterApiKey: 'SECRET-OPENROUTER',
      albertApiKey: 'SECRET-ALBERT',
      localAiEndpoint: 'http://localhost:9999/secret-endpoint',
    })
    const text = JSON.stringify(createBackup())
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('secret-endpoint')
    expect(text).not.toMatch(/ApiKey/)
  })

  it('ne laisse pas une sauvegarde modifier les clés ni les adresses de relais', () => {
    useSettingsStore.setState({ geminiApiKey: 'ma-cle', localAiEndpoint: 'http://localhost:1234' })
    const backup = parseBackup(
      JSON.stringify({
        app: 'veille-rss',
        formatVersion: 1,
        rss: { feeds: [], items: [] },
        preferences: {
          geminiApiKey: 'cle-pirate',
          localAiEndpoint: 'https://pirate.example/v1',
          appleFmBridgeUrl: 'https://pirate.example/v1',
          aiProvider: 'fournisseur-inconnu',
          theme: 'rose',
          inconnu: true,
        },
      })
    )
    expect(backup.preferences).toEqual({})
    restoreBackup(backup)
    expect(useSettingsStore.getState().geminiApiKey).toBe('ma-cle')
    expect(useSettingsStore.getState().localAiEndpoint).toBe('http://localhost:1234')
  })

  it('écarte les flux et articles invalides ou dangereux', () => {
    const backup = parseBackup(
      JSON.stringify({
        app: 'veille-rss',
        formatVersion: 1,
        rss: {
          feeds: [
            feed,
            { ...feed, id: 'local', url: 'http://192.168.1.1/feed' },
            { ...feed, id: 'js', url: 'javascript:alert(1)' },
            { id: 42 },
            'pas un flux',
          ],
          items: [
            item('ok'),
            item('ok'),
            item('lien', { link: 'javascript:alert(1)' }),
            { ...item('sans-date'), publishedAt: null },
            { title: 'sans identifiant' },
          ],
          settings: { density: 42, itemsPerFeedLimit: 500, intrus: 'x' },
        },
      })
    )
    expect(backup.rss.feeds.map((entry) => entry.id)).toEqual(['feed-1'])
    expect(backup.rss.items.map((entry) => entry.id)).toEqual(['ok', 'lien'])
    expect(backup.rss.items[1].link).toBe('')
    expect(backup.rss.settings.density).toBe(defaultRssSettings.density)
    expect(backup.rss.settings.itemsPerFeedLimit).toBe(500)
    expect(backup.rss.settings).not.toHaveProperty('intrus')
    expect(backup.rss.settings.keywordNotificationsEnabled).toBe(false)
  })

  it('refuse un fichier étranger ou trop récent', () => {
    expect(() => parseBackup('<opml/>')).toThrow(/JSON/)
    expect(() => parseBackup(JSON.stringify({ feeds: [] }))).toThrow(/pas une sauvegarde/)
    expect(() =>
      parseBackup(JSON.stringify({ app: 'veille-rss', formatVersion: 99, rss: {} }))
    ).toThrow(/plus récente/)
  })
})
