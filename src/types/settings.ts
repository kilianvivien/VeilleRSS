/** Central AI provider union — single source of truth */
export type AiProvider =
  | 'gemini'
  | 'vertex'
  | 'mistral'
  | 'local'
  | 'openrouter'
  | 'cliproxy'
  | 'apple'
  | 'albert'
  | 'heuristic'

// Theme preset names (7 options including Personnalisé)
export type ThemePresetName =
  | 'diplomatique'
  | 'moderne'
  | 'classique'
  | 'presse'
  | 'gouvernement'
  | 'mobile'
  | 'personnalise'

// Font family options (web-safe only)
export type FontFamily = 'system' | 'serif' | 'sans-serif'

// Global line spacing presets
export type GlobalLineSpacing = 'compact' | 'normal' | 'relaxed'

// Section layout styles
export type SectionLayoutStyle = 'boxed' | 'minimal' | 'bordered' | 'magazine'

// Header layout options
export type HeaderLayout = 'centered' | 'left-logo' | 'right-logo' | 'stacked' | 'minimal'

// Content density (spacing between themes/items)
export type ContentDensity = 'small' | 'normal' | 'large'

export interface ColorPalette {
  // Header colors
  headerPrimary: string // Main header background gradient start
  headerSecondary: string // Header background gradient end
  headerText: string // Header text color

  // Content colors
  primary: string // Section titles, main accents
  secondary: string // Subsection titles, links

  // Background colors
  background: string // Page background
  backgroundAlt: string // Alternate background for boxes

  // Text colors
  textPrimary: string // Main text
  textSecondary: string // Secondary text
  textMuted: string // Muted text, captions

  // Borders & dividers
  border: string // Main borders
  borderLight: string // Light borders

  // Accents
  accent: string // Theme boxes, highlights
}

/**
 * Individual font size adjustments per text category
 * Values range from -2 to +2 points relative to the base size preset
 */
export interface FontSizeAdjustments {
  headerTitle: number // -2 to +2
  headerMotto: number
  enBrefTitle: number
  enBrefContent: number
  sectionTitle: number
  themeName: number
  themeContent: number
  agendaTitle: number
  agendaItems: number
}

/**
 * Individual line-height adjustments per text category
 * Values range from -2 to +2 relative to the base line-height
 * Each step = 0.2 change in line-height
 */
export interface LineHeightAdjustments {
  headerTitle: number // Base 1.2, range 0.8-1.6
  headerMotto: number // Base 1.4, range 1.0-1.8
  enBrefTitle: number // Base 1.5, range 1.1-1.9
  enBrefContent: number // Base 1.7, range 1.3-2.1
  sectionTitle: number // Base 1.5, range 1.1-1.9
  themeName: number // Base 1.5, range 1.1-1.9
  themeContent: number // Base 1.6, range 1.2-2.0
  agendaTitle: number // Base 1.5, range 1.1-1.9
  agendaItems: number // Base 1.8, range 1.4-2.2
}

export interface Settings {
  headerTitle: string
  headerMotto: string
  headerLogo: string | null // Base64 encoded image or URL
  footerDisclaimer: string
  theme: 'light' | 'dark' | 'system'
  /** Le tutoriel de démarrage a été vu (terminé ou passé). Rejouable depuis les paramètres. */
  onboardingCompleted?: boolean
  nativeNotificationsEnabled: boolean
  notifyAiSuccess: boolean
  notifyErrors: boolean
  language: 'fr' | 'en'
  emailWidth?: 'normal' | 'large' | 'xlarge' // Email width preset (default: normal/600px)
  autoSaveInterval: number // milliseconds
  fontSize: 'small' | 'medium' | 'large' // Font size preset for reviews
  coverImageSize: 'small' | 'medium' | 'large' // Cover image size preset
  fontSizeAdjustments?: FontSizeAdjustments // Individual font size adjustments per text category
  lineHeightAdjustments?: LineHeightAdjustments // Individual line-height adjustments per text category
  colorPalette?: ColorPalette // Optional for backward compatibility
  // Layout & Appearance (Mise en page)
  themePreset?: ThemePresetName // Default: 'diplomatique'
  fontFamily?: FontFamily // Default: 'system'
  globalLineSpacing?: GlobalLineSpacing // Default: 'normal'
  sectionLayoutStyle?: SectionLayoutStyle // Default: 'boxed'
  headerLayout?: HeaderLayout // Default: 'centered'
  contentDensity?: ContentDensity // Default: 'normal'
  // AI Configuration
  aiProvider?: AiProvider
  summaryAiProvider?: AiProvider // For Editor "En Bref"
  magicReviewAiProvider?: AiProvider // For Revue Magique generation mode
  magicReviewConversionAiProvider?: AiProvider // For Revue Magique conversion mode
  rewriteAiProvider?: AiProvider // For inline AI rewrite
  proofReportAiProvider?: AiProvider // For "Rapport d'analyse"
  translationAiProvider?: AiProvider // For Translation feature
  rssAiProvider?: AiProvider // For Veille presse (tri IA des tendances, Briefing IA)
  geminiApiKey?: string
  vertexApiKey?: string
  mistralApiKey?: string
  openrouterApiKey?: string
  cliProxyApiKey?: string
  albertApiKey?: string
  localAiEndpoint?: string
  appleFmBridgeUrl?: string // Loopback bridge to fm serve, including /v1/chat/completions
  cliProxyBaseUrl?: string // CLIProxyAPI root or /v1 URL
  aiSystemPrompt?: string
  // Advanced AI Settings
  aiMaxOutputTokens?: number // Max output tokens for AI responses (8192-32768, default: 16384)
  localAiTimeoutSeconds?: number // Local AI request timeout in seconds (60-900, default: 300)
  geminiModel?: string // Gemini model ID (recommended default still set in settings defaults)
  vertexModel?: string // Vertex AI Gemini model ID
  mistralModel?: string // Mistral model ID
  openrouterModel?: string // OpenRouter model ID
  cliProxyModel?: string // Model ID exposed by CLIProxyAPI
  albertModel?: string // Albert API model ID
  // Translation-specific model overrides (falls back to global model if undefined)
  translationGeminiModel?: string
  translationVertexModel?: string
  translationMistralModel?: string
  translationOpenrouterModel?: string
  translationCliProxyModel?: string
  translationAlbertModel?: string
  translationLocalModel?: string // Default handled by local provider service (e.g. llama3)
  // PDF Review (Revue Magique IA) Configuration
  pdfReviewSystemPrompt?: string // Separate prompt for PDF-to-Review generation (takes precedence over aiSystemPrompt for Magic AI)
  reviewDetailLevel?: 'concise' | 'compact' | 'extended' | 'fullInjection' // Output verbosity level for PDF reviews (default: 'concise')
  minThemesPerSection?: number // Minimum number of themes per section for PDF reviews (1-6, default: 3)
  magicReviewDefaultMode?: 'generation' | 'conversion' // Default mode for Magic Review (default: 'generation')
  conversionSystemPrompt?: string // Custom prompt for Conversion mode (overrides default conversion prompt)
  // Onboarding
  hasSeenOnboarding?: boolean // Track if user has seen the onboarding screen
  // Desktop auto-update: silent check for a new GitHub release at startup (default: true)
  autoUpdateCheckEnabled?: boolean
  // Export
  exportFilenamePattern?: string // Pattern for exported filenames (default: '{date}-{template}')
  // Desktop-only inbound MCP agent integration. The bearer token is stored separately.
  mcpAgent?: {
    enabled: boolean
    port: number
    approvedClients: string[]
  }
}
