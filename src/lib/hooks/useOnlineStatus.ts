import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * État de connectivité du navigateur.
 *
 * `useSyncExternalStore` plutôt que `useState` + `useEffect` : pas de fenêtre
 * de désynchronisation au premier rendu, et un seul jeu d'écouteurs quel que
 * soit le nombre de consommateurs.
 *
 * À garder en tête : `navigator.onLine` est fiable en NÉGATIF (faux = pas de
 * réseau, à coup sûr) mais seulement indicatif en positif — un portail captif
 * ou un Wi-Fi sans route renvoie `true`. On s'en sert donc pour expliquer un
 * échec et désactiver des actions, jamais pour garantir qu'une requête
 * aboutira.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
}

/** Variante hors React, pour le planificateur et les modules utilitaires. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}
