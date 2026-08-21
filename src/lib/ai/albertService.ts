import { DEFAULT_SYSTEM_PROMPT } from './constants'
import {
  createRequestControlContext,
  executeWithRetry,
  isAbortError,
  isRequestTimeoutError,
  type RequestControlOptions,
} from './requestControl'
import { AiProviderError, createHttpProviderError, isAiProviderError } from './aiProviderError'
import { createLogger } from '@/lib/utils/logger'

// Albert API — the French government's (Etalab/DINUM) sovereign, OpenAI-compatible
// AI gateway. See https://albert.api.etalab.gouv.fr/reference
const ALBERT_API_ENDPOINT = 'https://albert.api.etalab.gouv.fr/v1/chat/completions'
const logger = createLogger('ai:albert')

export type AlbertModel = 'albert-large' | 'albert-small'

const MODEL_MAX_TOKENS: Record<string, number> = {
  'albert-large': 16384,
  'albert-small': 16384,
}

function extractAlbertContent(data: unknown): string {
  const content =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { choices?: unknown[] }).choices) &&
    (data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message?.content

  if (typeof content === 'string' && content.trim().length > 0) {
    return content
  }

  throw new AiProviderError({
    provider: 'albert',
    message: 'Réponse Albert invalide: contenu vide ou absent (choices[0].message.content).',
    isTransient: true,
  })
}

function getSafeMaxTokens(model: string, maxOutputTokens: number): number {
  return Math.min(maxOutputTokens, MODEL_MAX_TOKENS[model] || 16384)
}

async function parseErrorMessage(response: Response): Promise<string> {
  const errorData = await response.json().catch(() => ({}))
  return (
    (errorData as { error?: { message?: string } }).error?.message ||
    (errorData as { message?: string }).message ||
    response.statusText
  )
}

/**
 * Generates an "En bref" summary using the Albert API (OpenAI-compatible).
 */
export async function generateAlbertSummary(
  themesContent: string,
  apiKey: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  model: string = 'albert-large',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API Albert n'est pas configurée.")
  }
  if (!themesContent.trim()) {
    throw new Error('Le contenu des thèmes est vide.')
  }

  const systemInstruction = customPrompt || DEFAULT_SYSTEM_PROMPT
  const requestControl = createRequestControlContext(requestOptions)
  const safeMaxTokens = getSafeMaxTokens(model, maxOutputTokens)

  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling Albert API with model: ${model}`)
        const response = await fetch(ALBERT_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: themesContent },
            ],
            temperature: generationOptions?.temperature ?? 0.7,
            max_tokens: safeMaxTokens,
          }),
        })

        if (!response.ok) {
          throw createHttpProviderError({
            provider: 'albert',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: await parseErrorMessage(response),
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur Albert',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractAlbertContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Albert a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
      )
    }
    if (isAbortError(error)) {
      throw error
    }
    if (isAiProviderError(error)) {
      throw error
    }
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        throw new AiProviderError({
          provider: 'albert',
          message: "Impossible de se connecter à l'API Albert. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec Albert.')
  } finally {
    requestControl.cleanup()
  }
}

/**
 * Generates structured JSON content using the Albert API.
 */
export async function generateAlbertJSON(
  content: string,
  apiKey: string,
  systemPrompt: string,
  maxOutputTokens: number = 16384,
  model: string = 'albert-large',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API Albert n'est pas configurée.")
  }
  if (!content.trim()) {
    throw new Error('Le contenu à analyser est vide.')
  }

  const hasJsonKeyword = /json/i.test(systemPrompt)
  const finalSystemPrompt = hasJsonKeyword
    ? systemPrompt
    : `${systemPrompt}\n\nIMPORTANT: Tu dois toujours répondre en JSON valide.`
  const requestControl = createRequestControlContext(requestOptions)
  const safeMaxTokens = getSafeMaxTokens(model, maxOutputTokens)

  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling Albert API (JSON prompt) with model: ${model}`)
        const response = await fetch(ALBERT_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: finalSystemPrompt },
              { role: 'user', content },
            ],
            temperature: generationOptions?.temperature ?? 0.7,
            max_tokens: safeMaxTokens,
          }),
        })

        if (!response.ok) {
          throw createHttpProviderError({
            provider: 'albert',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: await parseErrorMessage(response),
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur Albert',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractAlbertContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Albert a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
      )
    }
    if (isAbortError(error)) {
      throw error
    }
    if (isAiProviderError(error)) {
      throw error
    }
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        throw new AiProviderError({
          provider: 'albert',
          message: "Impossible de se connecter à l'API Albert. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec Albert.')
  } finally {
    requestControl.cleanup()
  }
}
