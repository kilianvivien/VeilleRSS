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

const OPENROUTER_API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const logger = createLogger('ai:openrouter')

export type OpenRouterModel =
  | 'openai/gpt-oss-120b:free'
  | 'nvidia/nemotron-3-super-120b-a12b:free'
  | 'deepseek/deepseek-v4-flash-0731'
  | 'google/gemma-4-31b-it:free'
  | 'openai/gpt-5.6-luna'
  | 'moonshotai/kimi-k3'
  | 'minimax/minimax-m3'
  | 'z-ai/glm-5.2'
  | 'anthropic/claude-haiku-4.5'
  | 'anthropic/claude-sonnet-5'
  | 'mistralai/mistral-large-2512'

function extractOpenRouterContent(data: unknown): string {
  const content =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { choices?: unknown[] }).choices) &&
    (data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message?.content

  if (typeof content === 'string' && content.trim().length > 0) {
    return content
  }

  throw new AiProviderError({
    provider: 'openrouter',
    message: 'Réponse OpenRouter invalide: contenu vide ou absent (choices[0].message.content).',
    isTransient: true,
  })
}

/**
 * Generates an "En bref" summary using the OpenRouter API (OpenAI-compatible).
 */
export async function generateOpenRouterSummary(
  themesContent: string,
  apiKey: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  model: string = 'openai/gpt-oss-120b:free',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API OpenRouter n'est pas configurée.")
  }
  if (!themesContent.trim()) {
    throw new Error('Le contenu des thèmes est vide.')
  }

  const systemInstruction = customPrompt || DEFAULT_SYSTEM_PROMPT
  const requestControl = createRequestControlContext(requestOptions)

  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling OpenRouter API with model: ${model}`)
        const response = await fetch(OPENROUTER_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://diplorevue.app',
            'X-Title': 'DiploRevue',
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model: model,
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
          const errorMessage =
            (errorData as { error?: { message?: string } }).error?.message ||
            (errorData as { message?: string }).message ||
            response.statusText
          throw createHttpProviderError({
            provider: 'openrouter',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: errorMessage,
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur OpenRouter',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractOpenRouterContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete OpenRouter a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
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
          provider: 'openrouter',
          message:
            "Impossible de se connecter à l'API OpenRouter. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec OpenRouter.')
  } finally {
    requestControl.cleanup()
  }
}

/**
 * Generates structured JSON content using the OpenRouter API.
 */
export async function generateOpenRouterJSON(
  content: string,
  apiKey: string,
  systemPrompt: string,
  maxOutputTokens: number = 16384,
  model: string = 'openai/gpt-oss-120b:free',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API OpenRouter n'est pas configurée.")
  }
  if (!content.trim()) {
    throw new Error('Le contenu à analyser est vide.')
  }

  const hasJsonKeyword = /json/i.test(systemPrompt)
  const finalSystemPrompt = hasJsonKeyword
    ? systemPrompt
    : `${systemPrompt}\n\nIMPORTANT: Tu dois toujours répondre en JSON valide.`
  const requestControl = createRequestControlContext(requestOptions)

  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling OpenRouter API (JSON mode) with model: ${model}`)
        const response = await fetch(OPENROUTER_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://diplorevue.app',
            'X-Title': 'DiploRevue',
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: finalSystemPrompt },
              { role: 'user', content: content },
            ],
            temperature: generationOptions?.temperature ?? 0.7,
            max_tokens: maxOutputTokens,
            response_format: { type: 'json_object' },
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage =
            (errorData as { error?: { message?: string } }).error?.message ||
            (errorData as { message?: string }).message ||
            response.statusText
          throw createHttpProviderError({
            provider: 'openrouter',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: errorMessage,
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur OpenRouter',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractOpenRouterContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete OpenRouter a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
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
          provider: 'openrouter',
          message:
            "Impossible de se connecter à l'API OpenRouter. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec OpenRouter.')
  } finally {
    requestControl.cleanup()
  }
}
