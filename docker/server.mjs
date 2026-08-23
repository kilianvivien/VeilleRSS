import { lookup } from 'node:dns/promises'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number.parseInt(process.env.PORT || '8080', 10)
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
const UPSTREAM_TIMEOUT_MS = 8_000
const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
const FEED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 DiploRevue/2.0 (+RSS reader)'

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

class ProxyError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function ipv4IsPrivate(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function ipIsPrivate(ip) {
  const address = ip.trim().replace(/^\[|\]$/g, '').toLowerCase()
  if (address.includes('.') && !address.includes(':')) return ipv4IsPrivate(address)
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4IsPrivate(mapped[1])
  return address === '::1' || address === '::' || /^f[cd]/.test(address) || /^fe[89ab]/.test(address)
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(new ProxyError(504, 'Délai de réponse dépassé.'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ProxyError(504, 'Délai de réponse dépassé.'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

async function assertPublicTarget(url, signal) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyError(400, 'Seuls les flux HTTP et HTTPS sont acceptés.')
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) {
    throw new ProxyError(403, 'Adresse locale refusée.')
  }
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (ipIsPrivate(host)) throw new ProxyError(403, 'Adresse locale ou privée refusée.')
    return
  }

  let addresses
  try {
    addresses = await abortable(lookup(host, { all: true }), signal)
  } catch (error) {
    if (error instanceof ProxyError) throw error
    throw new ProxyError(502, `Nom d'hôte introuvable : ${host}`)
  }
  if (!addresses.length || addresses.some(({ address }) => ipIsPrivate(address))) {
    throw new ProxyError(403, 'Adresse locale ou privée refusée.')
  }
}

async function fetchFeed(target, signal) {
  let current = target
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicTarget(current, signal)
    const response = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: { Accept: FEED_ACCEPT, 'User-Agent': FEED_USER_AGENT },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new ProxyError(502, `Redirection sans destination (${response.status}).`)
      current = new URL(location, current)
      continue
    }
    return response
  }
  throw new ProxyError(502, 'Trop de redirections.')
}

async function readCapped(response) {
  const declared = Number(response.headers.get('content-length') || '')
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new ProxyError(502, 'Flux trop volumineux.')
  }
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new ProxyError(502, 'Flux trop volumineux.')
    }
    chunks.push(value)
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function sendText(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(message)
}

async function serveRssProxy(requestUrl, response) {
  const target = requestUrl.searchParams.get('url')
  if (!target) return sendText(response, 400, 'Paramètre « url » manquant.')

  let feedUrl
  try {
    feedUrl = new URL(target)
  } catch {
    return sendText(response, 400, 'URL de flux invalide.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const upstream = await fetchFeed(feedUrl, controller.signal)
    if (!upstream.ok) {
      return sendText(
        response,
        upstream.status === 404 ? 404 : 502,
        `Le flux a répondu avec le statut ${upstream.status}.`
      )
    }
    const body = await readCapped(upstream)
    response.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(body)
  } catch (error) {
    if (error instanceof ProxyError) return sendText(response, error.status, error.message)
    if (error instanceof Error && error.name === 'AbortError') {
      return sendText(response, 504, "Le flux n'a pas répondu dans le délai imparti.")
    }
    return sendText(response, 502, error instanceof Error ? error.message : 'Échec du proxy RSS.')
  } finally {
    clearTimeout(timer)
  }
}

function cacheControl(pathname) {
  if (pathname === '/sw.js' || pathname === '/manifest.webmanifest' || pathname.endsWith('.html')) {
    return 'public, max-age=0, must-revalidate'
  }
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

async function serveStatic(request, requestUrl, response) {
  let pathname
  try {
    pathname = decodeURIComponent(requestUrl.pathname)
  } catch {
    return sendText(response, 400, 'Chemin invalide.')
  }

  const relativePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  let filePath = join(DIST_DIR, relativePath || 'index.html')
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    filePath = join(DIST_DIR, 'index.html')
  }

  const headers = {
    'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cacheControl(filePath.endsWith('index.html') ? '/index.html' : pathname),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
  if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/'

  response.writeHead(200, headers)
  if (request.method === 'HEAD') return response.end()
  createReadStream(filePath).on('error', () => response.destroy()).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    if (requestUrl.pathname === '/healthz') return sendText(response, 200, 'ok')
    if (requestUrl.pathname === '/api/rss-proxy') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD')
        return sendText(response, 405, 'Méthode non autorisée.')
      }
      return await serveRssProxy(requestUrl, response)
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD')
      return sendText(response, 405, 'Méthode non autorisée.')
    }
    return await serveStatic(request, requestUrl, response)
  } catch (error) {
    console.error(error)
    return sendText(response, 500, 'Erreur interne du serveur.')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Veille RSS écoute sur http://${HOST}:${PORT}`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
