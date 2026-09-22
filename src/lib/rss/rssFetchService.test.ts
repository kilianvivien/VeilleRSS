import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRssFeedXml } from './rssFetchService'

const url = 'https://feeds.example.test/news.xml'
const rss = '<rss version="2.0"><channel><title>Actualités</title><item><title>Article</title><link>https://example.test/1</link><pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>'
const proxyUrl = (value: string) => `/__rss-proxy?url=${encodeURIComponent(value)}`

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('fetchRssFeedXml', () => {
  it('lit un flux compatible CORS dans le navigateur sans appeler le proxy', async () => {
    const fetchMock = vi.fn(async () => new Response(rss, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchRssFeedXml(url)).toBe(rss)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'GET' }))
  })

  it('utilise le proxy après un refus direct et évite de répéter ce refus', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === url) throw new TypeError('Failed to fetch')
      return new Response(rss, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchRssFeedXml(url)).toBe(rss)
    expect(await fetchRssFeedXml(url)).toBe(rss)
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
      url,
      proxyUrl(url),
      proxyUrl(url),
    ])
  })

  it('garde le proxy si le navigateur reçoit un XML invalide', async () => {
    const fetchMock = vi.fn(async (input: string) =>
      new Response(input === url ? '<not-a-feed />' : rss, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchRssFeedXml(url)).toBe(rss)
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([url, proxyUrl(url)])
  })

  it('garde le proxy si le navigateur reçoit un flux vide', async () => {
    const empty = '<rss version="2.0"><channel><title>Actualités</title></channel></rss>'
    const fetchMock = vi.fn(async (input: string) =>
      new Response(input === url ? empty : rss, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchRssFeedXml(url)).toBe(rss)
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([url, proxyUrl(url)])
  })

  it('découvre le flux annoncé par une page chargée directement', async () => {
    const discovered = 'https://feeds.example.test/atom.xml'
    const html = '<html><head><link rel="alternate" type="application/atom+xml" href="/atom.xml"></head></html>'
    const fetchMock = vi.fn(async (input: string) =>
      new Response(input === url ? html : rss, { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchRssFeedXml(url)).toBe(rss)
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([url, discovered])
  })

  it('partage une requête en cours entre deux appels du même flux', async () => {
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    const first = fetchRssFeedXml(url)
    const second = fetchRssFeedXml(url)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveResponse(new Response(rss, { status: 200 }))
    expect(await Promise.all([first, second])).toEqual([rss, rss])
  })
})
