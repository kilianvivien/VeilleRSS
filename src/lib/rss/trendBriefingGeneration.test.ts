import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '@/types/settings'
import type { RssFeed, RssItem } from '@/types/rss'
import type { TrendReport, TrendTerm } from './trendAnalysis'

const providerMocks = vi.hoisted(() => ({ generateWithProvider: vi.fn() }))
vi.mock('@/lib/ai/pdfGeneration/providerRouter', () => providerMocks)

import { generateTrendBriefing } from './trendBriefingService'

const NOW = 1_760_000_000_000

const trend: TrendTerm = {
  key: 'ankara', label: 'Ankara', count: 4, previousCount: 1, delta: 3, changeRatio: 3,
  isNew: false, sourceCount: 1, feedIds: ['feed-1'], itemIds: ['item-1'], unreadCount: 1,
  buckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3], isPhrase: false,
}

const report: TrendReport = {
  generatedAt: NOW, windowHours: 24, bucketCount: 12, bucketHours: 2, itemCount: 1,
  previousItemCount: 0, sourceCount: 1, volumeBuckets: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  terms: [trend], watched: [],
}

const feed = {
  id: 'feed-1', title: 'Source', url: 'https://example.com/rss', enabled: true,
  refreshIntervalMinutes: 30, lastFetchedAt: NOW, lastSuccessAt: NOW, lastError: null,
  consecutiveFailures: 0, createdAt: NOW, updatedAt: NOW,
} satisfies RssFeed

const item = {
  id: 'item-1', feedId: feed.id, guid: 'item-1', title: 'Ankara gündemi',
  link: 'https://example.com/article', publishedAt: NOW - 3_600_000,
  summary: 'Başsavcılık tarafından yürütülen soruşturmada şüpheliler tutuklanarak cezaevine gönderildi.',
  contentSnippet: '', categories: ['Ankara'], readAt: null, savedAt: null,
  importedReviewIds: [], importedAt: null, fetchedAt: NOW,
} satisfies RssItem

describe('generateTrendBriefing language fallback', () => {
  it('automatically translates a Turkish model response into French', async () => {
    providerMocks.generateWithProvider
      .mockReset()
      .mockResolvedValueOnce(JSON.stringify({ lines: [item.summary, 'Kulüp durumunun iyi olduğunu açıkladı.'] }))
      .mockResolvedValueOnce(JSON.stringify({ lines: [
        'Le parquet a placé les suspects en détention dans le cadre de son enquête.',
        'Le club a indiqué que la situation était satisfaisante.',
      ] }))

    const result = await generateTrendBriefing({
      report, items: [item], feeds: [feed], provider: 'gemini', settings: {} as Settings, now: NOW,
    })

    expect(providerMocks.generateWithProvider).toHaveBeenCalledTimes(2)
    expect(result.lines[0]).toMatch(/^Le parquet/)
    const firstPrompt = providerMocks.generateWithProvider.mock.calls[0][1] as string
    const firstPayload = JSON.parse(providerMocks.generateWithProvider.mock.calls[0][2] as string)
    expect(firstPrompt).toContain("l'évolution des principaux sujets")
    expect(firstPrompt).toContain('FRANÇAIS DE FRANCE UNIQUEMENT')
    expect(firstPayload.evolutionSujets[0]).toMatchObject({
      sujet: 'Ankara', mentionsActuelles: 4, mentionsPrecedentes: 1, variationAbsolue: 3,
    })
    expect(firstPayload).not.toHaveProperty('volumePrecedent')
  })
})
