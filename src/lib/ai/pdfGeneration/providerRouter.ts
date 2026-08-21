/**
 * AI Provider Router — version web autonome.
 *
 * Adapté de DiploRevue : le fournisseur « heuristic » (analyse sans IA de la
 * Revue Magique) n'existe pas ici, car l'outil de veille n'utilise le routeur
 * que pour l'affinage des tendances et le briefing, qui exigent un vrai
 * fournisseur IA (l'interface bloque déjà « heuristic » en amont).
 */

import type { AiProvider } from '@/types/settings'
import { useSettingsStore } from '@/stores/settingsStore'
import { createLogger } from '@/lib/utils/logger'
import { getLocalAiTimeoutMs } from '@/lib/ai/localAiTimeout'
import { resolveActiveLocalModel } from '@/lib/ai/localModelResolver'
import { isAiProviderError } from '@/lib/ai/aiProviderError'
import { getConfiguredFallbackProviders, getEffectiveModel } from '@/lib/ai/providerRegistry'
import {
  assertProviderAvailable,
  recordProviderFailure,
  recordProviderSuccess,
} from '@/lib/ai/providerCooldown'

const logger = createLogger('ai:provider-router')

interface GenerateWithProviderOptions {
  enableGeminiFallback?: boolean
}

function isGeminiFallbackError(error: unknown): boolean {
  if (isAiProviderError(error)) {
    return error.provider === 'gemini' && (error.status === 401 || error.status === 403)
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('safety') ||
    message.includes('filtres de sécurité') ||
    message.includes('403') ||
    message.includes('401') ||
    message.includes('api key') ||
    message.includes('clé api') ||
    message.includes('gemini a refusé')
  )
}

function isGeminiSafetyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('safety') || message.includes('filtres de sécurité')
}

/**
 * Generate with specified provider
 */
export async function generateWithProvider(
  provider: AiProvider,
  systemPrompt: string,
  text: string,
  onProgress: (update: string) => void,
  signal: AbortSignal,
  options: GenerateWithProviderOptions = {}
): Promise<string> {
  // Repeated transient failures put a provider on a short cooldown:
  // fail fast with one clear French message instead of N identical errors.
  assertProviderAvailable(provider)

  try {
    const result = await dispatchToProvider(provider, systemPrompt, text, onProgress, signal, options)
    recordProviderSuccess(provider)
    return result
  } catch (error) {
    if (isAiProviderError(error) && error.provider === provider && error.isTransient) {
      recordProviderFailure(provider)
    }
    throw error
  }
}

