import { AiProviderError } from './aiProviderError'
import {
  createRequestControlContext,
  isAbortError,
  isRequestTimeoutError,
  type RequestControlOptions,
} from './requestControl'
import { DEFAULT_LOCAL_AI_TIMEOUT_SECONDS } from './localAiTimeout'

export const DEFAULT_APPLE_FM_BRIDGE_URL = 'http://127.0.0.1:1977/v1/chat/completions'

export function isValidAppleFmBridgeUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value === undefined ? DEFAULT_APPLE_FM_BRIDGE_URL : value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname === '127.0.0.1' &&
      url.port !== '' &&
      url.pathname === '/v1/chat/completions' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export async function generateAppleFmSummary(
  text: string,
  systemPrompt: string,
  maxOutputTokens = 16384,
  requestOptions: RequestControlOptions = {},
  bridgeUrl = DEFAULT_APPLE_FM_BRIDGE_URL
): Promise<string> {
  if (!isValidAppleFmBridgeUrl(bridgeUrl)) {
    throw new AiProviderError({
      provider: 'apple',
      message: 'Adresse du relais Apple invalide. Utilisez une adresse 127.0.0.1 terminée par /v1/chat/completions.',
    })
  }
  if (!text.trim()) throw new Error('Le texte à envoyer au modèle Apple est vide.')

  const control = createRequestControlContext({
    timeoutMs: DEFAULT_LOCAL_AI_TIMEOUT_SECONDS * 1000,
    ...requestOptions,
  })
  try {
    const response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: control.signal,
      body: JSON.stringify({
        model: 'system',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        max_tokens: maxOutputTokens,
        stream: false,
      }),
    })

    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const error = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null
      const detail = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : response.statusText
      throw new AiProviderError({
        provider: 'apple',
        status: response.status,
        message:
          response.status === 403
            ? 'Le relais Apple refuse cette origine. Vérifiez VEILLE_RSS_ORIGIN et l’adresse du site Vercel.'
            : `Erreur Apple Foundation Models (${response.status}) : ${detail}`,
      })
    }

    const choices = payload && typeof payload === 'object' ? (payload as { choices?: unknown }).choices : null
    const first = Array.isArray(choices) ? choices[0] : null
    const content = first && typeof first === 'object' && typeof first.message?.content === 'string'
      ? first.message.content.trim()
      : ''
    if (!content) {
      throw new AiProviderError({
        provider: 'apple',
        message: 'Le modèle Apple a renvoyé une réponse vide. Réessayez avec un texte plus court.',
      })
    }
    return content
  } catch (error) {
    if (isRequestTimeoutError(error, control.signal)) {
      throw new AiProviderError({
        provider: 'apple',
        message: 'Apple Foundation Models n’a pas répondu avant le délai imparti.',
        isTransient: true,
        cause: error,
      })
    }
    if (isAbortError(error) || error instanceof AiProviderError) throw error
    if (error instanceof TypeError) {
      throw new AiProviderError({
        provider: 'apple',
        message:
          'Impossible de joindre le relais Apple local. Lancez « npm run apple:bridge » sur ce Mac ; dans Chrome ou Edge, autorisez l’accès au réseau local. Safari nécessite un relais HTTPS avec certificat de confiance.',
        isTransient: true,
        cause: error,
      })
    }
    throw error
  } finally {
    control.cleanup()
  }
}
