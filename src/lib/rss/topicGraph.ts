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
  /** Rapport largeur / hauteur de la zone pour laquelle la carte a été calculée. */
  aspect: number
}

interface BuildOptions {
  limit?: number
  /** Liens retenus au plus par sujet, pour garder une carte lisible. */
  maxEdgesPerNode?: number
  iterations?: number
  /** Rapport largeur / hauteur de la zone ; plus étroit sur mobile. */
  aspect?: number
  /** Largeur moyenne d'un caractère d'étiquette, en fraction de la hauteur. */
  labelCharWidth?: number
  /** Largeur maximale d'une étiquette (au-delà, elle est tronquée à l'écran). */
  maxLabelWidth?: number
}

/** Hauteur d'une étiquette et écart avec son nœud, en fraction de la hauteur. */
const LABEL_HEIGHT = 0.06
const LABEL_GAP = 0.02
/** Marge minimale entre deux blocs nœud + étiquette. */
const BOX_PADDING = 0.012
// The separation pass converges to touching padded boxes. Floating point
// residue at that boundary must not discard otherwise well-spaced subjects.
const OVERLAP_EPSILON = 0.00001

const MIN_SHARED_ITEMS = 2
const MIN_EDGE_WEIGHT = 0.15

export function buildTopicGraph(terms: TrendTerm[], options: BuildOptions = {}): TopicGraph {
  const {
    limit = 12,
    maxEdgesPerNode = 3,
    iterations = 260,
    aspect = GRAPH_ASPECT,
    labelCharWidth = 0.016,
    maxLabelWidth = 0.34,
  } = options
  const selected = terms.slice(0, limit)
  if (selected.length === 0) return { nodes: [], edges: [], aspect }

  const edges = computeEdges(selected, maxEdgesPerNode)
  const maxCount = Math.max(...selected.map((term) => term.count), 1)
  const radii = selected.map((term) => 0.05 + 0.065 * Math.sqrt(term.count / maxCount))

  // Départ en spirale dorée, du sujet le plus fort (au centre) vers la
  // périphérie : la simulation converge vite et sans tirage aléatoire.
  const width = aspect
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

  // Dernière passe : chaque nœud et son étiquette forment un bloc ; deux
  // blocs ne doivent jamais se chevaucher, ni sortir de la zone.
  const boxes = selected.map((term, index) => {
    const labelWidth = Math.min(maxLabelWidth, term.label.length * labelCharWidth + 0.02)
    const r = radii[index]
    return { halfWidth: Math.max(r, labelWidth / 2), above: r, below: r + LABEL_GAP + LABEL_HEIGHT }
  })
  const clampBox = (index: number) => {
    const box = boxes[index]
    const position = positions[index]
    position.x = clamp(position.x, box.halfWidth + 0.01, width - box.halfWidth - 0.01)
    position.y = clamp(position.y, box.above + 0.02, 1 - box.below - 0.01)
  }
  positions.forEach((_, index) => clampBox(index))

  const overlapAmount = (i: number, j: number) => {
    const a = positions[i]
    const b = positions[j]
    const overlapX = boxes[i].halfWidth + boxes[j].halfWidth + BOX_PADDING - Math.abs(a.x - b.x)
    const [upper, lower] = a.y <= b.y ? [i, j] : [j, i]
    const overlapY = boxes[upper].below + boxes[lower].above + BOX_PADDING - (positions[lower].y - positions[upper].y)
    return { overlapX, overlapY, upper, lower }
  }

  // Indices encore affichés, du plus important au moins important.
  let active = selected.map((_, index) => index)
  const separate = () => {
    for (let pass = 0; pass < 400; pass += 1) {
      let moved = false
      for (let p = 0; p < active.length; p += 1) {
        for (let q = p + 1; q < active.length; q += 1) {
          const i = active[p]
          const j = active[q]
          const { overlapX, overlapY, upper, lower } = overlapAmount(i, j)
          if (overlapX <= OVERLAP_EPSILON || overlapY <= OVERLAP_EPSILON) continue
          moved = true
          // On sépare selon l'axe qui demande le plus petit déplacement.
          if (overlapX / width < overlapY) {
            const direction = positions[i].x <= positions[j].x ? 1 : -1
            positions[i].x -= (direction * overlapX) / 2
            positions[j].x += (direction * overlapX) / 2
          } else {
            positions[upper].y -= overlapY / 2
            positions[lower].y += overlapY / 2
          }
          clampBox(i)
          clampBox(j)
        }
      }
      if (!moved) return true
    }
    return active.every((i, p) =>
      active.slice(p + 1).every((j) => {
        const { overlapX, overlapY } = overlapAmount(i, j)
        return overlapX <= OVERLAP_EPSILON || overlapY <= OVERLAP_EPSILON
      })
    )
  }

  // Quand la place manque (petit écran, longues étiquettes), on retire les
  // sujets les moins importants plutôt que de laisser des textes se superposer.
  while (!separate() && active.length > 1) {
    active = active.slice(0, -1)
  }
  const kept = new Set(active)
  const keptKeys = new Set(selected.filter((_, index) => kept.has(index)).map((term) => term.key))

  return {
    nodes: selected.flatMap((term, index) => (kept.has(index) ? [{
      term,
      x: positions[index].x / width,
      y: positions[index].y,
      r: radii[index],
    }] : [])),
    edges: edges.filter((edge) => keptKeys.has(edge.source) && keptKeys.has(edge.target)),
    aspect,
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
