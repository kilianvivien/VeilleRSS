import { describe, expect, it } from 'vitest'
import { needsFrenchRewrite, selectBriefingArticles } from './trendBriefingService'
import type { TrendReport } from './trendAnalysis'
import type { RssFeed, RssItem } from '@/types/rss'

const NOW = 1_760_000_000_000

const feed: RssFeed = {
  id: 'feed-1',
  title: 'Source diplomatique',
  url: 'https://example.com/rss.xml',
  enabled: true,
  refreshIntervalMinutes: 60,
  lastFetchedAt: NOW,
  lastSuccessAt: NOW,
  lastError: null,
  consecutiveFailures: 0,
  createdAt: NOW,
  updatedAt: NOW,
}

function rssItem(summary: string): RssItem {
  return {
    id: 'item-1',
    feedId: feed.id,
    guid: 'item-1',
    title: 'Une décision diplomatique est annoncée',
    link: 'https://example.com/article',
    publishedAt: NOW - 3_600_000,
    summary,
    contentSnippet: summary.slice(0, 500),
    categories: ['Diplomatie', 'Ankara'],
    readAt: null,
    savedAt: null,
    importedReviewIds: [],
    importedAt: null,
    fetchedAt: NOW,
  }
}

const report: TrendReport = {
  generatedAt: NOW,
  windowHours: 24,
  bucketCount: 12,
  bucketHours: 2,
  itemCount: 1,
  previousItemCount: 0,
  sourceCount: 1,
  volumeBuckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  terms: [],
  watched: [],
}

describe('selectBriefingArticles', () => {
  it('sends a bounded RSS excerpt and article metadata to the briefing model', () => {
    const summary = `Le ministère annonce une mesure précise. ${'Contexte supplémentaire '.repeat(80)}`

    const [selected] = selectBriefingArticles({
      report,
      items: [rssItem(summary)],
      feeds: [feed],
      now: NOW,
    })

    expect(selected).toMatchObject({
      title: 'Une décision diplomatique est annoncée',
      source: 'Source diplomatique',
      publishedAt: new Date(NOW - 3_600_000).toISOString(),
      categories: ['Diplomatie', 'Ankara'],
      topics: [],
    })
    expect(selected.excerpt).toContain('Le ministère annonce une mesure précise.')
    expect(selected.excerpt.length).toBeLessThanOrEqual(1_001)
    expect(selected.excerpt.endsWith('…')).toBe(true)
  })
})

describe('needsFrenchRewrite', () => {
  it('detects a Turkish briefing even when its opening line is already French', () => {
    expect(
      needsFrenchRewrite([
        'Le sujet progresse de 4 à 12 mentions par rapport à la période précédente.',
        "Adana Cumhuriyet Başsavcılığı tarafından yürütülen soruşturmada şüpheliler tutuklanarak cezaevine gönderildi.",
        "Kulüp oyuncunun tomografisinin temiz çıktığını ve durumunun iyi olduğunu açıkladı.",
      ])
    ).toBe(true)
  })

  it('accepts a detailed briefing written in French', () => {
    expect(
      needsFrenchRewrite([
        'Le dossier passe de quatre à douze mentions, tandis que le second sujet recule légèrement.',
        'Le parquet a annoncé plusieurs arrestations dans le cadre de son enquête. Les personnes concernées ont été placées en détention provisoire selon la source.',
        'Le club indique que les examens médicaux du joueur sont rassurants et que son état ne suscite plus d’inquiétude immédiate.',
      ])
    ).toBe(false)
  })
})
