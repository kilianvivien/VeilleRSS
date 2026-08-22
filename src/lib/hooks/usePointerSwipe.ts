import { useEffect, useRef, type RefObject } from 'react'

export interface SwipeState {
  /** Déplacement horizontal courant, en px (négatif = vers la gauche). */
  dx: number
  /** Vrai entre le verrouillage horizontal et le relâchement. */
  active: boolean
}

export interface UsePointerSwipeOptions {
  enabled?: boolean
  /** Distance parcourue avant de décider de la direction. */
  lockThreshold?: number
  /** Rapport |dx|/|dy| requis pour verrouiller à l'horizontale. */
  directionRatio?: number
  /** Distance de validation, en px. */
  commitDistance?: number
  /** Vélocité de validation, en px/ms — permet un geste court mais franc. */
  commitVelocity?: number
  /** Ignore les gestes démarrant à moins de N px du bord gauche de l'écran. */
  edgeGuardPx?: number
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  /** Suivi en direct, pour animer. Ne pas fournir sous `prefers-reduced-motion`. */
  onMove?: (state: SwipeState) => void
}

/**
 * Geste de balayage horizontal, sans dépendance.
 *
 * Points sensibles, tous volontaires :
 *
 * - **Pas de `preventDefault`.** Sur `pointermove` il n'arrêterait pas le
 *   défilement de toute façon : l'arbitrage se fait en CSS. L'élément écouté
 *   doit porter `touch-action: pan-y`, qui laisse le défilement vertical au
 *   compositeur et nous réserve l'horizontale — c'est ce qui rend le geste
 *   fluide plutôt que saccadé.
 * - **Écouteurs natifs sur une ref**, pas les gestionnaires synthétiques de
 *   React : ceux-ci sont enregistrés en passif à la racine.
 * - **Capture du pointeur APRÈS le verrouillage seulement.** Capturer dès le
 *   `pointerdown` volerait au navigateur les défilements verticaux.
 * - **Souris exclue** : sur bureau, un cliquer-glisser sert à sélectionner.
 */
export function usePointerSwipe<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UsePointerSwipeOptions
): void {
  // Les callbacks changent à chaque rendu : on les lit via une ref pour ne pas
  // réattacher les écouteurs en permanence.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const { enabled = true } = options

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let startTime = 0
    let lock: 'none' | 'horizontal' | 'aborted' = 'none'

    const reset = () => {
      pointerId = null
      lock = 'none'
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === 'mouse') return
      const { edgeGuardPx = 20 } = optionsRef.current
      // Le bord gauche appartient au geste « retour » du système.
      if (event.clientX < edgeGuardPx) return

      pointerId = event.pointerId
      lock = 'none'
      startX = event.clientX
      startY = event.clientY
      startTime = event.timeStamp
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || lock === 'aborted') return
      const { lockThreshold = 8, directionRatio = 1.5, onMove } = optionsRef.current

      const dx = event.clientX - startX
      const dy = event.clientY - startY

      if (lock === 'none') {
        if (Math.abs(dx) < lockThreshold && Math.abs(dy) < lockThreshold) return
        if (Math.abs(dx) < Math.abs(dy) * directionRatio) {
          lock = 'aborted'
          return
        }
        lock = 'horizontal'
        element.setPointerCapture(event.pointerId)
      }

      onMove?.({ dx, active: true })
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const {
        commitDistance = 72,
        commitVelocity = 0.4,
        onMove,
        onSwipeLeft,
        onSwipeRight,
      } = optionsRef.current

      const dx = event.clientX - startX
      const elapsed = Math.max(1, event.timeStamp - startTime)
      const committed =
        lock === 'horizontal' &&
        (Math.abs(dx) > commitDistance || Math.abs(dx) / elapsed > commitVelocity)

      onMove?.({ dx: 0, active: false })
      if (committed) {
        if (dx > 0) onSwipeRight?.()
        else onSwipeLeft?.()
      }
      reset()
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      optionsRef.current.onMove?.({ dx: 0, active: false })
      reset()
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerCancel)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [ref, enabled])
}
