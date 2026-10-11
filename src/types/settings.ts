/** Central AI provider union — single source of truth */
export type AiProvider =
  | 'gemini'
  | 'mistral'
  | 'local'
  | 'openrouter'
  | 'apple'
  | 'albert'
  | 'heuristic'

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  /** Le tutoriel de démarrage a été vu (terminé ou passé). Rejouable depuis les paramètres. */
  onboardingCompleted?: boolean
  // AI Configuration
  aiProvider?: AiProvider
  translationAiProvider?: AiProvider // For Translation feature
  rssAiProvider?: AiProvider // For Veille presse (tri IA des tendances, Briefing IA)
  geminiApiKey?: string
  mistralApiKey?: string
  openrouterApiKey?: string
  albertApiKey?: string
  localAiEndpoint?: string
  appleFmBridgeUrl?: string // Loopback bridge to fm serve, including /v1/chat/completions
  // Advanced AI Settings
  aiMaxOutputTokens?: number // Max output tokens for AI responses (8192-32768, default: 16384)
  localAiTimeoutSeconds?: number // Local AI request timeout in seconds (60-900, default: 300)
  geminiModel?: string // Gemini model ID (recommended default still set in settings defaults)
  mistralModel?: string // Mistral model ID
  openrouterModel?: string // OpenRouter model ID
  albertModel?: string // Albert API model ID
  // Translation-specific model overrides (falls back to global model if undefined)
  translationGeminiModel?: string
  translationMistralModel?: string
  translationOpenrouterModel?: string
  translationAlbertModel?: string
  translationLocalModel?: string // Default handled by local provider service (e.g. llama3)
}
