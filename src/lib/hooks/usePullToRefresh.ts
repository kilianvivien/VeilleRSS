import { useEffect, useRef, useState } from 'react'

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void
  enabled?: boolean
  /** Distance de traction déclenchant le rafraîchissement, en px. */
  threshold?: number
  /** Traction maximale affichée, en px. */
  maxPull?: number
}

export interface PullToRefreshState {
  /** Distance de traction courante, déjà amortie. */
  pull: number
  /** Le seuil est atteint : relâcher déclenchera le rafraîchissement. */
  armed: boolean
  refreshing: boolean
}

/**
 * Tirer pour rafraîchir, sur un conteneur défilant interne.
 *
 * Le pull-to-refresh natif est neutralisé globalement (`overscroll-behavior-y`
 * sur `html`/`body`), et le rafraîchissement n'était atteignable que par une
 * icône d'en-tête — geste standard absent sur mobile.
 *
 * Nécessite un écouteur `touchmove` NON passif : supprimer le rebond
 * élastique iOS impose `preventDefault()`, impossible via les gestionnaires
 * synthétiques de React, qui sont passifs. D'où l'attachement natif.
 *
 * Prend l'élément, PAS une `RefObject` : le volet Articles se démonte à
 * chaque changement d'onglet mobile, et une ref ne notifie personne de son
 * remontage. L'effet ne se rejouait donc jamais, et le geste restait mort
 * sur tout parcours où la liste n'existait pas encore au premier rendu —
 * c'est-à-dire le parcours par défaut, qui ouvre sur les Tendances.
 */
export function usePullToRefresh<T extends HTMLElement>(
  element: T | null,
  options: UsePullToRefreshOptions
): PullToRefreshState {
  const { enabled = true, threshold = 64, maxPull = 96 } = options

  const onRefreshRef = useRef(options.onRefresh)
  onRefreshRef.current = options.onRefresh

  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!element || !enabled) return

    let tracking = false
    let startY = 0
    let currentPull = 0
    let busy = false

    const onTouchStart = (event: TouchEvent) => {
      if (busy || event.touches.length !== 1) {
        tracking = false
        return
      }
      // Verrou évalué AU CONTACT seulement, jamais en continu : sinon remonter
      // vite jusqu'en haut déclencherait un rafraîchissement involontaire.
      tracking = element.scrollTop <= 0
      startY = event.touches[0].clientY
      currentPull = 0
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || busy) return

      const dy = event.touches[0].clientY - startY
      if (dy <= 0) {
        // L'utilisateur repart vers le haut : on rend la main au défilement.
        tracking = false
        currentPull = 0
        setPull(0)
        return
      }

      event.preventDefault()
      currentPull = Math.min(maxPull, dy * 0.5) // résistance
      setPull(currentPull)
    }

    const onTouchEnd = async () => {
      if (!tracking) return
      tracking = false

      if (currentPull >= threshold) {
        busy = true
        setRefreshing(true)
        setPull(0)
        try {
          await onRefreshRef.current()
        } finally {
          busy = false
          setRefreshing(false)
        }
      } else {
        setPull(0)
      }
      currentPull = 0
    }

    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd)
    element.addEventListener('touchcancel', onTouchEnd)

    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [element, enabled, threshold, maxPull])

  return { pull, armed: pull >= threshold, refreshing }
}
