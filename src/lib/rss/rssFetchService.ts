import { validateRssFeedUrl } from './rssUrlValidation'
import { parseRssFeed } from './rssParser'

const REQUEST_TIMEOUT_MS = 15000
const DIRECT_RETRY_MS = 60 * 60_000
const DIRECT_FAILURES_KEY = 'veille-rss-direct-failures-v1'
const MAX_DIRECT_FAILURES = 200
const inFlightFetches = new Map<string, Promise<string>>()

/** Middleware Vite, disponible uniquement pendant `npm run dev`. */
const DEV_PROXY_PATH = '/__rss-proxy'
/** Vercel Function (voir api/rss-proxy.ts), disponible sur le deploiement. */
const PROD_PROXY_PATH = '/api/rss-proxy'

/**
 * Récupération du XML d'un flux — version web autonome.
 *
 * Essaie d'abord le navigateur quand CORS le permet. Une source qui bloque
 * CORS passe par le proxy, et son échec direct est mémorisé localement pour
 * éviter de refaire une tentative inutile à chaque rafraîchissement.
 */
export async function fetchRssFeedXml(url: string): Promise<string> {
  const validation = validateRssFeedUrl(url, { allowHttp: true })
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const pending = inFlightFetches.get(validation.url)
  if (pending) return pending

  const task = fetchValidatedFeedXml(validation.url).finally(() => {
    inFlightFetches.delete(validation.url)
  })
  inFlightFetches.set(validation.url, task)
  return task
}

async function fetchValidatedFeedXml(url: string): Promise<string> {
  const proxyPath = isLocalDevBrowser() ? DEV_PROXY_PATH : PROD_PROXY_PATH

  const body = await fetchWithFallback(proxyPath, url)

  // L'adresse pointait une page et non un flux : cas courant quand on colle
  // l'accueil d'un site, et cas NORMAL pour la cible de partage du manifeste
  // (on partage un article, jamais une URL de flux). On tente l'autodécouverte
  // plutôt que de renvoyer une erreur de parsing incompréhensible.
  if (looksLikeHtml(body)) {
    const discovered = discoverFeedUrlInHtml(body, url)
    if (!discovered) {
      throw new Error(
        "Cette adresse renvoie une page web, pas un flux RSS, et aucun flux n'y est déclaré."
      )
    }
    const discoveredValidation = validateRssFeedUrl(discovered, { allowHttp: true })
    if (!discoveredValidation.ok) throw new Error(discoveredValidation.error)

    return fetchWithFallback(proxyPath, discoveredValidation.url)
  }

  return body
}

async function fetchWithFallback(proxyPath: string, url: string): Promise<string> {
  // Sur une page HTTPS, un flux HTTP serait bloqué comme contenu mixte.
  const canFetchDirect = !(window.location.protocol === 'https:' && new URL(url).protocol === 'http:')
  let directAttempted = false
  if (canFetchDirect && !recentDirectFailure(url)) {
    directAttempted = true
    try {
      const body = await fetchDirect(url)
      // Une réponse HTTP 200 peut dépendre de l'agent utilisateur : certains
      // sites servent une page ou un XML invalide au navigateur, mais un vrai
      // flux au proxy. Dans ce cas, on conserve la route qui fonctionne déjà.
      if (looksLikeHtml(body)) {
        if (!discoverFeedUrlInHtml(body, url)) throw new Error('Page sans flux déclaré.')
      } else {
        if (parseRssFeed(body, url).items.length === 0) {
          throw new Error('Flux direct vide.')
        }
      }
      forgetDirectFailure(url)
      return body
    } catch {
      /* Le proxy peut répondre avec une variante exploitable du flux. */
    }
  }

  try {
    const body = await fetchViaProxy(proxyPath, url)
    if (directAttempted) rememberDirectFailure(url)
    return body
  } catch (proxyError) {
    // Une dernière tentative si le refus direct était mémorisé mais que le
    // proxy est désormais indisponible. Si on vient d'essayer, on évite un
    // second téléchargement identique.
    if (canFetchDirect && !directAttempted) {
      try {
        const body = await fetchDirect(url)
        forgetDirectFailure(url)
        return body
      } catch {
        /* Le message du proxy est généralement le plus utile. */
      }
    }
    throw new Error(describeProxyFailure(proxyError))
  }
}

function readDirectFailures(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DIRECT_FAILURES_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && entry[1] > Date.now()
      )
    )
  } catch {
    return {}
  }
}

function recentDirectFailure(url: string): boolean {
  return (readDirectFailures()[url] ?? 0) > Date.now()
}

function rememberDirectFailure(url: string): void {
  try {
    const entries = Object.entries(readDirectFailures())
    entries.push([url, Date.now() + DIRECT_RETRY_MS])
    window.localStorage.setItem(
      DIRECT_FAILURES_KEY,
      JSON.stringify(Object.fromEntries(entries.slice(-MAX_DIRECT_FAILURES)))
    )
  } catch {
    /* Stockage désactivé : la requête reste fonctionnelle. */
  }
}

function forgetDirectFailure(url: string): void {
  try {
    const failures = readDirectFailures()
    if (!(url in failures)) return
    delete failures[url]
    window.localStorage.setItem(DIRECT_FAILURES_KEY, JSON.stringify(failures))
  } catch {
    /* Stockage désactivé : la requête reste fonctionnelle. */
  }
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 512).trimStart().toLowerCase()
  if (head.startsWith('<?xml')) return false
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

/**
 * Cherche un `<link rel="alternate">` de type RSS/Atom dans une page HTML.
 *
 * `DOMParser` plutôt qu'une expression régulière : le balisage réel comporte
 * des attributs dans n'importe quel ordre, avec des guillemets variables.
 */
function discoverFeedUrlInHtml(html: string, pageUrl: string): string | null {
  const FEED_TYPES = ['application/rss+xml', 'application/atom+xml', 'application/feed+json']

  let document: Document
  try {
    document = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }

  const links = Array.from(document.querySelectorAll('link[rel~="alternate"][href]'))
  const match = links.find((link) => {
    const type = link.getAttribute('type')?.trim().toLowerCase()
    return Boolean(type && FEED_TYPES.includes(type))
  })

  const href = match?.getAttribute('href')?.trim()
  if (!href) return null

  try {
    // Les sites déclarent très souvent un chemin relatif (`/feed`).
    return new URL(href, pageUrl).toString()
  } catch {
    return null
  }
}

function describeProxyFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : ''
  if (!detail) {
    return 'Impossible de charger ce flux.'
  }
  return detail
}

function isLocalDevBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return (
    import.meta.env.DEV &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  )
}

async function fetchViaProxy(proxyPath: string, url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${proxyPath}?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message.trim() || `Le proxy RSS a repondu avec le statut ${response.status}.`)
    }

    return await response.text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Le flux RSS n’a pas repondu dans le delai imparti.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function fetchDirect(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-cache',
      signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
    })

    if (!response.ok) {
      throw new Error(`Le flux a repondu avec le statut ${response.status}.`)
    }

    return await response.text()
  } finally {
    window.clearTimeout(timeout)
  }
}
