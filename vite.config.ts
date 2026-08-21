import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
]

function validateProxyUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported protocol')
  }
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw new Error('Private hosts are not allowed')
  }
  return url
}

/**
 * Proxy de développement : les flux RSS refusent presque tous les requêtes
 * CORS du navigateur. En dev, le serveur Vite rapatrie le XML côté Node.
 * (Même approche que DiploRevue ; en production desktop, Tauri fait ce travail.)
 */
function rssDevProxyPlugin(): Plugin {
  return {
    name: 'veille-web-rss-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/__rss-proxy', async (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '', 'http://localhost')
          const target = requestUrl.searchParams.get('url')
          if (!target) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Missing url')
            return
          }

          const feedUrl = validateProxyUrl(target)
          const response = await fetch(feedUrl, {
            headers: {
              Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
              'Accept-Language': 'tr,fr;q=0.9,en;q=0.8,*;q=0.5',
              // Même agent que DiploRevue : certains éditeurs du catalogue
              // (Anadolu Ajansı) répondent 403 à un agent inconnu.
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 DiploRevue/2.0 (+RSS reader)',
            },
          })

          if (!response.ok) {
            res.writeHead(response.status, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(`Feed responded with ${response.status}`)
            return
          }

          res.writeHead(200, {
            'Content-Type': response.headers.get('content-type') ?? 'application/xml; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          res.end(await response.text())
        } catch (error) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(error instanceof Error ? error.message : 'RSS proxy failed')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), rssDevProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
})
