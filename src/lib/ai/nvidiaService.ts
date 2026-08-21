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

const NVIDIA_API_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions'
const logger = createLogger('ai:nvidia')

export type NvidiaModel =
  | 'deepseek-ai/deepseek-v4-flash'
  | 'moonshotai/kimi-k2.6'
  | 'z-ai/glm-5.2'
  | 'minimaxai/minimax-m3'

const MODEL_MAX_TOKENS: Record<string, number> = {
  'deepseek-ai/deepseek-v4-flash': 16384,
  'moonshotai/kimi-k2.6': 16384,
  'z-ai/glm-5.2': 16384,
  'minimaxai/minimax-m3': 16384,
}

function extractNvidiaContent(data: unknown): string {
  const content =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { choices?: unknown[] }).choices) &&
    (data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message?.content

  if (typeof content === 'string' && content.trim().length > 0) {
    return content
  }

  throw new AiProviderError({
    provider: 'nvidia',
    message: 'Réponse NVIDIA invalide: contenu vide ou absent (choices[0].message.content).',
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
 * Generates an "En bref" summary using the NVIDIA NIM API (OpenAI-compatible).
 */
export async function generateNvidiaSummary(
  themesContent: string,
  apiKey: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  model: string = 'deepseek-ai/deepseek-v4-flash',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API NVIDIA n'est pas configurée.")
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
        logger.debug(`Calling NVIDIA NIM API with model: ${model}`)
        const response = await fetch(NVIDIA_API_ENDPOINT, {
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
            provider: 'nvidia',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: await parseErrorMessage(response),
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur NVIDIA',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractNvidiaContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete NVIDIA a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
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
          provider: 'nvidia',
          message: "Impossible de se connecter à l'API NVIDIA. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec NVIDIA.')
  } finally {
    requestControl.cleanup()
  }
}

/**
 * Generates structured JSON content using the NVIDIA NIM API.
 */
export async function generateNvidiaJSON(
  content: string,
  apiKey: string,
  systemPrompt: string,
  maxOutputTokens: number = 16384,
  model: string = 'deepseek-ai/deepseek-v4-flash',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API NVIDIA n'est pas configurée.")
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
        logger.debug(`Calling NVIDIA NIM API (JSON prompt) with model: ${model}`)
        const response = await fetch(NVIDIA_API_ENDPOINT, {
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
            provider: 'nvidia',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: await parseErrorMessage(response),
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur NVIDIA',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractNvidiaContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete NVIDIA a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
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
          provider: 'nvidia',
          message: "Impossible de se connecter à l'API NVIDIA. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec NVIDIA.')
  } finally {
    requestControl.cleanup()
  }
}
