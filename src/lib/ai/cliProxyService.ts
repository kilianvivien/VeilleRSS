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

const logger = createLogger('ai:cliproxy')

export function resolveCliProxyChatEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (!normalized) {
    throw new Error("L'adresse de CLIProxyAPI n'est pas configurée.")
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error("L'adresse de CLIProxyAPI n'est pas valide.")
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error("L'adresse de CLIProxyAPI doit utiliser HTTP ou HTTPS.")
  }

  if (normalized.endsWith('/chat/completions')) return normalized
  if (normalized.endsWith('/v1')) return `${normalized}/chat/completions`
  return `${normalized}/v1/chat/completions`
}

function extractContent(data: unknown): string {
  const content =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { choices?: unknown[] }).choices) &&
    (data as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message?.content

  if (typeof content === 'string' && content.trim()) return content

  throw new AiProviderError({
    provider: 'cliproxy',
    message: 'Réponse CLIProxyAPI invalide: contenu vide ou absent (choices[0].message.content).',
    isTransient: true,
  })
}

interface GenerateOptions {
  content: string
  apiKey: string
  baseUrl: string
  systemPrompt: string
  maxOutputTokens: number
  model: string
  requestOptions: RequestControlOptions
  temperature?: number
  jsonMode: boolean
}

async function generateWithCliProxy(options: GenerateOptions): Promise<string> {
  if (!options.apiKey.trim()) throw new Error("La clé d'accès CLIProxyAPI n'est pas configurée.")
  if (!options.model.trim()) throw new Error("Le modèle CLIProxyAPI n'est pas configuré.")
  if (!options.content.trim()) throw new Error('Le contenu à analyser est vide.')

  const endpoint = resolveCliProxyChatEndpoint(options.baseUrl)
  const requestControl = createRequestControlContext(options.requestOptions)

  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling CLIProxyAPI with model: ${options.model}`)
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey.trim()}`,
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model: options.model.trim(),
            messages: [
              { role: 'system', content: options.systemPrompt },
              { role: 'user', content: options.content },
            ],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxOutputTokens,
            ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage =
            (errorData as { error?: { message?: string } }).error?.message ||
            (errorData as { message?: string }).message ||
            response.statusText
          throw createHttpProviderError({
            provider: 'cliproxy',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: errorMessage,
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur CLIProxyAPI',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...options.requestOptions.retryPolicy }
    )
    return extractContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requête CLIProxyAPI a expiré après ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez réessayer.`
      )
    }
    if (isAbortError(error) || isAiProviderError(error)) throw error
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        throw new AiProviderError({
          provider: 'cliproxy',
          message:
            'Impossible de joindre CLIProxyAPI. Vérifiez que le serveur est démarré, son adresse et sa configuration CORS.',
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec CLIProxyAPI.')
  } finally {
    requestControl.cleanup()
  }
}

export async function generateCliProxySummary(
  content: string,
  apiKey: string,
  baseUrl: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  model: string = '',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  return generateWithCliProxy({
    content,
    apiKey,
    baseUrl,
    systemPrompt: customPrompt || DEFAULT_SYSTEM_PROMPT,
    maxOutputTokens,
    model,
    requestOptions,
    temperature: generationOptions?.temperature,
    jsonMode: false,
  })
}

export async function generateCliProxyJSON(
  content: string,
  apiKey: string,
  baseUrl: string,
  systemPrompt: string,
  maxOutputTokens: number = 16384,
  model: string = '',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  const finalSystemPrompt = /json/i.test(systemPrompt)
    ? systemPrompt
    : `${systemPrompt}\n\nIMPORTANT: Tu dois toujours répondre en JSON valide.`
  return generateWithCliProxy({
    content,
    apiKey,
    baseUrl,
    systemPrompt: finalSystemPrompt,
    maxOutputTokens,
    model,
    requestOptions,
    temperature: generationOptions?.temperature,
    jsonMode: true,
  })
}
