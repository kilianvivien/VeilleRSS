/**
 * Service worker de l'application (PWA).
 *
 * Stratégies :
 *  - Navigations (HTML)      : réseau d'abord, repli sur le shell en cache
 *                              pour rester utilisable hors connexion.
 *  - /assets/* (hash Vite)   : cache d'abord — les fichiers sont immuables.
 *  - Autres GET same-origin  : réseau puis mise en cache opportuniste.
 *
 * Mise à jour : à chaque déploiement, incrémenter CACHE_VERSION. Le nouveau
 * service worker s'installe en arrière-plan et ATTEND (pas de skipWaiting
 * automatique) : c'est la bannière « Nouvelle version disponible » de
 * l'application qui envoie le message SKIP_WAITING, puis recharge la page.
 */

const CACHE_VERSION = 'v3'
const SHELL_CACHE = `veille-shell-${CACHE_VERSION}`
const RUNTIME_CACHE = `veille-runtime-${CACHE_VERSION}`

// Le shell minimal : la page racine et les ressources statiques stables.
// Les bundles /assets/* sont mis en cache au premier chargement.
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-64.png',
  '/apple-touch-icon.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Pas de skipWaiting ici : le nouveau worker reste en attente jusqu'au
    // message SKIP_WAITING envoyé par la bannière « Nouvelle version ».
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(SHELL_CACHE)
    cache.put('/', response.clone())
    return response
  } catch (error) {
    const cached =
      (await caches.match(request)) || (await caches.match('/')) || (await caches.match('index.html'))
    if (cached) return cached
    throw error
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  // Bundles hashés par Vite : immuables, cache d'abord.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request))
    return
  }

  // Icônes et manifeste : pré-cachés, sinon réseau.
  if (url.pathname === '/' || PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirstAsset(request))
  }
})
