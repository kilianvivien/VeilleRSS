import {
  GoogleGenAI,
  ApiError,
  HarmBlockThreshold,
  HarmCategory,
  type SafetySetting,
} from '@google/genai'
import { DEFAULT_GEMINI_MODEL, DEFAULT_SYSTEM_PROMPT } from './constants'
import {
  createRequestControlContext,
  executeWithRetry,
  isAbortError,
  isRequestTimeoutError,
  type RequestControlOptions,
  type RetryPolicy,
} from './requestControl'
import { AiProviderError, isAiProviderError } from './aiProviderError'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('ai:gemini')

// Note: we deliberately omit HARM_CATEGORY_CIVIC_INTEGRITY — the @google/genai
// SDK lists it as deprecated ("Election filter is no longer supported").
const SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
]

const clientCache = new Map<string, GoogleGenAI>()

function getClient(apiKey: string): GoogleGenAI {
  let client = clientCache.get(apiKey)
  if (!client) {
    client = new GoogleGenAI({ apiKey })
    clientCache.set(apiKey, client)
  }
  return client
}

interface GeminiCallOptions {
  apiKey: string
  model: string
  systemInstruction: string
  userText: string
  temperature: number
  maxOutputTokens: number
  responseMimeType?: string
  responseSchema?: unknown
  signal: AbortSignal
  timeoutMs: number
  /** When true, use streaming and concatenate chunks. */
  stream: boolean
}

async function callGemini(opts: GeminiCallOptions): Promise<string> {
  const ai = getClient(opts.apiKey)
  const config = {
    systemInstruction: opts.systemInstruction,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    safetySettings: SAFETY_SETTINGS,
    abortSignal: opts.signal,
    httpOptions: { timeout: opts.timeoutMs },
    ...(opts.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}),
    ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
  }

  if (opts.stream) {
    const stream = await ai.models.generateContentStream({
      model: opts.model,
      contents: opts.userText,
      config,
    })
    const parts: string[] = []
    let finishReason: string | undefined
    let lastChunk: unknown
    for await (const chunk of stream) {
      lastChunk = chunk
      const text = chunk.text
      if (typeof text === 'string' && text.length > 0) {
        parts.push(text)
      }
      const reason = chunk.candidates?.[0]?.finishReason
      if (reason) finishReason = reason
    }
    logger.debug('Gemini stream finished', { finishReason, chunks: parts.length })
    const combined = parts.join('')
    if (!combined) {
      logger.warn('Gemini stream returned empty response', { lastChunk })
    }
    return combined
  }

  const response = await ai.models.generateContent({
    model: opts.model,
    contents: opts.userText,
    config,
  })
  const finishReason = response.candidates?.[0]?.finishReason
  logger.debug('Gemini response received', { finishReason })
  return response.text ?? ''
}

function classifyAndRethrow(error: unknown, jsonMode: boolean): never {
  if (isAbortError(error)) {
    throw error
  }
  if (isAiProviderError(error)) {
    throw error
  }

  if (error instanceof ApiError) {
    const status = error.status
    if (status === 429) {
      throw new AiProviderError({
        provider: 'gemini',
        status: 429,
        isRateLimit: true,
        isTransient: true,
        message:
          'Limite de requêtes Gemini atteinte. Patientez quelques instants ' +
          'avant de réessayer, ou ajustez votre forfait dans Google AI Studio.',
        cause: error,
      })
    }
    if (status === 401 || status === 403) {
      throw new AiProviderError({
        provider: 'gemini',
        status,
        isTransient: false,
        message:
          'Gemini a refusé la requête. Vérifiez la clé API, les droits du modèle ' +
          "sélectionné et l'accès au service dans Paramètres → Intelligence Artificielle.",
        cause: error,
      })
    }
    if (typeof status === 'number' && status >= 500) {
      throw new AiProviderError({
        provider: 'gemini',
        status,
        isTransient: true,
        message: `Le service Gemini est momentanément indisponible (HTTP ${status}). Veuillez réessayer.`,
        cause: error,
      })
    }
    const prefix = jsonMode ? 'Erreur Gemini API (JSON mode)' : 'Erreur Gemini API'
    throw new Error(`${prefix}: ${error.message}`)
  }

  if (error instanceof Error) {
    const prefix = jsonMode ? 'Erreur Gemini API (JSON mode)' : 'Erreur Gemini API'
    throw new Error(`${prefix}: ${error.message}`)
  }
  logger.error('Gemini API unknown error', error)
  throw new Error('Une erreur inconnue est survenue avec Gemini API.')
}

