import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerServiceWorker } from './lib/pwa/pwaService'

// PWA : enregistre le service worker (production uniquement) pour le mode
// hors connexion, l'icône d'écran d'accueil et les mises à jour.
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
