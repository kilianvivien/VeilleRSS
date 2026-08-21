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

const MISTRAL_API_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions'
const logger = createLogger('ai:mistral')

function extractMistralContent(data: unknown): string {
  const content =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { choices?: unknown[] }).choices) &&
    (data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message?.content

  if (typeof content === 'string' && content.trim().length > 0) {
    return content
  }

  throw new AiProviderError({
    provider: 'mistral',
    message: 'Réponse Mistral invalide: contenu vide ou absent (choices[0].message.content).',
    isTransient: true,
  })
}

/**
 * Génère un résumé "En bref" en utilisant l'API Mistral AI.
 * @param themesContent - Contenu concaténé des thèmes de la revue
 * @param apiKey - Clé API Mistral
 * @param customPrompt - Instruction système optionnelle fournie par l'utilisateur
 * @param maxOutputTokens - Max output tokens (default: 16384)
 * @param mistralModel - Mistral model to use (default: 'mistral-small-latest')
 * @returns Le résumé généré en HTML
 */
export async function generateMistralSummary(
  themesContent: string,
  apiKey: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  mistralModel: string = 'mistral-small-latest',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API Mistral n'est pas configurée.")
  }
  if (!themesContent.trim()) {
    throw new Error('Le contenu des thèmes est vide.')
  }

  // Utilise le prompt personnalisé ou, à défaut, celui par défaut
  const systemInstruction = customPrompt || DEFAULT_SYSTEM_PROMPT

  const requestControl = createRequestControlContext(requestOptions)
  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling Mistral API with model: ${mistralModel}`)
        const response = await fetch(MISTRAL_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model: mistralModel,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: themesContent },
            ],
            temperature: generationOptions?.temperature ?? 0.7,
            max_tokens: maxOutputTokens,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = (errorData as { message?: string }).message || response.statusText
          throw createHttpProviderError({
            provider: 'mistral',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: errorMessage,
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur Mistral AI',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractMistralContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Mistral a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
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
          provider: 'mistral',
          message: "Impossible de se connecter à l'API Mistral. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec Mistral AI.')
  } finally {
    requestControl.cleanup()
  }
}

/**
 * Génère du contenu structuré JSON en utilisant l'API Mistral AI.
 * Cette fonction est dédiée à la génération de revues de presse au format JSON
 * via la fonctionnalité Magic Review IA.
 *
 * @param content - Le contenu texte à analyser
 * @param apiKey - Clé API Mistral
 * @param systemPrompt - Le prompt système pour guider la génération
 * @param maxOutputTokens - Max output tokens (default: 16384)
 * @param mistralModel - Mistral model to use (default: 'mistral-small-latest')
 * @returns Le JSON généré sous forme de string
 */
export async function generateMistralJSON(
  content: string,
  apiKey: string,
  systemPrompt: string,
  maxOutputTokens: number = 16384,
  mistralModel: string = 'mistral-small-latest',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API Mistral n'est pas configurée.")
  }
  if (!content.trim()) {
    throw new Error('Le contenu à analyser est vide.')
  }

  const requestControl = createRequestControlContext(requestOptions)
  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling Mistral API (JSON mode) with model: ${mistralModel}`)
        const response = await fetch(MISTRAL_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model: mistralModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: content },
            ],
            temperature: generationOptions?.temperature ?? 0.7,
            max_tokens: maxOutputTokens,
            response_format: { type: 'json_object' },
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = (errorData as { message?: string }).message || response.statusText
          throw createHttpProviderError({
            provider: 'mistral',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: errorMessage,
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur Mistral AI',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    logger.debug('Mistral JSON response received')
    return extractMistralContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Mistral a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
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
          provider: 'mistral',
          message: "Impossible de se connecter à l'API Mistral. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec Mistral AI.')
  } finally {
    requestControl.cleanup()
  }
}
