import type { AiProvider, Settings } from '@/types/settings'
import { isValidAppleFmBridgeUrl } from './appleFmService'

/**
 * Shipped source of truth for AI providers and their recommended models.
 * The remote catalog (`modelCatalog.ts`) can override `recommendedModels`
 * and `defaultModel` at runtime; a user-set model string in Settings always
 * wins. Model labels describe capability, never pricing or marketing tiers —
 * those rot faster than releases ship.
 */
export interface ModelOption {
  id: string
  label: string
  note?: string
}

export type ProviderTransport = 'gemini-sdk' | 'openai-chat' | 'local' | 'heuristic'

export interface ProviderDescriptor {
  id: AiProvider
  label: string
  transport: ProviderTransport
  requiresApiKey: boolean
  settingsApiKeyField?: keyof Settings
  settingsModelField?: keyof Settings
  /** Settings field holding the translation-specific model override. */
  translationModelField?: keyof Settings
  defaultModel?: string
  recommendedModels: ModelOption[]
  /**
   * Ordering used when falling back from a failed primary provider.
   * Lower runs first; `null` means the provider never participates
   * in automatic fallback (gemini is the primary, heuristic is opt-in).
   */
  fallbackPriority: number | null
}

export const PROVIDER_REGISTRY: Record<AiProvider, ProviderDescriptor> = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    transport: 'gemini-sdk',
    requiresApiKey: true,
    settingsApiKeyField: 'geminiApiKey',
    settingsModelField: 'geminiModel',
    translationModelField: 'translationGeminiModel',
    defaultModel: 'gemini-3.5-flash-lite',
    recommendedModels: [
      {
        id: 'gemini-3.5-flash-lite',
        label: 'Gemini 3.5 Flash Lite',
        note: 'Léger et rapide, optimisé coût et latence.',
      },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'Équilibre qualité et vitesse.' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: 'Orienté qualité maximale.' },
    ],
    fallbackPriority: null,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    transport: 'openai-chat',
    requiresApiKey: true,
    settingsApiKeyField: 'mistralApiKey',
    settingsModelField: 'mistralModel',
    translationModelField: 'translationMistralModel',
    defaultModel: 'mistral-medium-latest',
    recommendedModels: [
      {
        id: 'mistral-medium-latest',
        label: 'Mistral Medium',
        note: 'Équilibre performance et rapidité.',
      },
      {
        id: 'mistral-small-latest',
        label: 'Mistral Small',
        note: 'Rapide, adapté aux tâches simples.',
      },
      {
        id: 'mistral-large-latest',
        label: 'Mistral Large',
        note: 'Le plus capable pour les analyses complexes.',
      },
    ],
    fallbackPriority: 1,
  },
  vertex: {
    id: 'vertex',
    label: 'Vertex AI',
    transport: 'openai-chat',
    requiresApiKey: true,
    settingsApiKeyField: 'vertexApiKey',
    settingsModelField: 'vertexModel',
    translationModelField: 'translationVertexModel',
    defaultModel: 'gemini-3.5-flash-lite',
    recommendedModels: [
      {
        id: 'gemini-3.5-flash-lite',
        label: 'Gemini 3.5 Flash Lite',
        note: 'Léger et rapide, optimisé coût et latence.',
      },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'Équilibre qualité et vitesse.' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: 'Orienté qualité maximale.' },
    ],
    fallbackPriority: 2,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    transport: 'openai-chat',
    requiresApiKey: true,
    settingsApiKeyField: 'openrouterApiKey',
    settingsModelField: 'openrouterModel',
    translationModelField: 'translationOpenrouterModel',
    defaultModel: 'openai/gpt-oss-120b:free',
    recommendedModels: [
      {
        id: 'openai/gpt-oss-120b:free',
        label: 'GPT-OSS 120B',
        note: 'Grand modèle open-source, solide en analyse.',
      },
      {
        id: 'nvidia/nemotron-3-super-120b-a12b:free',
        label: 'Nemotron Super 120B',
        note: 'Performant pour le raisonnement.',
      },
      {
        id: 'deepseek/deepseek-v4-flash-0731',
        label: 'DeepSeek V4 Flash 0731',
        note: 'Rapide et efficace.',
      },
      {
        id: 'google/gemma-4-31b-it:free',
        label: 'Gemma 4 31B Instruct',
        note: 'Solide pour traduction et rédaction.',
      },
      { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'Compact et performant.' },
      {
        id: 'moonshotai/kimi-k3',
        label: 'Kimi K3',
        note: 'Multimodal et raisonnement, très long contexte.',
      },
      {
        id: 'minimax/minimax-m3',
        label: 'MiniMax M3',
        note: 'Économique, orienté agents et long contexte.',
      },
      {
        id: 'z-ai/glm-5.2',
        label: 'GLM 5.2',
        note: 'Agentique et long contexte, solide en analyse.',
      },
      {
        id: 'anthropic/claude-haiku-4.5',
        label: 'Claude Haiku 4.5',
        note: 'Rapide, faible latence.',
      },
      {
        id: 'anthropic/claude-sonnet-5',
        label: 'Claude Sonnet 5',
        note: 'Compréhension et raisonnement robustes.',
      },
      {
        id: 'mistralai/mistral-large-2512',
        label: 'Mistral Large',
        note: 'Modèle phare de Mistral AI.',
      },
    ],
    fallbackPriority: 3,
  },
  cliproxy: {
    id: 'cliproxy',
    label: 'CLIProxyAPI',
    transport: 'openai-chat',
    requiresApiKey: true,
    settingsApiKeyField: 'cliProxyApiKey',
    settingsModelField: 'cliProxyModel',
    translationModelField: 'translationCliProxyModel',
    defaultModel: '',
    recommendedModels: [],
    fallbackPriority: 4,
  },
  apple: {
    id: 'apple',
    label: 'Apple Foundation Models',
    transport: 'local',
    requiresApiKey: false,
    defaultModel: 'system',
    recommendedModels: [{ id: 'system', label: 'Modèle embarqué sur le Mac' }],
    fallbackPriority: null,
  },
  albert: {
    id: 'albert',
    label: 'Albert',
    transport: 'openai-chat',
    requiresApiKey: true,
    settingsApiKeyField: 'albertApiKey',
    settingsModelField: 'albertModel',
    translationModelField: 'translationAlbertModel',
    defaultModel: 'albert-large',
    recommendedModels: [
      {
        id: 'albert-large',
        label: 'Albert Large',
        note: 'Modèle généraliste le plus capable, souverain (Etalab).',
      },
      {
        id: 'albert-small',
        label: 'Albert Small',
        note: 'Plus léger et rapide, optimisé coût et latence.',
      },
    ],
    fallbackPriority: 6,
  },
  local: {
    id: 'local',
    label: 'IA Locale',
    transport: 'local',
    requiresApiKey: false,
    settingsModelField: undefined,
    translationModelField: 'translationLocalModel',
    defaultModel: 'llama3',
    recommendedModels: [],
    fallbackPriority: 7,
  },
  heuristic: {
    id: 'heuristic',
    label: 'Sans IA',
    transport: 'heuristic',
    requiresApiKey: false,
    recommendedModels: [],
    fallbackPriority: null,
  },
}

