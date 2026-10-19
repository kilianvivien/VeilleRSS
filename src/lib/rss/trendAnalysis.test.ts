import { describe, expect, it } from 'vitest'
import type { RssItem } from '@/types/rss'
import { computeTrends } from './trendAnalysis'
import { applyStoredTrendSelection } from './trendSelection'

const now = Date.UTC(2026, 7, 30, 12)
const hour = 3_600_000
function article(id: string, age: number, overrides: Partial<RssItem> = {}): RssItem {
  return {
    id, feedId: 'a', guid: id, title: 'Ankara',
    link: `https://example.com/${id}`, publishedAt: now - age * hour,
    fetchedAt: now, summary: '', contentSnippet: '', categories: [],
    readAt: null, savedAt: null, importedAt: null, importedReviewIds: [],
    ...overrides,
  }
}
const focus = { key: 'ankara', label: 'Ankara' }

describe('selected trend statistics', () => {
  it('uses the same term counts as the ranking, with equal-period buckets and exact boundaries', () => {
    const report = computeTrends({ now, windowHours: 24, focus, items: [
      article('start', 24), article('latest', 0, { feedId: 'b', readAt: now }),
      article('previous-start', 48), article('previous-end', 24.001, { feedId: 'c' }),
      article('too-old', 48.001), article('future', -0.001),
      article('unrelated', 1, { title: 'London election' }),
      article('summary-only', 2, { title: 'Economic outlook', summary: 'Ankara summit' }),
    ] })
    expect(report.itemCount).toBe(4)
    expect(report.focus).toMatchObject({ count: 2, previousCount: 2, sourceCount: 2, previousSourceCount: 2, unreadCount: 1, latestPublishedAt: now })
    expect(report.focus?.buckets).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(report.focus?.previousBuckets).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    const ranked = report.terms.find((term) => term.key === focus.key)
    expect(ranked?.count).toBe(report.focus?.count)
    expect(ranked?.previousCount).toBe(report.focus?.previousCount)
    expect(ranked?.buckets).toEqual(report.focus?.buckets)
  })

  it('keeps the focus even outside the ranking and recomputes it when window or source changes', () => {
    const items = [article('a', 8), article('b', 9, { feedId: 'b' })]
    const report = computeTrends({ items, now, windowHours: 24, feedIds: ['a'], focus, termLimit: 0 })
    expect(report.terms).toEqual([])
    expect(report.focus?.count).toBe(1)
    expect(report.focus?.sourceCount).toBe(1)
    const shorter = computeTrends({ items, now, windowHours: 6, feedIds: ['a'], focus })
    expect(shorter.focus).toMatchObject({ count: 0, previousCount: 1, sourceCount: 0, latestPublishedAt: null })
    expect(shorter.focus?.buckets.every((count) => count === 0)).toBe(true)
  })

  it('keeps per-source boilerplate exclusions identical to the trend ranking', () => {
    const items = Array.from({ length: 10 }, (_, index) => article(`boilerplate-${index}`, 1))
    items.push(article('independent', 2, { feedId: 'b' }))
    const report = computeTrends({ items, now, windowHours: 24, focus })
    expect(report.itemCount).toBe(11)
    expect(report.focus?.count).toBe(1)
    expect(report.focus?.sourceCount).toBe(1)
  })

  it('matches watched keywords in summaries in both periods without treating them as extracted trends', () => {
    const selection = { key: 'ankara', label: 'Ankara', kind: 'keyword' as const }
    const report = computeTrends({ now, windowHours: 24, focus: selection, watchedKeywords: ['Ankara'], items: [
      article('current', 2, { title: 'Talks resume', summary: 'News from Ankara' }),
      article('previous', 26, { title: 'Talks planned', contentSnippet: 'Ankara negotiations' }),
    ] })
    expect(report.focus).toMatchObject({ count: 1, previousCount: 1 })
    expect(report.watched[0].count).toBe(report.focus?.count)
    expect(report.watched[0].buckets).toEqual(report.focus?.buckets)
    expect(report.focus?.previousBuckets[11]).toBe(1)
  })

  it('preserves local measurements when the AI rewrites the selected label', () => {
    const report = computeTrends({ now, windowHours: 24, focus, items: [article('a', 1), article('b', 2, { feedId: 'b' })] })
    const refined = applyStoredTrendSelection(report, {
      keptKeys: ['ankara'], rejectedKeys: [], labels: { ankara: 'Diplomatie à Ankara' },
      providerLabel: 'Test', refinedAt: now, windowHours: 24,
    })
    expect(refined.focus).toEqual({ ...report.focus, label: 'Diplomatie à Ankara' })
  })
})

describe('trend grouping', () => {
  it('folds a first-name + surname phrase into the surname and keeps the full name as label', () => {
    const items = [
      article('m1', 1, { title: 'Emmanuel Macron reçoit le chancelier' }),
      article('m2', 2, { feedId: 'b', title: 'Emmanuel Macron en visite à Berlin' }),
      article('m3', 3, { feedId: 'c', title: 'Macron annonce un remaniement' }),
    ]
    const report = computeTrends({ now, windowHours: 24, items })
    const keys = report.terms.map((term) => term.key)
    expect(keys).toContain('macron')
    expect(keys).not.toContain('emmanuel macron')
    expect(report.terms.find((term) => term.key === 'macron')).toMatchObject({ label: 'Emmanuel Macron', count: 3 })
  })

  it('keeps a single phrase when two overlapping phrases cover mostly the same articles', () => {
    const items = [
      article('g1', 1, { title: 'Grève générale nationale : cortèges à Paris' }),
      article('g2', 2, { feedId: 'b', title: 'Grève générale nationale, les syndicats satisfaits' }),
      article('g3', 3, { feedId: 'c', title: 'Grève générale nationale suivie à Lyon' }),
      article('g4', 4, { feedId: 'd', title: 'Grève générale reconduite jeudi' }),
    ]
    const report = computeTrends({ now, windowHours: 24, items })
    const phrases = report.terms.filter((term) => term.key.startsWith('greve generale'))
    expect(phrases.map((term) => term.key)).toEqual(['greve generale'])
  })
})
