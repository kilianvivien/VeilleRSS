import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateAppleFmSummary, isValidAppleFmBridgeUrl } from './appleFmService'

afterEach(() => vi.unstubAllGlobals())

describe('Apple Foundation Models via fm serve', () => {
  it('sends a chat request to the on-device system model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'Bonjour.' } }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(isValidAppleFmBridgeUrl(undefined)).toBe(true)
    expect(await generateAppleFmSummary('Bonjour', 'Réponds en français.', 128)).toBe('Bonjour.')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:1977/v1/chat/completions')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'system',
      messages: [
        { role: 'system', content: 'Réponds en français.' },
        { role: 'user', content: 'Bonjour' },
      ],
      max_tokens: 128,
      stream: false,
    })
  })

  it('refuses a non-loopback bridge before sending any prompt', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(isValidAppleFmBridgeUrl('https://example.com/v1/chat/completions')).toBe(false)
    expect(isValidAppleFmBridgeUrl('')).toBe(false)
    await expect(generateAppleFmSummary('Bonjour', 'Réponds en français.', 32, {},
      'https://example.com/v1/chat/completions')).rejects.toThrow(
      'Adresse du relais Apple invalide'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a rejected local bridge request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Cross-site requests are not allowed.' } }), {
        status: 403,
      })
    ))

    await expect(generateAppleFmSummary('Bonjour', 'Réponds en français.')).rejects.toThrow(
      'Le relais Apple refuse cette origine'
    )
  })
})
