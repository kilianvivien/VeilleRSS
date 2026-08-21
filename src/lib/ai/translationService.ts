import { generateGeminiSummary } from './geminiService'
import { generateGeminiJSON } from './geminiService'
import { generateVertexSummary } from './vertexService'
import { generateVertexJSON } from './vertexService'
import { generateMistralSummary } from './mistralService'
import { generateMistralJSON } from './mistralService'
import { generateOpenRouterSummary } from './openrouterService'
import { generateOpenRouterJSON } from './openrouterService'
import { generateCliProxyJSON, generateCliProxySummary } from './cliProxyService'
import { generateNvidiaSummary } from './nvidiaService'
import { generateNvidiaJSON } from './nvidiaService'
import { generateAlbertSummary } from './albertService'
import { generateAlbertJSON } from './albertService'
import { generateLocalSummary } from './localAiService'
import { getLocalAiTimeoutMs } from './localAiTimeout'
import { discoverLocalModels } from './localModelDiscovery'
import { getEffectiveProvider } from '@/lib/utils/aiProvider'
import { getEffectiveModel, PROVIDER_REGISTRY, type ModelOption } from './providerRegistry'
import { createRequestControlContext, isAbortError, isRequestTimeoutError } from './requestControl'
import { createLogger } from '@/lib/utils/logger'
import { assertNever } from '@/lib/utils/assertNever'
import type { AiProvider, Settings } from '@/types/settings'

export type { AiProvider }
export type GeminiModel = Exclude<Settings['geminiModel'], undefined>
export type VertexModel = Exclude<Settings['vertexModel'], undefined>
export type MistralModel = Exclude<Settings['mistralModel'], undefined>
export type OpenRouterModel = Exclude<Settings['openrouterModel'], undefined>
export type NvidiaModel = Exclude<Settings['nvidiaModel'], undefined>
export type AlbertModel = Exclude<Settings['albertModel'], undefined>

const logger = createLogger('ai:translation')
export const TRANSLATE_GEMMA_UNSUPPORTED_MESSAGE =
  "TranslateGemma n'est pas pris en charge pour le moment en mode IA locale. Utilisez un modèle Gemma Instruct standard (ex: gemma-2-9b-it, gemma-3-12b-it)."
