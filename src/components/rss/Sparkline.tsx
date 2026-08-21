import { cn } from '@/lib/utils/cn'

interface SparklineProps {
  /** Valeurs du plus ancien au plus récent. */
  values: number[]
  width?: number
  height?: number
  className?: string
  /** Description lue par les lecteurs d’écran ; sans elle le graphique est décoratif. */
  label?: string
}

/**
 * Courbe de volume miniature, en SVG inline (aucune dépendance de graphiques).
 * L’aire sous la courbe utilise la couleur d’accent du thème, donc elle suit
 * automatiquement le mode clair et le mode sombre.
 */
export function Sparkline({ values, width = 72, height = 20, className, label }: SparklineProps) {
  if (values.length === 0) return null

  const max = Math.max(...values, 1)
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, index) => {
    const x = values.length > 1 ? index * step : width / 2
    // Une marge d’un pixel en haut et en bas évite que le trait soit rogné.
    const y = height - 1 - (value / max) * (height - 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const linePath = `M${points.join(' L')}`
  const areaPath = `${linePath} L${width.toFixed(2)},${height} L0,${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={areaPath} fill="var(--accent)" opacity={0.14} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
