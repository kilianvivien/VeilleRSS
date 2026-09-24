import { readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'

const HOST = '127.0.0.1'
const PORT = Number(process.env.APPLE_BRIDGE_PORT || '1977')
const ALLOWED_ORIGIN = new URL(
  process.env.VEILLE_RSS_ORIGIN || 'https://veille-rss.vercel.app'
).origin
const FM_ORIGIN = 'http://127.0.0.1:1976'
const MAX_REQUEST_BYTES = 4 * 1024 * 1024
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('APPLE_BRIDGE_PORT doit être un port valide.')
}
if (new URL(ALLOWED_ORIGIN).protocol !== 'https:') {
  throw new Error('VEILLE_RSS_ORIGIN doit être une origine HTTPS.')
}

function corsHeaders(origin) {
  return origin === ALLOWED_ORIGIN
    ? {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

function sendJson(response, status, payload, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(origin),
  })
  response.end(JSON.stringify(payload))
}

async function readCapped(stream, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of stream) {
    total += chunk.byteLength
    if (total > maxBytes) throw new Error('payload-too-large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}

async function forwardToFm(request, response, origin, path, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), path === '/v1/chat/completions' ? 300_000 : 5_000)
  try {
    const upstream = await fetch(`${FM_ORIGIN}${path}`, {
      method: request.method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
      signal: controller.signal,
      redirect: 'error',
    })
    const payload = upstream.body ? await readCapped(upstream.body, MAX_RESPONSE_BYTES) : Buffer.alloc(0)
    response.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(origin),
    })
    response.end(payload)
  } catch {
    sendJson(response, 502, { error: { message: 'fm serve est indisponible ou a dépassé le délai.' } }, origin)
  } finally {
    clearTimeout(timer)
  }
}

async function handleRequest(request, response) {
  const origin = request.headers.origin
  const address = request.socket.remoteAddress
  if (address !== HOST && address !== '::ffff:127.0.0.1') {
    return sendJson(response, 403, { error: { message: 'Accès local uniquement.' } }, origin)
  }
  if (request.headers.host !== `${HOST}:${PORT}`) {
    return sendJson(response, 403, { error: { message: 'Hôte local requis.' } }, origin)
  }
  if (origin && origin !== ALLOWED_ORIGIN) {
    return sendJson(response, 403, { error: { message: 'Origine non autorisée.' } }, origin)
  }

  const path = new URL(request.url || '/', `http://${HOST}:${PORT}`).pathname
  if (request.method === 'OPTIONS') {
    if (origin !== ALLOWED_ORIGIN || !['/health', '/v1/models', '/v1/chat/completions'].includes(path)) {
      return sendJson(response, 403, { error: { message: 'Pré-vérification refusée.' } }, origin)
    }
    response.writeHead(204, corsHeaders(origin))
    return response.end()
  }
  if (request.method === 'GET' && (path === '/health' || path === '/v1/models')) {
    return forwardToFm(request, response, origin, path)
  }
  if (request.method !== 'POST' || path !== '/v1/chat/completions') {
    return sendJson(response, 404, { error: { message: 'Route inconnue.' } }, origin)
  }
  if (!request.headers['content-type']?.startsWith('application/json')) {
    return sendJson(response, 415, { error: { message: 'JSON requis.' } }, origin)
  }

  try {
    const body = await readCapped(request, MAX_REQUEST_BYTES)
    const payload = JSON.parse(body.toString('utf8'))
    if (
      payload?.model !== 'system' ||
      !Array.isArray(payload.messages) ||
      payload.messages.length === 0 ||
      payload.messages.some((message) =>
        !['system', 'user', 'assistant'].includes(message?.role) ||
        typeof message.content !== 'string'
      )
    ) {
      return sendJson(response, 400, { error: { message: 'Requête Apple invalide.' } }, origin)
    }
    return forwardToFm(request, response, origin, path, body)
  } catch (error) {
    const status = error instanceof Error && error.message === 'payload-too-large' ? 413 : 400
    return sendJson(response, status, { error: { message: 'Corps de requête invalide.' } }, origin)
  }
}

const certificate = process.env.APPLE_BRIDGE_TLS_CERT
const privateKey = process.env.APPLE_BRIDGE_TLS_KEY
if (Boolean(certificate) !== Boolean(privateKey)) {
  throw new Error('APPLE_BRIDGE_TLS_CERT et APPLE_BRIDGE_TLS_KEY doivent être fournis ensemble.')
}
const server = certificate && privateKey
  ? createHttpsServer({ cert: readFileSync(certificate), key: readFileSync(privateKey) }, handleRequest)
  : createHttpServer(handleRequest)

server.listen(PORT, HOST, () => {
  const scheme = certificate ? 'https' : 'http'
  process.stdout.write(`Relais Apple actif sur ${scheme}://${HOST}:${PORT} pour ${ALLOWED_ORIGIN}\n`)
})
