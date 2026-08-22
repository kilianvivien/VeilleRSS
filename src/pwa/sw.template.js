/**
 * Gabarit du service worker.
 *
 * Ce fichier n'est jamais servi tel quel et n'est jamais importé par
 * l'application : le plugin `veille-service-worker` de `vite.config.ts` le lit
 * au build, y injecte l'identifiant de version et les listes de précache
 * dérivées du graphe Rollup, puis émet le résultat en `dist/sw.js`.
 *
 * Il vit hors de `public/` à dessein : la copie du dossier public écraserait
 * le fichier émis.
 *
 * Stratégies :
 *  - Navigations (HTML)     : préchargement puis réseau avec délai maximal,
 *                             repli sur la coquille en cache.
 *  - /assets/* (hachés)     : cache d'abord — les URL sont immuables.
 *  - Icônes et manifeste    : cache d'abord, précache best-effort.
 *  - /api/*                 : jamais intercepté (proxy RSS).
 *
 * Mise à jour : pas de `skipWaiting` automatique. Le nouveau worker s'installe
 * et attend ; c'est la bannière « Nouvelle version disponible » qui envoie
 * SKIP_WAITING, puis recharge la page.
 */

/* eslint-env serviceworker */

// --- Valeurs injectées au build (cf. vite.config.ts) ------------------------
const BUILD_ID = '__BUILD_ID__'
/** Graphe statique de l'entrée : indispensable à un démarrage hors connexion. */
const PRECACHE_CRITICAL_ASSETS = /*__PRECACHE_CRITICAL_ASSETS__*/ []
/** Ressources publiques non hachées : précache best-effort. */
const PRECACHE_OPTIONAL = /*__PRECACHE_OPTIONAL__*/ []
/** Tous les assets hachés du build, utilisé pour élaguer le cache persistant. */
const ASSET_MANIFEST = /*__ASSET_MANIFEST__*/ []
// ---------------------------------------------------------------------------

/** Versionné : le HTML pointe des URL d'assets propres au build. */
const SHELL_CACHE = `veille-shell-${BUILD_ID}`
/**
 * NON versionnés : les URL sous /assets/ sont des hachages de contenu, donc
 * immuables. Les suffixer par version jetterait à chaque déploiement des
 * fichiers pourtant identiques — et casserait le hors-ligne jusqu'au prochain
 * téléchargement. On les élague plutôt contre le manifeste du build courant.
 */
const ASSET_CACHE = 'veille-assets'
const STATIC_CACHE = 'veille-static'

const KEEP_CACHES = new Set([SHELL_CACHE, ASSET_CACHE, STATIC_CACHE])

/** Au-delà, on sert la coquille en cache plutôt que d'attendre le réseau. */
const NAVIGATION_TIMEOUT_MS = 3000

async function fetchOrThrow(request) {
  const response = await fetch(request)
  if (!response.ok) {
    throw new Error(`Précache impossible : ${request.url} → ${response.status}`)
  }
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const [shell, assets, statics] = await Promise.all([
        caches.open(SHELL_CACHE),
        caches.open(ASSET_CACHE),
        caches.open(STATIC_CACHE),
      ])

      // Ensemble critique : un échec doit faire échouer l'installation plutôt
      // que d'activer un worker incapable de démarrer hors connexion.
      // `cache: 'reload'` évite de précacher le HTML du build précédent.
      await Promise.all([
        shell.put('/', await fetchOrThrow(new Request('/', { cache: 'reload' }))),
        assets.addAll(PRECACHE_CRITICAL_ASSETS),
      ])

      // Ensemble optionnel : une icône manquante ne doit jamais bloquer.
      await Promise.allSettled(PRECACHE_OPTIONAL.map((url) => statics.add(url)))
    })()
  )
})

/** Retire d'un cache tout ce qui ne figure pas dans le manifeste courant. */
async function pruneCache(cacheName, allowedPaths) {
  const cache = await caches.open(cacheName)
  const allowed = new Set(allowedPaths)
  const requests = await cache.keys()
  await Promise.all(
    requests
      .filter((request) => !allowed.has(new URL(request.url).pathname))
      .map((request) => cache.delete(request))
  )
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }

      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => !KEEP_CACHES.has(key)).map((key) => caches.delete(key))
      )

      // Sûr ici : l'activation n'a lieu qu'en l'absence de client, ou juste
      // après SKIP_WAITING — suivi immédiatement d'un rechargement complet.
      await pruneCache(ASSET_CACHE, ASSET_MANIFEST)
      await pruneCache(STATIC_CACHE, PRECACHE_OPTIONAL)

      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  // Compatibilité : c'est la page de l'ANCIEN build qui envoie ce message au
  // nouveau worker en attente, et elle envoie la chaîne brute. Ne jamais
  // supprimer cette branche — cela empêcherait définitivement les clients
  // déjà déployés d'appliquer la moindre mise à jour.
  const type = typeof event.data === 'string' ? event.data : event.data?.type
  if (type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

/** Dernier recours : ni réseau, ni coquille en cache. */
function offlineResponse() {
  return new Response(
    '<!doctype html><html lang="fr"><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Hors connexion</title>' +
      '<body style="font:16px system-ui;padding:2rem;color-scheme:light dark">' +
      '<h1>Hors connexion</h1><p>Reconnectez-vous puis rechargez la page.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

async function networkFirstNavigation(event) {
  const cache = await caches.open(SHELL_CACHE)

  try {
    const preloaded = await event.preloadResponse
    const response = preloaded || (await fetchWithTimeout(event.request, NAVIGATION_TIMEOUT_MS))

    // Ne jamais empoisonner la coquille avec une page d'erreur, une
    // redirection ou une réponse opaque.
    if (response && response.ok && response.type === 'basic' && !response.redirected) {
      event.waitUntil(cache.put('/', response.clone()))
    }
    if (response) return response
  } catch {
    /* Hors connexion ou réseau trop lent : on sert la coquille. */
  }

  return (await cache.match('/')) || offlineResponse()
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(event.request)
  if (cached) return cached

  const response = await fetch(event.request)
  if (response.ok && response.type === 'basic') {
    event.waitUntil(cache.put(event.request, response.clone()))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Les flux RSS passent par le proxy : jamais de cache, jamais d'interception.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event, ASSET_CACHE))
    return
  }

  if (PRECACHE_OPTIONAL.includes(url.pathname)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE))
  }
})

/**
 * Notifications locales de mots-clés suivis (cf. lib/pwa/keywordNotifications).
 * Aucun gestionnaire `push` / `periodicsync` : l'application ne dépend
 * volontairement d'aucun serveur de notification.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const term = event.notification.data?.term

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of clientList) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        // La page se charge de filtrer la liste sur le terme cliqué.
        client.postMessage({ type: 'NOTIFICATION_CLICK', term })
        return
      }

      await self.clients.openWindow('/')
    })()
  )
})
