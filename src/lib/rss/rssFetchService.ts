import { validateRssFeedUrl } from './rssUrlValidation'

const REQUEST_TIMEOUT_MS = 15000

/**
 * Récupération du XML d'un flux — version web autonome.
 *
 * En dev, le serveur Vite expose `/__rss-proxy` (voir vite.config.ts) : les
 * flux refusent presque tous les requêtes CORS directes du navigateur.
 * Hors dev (build statique), on tente la récupération directe et on explique
 * l'échec CORS si le flux bloque.
 */
export async function fetchRssFeedXml(url: string): Promise<string> {
  const validation = validateRssFeedUrl(url, { allowHttp: true })
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  if (isLocalDevBrowser()) {
    return fetchViaLocalDevProxy(validation.url)
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(validation.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`Le flux a repondu avec le statut ${response.status}.`)
    }

    return await response.text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Le flux RSS n’a pas repondu dans le navigateur. Il peut bloquer les requetes CORS de la version web.')
    }
    throw new Error(
      error instanceof Error
        ? `${error.message} Si ce flux fonctionne dans un navigateur, il bloque probablement les requetes CORS de la version web. Lancez l’outil avec « npm run dev » pour passer par le proxy local.`
        : 'Impossible de charger ce flux. Il bloque probablement les requetes CORS de la version web.'
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

function isLocalDevBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return (
    import.meta.env.DEV &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  )
}

async function fetchViaLocalDevProxy(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`/__rss-proxy?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || `Le proxy RSS local a repondu avec le statut ${response.status}.`)
    }

    return await response.text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Le flux RSS n’a pas repondu via le proxy local de developpement.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
