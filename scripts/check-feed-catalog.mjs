/** Live check, deliberately separate from the offline unit test suite. */
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const json = args.includes('--json')
const selectors = args.filter((arg) => arg !== '--json')
const dom = new JSDOM('')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.DOMParser = dom.window.DOMParser

// Load the actual application parser and Vercel handler without opening a port.
const server = await createServer({
  root,
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const { FEED_CATALOG } = await server.ssrLoadModule('/src/lib/rss/feedCatalog.ts')
  const { parseRssFeed, isDatedRssItem } = await server.ssrLoadModule('/src/lib/rss/rssParser.ts')
  const { GET } = await server.ssrLoadModule('/api/rss-proxy.ts')
  const catalog = FEED_CATALOG.flatMap((pack) => pack.feeds.map((feed) => ({ ...feed, packId: pack.id })))
  const selected = selectors.length === 0 ? catalog : selectors.flatMap((selector) => {
    const matches = catalog.filter((feed) => feed.id === selector || feed.packId === selector)
    if (matches.length) return matches
    if (selector.startsWith('https://')) return [{ id: selector, url: selector }]
    throw new Error(`Source ou bouquet inconnu : ${selector}`)
  })
  const feeds = [...new Map(selected.map((feed) => [feed.url, feed])).values()]
  const results = new Array(feeds.length)
  let cursor = 0
  // Keep upstream traffic bounded; the production handler enforces its own
  // DNS/redirect checks, eight-second timeout and five-MiB response limit.
  await Promise.all(Array.from({ length: Math.min(4, feeds.length) }, async () => {
    while (cursor < feeds.length) {
      const index = cursor++
      const feed = feeds[index]
      const result = { id: feed.id, url: feed.url, checkedAt: new Date().toISOString() }
      try {
        const response = await GET(new Request(`https://catalog-check.invalid/api/rss-proxy?url=${encodeURIComponent(feed.url)}`))
        result.httpStatus = response.status
        const xml = await response.text()
        if (!response.ok) throw new Error(xml)
        const parsed = parseRssFeed(xml, feed.url)
        const dated = parsed.items.filter(isDatedRssItem)
        result.title = parsed.title
        result.itemCount = dated.length
        result.undatedCount = parsed.items.length - dated.length
        if (!dated.length) throw new Error('Aucun article daté lisible.')
        result.newestItemAt = new Date(Math.max(...dated.map((item) => item.publishedAt))).toISOString()
        result.linkedItemCount = dated.filter((item) => /^https?:\/\//i.test(item.link)).length
        if (!result.linkedItemCount) throw new Error('Aucun article daté avec un lien HTTP(S).')
        result.status = 'ok'
      } catch (error) {
        result.status = 'error'
        result.message = error instanceof Error ? error.message : String(error)
      }
      results[index] = result
      if (!json) console.log(`${result.status === 'ok' ? 'OK' : 'FAIL'} ${feed.id}: ${result.status === 'ok' ? `${result.itemCount} articles, dernier ${result.newestItemAt}` : result.message}`)
    }
  }))
  const failed = results.filter((result) => result.status !== 'ok').length
  if (json) console.log(JSON.stringify(results, null, 2))
  else console.log(`\n${results.length - failed}/${results.length} flux lisibles. La disponibilité et la fraîcheur restent à surveiller.`)
  if (failed) process.exitCode = 1
} finally {
  await server.close()
  dom.window.close()
}
