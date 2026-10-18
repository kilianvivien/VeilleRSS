import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/newsreader'
import './index.css'
import App from './App'
import { AppErrorBoundary } from './components/error/AppErrorBoundary'
import { initInstallCapture, registerServiceWorker } from './lib/pwa/pwaService'

// PWA : enregistre le service worker (production uniquement) pour le mode
// hors connexion, l'icône d'écran d'accueil et les mises à jour.
registerServiceWorker()

// Doit précéder le rendu React : Chrome émet `beforeinstallprompt` avant que
// le premier `useEffect` n'ait pu s'abonner.
initInstallCapture()

/**
 * Un déploiement pendant qu'un onglet est resté ouvert fait disparaître les
 * chunks hachés de la version précédente : le prochain import dynamique
 * renvoie alors un 404 et l'écran reste bloqué sur le fallback Suspense.
 * On recharge plutôt que d'afficher une vue morte.
 */
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