interface SharedExtras {
  generationOptions?: { temperature?: number }
  retryPolicy?: RetryPolicy
  /** Default true for both functions; callers can disable for short prompts. */
  stream?: boolean
}

/**
 * Génère un résumé "En bref" en utilisant l'API Gemini.
 */
export async function generateGeminiSummary(
  themesContent: string,
  apiKey: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  geminiModel: string = DEFAULT_GEMINI_MODEL,
  requestOptions: RequestControlOptions = {},
  generationOptions?: SharedExtras['generationOptions'],
  extras: { retryPolicy?: RetryPolicy; stream?: boolean } = {}
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API Gemini n'est pas configurée.")
  }
  if (!themesContent.trim()) {
    throw new Error('Le contenu des thèmes est vide.')
  }

  const systemInstruction = customPrompt || DEFAULT_SYSTEM_PROMPT
  const requestControl = createRequestControlContext(requestOptions)

  try {
    const text = await executeWithRetry(
      () =>
        callGemini({
          apiKey,
          model: geminiModel,
          systemInstruction,
          userText: themesContent,
          temperature: generationOptions?.temperature ?? 0.7,
          maxOutputTokens,
          signal: requestControl.signal,
          timeoutMs: requestControl.timeoutMs,
          stream: extras.stream ?? false,
        }),
      { signal: requestControl.signal, ...(extras.retryPolicy ?? requestOptions.retryPolicy) }
    )

    if (!text) {
      throw new Error(
        'La réponse a été bloquée par les filtres de sécurité de Gemini. ' +
          'Cela peut arriver avec certains sujets sensibles. Essayez de reformuler ' +
          'votre contenu ou utilisez un autre fournisseur IA (Mistral ou Local AI).'
      )
    }
    logger.debug('Response text length', text.length)
    return text
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Gemini a expire apres ${Math.round(
          requestControl.timeoutMs / 1000
        )} secondes. Veuillez reessayer.`
      )
    }
    classifyAndRethrow(error, false)
  } finally {
    requestControl.cleanup()
  }
}

/**
 * Génère du contenu structuré JSON en utilisant l'API Gemini avec JSON mode.
 * Si `responseSchema` est fourni, Gemini contraindra la sortie au schéma.
 */
export async function generateGeminiJSON(
  content: string,
  apiKey: string,
  systemPrompt: string,
  maxOutputTokens: number = 16384,
  geminiModel: string = DEFAULT_GEMINI_MODEL,
  requestOptions: RequestControlOptions = {},
  generationOptions?: SharedExtras['generationOptions'],
  extras: { retryPolicy?: RetryPolicy; responseSchema?: unknown; stream?: boolean } = {}
): Promise<string> {
  if (!apiKey) {
    throw new Error("La clé API Gemini n'est pas configurée.")
  }
  if (!content.trim()) {
    throw new Error('Le contenu est vide.')
  }

  const requestControl = createRequestControlContext(requestOptions)

  try {
    logger.debug(`Calling Gemini JSON mode with model: ${geminiModel}`)
    logger.debug('Input length', content.length)

    const text = await executeWithRetry(
      () =>
        callGemini({
          apiKey,
          model: geminiModel,
          systemInstruction: systemPrompt,
          userText: content,
          temperature: generationOptions?.temperature ?? 0.7,
          maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema: extras.responseSchema,
          signal: requestControl.signal,
          timeoutMs: requestControl.timeoutMs,
          stream: extras.stream ?? true,
        }),
      { signal: requestControl.signal, ...(extras.retryPolicy ?? requestOptions.retryPolicy) }
    )

    if (!text) {
      throw new Error(
        'La réponse a été bloquée par les filtres de sécurité de Gemini. ' +
          'Cela peut arriver avec certains sujets sensibles. Essayez de reformuler ' +
          'votre contenu ou utilisez un autre fournisseur IA (Mistral ou Local AI).'
      )
    }
    logger.debug('Response JSON length', text.length)
    return text
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Gemini a expire apres ${Math.round(
          requestControl.timeoutMs / 1000
        )} secondes. Veuillez reessayer.`
      )
    }
    classifyAndRethrow(error, true)
  } finally {
    requestControl.cleanup()
  }
}
