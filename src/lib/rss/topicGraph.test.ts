import { describe, expect, it } from 'vitest'
import { buildTopicGraph, neighbourKeys } from './topicGraph'
import type { TrendTerm } from './trendAnalysis'

function term(key: string, itemIds: string[]): TrendTerm {
  return {
    key,
    label: key,
    count: itemIds.length,
    previousCount: 0,
    delta: itemIds.length,
    changeRatio: null,
    isNew: true,
    sourceCount: 1,
    feedIds: ['f'],
    itemIds,
    unreadCount: itemIds.length,
    buckets: [itemIds.length],
    isPhrase: false,
  }
}

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i}`)

describe('buildTopicGraph', () => {
  const terms = [
    term('budget', [...ids('b', 8), 's0', 's1', 's2']),
    term('senat', ['s0', 's1', 's2', ...ids('x', 3)]),
    term('ukraine', ids('u', 7)),
    term('energie', ['u0', 'u1', 'u2', ...ids('e', 4)]),
    term('jean-luc', ['m0', 'm1', 'm2', 'm3']),
    term('melenchon', ['m0', 'm1', 'm2', 'm3', 'm4']),
  ]

  it('links topics that share articles, but not near-duplicates', () => {
    const graph = buildTopicGraph(terms)
    const pairs = graph.edges.map((edge) => [edge.source, edge.target].sort().join('–'))
    expect(pairs).toContain('budget–senat')
    expect(pairs).toContain('energie–ukraine')
    expect(pairs).not.toContain('jean-luc–melenchon')
    expect(pairs).not.toContain('budget–ukraine')
    expect(neighbourKeys(graph, 'senat')).toEqual(['budget'])
  })

  it('is deterministic and keeps every node inside the area', () => {
    const first = buildTopicGraph(terms)
    const second = buildTopicGraph(terms)
    expect(second.nodes.map((node) => [node.x, node.y])).toEqual(first.nodes.map((node) => [node.x, node.y]))
    for (const node of first.nodes) {
      expect(node.x).toBeGreaterThan(0)
      expect(node.x).toBeLessThan(1)
      expect(node.y - node.r).toBeGreaterThan(0)
      expect(node.y + node.r).toBeLessThan(1)
    }
  })

  it('handles an empty report', () => {
    expect(buildTopicGraph([])).toEqual({ nodes: [], edges: [], aspect: 1.7 })
  })
})
