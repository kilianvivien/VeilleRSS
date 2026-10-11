import type { AiProvider, Settings } from '@/types/settings'
import { isProviderConfiguredInRegistry } from '@/lib/ai/providerRegistry'

/**
 * Get effective AI provider with fallback logic
 * @param featureProvider - Feature-specific provider (e.g., summaryAiProvider)
 * @param defaultProvider - Default provider from settings
 * @returns The effective provider to use
 */
export function getEffectiveProvider(
  featureProvider: AiProvider | undefined,
  defaultProvider: AiProvider | undefined
): AiProvider {
  return featureProvider || defaultProvider || 'gemini'
}

/**
 * Check if a provider has API key configured
 * @param provider - Provider to check
 * @param settings - Settings object containing API keys
 * @returns true if provider is configured, false otherwise
 */
export function isProviderConfigured(provider: AiProvider, settings: Settings): boolean {
  switch (provider) {
    case 'gemini':
      return !!settings.geminiApiKey
    case 'mistral':
      return !!settings.mistralApiKey
    case 'openrouter':
      return !!settings.openrouterApiKey
    case 'apple':
      return isProviderConfiguredInRegistry(provider, settings)
    case 'albert':
      return !!settings.albertApiKey
    case 'local':
      return !!settings.localAiEndpoint
    case 'heuristic':
      return true
  }
}

/**
 * Get human-readable provider name in French
 * @param provider - Provider identifier
 * @returns Localized provider name
 */
export function getProviderLabel(provider: AiProvider): string {
  switch (provider) {
    case 'gemini':
      return 'Gemini'
    case 'mistral':
      return 'Mistral'
    case 'openrouter':
      return 'OpenRouter'
    case 'apple':
      return 'Apple Foundation Models'
    case 'albert':
      return 'Albert'
    case 'local':
      return 'IA Locale'
    case 'heuristic':
      return 'Sans IA'
  }
}