export const SIMPLE_TRANSLATION_TEXT_MAX_INPUT_CHARS = 8000
export const SIMPLE_TRANSLATION_TEXT_WARNING_INPUT_CHARS = 6400
export const SIMPLE_TRANSLATION_VARIANTS_MAX_INPUT_CHARS = 4000
export const SIMPLE_TRANSLATION_VARIANTS_WARNING_INPUT_CHARS = 3200

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'tr', label: 'Turc' },
  { code: 'ru', label: 'Russe' },
  { code: 'ar', label: 'Arabe' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'zh', label: 'Chinois' },
  { code: 'ja', label: 'Japonais' },
  { code: 'pt', label: 'Portugais' },
  { code: 'hi', label: 'Hindi' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

export interface TranslateTextInput {
  sourceText: string
  sourceLanguage: LanguageCode | 'auto'
  targetLanguage: LanguageCode
  settings: Settings
  signal?: AbortSignal
}

export interface TranslateTextResult {
  translatedText: string
  translationNote?: string
  detectedSourceLanguage?: string
  provider: AiProvider
  modelLabel: string
}

export interface TranslationVariant {
  translation: string
  explanation: string
}

export interface TranslateVariantsInput {
  sourceText: string
  sourceLanguage: LanguageCode | 'auto'
  targetLanguage: LanguageCode
  settings: Settings
  maxVariants?: number
  signal?: AbortSignal
}

export interface TranslateVariantsResult {
  variants: TranslationVariant[]
  detectedSourceLanguage?: string
  provider: AiProvider
  modelLabel: string
}

// Curated model lists now live in the provider registry; these exports are
// kept as thin views so existing imports keep working.
function toLegacyOptions(models: ReadonlyArray<ModelOption>): ReadonlyArray<{
  value: string
  label: string
}> {
  return models.map((model) => ({ value: model.id, label: model.label }))
}

export const GEMINI_MODEL_OPTIONS = toLegacyOptions(PROVIDER_REGISTRY.gemini.recommendedModels)

export const VERTEX_MODEL_OPTIONS = toLegacyOptions(PROVIDER_REGISTRY.vertex.recommendedModels)

export const MISTRAL_MODEL_OPTIONS = toLegacyOptions(PROVIDER_REGISTRY.mistral.recommendedModels)

export const OPENROUTER_MODEL_OPTIONS = toLegacyOptions(
  PROVIDER_REGISTRY.openrouter.recommendedModels
)

export const NVIDIA_MODEL_OPTIONS = toLegacyOptions(PROVIDER_REGISTRY.nvidia.recommendedModels)

export const ALBERT_MODEL_OPTIONS = toLegacyOptions(PROVIDER_REGISTRY.albert.recommendedModels)

function resolveProvider(settings: Settings): AiProvider {
  return getEffectiveProvider(settings.translationAiProvider, settings.aiProvider)
}

function resolveGeminiModel(settings: Settings): string {
  return getEffectiveModel('gemini', settings, 'translation')
}

function resolveVertexModel(settings: Settings): string {
  return getEffectiveModel('vertex', settings, 'translation')
}

function resolveMistralModel(settings: Settings): string {
  return getEffectiveModel('mistral', settings, 'translation')
}

function resolveOpenRouterModel(settings: Settings): string {
  return getEffectiveModel('openrouter', settings, 'translation')
}

function resolveCliProxyModel(settings: Settings): string {
  return getEffectiveModel('cliproxy', settings, 'translation')
}

function resolveNvidiaModel(settings: Settings): string {
  return getEffectiveModel('nvidia', settings, 'translation')
}

function resolveAlbertModel(settings: Settings): string {
  return getEffectiveModel('albert', settings, 'translation')
}

function resolveLocalModel(settings: Settings): string {
  return getEffectiveModel('local', settings, 'translation')
}

export function isTranslateGemmaModel(model: string | null | undefined): boolean {
  if (!model) return false
  return model.toLowerCase().includes('translategemma')
}

export async function resolveLocalTranslationModel(settings: Settings): Promise<string> {
  const configuredModel = settings.translationLocalModel?.trim()
  const configuredModelIsDefault = configuredModel?.toLowerCase() === 'llama3'
  if (configuredModel && !configuredModelIsDefault) {
    return configuredModel
  }

  const endpoint = settings.localAiEndpoint?.trim()
  if (!endpoint) {
    return 'llama3'
  }

  try {
    const discoveredModels = await discoverLocalModels(endpoint)
    if (discoveredModels.length > 0) {
      const firstSupportedModel = discoveredModels.find((model) => !isTranslateGemmaModel(model))
      return firstSupportedModel || discoveredModels[0]
    }
  } catch (error) {
    logger.warn('Local model discovery failed, falling back to llama3', error)
  }

  return configuredModel || 'llama3'
}

export function getTranslationModel(provider: AiProvider, settings: Settings): string {
  switch (provider) {
    case 'gemini':
      return resolveGeminiModel(settings)
    case 'vertex':
      return resolveVertexModel(settings)
    case 'mistral':
      return resolveMistralModel(settings)
    case 'openrouter':
      return resolveOpenRouterModel(settings)
    case 'cliproxy':
      return resolveCliProxyModel(settings)
    case 'nvidia':
      return resolveNvidiaModel(settings)
    case 'albert':
      return resolveAlbertModel(settings)
    case 'local':
      return resolveLocalModel(settings)
    case 'heuristic':
      return 'Heuristique'
    default:
      return assertNever(provider, 'getTranslationModel')
  }
}

function getMaxOutputTokens(settings: Settings): number {
  return settings.aiMaxOutputTokens || 16384
}

function assertSimpleModeInputLength(sourceText: string, modeLabel: 'texte' | 'variantes'): void {
  const normalizedLength = sourceText.trim().length
  if (modeLabel === 'variantes') {
    if (normalizedLength <= SIMPLE_TRANSLATION_VARIANTS_MAX_INPUT_CHARS) {
      return
    }
    if (normalizedLength <= SIMPLE_TRANSLATION_TEXT_MAX_INPUT_CHARS) {
      throw new Error(
        `Le mode variantes est limité à ${SIMPLE_TRANSLATION_VARIANTS_MAX_INPUT_CHARS.toLocaleString('fr-FR')} caractères. Passez en mode Texte pour ce contenu.`
      )
    }
    throw new Error(
      `Le mode variantes est limité à ${SIMPLE_TRANSLATION_VARIANTS_MAX_INPUT_CHARS.toLocaleString('fr-FR')} caractères. Au-delà de ${SIMPLE_TRANSLATION_TEXT_MAX_INPUT_CHARS.toLocaleString('fr-FR')} caractères, utilisez l'onglet Document.`
    )
  }

  if (normalizedLength <= SIMPLE_TRANSLATION_TEXT_MAX_INPUT_CHARS) {
    return
  }

  throw new Error(
    `Le mode texte est limité à ${SIMPLE_TRANSLATION_TEXT_MAX_INPUT_CHARS.toLocaleString('fr-FR')} caractères. Utilisez l'onglet Document pour les textes longs.`
  )
}

async function generateTextWithProvider(
  provider: AiProvider,
  payload: string,
  systemPrompt: string,
  settings: Settings,
  signal?: AbortSignal,
  localModelOverride?: string
): Promise<string> {
  const maxOutputTokens = getMaxOutputTokens(settings)

  switch (provider) {
    case 'gemini':
      if (!settings.geminiApiKey) throw new Error('Clé API Gemini manquante.')
      return generateGeminiSummary(
        payload,
        settings.geminiApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveGeminiModel(settings),
        { signal }
      )
    case 'vertex':
      if (!settings.vertexApiKey) throw new Error('Clé API Vertex AI manquante.')
      return generateVertexSummary(
        payload,
        settings.vertexApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveVertexModel(settings),
        { signal }
      )
    case 'mistral':
      if (!settings.mistralApiKey) throw new Error('Clé API Mistral manquante.')
      return generateMistralSummary(
        payload,
        settings.mistralApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveMistralModel(settings),
        { signal }
      )
    case 'openrouter':
      if (!settings.openrouterApiKey) throw new Error('Clé API OpenRouter manquante.')
      return generateOpenRouterSummary(
        payload,
        settings.openrouterApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveOpenRouterModel(settings),
        { signal }
      )
    case 'cliproxy':
      if (!settings.cliProxyApiKey) throw new Error("Clé d'accès CLIProxyAPI manquante.")
      if (!settings.cliProxyBaseUrl) throw new Error('Adresse CLIProxyAPI manquante.')
      return generateCliProxySummary(
        payload,
        settings.cliProxyApiKey,
        settings.cliProxyBaseUrl,
        systemPrompt,
        maxOutputTokens,
        resolveCliProxyModel(settings),
        { signal }
      )
    case 'nvidia':
      if (!settings.nvidiaApiKey) throw new Error('Clé API NVIDIA manquante.')
      return generateNvidiaSummary(
        payload,
        settings.nvidiaApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveNvidiaModel(settings),
        { signal }
      )
    case 'albert':
      if (!settings.albertApiKey) throw new Error('Clé API Albert manquante.')
      return generateAlbertSummary(
        payload,
        settings.albertApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveAlbertModel(settings),
        { signal }
      )
    case 'local':
      if (!settings.localAiEndpoint) throw new Error('Endpoint IA locale manquant.')
      return generateLocalSummary(
        payload,
        settings.localAiEndpoint,
        systemPrompt,
        maxOutputTokens,
        false,
        { signal, timeoutMs: getLocalAiTimeoutMs(settings) },
        localModelOverride || resolveLocalModel(settings)
      )
    case 'heuristic':
      throw new Error("Le mode sans IA n'est pas disponible pour la traduction.")
    default:
      return assertNever(provider, 'generateTextWithProvider')
  }
}

async function generateJsonWithProvider(
  provider: AiProvider,
  payload: string,
  systemPrompt: string,
  settings: Settings,
  signal?: AbortSignal,
  localModelOverride?: string
): Promise<string> {
  const maxOutputTokens = getMaxOutputTokens(settings)

  switch (provider) {
    case 'gemini':
      if (!settings.geminiApiKey) throw new Error('Clé API Gemini manquante.')
      return generateGeminiJSON(
        payload,
        settings.geminiApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveGeminiModel(settings),
        { signal }
      )
    case 'vertex':
      if (!settings.vertexApiKey) throw new Error('Clé API Vertex AI manquante.')
      return generateVertexJSON(
        payload,
        settings.vertexApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveVertexModel(settings),
        { signal }
      )
    case 'mistral':
      if (!settings.mistralApiKey) throw new Error('Clé API Mistral manquante.')
      return generateMistralJSON(
        payload,
        settings.mistralApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveMistralModel(settings),
        { signal }
      )
    case 'openrouter':
      if (!settings.openrouterApiKey) throw new Error('Clé API OpenRouter manquante.')
      return generateOpenRouterJSON(
        payload,
        settings.openrouterApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveOpenRouterModel(settings),
        { signal }
      )
    case 'cliproxy':
      if (!settings.cliProxyApiKey) throw new Error("Clé d'accès CLIProxyAPI manquante.")
      if (!settings.cliProxyBaseUrl) throw new Error('Adresse CLIProxyAPI manquante.')
      return generateCliProxyJSON(
        payload,
        settings.cliProxyApiKey,
        settings.cliProxyBaseUrl,
        systemPrompt,
        maxOutputTokens,
        resolveCliProxyModel(settings),
        { signal }
      )
    case 'nvidia':
      if (!settings.nvidiaApiKey) throw new Error('Clé API NVIDIA manquante.')
      return generateNvidiaJSON(
        payload,
        settings.nvidiaApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveNvidiaModel(settings),
        { signal }
      )
    case 'albert':
      if (!settings.albertApiKey) throw new Error('Clé API Albert manquante.')
      return generateAlbertJSON(
        payload,
        settings.albertApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveAlbertModel(settings),
        { signal }
      )
    case 'local':
      if (!settings.localAiEndpoint) throw new Error('Endpoint IA locale manquant.')
      return generateLocalSummary(
        payload,
        settings.localAiEndpoint,
        systemPrompt,
        maxOutputTokens,
        true,
        { signal, timeoutMs: getLocalAiTimeoutMs(settings) },
        localModelOverride || resolveLocalModel(settings)
      )
    case 'heuristic':
      throw new Error("Le mode sans IA n'est pas disponible pour la traduction.")
    default:
      return assertNever(provider, 'generateJsonWithProvider')
  }
}

function stripCodeFences(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/gim, '')
    .replace(/```\s*$/gim, '')
    .trim()
}

function stripJsonComments(value: string): string {
  let output = ''
  let inString = false
  let escapeNext = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    const nextChar = value[i + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
        output += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (escapeNext) {
      output += char
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      output += char
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      output += char
      continue
    }

    if (!inString && char === '/' && nextChar === '/') {
      inLineComment = true
      i++
      continue
    }

    if (!inString && char === '/' && nextChar === '*') {
      inBlockComment = true
      i++
      continue
    }

    output += char
  }

  return output
}

function sanitizeVariantsJson(raw: string): string {
  const normalizedQuotes = stripCodeFences(raw).replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  const withoutComments = stripJsonComments(normalizedQuotes)
  return withoutComments.replace(/,(\s*[}\]])/g, '$1').trim()
}

function findCompleteJsonObject(raw: string): string | null {
  let depth = 0
  let start = -1
  let inString = false
  let escapeNext = false

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = i
      }
      depth++
      continue
    }

    if (char === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        return raw.slice(start, i + 1)
      }
    }
  }

  return null
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const sanitized = sanitizeVariantsJson(raw)
  const attempts: string[] = [sanitized]

  const completeJson = findCompleteJsonObject(sanitized)
  if (completeJson) {
    attempts.push(completeJson)
  }

  const firstBrace = sanitized.indexOf('{')
  const lastBrace = sanitized.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(sanitized.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>
    } catch {
      continue
    }
  }

  throw new Error(
    "Impossible d'interpréter la réponse des variantes. Réessayez avec un autre fournisseur."
  )
}

function parseVariants(
  raw: string,
  maxVariants: number
): {
  variants: TranslationVariant[]
  detectedSourceLanguage?: string
} {
  const parsed = parseJsonObject(raw)
  const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : []

  const normalizeVariantFields = (
    translationRaw: string,
    explanationRaw: string
  ): { translation: string; explanation: string } => {
    const stripMarkdownNoise = (value: string): string => {
      let next = value.trim()
      let previous = ''
      while (next !== previous) {
        previous = next
        next = next
          .replace(/^(\*\*|__|~~|`)\s*([\s\S]*?)\s*\1$/g, '$2')
          .replace(/^([*_])\s*([\s\S]*?)\s*\1$/g, '$2')
          .trim()
      }

      return next
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/__([^_\n]+)__/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .trim()
    }

    let translation = stripMarkdownNoise(translationRaw)
    let explanation = stripMarkdownNoise(explanationRaw)

    translation = translation.replace(/^(?:traduction|translation|option\s*\d+)\s*[:-]\s*/i, '')

    const explanationMarker =
      /(?:^|\n)\s*(?:explication|explanation|justification|rationale|note)\s*[:-]\s*/i
    const markerMatch = explanationMarker.exec(translation)
    if (markerMatch && markerMatch.index >= 0) {
      const markerStart = markerMatch.index
      const markerLength = markerMatch[0].length
      const extractedTranslation = translation.slice(0, markerStart).trim()
      const extractedExplanation = translation.slice(markerStart + markerLength).trim()
      if (extractedTranslation) {
        translation = extractedTranslation
      }
      if (!explanation && extractedExplanation) {
        explanation = extractedExplanation
      }
    }

    translation = stripMarkdownNoise(translation.replace(/^["']+|["']+$/g, '').trim())
    explanation = stripMarkdownNoise(explanation.replace(/^["']+|["']+$/g, '').trim())

    return { translation, explanation }
  }

  const extractPreferredText = (value: unknown, depth: number = 0): string => {
    if (depth > 5 || value === null || value === undefined) return ''

    if (typeof value === 'string') {
      return value.trim()
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const text = extractPreferredText(item, depth + 1)
        if (text) return text
      }
      return ''
    }

    if (typeof value !== 'object') {
      return ''
    }

    const record = value as Record<string, unknown>
    const preferredKeys = ['translation', 'text', 'enBref', 'content', 'summary', 'title', 'name']

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        const text = extractPreferredText(record[key], depth + 1)
        if (text) return text
      }
    }

    for (const entry of Object.values(record)) {
      const text = extractPreferredText(entry, depth + 1)
      if (text) return text
    }

    return ''
  }

  const variants: TranslationVariant[] = rawVariants
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as Record<string, unknown>
      const translation =
        typeof candidate.translation === 'string'
          ? candidate.translation.trim()
          : typeof candidate.text === 'string'
            ? candidate.text.trim()
            : extractPreferredText(candidate.translation)
      const explanation =
        typeof candidate.explanation === 'string'
          ? candidate.explanation.trim()
          : typeof candidate.rationale === 'string'
            ? candidate.rationale.trim()
            : typeof candidate.note === 'string'
              ? candidate.note.trim()
              : extractPreferredText(candidate.explanation)
      const normalized = normalizeVariantFields(translation, explanation)
      if (!normalized.translation) return null
      return {
        translation: normalized.translation,
        explanation: normalized.explanation || 'Alternative de formulation.',
      }
    })
    .filter((item): item is TranslationVariant => item !== null)
    .slice(0, maxVariants)

  if (variants.length === 0) {
    throw new Error('La génération des variantes a échoué. Réessayez ou désactivez Variantes.')
  }

  const detectedSourceLanguage =
    typeof parsed.detectedSourceLanguage === 'string'
      ? parsed.detectedSourceLanguage.toLowerCase()
      : undefined

  return { variants, detectedSourceLanguage }
}

