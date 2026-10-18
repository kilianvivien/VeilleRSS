import type { TrendTerm } from './trendAnalysis'

/**
 * Graphe des sujets de la vue « Constellation ».
 *
 * Chaque nœud est un sujet du classement de tendances ; deux sujets sont
 * reliés quand ils partagent des articles. La disposition est calculée par un
 * petit algorithme de forces DÉTERMINISTE : à rapport identique, la carte est
 * identique, et un rafraîchissement ne fait pas sauter les nœuds au hasard.
 *
 * Les coordonnées sont normalisées entre 0 et 1 sur chaque axe ; le composant
 * les place dans une zone de rapport largeur / hauteur `GRAPH_ASPECT`.
 */

export const GRAPH_ASPECT = 1.7

export interface TopicGraphNode {
  term: TrendTerm
  /** Position du centre, de 0 à 1 dans la largeur et dans la hauteur. */
  x: number
  y: number
  /** Rayon exprimé en fraction de la HAUTEUR de la zone. */
  r: number
}

export interface TopicGraphEdge {
  source: string
  target: string
  /** Articles communs rapportés au plus petit des deux sujets, de 0 à 1. */
  weight: number
  shared: number
}

export interface TopicGraph {
  nodes: TopicGraphNode[]
  edges: TopicGraphEdge[]
}

interface BuildOptions {
  limit?: number
  /** Liens retenus au plus par sujet, pour garder une carte lisible. */
  maxEdgesPerNode?: number
  iterations?: number
}

const MIN_SHARED_ITEMS = 2
const MIN_EDGE_WEIGHT = 0.15

export function buildTopicGraph(terms: TrendTerm[], options: BuildOptions = {}): TopicGraph {
  const { limit = 12, maxEdgesPerNode = 3, iterations = 260 } = options
  const selected = terms.slice(0, limit)
  if (selected.length === 0) return { nodes: [], edges: [] }

  const edges = computeEdges(selected, maxEdgesPerNode)
  const maxCount = Math.max(...selected.map((term) => term.count), 1)
  const radii = selected.map((term) => 0.05 + 0.065 * Math.sqrt(term.count / maxCount))

  // Départ en spirale dorée, du sujet le plus fort (au centre) vers la
  // périphérie : la simulation converge vite et sans tirage aléatoire.
  const width = GRAPH_ASPECT
  const positions = selected.map((_, index) => {
    const angle = index * 2.399963
    const distance = 0.08 + 0.36 * Math.sqrt(index / selected.length)
    return { x: width / 2 + Math.cos(angle) * distance * width * 0.62, y: 0.5 + Math.sin(angle) * distance }
  })

  const indexByKey = new Map(selected.map((term, index) => [term.key, index]))
  const links = edges.map((edge) => ({
    a: indexByKey.get(edge.source)!,
    b: indexByKey.get(edge.target)!,
    weight: edge.weight,
  }))

  for (let step = 0; step < iterations; step += 1) {
    const cooling = 1 - step / iterations
    const forces = positions.map(() => ({ x: 0, y: 0 }))

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const dx = positions[j].x - positions[i].x
        const dy = positions[j].y - positions[i].y
        const distance = Math.max(Math.hypot(dx, dy), 0.001)
        const minimum = radii[i] + radii[j] + 0.07
        // Répulsion générale, renforcée en cas de chevauchement (étiquettes comprises).
        const push = 0.0016 / (distance * distance) + (distance < minimum ? (minimum - distance) * 0.6 : 0)
        const fx = (dx / distance) * push
        const fy = (dy / distance) * push
        forces[i].x -= fx
        forces[i].y -= fy
        forces[j].x += fx
        forces[j].y += fy
      }
    }

    for (const link of links) {
      const dx = positions[link.b].x - positions[link.a].x
      const dy = positions[link.b].y - positions[link.a].y
      const distance = Math.max(Math.hypot(dx, dy), 0.001)
      const rest = radii[link.a] + radii[link.b] + 0.16
      const pull = (distance - rest) * 0.05 * (0.4 + link.weight)
      const fx = (dx / distance) * pull
      const fy = (dy / distance) * pull
      forces[link.a].x += fx
      forces[link.a].y += fy
      forces[link.b].x -= fx
      forces[link.b].y -= fy
    }

    positions.forEach((position, index) => {
      // Gravité douce vers le centre, plus faible à l'horizontale : la zone est large.
      forces[index].x += (width / 2 - position.x) * 0.006
      forces[index].y += (0.5 - position.y) * 0.012
      const maxStep = 0.03 * cooling + 0.002
      position.x += clamp(forces[index].x, -maxStep, maxStep)
      position.y += clamp(forces[index].y, -maxStep, maxStep)
      const r = radii[index]
      // Marge basse plus large : l'étiquette s'affiche sous le nœud.
      position.x = clamp(position.x, r + 0.04, width - r - 0.04)
      position.y = clamp(position.y, r + 0.04, 1 - r - 0.1)
    })
  }

  return {
    nodes: selected.map((term, index) => ({
      term,
      x: positions[index].x / width,
      y: positions[index].y,
      r: radii[index],
    })),
    edges,
  }
}

function computeEdges(terms: TrendTerm[], maxEdgesPerNode: number): TopicGraphEdge[] {
  const itemSets = terms.map((term) => new Set(term.itemIds))
  const candidates: TopicGraphEdge[] = []

  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const [small, large] = itemSets[i].size <= itemSets[j].size ? [itemSets[i], itemSets[j]] : [itemSets[j], itemSets[i]]
      let shared = 0
      for (const id of small) if (large.has(id)) shared += 1
      if (shared < MIN_SHARED_ITEMS) continue
      const weight = shared / Math.max(1, small.size)
      // Un sujet entièrement contenu dans l'autre (« Jean-Luc » / « Mélenchon »)
      // est une redite, pas une connexion.
      if (weight < MIN_EDGE_WEIGHT || weight >= 0.95) continue
      candidates.push({ source: terms[i].key, target: terms[j].key, weight, shared })
    }
  }

  candidates.sort((a, b) => b.weight - a.weight || b.shared - a.shared)
  const degree = new Map<string, number>()
  return candidates.filter((edge) => {
    const a = degree.get(edge.source) ?? 0
    const b = degree.get(edge.target) ?? 0
    if (a >= maxEdgesPerNode || b >= maxEdgesPerNode) return false
    degree.set(edge.source, a + 1)
    degree.set(edge.target, b + 1)
    return true
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Sujets reliés à un sujet donné, du lien le plus fort au plus faible. */
export function neighbourKeys(graph: TopicGraph, key: string): string[] {
  return graph.edges
    .filter((edge) => edge.source === key || edge.target === key)
    .sort((a, b) => b.weight - a.weight)
    .map((edge) => (edge.source === key ? edge.target : edge.source))
}