/** Providers no longer offered for selection or automatic fallback. */
export const RETIRED_PROVIDERS: readonly string[] = ['vertex', 'cliproxy', 'nvidia']

/**
 * Fournisseurs proposés dans les paramètres sur mobile.
 *
 * Le panneau mobile n'a pas la place — ni l'usage — de tous les fournisseurs :
 * on garde ceux qui marchent depuis un téléphone (clé API, endpoint public).
 * Apple Foundation Models, Albert et l'IA locale restent accessibles sur bureau.
 */
export const MOBILE_VISIBLE_PROVIDERS: readonly AiProvider[] = ['gemini', 'mistral', 'openrouter']

// ─── Remote catalog injection (set by modelCatalog.ts, never imported here) ──

let catalogDefaultModels: Partial<Record<AiProvider, string>> = {}

/** Called by the model catalog after a valid catalog is loaded. */
export function setCatalogDefaultModels(defaults: Partial<Record<AiProvider, string>>): void {
  catalogDefaultModels = defaults
}

/** Test helper. */
export function resetCatalogDefaultModels(): void {
  catalogDefaultModels = {}
}

// ─── Resolution helpers ──────────────────────────────────────────────────────

export type ModelUsage = 'general' | 'translation'

function readSettingsString(settings: Settings, field: keyof Settings | undefined): string {
  if (!field) return ''
  const value = settings[field]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolves the model to use for a provider:
 * user-set value > remote catalog default > shipped default.
 * With `usage: 'translation'`, the translation-specific override wins
 * over the global user-set model.
 */
export function getEffectiveModel(
  provider: AiProvider,
  settings: Settings,
  usage: ModelUsage = 'general'
): string {
  const descriptor = PROVIDER_REGISTRY[provider]

  if (usage === 'translation') {
    const translationOverride = readSettingsString(settings, descriptor.translationModelField)
    if (translationOverride) {
      return translationOverride
    }
  }

  const userModel = readSettingsString(settings, descriptor.settingsModelField)
  if (userModel) {
    return userModel
  }

  return catalogDefaultModels[provider] || descriptor.defaultModel || ''
}

/** True when the provider has the credentials/endpoint it needs in Settings. */
export function isProviderConfiguredInRegistry(provider: AiProvider, settings: Settings): boolean {
  const descriptor = PROVIDER_REGISTRY[provider]
  if (descriptor.settingsApiKeyField) {
    const hasApiKey = Boolean(readSettingsString(settings, descriptor.settingsApiKeyField))
    if (provider === 'cliproxy') {
      return (
        hasApiKey &&
        Boolean(settings.cliProxyBaseUrl?.trim()) &&
        Boolean(getEffectiveModel(provider, settings))
      )
    }
    return hasApiKey
  }
  if (provider === 'local') {
    return Boolean(settings.localAiEndpoint?.trim())
  }
  if (provider === 'apple') {
    return isValidAppleFmBridgeUrl(settings.appleFmBridgeUrl)
  }
  return true
}

/**
 * Configured providers eligible for automatic fallback, in registry
 * priority order: mistral → openrouter → albert → local.
 */
export function getConfiguredFallbackProviders(settings: Settings): AiProvider[] {
  return (Object.values(PROVIDER_REGISTRY) as ProviderDescriptor[])
    .filter(
      (descriptor) =>
        descriptor.fallbackPriority !== null && !RETIRED_PROVIDERS.includes(descriptor.id)
    )
    .sort((a, b) => (a.fallbackPriority as number) - (b.fallbackPriority as number))
    .filter((descriptor) => isProviderConfiguredInRegistry(descriptor.id, settings))
    .map((descriptor) => descriptor.id)
}
