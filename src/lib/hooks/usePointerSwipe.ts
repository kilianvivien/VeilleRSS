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
 * - **`touch-action: pan-y` sur l'élément écouté**, qui laisse le défilement
 *   vertical au compositeur et nous réserve l'horizontale — c'est ce qui rend
 *   le geste fluide plutôt que saccadé.
 * - **`preventDefault()` sur `touchmove`, une fois le geste verrouillé à
 *   l'horizontale.** Le CSS seul suffit à WebKit, pas à Chrome Android :
 *   celui-ci peut encore convertir un balayage horizontal en navigation
 *   « retour » ou en défilement, et il annule alors la séquence de pointeurs
 *   (`pointercancel`) — le geste mourait sans un seul rappel déclenché. Le
 *   `preventDefault` réclame explicitement le geste ; il n'arrive qu'après le
 *   verrouillage, donc le défilement vertical reste intact. Il lui faut un
 *   écouteur NON passif, d'où l'attachement natif plutôt que React.
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
        // Le tactile est déjà capturé implicitement : cette capture explicite
        // n'est qu'un confort, et elle lève si le navigateur vient de retirer
        // le pointeur. Le geste ne doit pas mourir pour ça.
        try {
          element.setPointerCapture(event.pointerId)
        } catch {
          // Pointeur déjà relâché ou annulé : rien à capturer.
        }
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

    /**
     * Réclame le geste au navigateur. Chrome Android n'accorde le balayage
     * horizontal qu'à qui l'exige : sans ce `preventDefault`, il garde la
     * main pour sa navigation par balayage et annule nos évènements en cours
     * de route. Il faut donc un écouteur non passif — mais on ne bloque rien
     * tant que la direction n'est pas décidée, sous peine de casser le
     * défilement vertical.
     */
    const onTouchMove = (event: TouchEvent) => {
      if (lock !== 'horizontal' || !event.cancelable) return
      event.preventDefault()
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerCancel)
    element.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
      element.removeEventListener('touchmove', onTouchMove)
    }
  }, [ref, enabled])
}
