import { useEffect } from 'react'
import { RssFeeds } from '@/views/RssFeeds'
import { useSettingsStore } from '@/stores/settingsStore'
import { useRssRefreshScheduler } from '@/lib/hooks/useRssRefreshScheduler'

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

  return (
    <div className="h-full min-h-0 bg-[var(--bg-primary)]">
      <RssFeeds />
    </div>
  )
}