function buildVariantsSystemPrompt(
  sourceLabel: string,
  targetLabel: string,
  sourceLanguage: LanguageCode | 'auto',
  maxVariants: number,
  strictRetry: boolean = false
): string {
  const prompt = [
    `Tu es un traducteur professionnel. Génère ${maxVariants} variantes de traduction du texte fourni de ${sourceLabel} vers ${targetLabel}.`,
    'Retourne strictement un JSON valide au format:',
    '{"detectedSourceLanguage":"xx","variants":[{"translation":"...","explanation":"..."}]}',
    'Règles strictes:',
    '- variants: tableau de 1 à 3 éléments, sans doublons.',
    '- translation: uniquement le texte traduit, sans préfixe ni explication.',
    '- explanation: justification courte (max 12 mots) pour chaque variante.',
    '- Préserve le formatage original autant que possible.',
    '- Ne retourne aucun texte hors JSON.',
    sourceLanguage === 'auto'
      ? '- Renseigne detectedSourceLanguage avec un code ISO 639-1 en minuscules.'
      : '- Renseigne detectedSourceLanguage avec la valeur fournie ou null.',
  ]

  if (strictRetry) {
    prompt.push(
      "IMPORTANT (REESSAI): Réponds avec un objet JSON unique, commence par '{' et termine par '}'.",
      '- Interdit: texte explicatif, markdown, commentaires, guillemets typographiques.'
    )
  }

  return prompt.join('\n')
}

