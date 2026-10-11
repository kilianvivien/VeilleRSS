import { getLocalAiTimeoutMs } from './localAiTimeout'
import { getEffectiveProvider } from '@/lib/utils/aiProvider'
import { getEffectiveModel } from './providerRegistry'
import { createRequestControlContext, isAbortError, isRequestTimeoutError } from './requestControl'
import { createLogger } from '@/lib/utils/logger'
import { assertNever } from '@/lib/utils/assertNever'
import type { AiProvider, Settings } from '@/types/settings'
import { discoverLocalModels } from './localModelDiscovery'
import { SUPPORTED_LANGUAGES, type LanguageCode } from './languages'

/**
 * Chargeurs paresseux des services fournisseurs.
 *
 * Ces modules embarquent des SDK volumineux (`@google/genai` en tête) : les
 * importer statiquement mettait toute la pile IA dans le chunk d'entrée, alors
 * qu'une session ne sollicite jamais qu'un seul fournisseur — souvent aucun.
 * Le registre de modules ES mémoïse déjà l'import, inutile de cacher nous-mêmes.
 */
const loadGemini = () => import('./geminiService')
const loadMistral = () => import('./mistralService')
const loadOpenRouter = () => import('./openrouterService')
const loadApple = () => import('./appleFmService')
const loadAlbert = () => import('./albertService')
const loadLocalAi = () => import('./localAiService')

export type { AiProvider }
export type OpenRouterModel = Exclude<Settings['openrouterModel'], undefined>
export type AlbertModel = Exclude<Settings['albertModel'], undefined>

const logger = createLogger('ai:translation')
export const TRANSLATE_GEMMA_UNSUPPORTED_MESSAGE =
  "TranslateGemma n'est pas pris en charge pour le moment en mode IA locale. Utilisez un modèle Gemma Instruct standard (ex: gemma-2-9b-it, gemma-3-12b-it)."
export const SIMPLE_TRANSLATION_TEXT_MAX_INPUT_CHARS = 8000
export const SIMPLE_TRANSLATION_VARIANTS_MAX_INPUT_CHARS = 4000

// Les langues vivent dans un module feuille pour que les composants qui ne
// veulent que la liste n'entraînent pas toute la pile IA. Ré-exportées ici
// pour compatibilité — les nouveaux imports doivent viser `./languages`.
export { SUPPORTED_LANGUAGES }
export type { LanguageCode }

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


function resolveProvider(settings: Settings): AiProvider {
  return getEffectiveProvider(settings.translationAiProvider, settings.aiProvider)
}

function resolveGeminiModel(settings: Settings): string {
  return getEffectiveModel('gemini', settings, 'translation')
}


function resolveMistralModel(settings: Settings): string {
  return getEffectiveModel('mistral', settings, 'translation')
}

function resolveOpenRouterModel(settings: Settings): string {
  return getEffectiveModel('openrouter', settings, 'translation')
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
    case 'mistral':
      return resolveMistralModel(settings)
    case 'openrouter':
      return resolveOpenRouterModel(settings)
    case 'apple':
      return 'system'
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
      return (await loadGemini()).generateGeminiSummary(
        payload,
        settings.geminiApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveGeminiModel(settings),
        { signal }
      )
    case 'mistral':
      if (!settings.mistralApiKey) throw new Error('Clé API Mistral manquante.')
      return (await loadMistral()).generateMistralSummary(
        payload,
        settings.mistralApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveMistralModel(settings),
        { signal }
      )
    case 'openrouter':
      if (!settings.openrouterApiKey) throw new Error('Clé API OpenRouter manquante.')
      return (await loadOpenRouter()).generateOpenRouterSummary(
        payload,
        settings.openrouterApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveOpenRouterModel(settings),
        { signal }
      )
    case 'apple':
      return (await loadApple()).generateAppleFmSummary(payload, systemPrompt, maxOutputTokens, {
        signal,
        timeoutMs: getLocalAiTimeoutMs(settings),
      }, settings.appleFmBridgeUrl)
    case 'albert':
      if (!settings.albertApiKey) throw new Error('Clé API Albert manquante.')
      return (await loadAlbert()).generateAlbertSummary(
        payload,
        settings.albertApiKey,
        systemPrompt,
        maxOutputTokens,
        resolveAlbertModel(settings),
        { signal }
      )
    case 'local':
      if (!settings.localAiEndpoint) throw new Error('Endpoint IA locale manquant.')
      return (await loadLocalAi()).generateLocalSummary(
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
