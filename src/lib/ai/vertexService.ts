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

const VERTEX_API_BASE = 'https://aiplatform.googleapis.com/v1/publishers/google/models'
const logger = createLogger('ai:vertex')

export type VertexModel = 'gemini-3.7-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.5-flash-lite'

const MODEL_MAX_TOKENS: Record<VertexModel, number> = {
  'gemini-3.7-flash': 65536,
  'gemini-3.1-pro-preview': 32768,
  'gemini-3.5-flash-lite': 32768,
}

const SAFETY_SETTINGS = [
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_NONE',
  },
]

function buildVertexEndpoint(model: string, apiKey: string): string {
  return `${VERTEX_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
}

function getSafeMaxTokens(model: string, maxOutputTokens: number): number {
  return Math.min(maxOutputTokens, MODEL_MAX_TOKENS[model as VertexModel] || 32768)
}

function extractVertexContent(data: unknown): string {
  const parts =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { candidates?: unknown[] }).candidates) &&
    (data as { candidates: Array<{ content?: { parts?: unknown[] } }> }).candidates[0]?.content
      ?.parts

  if (Array.isArray(parts)) {
    const text = parts
      .map((part) =>
        typeof part === 'object' &&
        part !== null &&
        typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : ''
      )
      .join('')
      .trim()

    if (text.length > 0) {
      return text
    }
  }

  throw new AiProviderError({
    provider: 'vertex',
    message: 'Réponse Vertex AI invalide: contenu vide ou absent (candidates[0].content.parts).',
    isTransient: true,
  })
}

async function parseErrorMessage(response: Response): Promise<string> {
  const errorData = await response.json().catch(() => ({}))
  return (
    (errorData as { error?: { message?: string } }).error?.message ||
    (errorData as { message?: string }).message ||
    response.statusText
  )
}

async function generateVertexContent(input: {
  content: string
  apiKey: string
  systemPrompt: string
  maxOutputTokens: number
  model: string
  requestOptions: RequestControlOptions
  generationOptions?: { temperature?: number }
  jsonMode: boolean
}): Promise<string> {
  if (!input.apiKey) {
    throw new Error("La clé API Vertex AI n'est pas configurée.")
  }
  if (!input.content.trim()) {
    throw new Error(input.jsonMode ? 'Le contenu est vide.' : 'Le contenu des thèmes est vide.')
  }

  const requestControl = createRequestControlContext(input.requestOptions)
  const safeMaxTokens = getSafeMaxTokens(input.model, input.maxOutputTokens)
  const endpoint = buildVertexEndpoint(input.model, input.apiKey)

  try {
    const data = await executeWithRetry(
      async () => {
        logger.debug(`Calling Vertex AI with model: ${input.model}`)
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: input.content }] }],
            systemInstruction: {
              role: 'system',
              parts: [{ text: input.systemPrompt }],
            },
            generationConfig: {
              temperature: input.generationOptions?.temperature ?? 0.7,
              topP: 1,
              topK: 1,
              maxOutputTokens: safeMaxTokens,
              ...(input.jsonMode ? { responseMimeType: 'application/json' } : {}),
            },
            safetySettings: SAFETY_SETTINGS,
          }),
        })

        if (!response.ok) {
          throw createHttpProviderError({
            provider: 'vertex',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: await parseErrorMessage(response),
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: 'Erreur Vertex AI',
          })
        }

        return response.json()
      },
      { signal: requestControl.signal, ...input.requestOptions.retryPolicy }
    )
    return extractVertexContent(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Vertex AI a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
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
          provider: 'vertex',
          message:
            "Impossible de se connecter à l'API Vertex AI. Vérifiez votre connexion internet.",
          isTransient: true,
          cause: error,
        })
      }
      throw error
    }
    throw new Error('Une erreur inconnue est survenue avec Vertex AI.')
  } finally {
    requestControl.cleanup()
  }
}

export async function generateVertexSummary(
  themesContent: string,
  apiKey: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  model: string = 'gemini-3.7-flash',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  return generateVertexContent({
    content: themesContent,
    apiKey,
    systemPrompt: customPrompt || DEFAULT_SYSTEM_PROMPT,
    maxOutputTokens,
    model,
    requestOptions,
    generationOptions,
    jsonMode: false,
  })
}

export async function generateVertexJSON(
  content: string,
  apiKey: string,
  systemPrompt: string,
  maxOutputTokens: number = 16384,
  model: string = 'gemini-3.7-flash',
  requestOptions: RequestControlOptions = {},
  generationOptions?: { temperature?: number }
): Promise<string> {
  return generateVertexContent({
    content,
    apiKey,
    systemPrompt,
    maxOutputTokens,
    model,
    requestOptions,
    generationOptions,
    jsonMode: true,
  })
}
