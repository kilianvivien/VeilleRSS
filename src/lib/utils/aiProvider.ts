import type { AiProvider, Settings } from '@/types/settings'
import { DEFAULT_GEMINI_MODEL } from '@/lib/ai/constants'

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
    case 'vertex':
      return !!settings.vertexApiKey
    case 'mistral':
      return !!settings.mistralApiKey
    case 'openrouter':
      return !!settings.openrouterApiKey
    case 'cliproxy':
      return !!settings.cliProxyApiKey && !!settings.cliProxyBaseUrl && !!settings.cliProxyModel
    case 'nvidia':
      return !!settings.nvidiaApiKey
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
    case 'vertex':
      return 'Vertex AI'
    case 'mistral':
      return 'Mistral'
    case 'openrouter':
      return 'OpenRouter'
    case 'cliproxy':
      return 'CLIProxyAPI'
    case 'nvidia':
      return 'NVIDIA'
    case 'albert':
      return 'Albert'
    case 'local':
      return 'IA Locale'
    case 'heuristic':
      return 'Sans IA'
  }
}

/**
 * Get human-readable model name for the current provider configuration
 * @param provider - Provider identifier
 * @param settings - Settings object containing model selections
 * @returns Short, readable model name
 */
export function getModelLabel(provider: AiProvider, settings: Settings): string {
  switch (provider) {
    case 'gemini': {
      const model = settings.geminiModel || DEFAULT_GEMINI_MODEL
      if (model === 'gemini-3.7-flash') return '3.7 Flash'
      if (model === 'gemini-3.5-flash-lite') return '3.5 Flash Lite'
      if (model === 'gemini-3.1-pro-preview') return '3.1 Pro'
      return model
    }
    case 'vertex': {
      const model = settings.vertexModel || DEFAULT_GEMINI_MODEL
      if (model === 'gemini-3.7-flash') return '3.7 Flash'
      if (model === 'gemini-3.1-pro-preview') return '3.1 Pro'
      if (model === 'gemini-3.5-flash-lite') return '3.5 Flash Lite'
      return model
    }
    case 'mistral': {
      const model = settings.mistralModel || 'mistral-medium-latest'
      if (model === 'mistral-small-latest') return 'Small'
      if (model === 'mistral-medium-latest') return 'Medium'
      if (model === 'mistral-large-latest') return 'Large'
      return model
    }
    case 'openrouter': {
      const model = settings.openrouterModel || 'openai/gpt-oss-120b:free'
      if (model === 'openai/gpt-oss-120b:free') return 'GPT-OSS'
      if (model === 'nvidia/nemotron-3-super-120b-a12b:free') return 'Nemotron 120B'
      if (model === 'deepseek/deepseek-v4-flash-0731') return 'DeepSeek V4 Flash 0731'
      if (model === 'google/gemma-4-31b-it:free') return 'Gemma 4 31B'
      if (model === 'openai/gpt-5.6-luna') return 'GPT-5.6 Luna'
      if (model === 'moonshotai/kimi-k3') return 'Kimi K3'
      if (model === 'minimax/minimax-m3') return 'MiniMax M3'
      if (model === 'z-ai/glm-5.2') return 'GLM 5.2'
      if (model === 'anthropic/claude-haiku-4.5') return 'Claude Haiku'
      if (model === 'anthropic/claude-sonnet-5') return 'Claude Sonnet 5'
      if (model === 'mistralai/mistral-large-2512') return 'Mistral Large'
      return model
    }
    case 'cliproxy':
      return settings.cliProxyModel || 'Non configuré'
    case 'nvidia': {
      const model = settings.nvidiaModel || 'deepseek-ai/deepseek-v4-flash'
      if (model === 'deepseek-ai/deepseek-v4-flash') return 'DeepSeek V4 Flash'
      if (model === 'moonshotai/kimi-k2.6') return 'Kimi K2.6'
      if (model === 'z-ai/glm-5.2') return 'GLM 5.2'
      if (model === 'minimaxai/minimax-m3') return 'MiniMax M3'
      return model
    }
    case 'albert': {
      const model = settings.albertModel || 'albert-large'
      if (model === 'albert-large') return 'Large'
      if (model === 'albert-small') return 'Small'
      return model
    }
    case 'local':
      return 'Local'
    case 'heuristic':
      return 'Heuristique'
  }
}
