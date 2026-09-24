import { AUTO_SAVE_DELAY } from './storageConstants'
import { defaultColorPalette } from './colorPresets'
import { DEFAULT_LOCAL_AI_TIMEOUT_SECONDS } from '@/lib/ai/localAiTimeout'
import { DEFAULT_APPLE_FM_BRIDGE_URL } from '@/lib/ai/appleFmService'
import { PROVIDER_REGISTRY } from '@/lib/ai/providerRegistry'
import type {
  ThemePresetName,
  FontFamily,
  GlobalLineSpacing,
  SectionLayoutStyle,
  HeaderLayout,
  ContentDensity,
} from '@/types/settings'

export const defaultSettings = {
  headerTitle: 'Revue de Presse',
  headerMotto: 'Ambassade de France en Turquie',
  headerLogo: null,
  footerDisclaimer: 'Cet document est confidentiel',
  theme: 'light' as const,
  onboardingCompleted: false, // Le tutoriel s'ouvre au premier lancement
  nativeNotificationsEnabled: true,
  notifyAiSuccess: true,
  notifyErrors: true,
  language: 'fr' as const,
  emailWidth: 'normal' as const, // Default email width (600px)
  autoSaveInterval: AUTO_SAVE_DELAY,
  fontSize: 'large' as const,
  coverImageSize: 'large' as const,
  fontSizeAdjustments: undefined, // Use defaults (all 0)
  lineHeightAdjustments: undefined, // Use defaults (all 0 = base line-heights)
  colorPalette: defaultColorPalette,
  // Layout & Appearance (Mise en page) defaults
  themePreset: 'diplomatique' as ThemePresetName,
  fontFamily: 'sans-serif' as FontFamily,
  globalLineSpacing: 'normal' as GlobalLineSpacing,
  sectionLayoutStyle: 'minimal' as SectionLayoutStyle,
  headerLayout: 'centered' as HeaderLayout,
  contentDensity: 'normal' as ContentDensity,
  // AI Configuration defaults
  aiProvider: undefined,
  summaryAiProvider: undefined, // Falls back to aiProvider
  magicReviewAiProvider: undefined, // Falls back to aiProvider
  magicReviewConversionAiProvider: 'heuristic' as const, // Default: local deterministic conversion
  rewriteAiProvider: undefined, // Falls back to aiProvider
  proofReportAiProvider: undefined, // Falls back to aiProvider
  translationAiProvider: undefined, // Falls back to aiProvider
  rssAiProvider: undefined, // Falls back to aiProvider
  geminiApiKey: undefined,
  vertexApiKey: undefined,
  mistralApiKey: undefined,
  openrouterApiKey: undefined,
  cliProxyApiKey: undefined,
  albertApiKey: undefined,
  localAiEndpoint: 'http://localhost:1234/v1/chat/completions',
  appleFmBridgeUrl: DEFAULT_APPLE_FM_BRIDGE_URL,
  cliProxyBaseUrl: 'http://127.0.0.1:8317/v1',
  aiSystemPrompt: undefined,
  // Advanced AI Settings defaults
  aiMaxOutputTokens: 16384, // Default max tokens (8192-32768)
  localAiTimeoutSeconds: DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
  // Shipped model defaults come from the provider registry (single source of truth)
  geminiModel: PROVIDER_REGISTRY.gemini.defaultModel,
  vertexModel: PROVIDER_REGISTRY.vertex.defaultModel,
  mistralModel: PROVIDER_REGISTRY.mistral.defaultModel,
  openrouterModel: PROVIDER_REGISTRY.openrouter.defaultModel,
  cliProxyModel: PROVIDER_REGISTRY.cliproxy.defaultModel,
  albertModel: PROVIDER_REGISTRY.albert.defaultModel,
  translationGeminiModel: undefined, // Falls back to geminiModel
  translationVertexModel: undefined, // Falls back to vertexModel
  translationMistralModel: undefined, // Falls back to mistralModel
  translationOpenrouterModel: undefined, // Falls back to openrouterModel
  translationCliProxyModel: undefined, // Falls back to cliProxyModel
  translationAlbertModel: undefined, // Falls back to albertModel
  translationLocalModel: undefined, // Falls back to local provider default model
  minThemesPerSection: 3, // Default minimum themes per section (1-6)
  // Magic Review defaults
  magicReviewDefaultMode: 'generation' as const, // Default mode for Magic Review
  conversionSystemPrompt: undefined, // Custom prompt for Conversion mode
  // Export
  exportFilenamePattern: '{date}-{template}', // Pattern for exported filenames
  // Desktop auto-update
  autoUpdateCheckEnabled: true, // Silent check for a new GitHub release at startup
  mcpAgent: {
    enabled: false,
    port: 41537,
    approvedClients: [],
  },
}
