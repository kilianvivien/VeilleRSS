import { useEffect, useState } from 'react'

/**
 * S'abonne à une media query CSS (SSR-safe : rend `false` côté serveur).
 * Utilisée pour basculer entre la composition bureau et la composition
 * mobile sans dupliquer les composants dans le DOM.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)

    setMatches(mediaQueryList.matches)
    mediaQueryList.addEventListener('change', onChange)
    return () => mediaQueryList.removeEventListener('change', onChange)
  }, [query])

  return matches
}
