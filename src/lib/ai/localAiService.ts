import { DEFAULT_SYSTEM_PROMPT } from './constants'
import {
  createRequestControlContext,
  executeWithRetry,
  isAbortError,
  isRequestTimeoutError,
  type RequestControlOptions,
} from './requestControl'
import { AiProviderError, createHttpProviderError, isAiProviderError } from './aiProviderError'
import { localAiTimeoutSecondsToMs } from './localAiTimeout'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('ai:local')

export interface LocalChatMessagePart {
  type: string
  [key: string]: unknown
}

export interface LocalChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | LocalChatMessagePart[]
}

export interface LocalChatCompletionInput {
  endpoint: string
  model: string
  messages: LocalChatMessage[]
  maxOutputTokens?: number
  temperature?: number
  requestOptions?: RequestControlOptions
}

function extractLocalModelResponse(data: Record<string, unknown>): string {
  const ollamaContent =
    typeof data.message === 'object' &&
    data.message !== null &&
    typeof (data.message as { content?: unknown }).content === 'string'
      ? (data.message as { content: string }).content
      : null
  if (ollamaContent) {
    return ollamaContent
  }

  const choices = Array.isArray(data.choices) ? data.choices : []
  const firstChoice = choices[0]
  const openAiContent =
    typeof firstChoice === 'object' &&
    firstChoice !== null &&
    typeof (firstChoice as { message?: unknown }).message === 'object' &&
    (firstChoice as { message?: unknown }).message !== null &&
    typeof (firstChoice as { message: { content?: unknown } }).message.content === 'string'
      ? (firstChoice as { message: { content: string } }).message.content
      : null
  if (openAiContent) {
    return openAiContent
  }
  throw new Error("Format de réponse non reconnu de l'IA locale.")
}

export async function generateLocalChatCompletion(
  input: LocalChatCompletionInput
): Promise<string> {
  const {
    endpoint,
    model,
    messages,
    maxOutputTokens = 16384,
    temperature = 0.7,
    requestOptions = {},
  } = input

  if (!endpoint) {
    throw new Error("Le point de terminaison de l'IA locale n'est pas configuré.")
  }
  if (!model.trim()) {
    throw new Error("Le modèle IA locale n'est pas configuré.")
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Aucun message à envoyer à l'IA locale.")
  }

  const requestControl = createRequestControlContext({
    timeoutMs: localAiTimeoutSecondsToMs(undefined),
    ...requestOptions,
  })
  try {
    // Local servers fail fast: 2 attempts max so a dead Ollama doesn't feel frozen.
    const data = await executeWithRetry(
      async () => {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: requestControl.signal,
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxOutputTokens,
            stream: false,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const rawError = (errorData as { error?: unknown }).error
          const errorMessage =
            typeof rawError === 'string'
              ? rawError
              : typeof rawError === 'object' &&
                  rawError !== null &&
                  typeof (rawError as { message?: unknown }).message === 'string'
                ? (rawError as { message: string }).message
                : response.statusText
          throw createHttpProviderError({
            provider: 'local',
            status: response.status,
            responseStatusText: response.statusText,
            apiMessage: errorMessage,
            retryAfterHeader: response.headers.get('retry-after'),
            defaultPrefix: `Erreur IA Locale (${response.status})`,
          })
        }

        return (await response.json()) as Record<string, unknown>
      },
      { maxAttempts: 2, signal: requestControl.signal, ...requestOptions.retryPolicy }
    )
    return extractLocalModelResponse(data)
  } catch (error) {
    if (isRequestTimeoutError(error, requestControl.signal)) {
      throw new Error(
        `La requete Local AI a expire apres ${Math.round(requestControl.timeoutMs / 1000)} secondes. Veuillez reessayer.`
      )
    }
    if (isAbortError(error)) {
      throw error
    }
    if (isAiProviderError(error)) {
      throw error
    }
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch') || error.message.includes('Load failed')) {
        throw new AiProviderError({
          provider: 'local',
          isTransient: true,
          message:
            `Erreur CORS: Impossible de se connecter à l'IA locale à ${endpoint}. ` +
            `Assurez-vous que:\n` +
            `1. Le serveur LM Studio est démarré\n` +
            `2. CORS est activé dans les paramètres du serveur\n` +
            `3. L'URL est correcte (ex: http://localhost:1234/v1/chat/completions)`,
          cause: error,
        })
      }
    }
    if (error instanceof Error) {
      throw error
    }
    throw new Error("Une erreur inconnue est survenue avec l'IA locale.")
  } finally {
    requestControl.cleanup()
  }
}

