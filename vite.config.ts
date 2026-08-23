import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

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

type ProxyRequest = { url?: string }
type ProxyResponse = {
  writeHead: (status: number, headers: Record<string, string>) => void
  end: (body?: string) => void
}

async function handleRssProxy(req: ProxyRequest, res: ProxyResponse) {
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
}

/**
 * Proxy RSS local : les flux refusent presque tous les requêtes CORS du
 * navigateur, le serveur Vite rapatrie donc le XML côté Node.
 *
 * Monté sur DEUX chemins, à dessein :
 *  - `/__rss-proxy` en dev, chemin qu'utilise `rssFetchService` sous `vite dev` ;
 *  - `/api/rss-proxy` en preview, chemin de la fonction Vercel de production.
 *
 * Sans le second, `npm run preview` sert un build qui ne peut charger aucun
 * flux — or c'est le seul mode où le service worker est actif, donc le seul
 * banc d'essai possible pour le hors-ligne et les mises à jour.
 */
function rssDevProxyPlugin(): Plugin {
  return {
    name: 'veille-web-rss-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/__rss-proxy', handleRssProxy)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/rss-proxy', handleRssProxy)
    },
  }
}


const SW_TEMPLATE_PATH = path.resolve(__dirname, 'src/pwa/sw.template.js')

/**
 * Ressources publiques non hachées, précachées en best-effort par le SW.
 * Leur contenu entre dans le calcul du BUILD_ID : remplacer une icône doit
 * suffire à déclencher une mise à jour.
 */
const SW_OPTIONAL_PRECACHE = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-64.png',
  '/apple-touch-icon.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-192.png',
  '/pwa-maskable-512.png',
]

/**
 * Génère `dist/sw.js` à partir de `src/pwa/sw.template.js`.
 *
 * Remplace le `CACHE_VERSION` incrémenté à la main, qu'il suffisait d'oublier
 * pour laisser les visiteurs sur une coquille périmée. Le plugin travaille
 * dans `generateBundle` pour avoir accès au graphe Rollup : on distingue ainsi
 * le graphe STATIQUE de l'entrée (à précacher, sinon pas de démarrage hors
 * connexion) des chunks dynamiques (mis en cache à l'usage).
 *
 * Le BUILD_ID est DÉTERMINISTE — hachage des sorties, pas d'horodatage : deux
 * builds au contenu identique ne doivent pas déclencher de fausse bannière
 * « nouvelle version ».
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'veille-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (file) => file.type === 'chunk' && file.isEntry
      )
      if (!entry || entry.type !== 'chunk') {
        this.error("Aucun chunk d'entrée : service worker non généré.")
        return
      }

      // Parcours du graphe statique depuis l'entrée, CSS compris.
      const critical = new Set<string>([`/${entry.fileName}`])
      const walk = (fileName: string) => {
        const chunk = bundle[fileName]
        if (!chunk || chunk.type !== 'chunk') return
        for (const css of chunk.viteMetadata?.importedCss ?? []) critical.add(`/${css}`)
        for (const dependency of chunk.imports) {
          if (critical.has(`/${dependency}`)) continue
          critical.add(`/${dependency}`)
          walk(dependency)
        }
      }
      walk(entry.fileName)

      const assetManifest = Object.keys(bundle)
        .filter((fileName) => fileName.startsWith('assets/'))
        .map((fileName) => `/${fileName}`)
        .sort()

      const template = readFileSync(SW_TEMPLATE_PATH, 'utf8')
      const hash = createHash('sha256').update(template)
      for (const file of Object.values(bundle).sort((a, b) =>
        a.fileName.localeCompare(b.fileName)
      )) {
        hash.update(file.fileName)
        hash.update(file.type === 'chunk' ? file.code : Buffer.from(file.source))
      }
      for (const url of SW_OPTIONAL_PRECACHE) {
        hash.update(readFileSync(path.resolve(__dirname, 'public', url.slice(1))))
      }
      const buildId = hash.digest('hex').slice(0, 12)

      const source = template
        .replace('__BUILD_ID__', buildId)
        .replace(
          /\/\*__PRECACHE_CRITICAL_ASSETS__\*\/\s*\[\]/,
          JSON.stringify([...critical].sort())
        )
        .replace(/\/\*__PRECACHE_OPTIONAL__\*\/\s*\[\]/, JSON.stringify(SW_OPTIONAL_PRECACHE))
        .replace(/\/\*__ASSET_MANIFEST__\*\/\s*\[\]/, JSON.stringify(assetManifest))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/**
 * Version affichée dans « À propos ». Lue depuis package.json pour qu'un
 * `npm version` suffise : aucune constante à re-synchroniser à la main.
 */
const APP_VERSION = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
).version as string

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react(), rssDevProxyPlugin(), serviceWorkerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * React est isolé pour que le cache d'assets NON versionné du service
         * worker le conserve d'un déploiement à l'autre : son nom haché ne
         * change que si React change. Volontairement limité à React —
         * `lucide-react` est déjà tree-shaké par icône, et `@google/genai` est
         * séparé naturellement par les imports dynamiques de
         * `translationService`, qu'un chunk manuel viendrait contrarier.
         */
        manualChunks: (id) =>
          /node_modules\/(react|react-dom|scheduler)\//.test(id) ? 'vendor-react' : undefined,
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
})
