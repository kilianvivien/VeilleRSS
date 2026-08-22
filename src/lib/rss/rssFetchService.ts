import { validateRssFeedUrl } from './rssUrlValidation'

const REQUEST_TIMEOUT_MS = 15000

/** Middleware Vite, disponible uniquement pendant `npm run dev`. */
const DEV_PROXY_PATH = '/__rss-proxy'
/** Vercel Function (voir api/rss-proxy.ts), disponible sur le deploiement. */
const PROD_PROXY_PATH = '/api/rss-proxy'

/**
 * Récupération du XML d'un flux — version web autonome.
 *
 * Les flux refusent presque tous les requêtes CORS directes du navigateur :
 * on passe donc toujours par un proxy côté serveur. En dev c'est le
 * middleware Vite, en production la fonction déployée sur Vercel.
 * Le fetch direct ne subsiste qu'en dernier recours, pour les rares flux
 * qui renvoient `Access-Control-Allow-Origin`.
 */
export async function fetchRssFeedXml(url: string): Promise<string> {
  const validation = validateRssFeedUrl(url, { allowHttp: true })
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const proxyPath = isLocalDevBrowser() ? DEV_PROXY_PATH : PROD_PROXY_PATH

  let body: string
  try {
    body = await fetchViaProxy(proxyPath, validation.url)
  } catch (proxyError) {
    try {
      body = await fetchDirect(validation.url)
    } catch {
      // L'échec du proxy est la cause utile : le fetch direct échoue par
      // conception sur la plupart des flux.
      throw new Error(describeProxyFailure(proxyError))
    }
  }

  // L'adresse pointait une page et non un flux : cas courant quand on colle
  // l'accueil d'un site, et cas NORMAL pour la cible de partage du manifeste
  // (on partage un article, jamais une URL de flux). On tente l'autodécouverte
  // plutôt que de renvoyer une erreur de parsing incompréhensible.
  if (looksLikeHtml(body)) {
    const discovered = discoverFeedUrlInHtml(body, validation.url)
    if (!discovered) {
      throw new Error(
        "Cette adresse renvoie une page web, pas un flux RSS, et aucun flux n'y est déclaré."
      )
    }
    const discoveredValidation = validateRssFeedUrl(discovered, { allowHttp: true })
    if (!discoveredValidation.ok) throw new Error(discoveredValidation.error)

    try {
      return await fetchViaProxy(proxyPath, discoveredValidation.url)
    } catch (proxyError) {
      try {
        return await fetchDirect(discoveredValidation.url)
      } catch {
        throw new Error(describeProxyFailure(proxyError))
      }
    }
  }

  return body
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