async function dispatchToProvider(
  provider: AiProvider,
  systemPrompt: string,
  text: string,
  onProgress: (update: string) => void,
  signal: AbortSignal,
  options: GenerateWithProviderOptions
): Promise<string> {
  const settings = useSettingsStore.getState()

  // Get max output tokens from settings (default to 16384)
  const maxOutputTokens = settings.aiMaxOutputTokens || 16384

  switch (provider) {
    case 'gemini': {
      if (!settings.geminiApiKey) {
        throw new Error(
          'Clé API Gemini non configurée. Veuillez la configurer dans Paramètres → IA.'
        )
      }

      try {
        const { generateGeminiJSON } = await import('../geminiService')
        const geminiModel = getEffectiveModel('gemini', settings)
        // Use JSON mode for structured output - guarantees valid JSON without markdown wrappers
        return await generateGeminiJSON(
          text,
          settings.geminiApiKey,
          systemPrompt,
          maxOutputTokens,
          geminiModel,
          { signal }
        )
      } catch (error) {
        const shouldUseConversionFallback =
          options.enableGeminiFallback && isGeminiFallbackError(error)
        const shouldUseLegacySafetyFallback = isGeminiSafetyError(error)

        if (shouldUseConversionFallback || shouldUseLegacySafetyFallback) {
          const fallbackProviders = shouldUseConversionFallback
            ? getConfiguredFallbackProviders(settings)
            : settings.mistralApiKey
              ? (['mistral'] as AiProvider[])
              : []
          if (fallbackProviders.length > 0) {
            logger.warn('Gemini error detected, attempting provider fallback')
            const fallbackProvider = fallbackProviders[0]
            onProgress(
              shouldUseConversionFallback
                ? `Basculement vers ${fallbackProvider} (Gemini a refusé la conversion)...`
                : `Basculement vers ${fallbackProvider} (Gemini a bloqué le contenu)...`
            )
            return generateWithProvider(fallbackProvider, systemPrompt, text, onProgress, signal, {
              enableGeminiFallback: false,
            })
          } else {
            if (!shouldUseConversionFallback) {
              throw error
            }

            logger.warn('No configured provider available for Gemini fallback')
            throw new Error(
              'Gemini a refusé la conversion. Vérifiez la clé API et les droits du modèle Gemini sélectionné, ou configurez un autre fournisseur IA.'
            )
          }
        }
        throw error
      }
    }

    case 'mistral': {
      if (!settings.mistralApiKey) {
        throw new Error(
          'Clé API Mistral non configurée. Veuillez la configurer dans Paramètres → IA.'
        )
      }
      const { generateMistralJSON } = await import('../mistralService')
      // Use JSON mode for structured output
      return generateMistralJSON(
        text,
        settings.mistralApiKey,
        systemPrompt,
        maxOutputTokens,
        getEffectiveModel('mistral', settings),
        { signal }
      )
    }

    case 'vertex': {
      if (!settings.vertexApiKey) {
        throw new Error(
          'Clé API Vertex AI non configurée. Veuillez la configurer dans Paramètres → IA.'
        )
      }
      const { generateVertexJSON } = await import('../vertexService')
      return generateVertexJSON(
        text,
        settings.vertexApiKey,
        systemPrompt,
        maxOutputTokens,
        getEffectiveModel('vertex', settings),
        { signal }
      )
    }

    case 'local': {
      if (!settings.localAiEndpoint) {
        throw new Error(
          'Endpoint Local AI non configuré. Veuillez le configurer dans Paramètres → IA.'
        )
      }
      const { generateLocalSummary } = await import('../localAiService')
      const localModel = await resolveActiveLocalModel(settings.localAiEndpoint, 'llama3')
      // Enable JSON enforcement mode for structured output
      return generateLocalSummary(
        text,
        settings.localAiEndpoint,
        systemPrompt,
        maxOutputTokens,
        true,
        { signal, timeoutMs: getLocalAiTimeoutMs(settings) },
        localModel
      )
    }

    case 'openrouter': {
      if (!settings.openrouterApiKey) {
        throw new Error(
          'Clé API OpenRouter non configurée. Veuillez la configurer dans Paramètres → IA.'
        )
      }
      const { generateOpenRouterJSON } = await import('../openrouterService')
      return generateOpenRouterJSON(
        text,
        settings.openrouterApiKey,
        systemPrompt,
        maxOutputTokens,
        getEffectiveModel('openrouter', settings),
        { signal }
      )
    }

    case 'cliproxy': {
      if (!settings.cliProxyApiKey) {
        throw new Error(
          "Clé d'accès CLIProxyAPI non configurée. Veuillez la configurer dans Paramètres → IA."
        )
      }
      if (!settings.cliProxyBaseUrl) {
        throw new Error(
          'Adresse CLIProxyAPI non configurée. Veuillez la configurer dans Paramètres → IA.'
        )
      }
      const { generateCliProxyJSON } = await import('../cliProxyService')
      return generateCliProxyJSON(
        text,
        settings.cliProxyApiKey,
        settings.cliProxyBaseUrl,
        systemPrompt,
        maxOutputTokens,
        getEffectiveModel('cliproxy', settings),
        { signal }
      )
    }

    case 'heuristic': {
      throw new Error(
        'Le mode heuristique n’est pas disponible dans l’outil de veille web : configurez un fournisseur IA.'
      )
    }

    case 'nvidia': {
      if (!settings.nvidiaApiKey) {
        throw new Error(
          'Clé API NVIDIA non configurée. Veuillez la configurer dans Paramètres → IA.'
        )
      }
      const { generateNvidiaJSON } = await import('../nvidiaService')
      return generateNvidiaJSON(
        text,
        settings.nvidiaApiKey,
        systemPrompt,
        maxOutputTokens,
        getEffectiveModel('nvidia', settings),
        { signal }
      )
    }

    case 'albert': {
      if (!settings.albertApiKey) {
        throw new Error(
          'Clé API Albert non configurée. Veuillez la configurer dans Paramètres → IA.'
        )
      }
      const { generateAlbertJSON } = await import('../albertService')
      return generateAlbertJSON(
        text,
        settings.albertApiKey,
        systemPrompt,
        maxOutputTokens,
        getEffectiveModel('albert', settings),
        { signal }
      )
    }

    default:
      throw new Error(`Fournisseur IA non supporté: ${provider}`)
  }
}
