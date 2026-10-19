import type { CSSProperties } from 'react'
import type { TrendTerm } from '@/lib/rss/trendAnalysis'
import type { ConstellationStyle } from '@/types/settings'

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

/**
 * Habillage d'un nœud selon le style choisi : disque, numéro posé dessus et
 * intensité de la lueur. Partagé avec l'aperçu des réglages.
 */
export function constellationNodeLook(
  style: ConstellationStyle,
  color: string,
  selected: boolean
): { disc: CSSProperties; textColor: string } {
  const ring = `0 0 0 ${selected ? 3 : 0}px var(--text-primary)`
  if (style === 'rings') {
    return {
      disc: {
        background: `color-mix(in srgb, ${color} ${selected ? 26 : 14}%, var(--surface))`,
        border: `2px solid ${color}`,
        boxShadow: `${ring}, 0 0 18px color-mix(in srgb, ${color} ${selected ? 40 : 0}%, transparent)`,
      },
      textColor: 'var(--text-primary)',
    }
  }
  if (style === 'flat') {
    return {
      disc: { background: color, boxShadow: ring },
      textColor: 'var(--trend-node-ink)',
    }
  }
  return {
    disc: {
      background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 72%, white), ${color} 72%)`,
      boxShadow: `${ring}, 0 0 32px color-mix(in srgb, ${color} ${selected ? 55 : 22}%, transparent)`,
    },
    textColor: '#0b0d12',
  }
}
