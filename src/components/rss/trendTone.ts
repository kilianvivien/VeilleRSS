import type { TrendTerm } from '@/lib/rss/trendAnalysis'

/**
 * Tonalité visuelle d’un sujet dans le thème « Constellation ». La même grille
 * colore les pastilles de la liste, les étiquettes d’article et, à terme, la
 * carte des sujets : un sujet garde sa couleur d’un écran à l’autre.
 */
export type TrendTone = 'hot' | 'new' | 'calm' | 'down'

/** Au-delà de +60 % sur la fenêtre précédente, un sujet passe en « forte hausse ». */
const HOT_RATIO = 0.6

export function trendTone(term: Pick<TrendTerm, 'isNew' | 'changeRatio' | 'delta'>): TrendTone {
  if (term.isNew) return 'new'
  if (term.changeRatio !== null && term.changeRatio >= HOT_RATIO) return 'hot'
  if (term.delta < 0) return 'down'
  return 'calm'
}

export const TREND_TONE_COLOR: Record<TrendTone, string> = {
  hot: 'var(--trend-hot)',
  new: 'var(--trend-new)',
  calm: 'var(--trend-calm)',
  down: 'var(--trend-down)',
}

export function formatTrendDelta(term: Pick<TrendTerm, 'isNew' | 'changeRatio' | 'delta'>): string {
  if (term.isNew) return 'Nouveau'
  if (term.changeRatio !== null) {
    const percentage = Math.round(Math.abs(term.changeRatio) * 100)
    return `${term.changeRatio >= 0 ? '+' : '−'}${percentage} %`
  }
  return `${term.delta >= 0 ? '+' : '−'}${Math.abs(term.delta)}`
}
