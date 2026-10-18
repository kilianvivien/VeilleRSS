import { DEFAULT_LOCAL_AI_TIMEOUT_SECONDS } from '@/lib/ai/localAiTimeout'
import { DEFAULT_APPLE_FM_BRIDGE_URL } from '@/lib/ai/appleFmService'
import { PROVIDER_REGISTRY } from '@/lib/ai/providerRegistry'
import type { Settings } from '@/types/settings'

export const defaultSettings = {
  theme: 'light' as const,
  accentColor: 'violet' as const,
  onboardingCompleted: false, // Le tutoriel s'ouvre au premier lancement
  // AI Configuration defaults
  aiProvider: undefined,
  translationAiProvider: undefined, // Falls back to aiProvider
  rssAiProvider: undefined, // Falls back to aiProvider
  geminiApiKey: undefined,
  mistralApiKey: undefined,
  openrouterApiKey: undefined,
  albertApiKey: undefined,
  localAiEndpoint: 'http://localhost:1234/v1/chat/completions',
  appleFmBridgeUrl: DEFAULT_APPLE_FM_BRIDGE_URL,
  // Advanced AI Settings defaults
  aiMaxOutputTokens: 16384, // Default max tokens (8192-32768)
  localAiTimeoutSeconds: DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
  // Shipped model defaults come from the provider registry (single source of truth)
  geminiModel: PROVIDER_REGISTRY.gemini.defaultModel,
  mistralModel: PROVIDER_REGISTRY.mistral.defaultModel,
  openrouterModel: PROVIDER_REGISTRY.openrouter.defaultModel,
  albertModel: PROVIDER_REGISTRY.albert.defaultModel,
  translationGeminiModel: undefined, // Falls back to geminiModel
  translationMistralModel: undefined, // Falls back to mistralModel
  translationOpenrouterModel: undefined, // Falls back to openrouterModel
  translationAlbertModel: undefined, // Falls back to albertModel
  translationLocalModel: undefined, // Falls back to local provider default model
} satisfies Record<keyof Settings, unknown>

/**
 * Liste fermée des réglages : la migration y réduit l'état persisté et la
 * restauration d'une sauvegarde n'accepte rien d'autre.
 */
export const SETTINGS_KEYS = Object.keys(defaultSettings) as Array<keyof Settings>

/** Réglages qui portent un secret : jamais écrits dans une sauvegarde. */
export const SECRET_SETTINGS_KEYS: ReadonlyArray<keyof Settings> = [
  'geminiApiKey',
  'mistralApiKey',
  'openrouterApiKey',
  'albertApiKey',
]
