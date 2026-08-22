import { useEffect, useRef } from 'react'

/**
 * Rend un panneau superposé refermable par le retour système.
 *
 * Sans cela, le bouton retour d'Android (et le geste de bord) QUITTE
 * l'application alors qu'un lecteur ou un tiroir est ouvert — le réflexe le
 * plus courant sur mobile aboutit au pire résultat possible.
 *
 * Principe : empiler une entrée d'historique tant que le panneau est ouvert,
 * et la dépiler quand il se ferme autrement (bouton, clic sur le voile), pour
 * que l'historique ne gonfle pas à chaque ouverture.
 */
export function useHistoryBackGesture(active: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Distingue « fermé par popstate » de « fermé par l'interface » : dans le
  // premier cas l'entrée a déjà disparu, un `history.back()` en boucle.
  const closingFromPopRef = useRef(false)

  useEffect(() => {
    if (!active) return

    window.history.pushState({ veilleOverlay: true }, '')

    const onPopState = () => {
      closingFromPopRef.current = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      if (closingFromPopRef.current) {
        closingFromPopRef.current = false
        return
      }
      // Fermeture par l'interface : on retire notre entrée.
      if (window.history.state?.veilleOverlay) {
        window.history.back()
      }
    }
  }, [active])
}
