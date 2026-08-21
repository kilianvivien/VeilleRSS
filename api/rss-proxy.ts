/**
 * Proxy RSS de production (Vercel Function).
 *
 * Pendant `npm run dev`, c'est le middleware Vite `/__rss-proxy`
 * (voir vite.config.ts) qui rapatrie le XML cote Node. Sur un build
 * statique deploye, ce middleware n'existe pas : sans cette fonction, le
 * navigateur tente un fetch direct que la quasi-totalite des editeurs
 * refuse (pas d'en-tete Access-Control-Allow-Origin).
 *
 * Contrairement au proxy de dev, ecoute uniquement en local, celui-ci est
 * joignable depuis Internet. Les garde-fous ci-dessous (blocage des plages
 * privees APRES resolution DNS, redirections revalidees a chaque saut,
 * plafond de taille et de duree) ne sont donc pas optionnels.
 */

const UPSTREAM_TIMEOUT_MS = 8000 // sous le plafond de 10 s d'une Vercel Function
const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5

const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'

// Meme agent que le proxy de dev : certains editeurs du catalogue
// (Anadolu Ajansi) repondent 403 a un agent inconnu.
const FEED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 DiploRevue/2.0 (+RSS reader)'

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true // forme inattendue : on refuse par defaut
  }
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true // link-local + metadonnees cloud
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 0) return true // 192.0.0.0/24
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast + reserve
  return false
}

function ipIsPrivate(ip: string): boolean {
  const address = ip.trim().replace(/^\[|\]$/g, '').toLowerCase()
  if (address.includes('.') && !address.includes(':')) {
    return ipv4IsPrivate(address)
  }
  // IPv4 encapsule en IPv6 (::ffff:127.0.0.1)
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4IsPrivate(mapped[1])

  if (address === '::1' || address === '::') return true
  if (/^f[cd]/.test(address)) return true // unique-local fc00::/7
  if (/^fe[89ab]/.test(address)) return true // link-local fe80::/10
  return false
}

/**
 * Verifie l'URL puis la cible reelle : un nom d'hote public peut resoudre
 * vers une adresse privee, donc le controle par expression reguliere sur le
 * nom d'hote ne suffit pas.
 */
async function assertPublicTarget(url: URL, signal: AbortSignal): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ProxyError(400, 'Seuls les flux HTTP et HTTPS sont acceptes.')
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) {
    throw new ProxyError(403, 'Adresse locale refusee.')
  }

  // Litteral IP : verifiable sans DNS.
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (ipIsPrivate(host)) {
      throw new ProxyError(403, 'Adresse locale ou privee refusee.')
    }
    return
  }

  const { lookup } = await import('node:dns/promises')
  let addresses: Array<{ address: string }>
  try {
    // La resolution DNS n'accepte pas de signal : sans cette course, un
    // resolveur lent depasse le budget de la fonction avant meme le fetch.
    addresses = await abortable(lookup(host, { all: true }), signal)
  } catch (error) {
    if (error instanceof ProxyError) throw error
    throw new ProxyError(502, `Nom d'hote introuvable : ${host}`)
  }
  if (addresses.length === 0 || addresses.some((entry) => ipIsPrivate(entry.address))) {
    throw new ProxyError(403, 'Adresse locale ou privee refusee.')
  }
}

/** Abandonne une promesse non annulable des que le signal se declenche. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new ProxyError(504, "Le flux n'a pas repondu dans le delai imparti."))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ProxyError(504, "Le flux n'a pas repondu dans le delai imparti."))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

class ProxyError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Suit les redirections a la main pour revalider chaque saut. */
async function fetchFeed(target: URL, signal: AbortSignal): Promise<Response> {
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
      if (!location) {
        throw new ProxyError(502, `Redirection sans destination (${response.status}).`)
      }
      current = new URL(location, current) // relatif ou absolu
      continue
    }

    return response
  }

  throw new ProxyError(502, 'Trop de redirections.')
}

async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new ProxyError(502, 'Flux trop volumineux.')
  }

  const body = response.body
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
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

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(merged)
}

export async function GET(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get('url')
  if (!target) {
    return text(400, 'Parametre « url » manquant.')
  }

  let feedUrl: URL
  try {
    feedUrl = new URL(target)
  } catch {
    return text(400, 'URL de flux invalide.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const response = await fetchFeed(feedUrl, controller.signal)

    if (!response.ok) {
      return text(response.status === 404 ? 404 : 502, `Le flux a repondu avec le statut ${response.status}.`)
    }

    const xml = await readCapped(response)
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'application/xml; charset=utf-8',
        // Mutualise les appels entre lecteurs sans figer un flux d'actualite.
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    if (error instanceof ProxyError) {
      return text(error.status, error.message)
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return text(504, "Le flux n'a pas repondu dans le delai imparti.")
    }
    return text(502, error instanceof Error ? error.message : 'Echec du proxy RSS.')
  } finally {
    clearTimeout(timer)
  }
}

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
