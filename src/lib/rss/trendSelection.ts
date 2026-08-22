/**
 * Relecture d'une sélection de tendances IA — module feuille.
 *
 * Séparé de `trendRefinementService` : cette fonction pure est appelée à
 * chaque rendu de la liste, alors que l'affinage IA lui-même n'est chargé
 * qu'à la demande. Les garder ensemble ramenait tout le service (et son
 * routeur de fournisseurs) dans le chunk d'entrée.
 */

import type { RssTrendAiSelection } from '@/types/rss'
import type { TrendReport } from './trendAnalysis'

/**
 * Rejoue une sélection IA sur un rapport fraîchement calculé.
 *
 * Le rapport est recalculé à chaque nouvel article et à chaque changement de
 * fenêtre ; sans cette fonction, le tri de l’IA disparaîtrait au premier clic
 * dans l’interface. Les termes que l’IA n’a jamais vus sont conservés, à la
 * suite des termes retenus : une tendance qui apparaît après l’affinage ne
 * doit pas rester invisible.
 */
export function applyStoredTrendSelection(
  report: TrendReport,
  selection: RssTrendAiSelection
): TrendReport {
  const rank = new Map(selection.keptKeys.map((key, index) => [key, index]))
  const rejected = new Set(selection.rejectedKeys)

  const kept = report.terms
    .filter((term) => rank.has(term.key))
    .sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0))
    .map((term) => ({ ...term, label: selection.labels[term.key] ?? term.label }))

  const unreviewed = report.terms.filter((term) => !rank.has(term.key) && !rejected.has(term.key))

  return { ...report, terms: [...kept, ...unreviewed] }
}