function getLanguageLabel(code: LanguageCode | 'auto'): string {
  if (code === 'auto') return 'la langue source (détecte-la automatiquement)'
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code
}

function extractTrailingTranslationNote(rawText: string): {
  translatedText: string
  translationNote?: string
} {
  const normalizedText = rawText.trim()
  if (!normalizedText) {
    return { translatedText: normalizedText }
  }

  const notePattern =
    /(?:\n{2,}|\n)\s*(?:[*_`~>-]\s*)*\(?\s*(?:note|remarque)\s*[:：]\s*([\s\S]+?)\s*\)?\s*(?:[*_`~]+)?\s*$/i
  const match = notePattern.exec(normalizedText)
  if (!match || match.index <= 0) {
    return { translatedText: normalizedText }
  }

  const extractedTranslation = normalizedText.slice(0, match.index).trimEnd()
  let extractedNote = match[1].trim()

  extractedNote = extractedNote
    .replace(/\s*[*_`~]+\s*$/g, '')
    .replace(/^\(\s*|\s*\)$/g, '')
    .trim()

  if (!extractedTranslation || !extractedNote) {
    return { translatedText: normalizedText }
  }

  return {
    translatedText: extractedTranslation,
    translationNote: extractedNote,
  }
}

export async function translateText(input: TranslateTextInput): Promise<TranslateTextResult> {
  assertSimpleModeInputLength(input.sourceText, 'texte')

  const provider = resolveProvider(input.settings)
  const localModel =
    provider === 'local' ? await resolveLocalTranslationModel(input.settings) : undefined
  const translateGemmaDetected = provider === 'local' && isTranslateGemmaModel(localModel)

  if (translateGemmaDetected) {
    throw new Error(TRANSLATE_GEMMA_UNSUPPORTED_MESSAGE)
  }

  if (provider === 'local' && input.sourceLanguage === 'auto') {
    throw new Error(
      "La détection automatique de la langue est indisponible avec l'IA locale. Choisissez la langue source."
    )
  }

  const sourceLabel = getLanguageLabel(input.sourceLanguage)
  const targetLabel = getLanguageLabel(input.targetLanguage)

  const systemPrompt = [
    `Tu es un traducteur professionnel. Traduis le texte fourni de ${sourceLabel} vers ${targetLabel}.`,
    'Règles strictes:',
    '- Préserve le formatage original (paragraphes, listes, retours à la ligne).',
    '- Ne modifie pas les noms propres, sigles et acronymes sauf convention établie.',
    '- Retourne uniquement le texte traduit, sans commentaire, sans balises Markdown.',
    input.sourceLanguage === 'auto'
      ? '- Indique la langue source détectée sur la première ligne au format exact: [DETECTED:xx] (code ISO 639-1 en minuscules).'
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const ctx = createRequestControlContext({ signal: input.signal })
  try {
    const rawResult = await generateTextWithProvider(
      provider,
      input.sourceText,
      systemPrompt,
      input.settings,
      ctx.signal,
      localModel
    )

    let translatedText = rawResult.trim()
    let detectedSourceLanguage: string | undefined

    if (input.sourceLanguage === 'auto') {
      const match = translatedText.match(/^\[DETECTED:(\w+)\]\s*/i)
      if (match) {
        detectedSourceLanguage = match[1].toLowerCase()
        translatedText = translatedText.slice(match[0].length)
      }
    }

    const normalizedResult = extractTrailingTranslationNote(translatedText)
    translatedText = normalizedResult.translatedText

    if (!translatedText) {
      throw new Error(
        'La réponse IA est vide. Réessayez avec un autre fournisseur ou un texte plus court.'
      )
    }

    logger.info('Translation completed', {
      provider,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
    })

    return {
      translatedText,
      translationNote: normalizedResult.translationNote,
      detectedSourceLanguage,
      provider,
      modelLabel:
        provider === 'local' && localModel
          ? localModel
          : getTranslationModel(provider, input.settings),
    }
  } catch (error) {
    if (isAbortError(error) || isRequestTimeoutError(error, ctx.signal)) {
      throw error
    }
    logger.error('Translation failed', error)
    throw error
  } finally {
    ctx.cleanup()
  }
}

export async function translateTextVariants(
  input: TranslateVariantsInput
): Promise<TranslateVariantsResult> {
  assertSimpleModeInputLength(input.sourceText, 'variantes')

  const provider = resolveProvider(input.settings)
  const maxVariants = Math.max(1, Math.min(3, input.maxVariants || 3))
  const localModel =
    provider === 'local' ? await resolveLocalTranslationModel(input.settings) : undefined
  const translateGemmaDetected = provider === 'local' && isTranslateGemmaModel(localModel)

  if (translateGemmaDetected) {
    throw new Error(TRANSLATE_GEMMA_UNSUPPORTED_MESSAGE)
  }

  if (provider === 'local' && input.sourceLanguage === 'auto') {
    throw new Error(
      "La détection automatique de la langue est indisponible avec l'IA locale. Choisissez la langue source."
    )
  }

  const sourceLabel = getLanguageLabel(input.sourceLanguage)
  const targetLabel = getLanguageLabel(input.targetLanguage)

  const systemPrompt = buildVariantsSystemPrompt(
    sourceLabel,
    targetLabel,
    input.sourceLanguage,
    maxVariants
  )

  const ctx = createRequestControlContext({ signal: input.signal })
  try {
    const rawResult = await generateJsonWithProvider(
      provider,
      input.sourceText,
      systemPrompt,
      input.settings,
      ctx.signal,
      localModel
    )

    let parsed: {
      variants: TranslationVariant[]
      detectedSourceLanguage?: string
    }

    try {
      parsed = parseVariants(rawResult, maxVariants)
    } catch (parseError) {
      logger.warn('Variants JSON parsing failed, retrying once with stricter instructions', {
        provider,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      })
      const retryPrompt = buildVariantsSystemPrompt(
        sourceLabel,
        targetLabel,
        input.sourceLanguage,
        maxVariants,
        true
      )
      const retryRawResult = await generateJsonWithProvider(
        provider,
        input.sourceText,
        retryPrompt,
        input.settings,
        ctx.signal,
        localModel
      )
      parsed = parseVariants(retryRawResult, maxVariants)
    }

    logger.info('Translation variants completed', {
      provider,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      variants: parsed.variants.length,
    })

    return {
      variants: parsed.variants,
      detectedSourceLanguage: parsed.detectedSourceLanguage,
      provider,
      modelLabel:
        provider === 'local' && localModel
          ? localModel
          : getTranslationModel(provider, input.settings),
    }
  } catch (error) {
    if (isAbortError(error) || isRequestTimeoutError(error, ctx.signal)) {
      throw error
    }
    logger.error('Translation variants failed', error)
    throw error
  } finally {
    ctx.cleanup()
  }
}