/**
 * Génère un résumé "En bref" en utilisant une IA locale (Ollama/LM Studio).
 * @param themesContent - Contenu concaténé des thèmes de la revue
 * @param endpoint - URL du point de terminaison de l'IA locale
 * @param customPrompt - Instruction système optionnelle fournie par l'utilisateur
 * @param maxOutputTokens - Max output tokens (default: 16384)
 * @param enforceJSON - If true, adds strict JSON formatting instructions (default: false for HTML summaries)
 * @param requestOptions - Abort/timeout options
 * @param model - Local model name (default: llama3)
 * @returns Le résumé généré en HTML ou JSON
 */
export async function generateLocalSummary(
  themesContent: string,
  endpoint: string,
  customPrompt?: string,
  maxOutputTokens: number = 16384,
  enforceJSON: boolean = false,
  requestOptions: RequestControlOptions = {},
  model: string = 'llama3',
  generationOptions?: { temperature?: number }
): Promise<string> {
  if (!endpoint) {
    throw new Error("Le point de terminaison de l'IA locale n'est pas configuré.")
  }
  if (!themesContent.trim()) {
    throw new Error('Le contenu des thèmes est vide.')
  }

  // Utilise le prompt personnalisé ou, à défaut, celui par défaut
  let systemInstruction = customPrompt || DEFAULT_SYSTEM_PROMPT

  // If JSON mode is requested, prepend strict JSON enforcement instructions with examples
  if (enforceJSON) {
    systemInstruction = `YOU MUST RESPOND WITH VALID JSON ONLY. NO OTHER TEXT.

EXAMPLE OF CORRECT OUTPUT FORMAT:
{
  "date": "2025-12-13",
  "enBref": "Summary text here without HTML tags",
  "agenda": ["Point 1", "Point 2", "Point 3"],
  "image": null,
  "sections": [
    {
      "title": "Image de la France",
      "themes": [
        {
          "name": "Relations franco-turques",
          "content": "Plain text content here. According to Hurriyet, diplomatic talks continued. No HTML tags allowed.",
          "order": 0
        },
        {
          "name": "Cooperation economique",
          "content": "More plain text. According to Sabah, trade increased by 15 percent.",
          "order": 1
        }
      ],
      "order": 0
    },
    {
      "title": "Politique etrangere",
      "themes": [
        {
          "name": "Relations internationales",
          "content": "Plain text only. Sources must be cited.",
          "order": 0
        }
      ],
      "order": 1
    }
  ]
}

CRITICAL RULES:
1. Start with { and end with }
2. Use ONLY plain text in content fields (NO <p>, <strong>, <em>, <u> tags)
3. Use straight double quotes " for all strings
4. No trailing commas
5. No explanatory text before or after JSON
6. No markdown code blocks
7. Always include "image": null
8. Cite sources in plain text: "According to [newspaper], ..."

${systemInstruction}

REMINDER: Follow the example format exactly. Return ONLY valid JSON with plain text content.`

    logger.debug('Local AI JSON enforcement mode enabled')
  }

  // Note: LM Studio doesn't support response_format reliably for all models.
  // JSON reliability is enforced at prompt level when enforceJSON=true.
  return generateLocalChatCompletion({
    endpoint,
    model,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: themesContent },
    ],
    maxOutputTokens,
    temperature: generationOptions?.temperature ?? 0.7,
    requestOptions,
  })
}
