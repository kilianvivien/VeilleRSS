import { useEffect } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { RssFeeds } from '@/views/RssFeeds'
import { useSettingsStore } from '@/stores/settingsStore'
import { useRssRefreshScheduler } from '@/lib/hooks/useRssRefreshScheduler'
import { PwaPrompts } from '@/components/pwa/PwaPrompts'

export default function App() {
  const theme = useSettingsStore((state) => state.theme)
  useRssRefreshScheduler()

  // Le thème est appliqué via la classe `.dark` (cf. index.css et le script
  // anti-flash de index.html, qui lit la même clé au démarrage).
  useEffect(() => {
    const isDark = theme === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    try {
      window.localStorage.setItem('veille-web-theme', isDark ? 'dark' : 'light')
    } catch {
      /* localStorage indisponible — le thème reste appliqué pour la session. */
    }
  }, [theme])

  /**
   * Préchauffage des vues paresseuses quand le navigateur est au repos.
   *
   * Le service worker ne précache que le graphe statique de l'entrée : sans
   * cela, un utilisateur qui n'a jamais ouvert la cartographie se retrouverait
   * avec un volet cassé une fois hors connexion. Les chunks passent par le
   * cache d'exécution du SW au vol, aucun protocole supplémentaire nécessaire.
   */
  useEffect(() => {
    const warmLazyViews = () => {
      void import('@/components/rss/TrendMapView')
      void import('@/components/rss/TrendBriefingPanel')
      void import('@/components/rss/FeedCatalogModal')
      void import('@/components/settings/SettingsModal')
    }

    if (typeof window.requestIdleCallback === 'function') {
      const idleHandle = window.requestIdleCallback(warmLazyViews, { timeout: 8000 })
      return () => window.cancelIdleCallback(idleHandle)
    }
    const timeoutHandle = window.setTimeout(warmLazyViews, 4000)
    return () => window.clearTimeout(timeoutHandle)
  }, [])

  return (
    <div className="h-full min-h-0 bg-[var(--bg-primary)]">
      <RssFeeds />
      <PwaPrompts />
      <Analytics />
    </div>
  )
}
