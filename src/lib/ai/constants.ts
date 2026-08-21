import defaultSummarySystemPrompt from '../../../docs/prompt-en-bref-system.md?raw'
import defaultMagicReviewGenerationSystemPrompt from '../../../docs/prompts/magic-review-generation-system-prompt.md?raw'
import defaultMagicReviewConversionSystemPrompt from '../../../docs/prompts/magic-review-conversion-system-prompt.md?raw'

/**
 * Supported Gemini model IDs (Gemini API direct).
 * `gemini-3-pro-preview` was shut down by Google on 2026-03-09 — not supported.
 */
export type GeminiModelId = 'gemini-3.5-flash-lite' | 'gemini-3.7-flash' | 'gemini-3.1-pro-preview'

/**
 * Default Gemini model. `gemini-3.5-flash-lite` is cost-efficient and
 * latency-friendly for translation, editor assist and the bulk of Magic Review.
 * Users can switch to `gemini-3.1-pro-preview` from Settings for higher quality.
 */
export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-3.5-flash-lite'

/**
 * Default system prompt for AI-powered summary generation
 * This prompt guides the AI to create concise, journalistic summaries
 * for the "En bref" section of press reviews.
 */
export const DEFAULT_SYSTEM_PROMPT = defaultSummarySystemPrompt.trim()

/**
 * Generates the system prompt for PDF-to-Review generation with dynamic theme count
 * @param minThemes - Minimum number of themes per section (1-6, default: 3)
 * @returns The formatted system prompt with theme count embedded
 */
export function generatePDFSystemPrompt(minThemes: number = 3): string {
  const imageThemes = Math.max(1, minThemes - 1)
  const foreignThemes = minThemes
  const domesticThemes = minThemes

  const basePrompt = DEFAULT_PDF_SYSTEM_PROMPT

  // Dynamically inject theme counts into the prompt
  return basePrompt
    .replaceAll('{{MIN_THEMES}}', String(minThemes))
    .replaceAll('{{IMAGE_THEMES}}', String(imageThemes))
    .replaceAll('{{FOREIGN_THEMES}}', String(foreignThemes))
    .replaceAll('{{DOMESTIC_THEMES}}', String(domesticThemes))
}

/**
 * Legacy constant for backward compatibility
 */
export const DEFAULT_PDF_SYSTEM_PROMPT = defaultMagicReviewGenerationSystemPrompt.trim()

/**
 * Detail level configuration presets for PDF review generation
 * Each preset adjusts chunk size, output length expectations, and prompt modifiers
 */
export const DETAIL_LEVEL_CONFIGS = {
  concise: {
    name: 'Gros chunks (recommandé)',
    description: 'Grands segments = plus de contexte par analyse = détails substantiels',
    chunkSize: 20000,
    targetWords: '600-800 mots',
    promptModifier: `
**Gros Chunks (20k caractères par segment)** :
- 5 segments pour analyser 100k caractères de contenu
- Chaque segment a BEAUCOUP de contexte = analyses plus détaillées et cohérentes
- Génère 2-3 thèmes substantiels par section
- Priorité : profondeur analytique et fiabilité`,
  },
  standard: {
    name: 'Chunks moyens',
    description: 'Segments moyens = équilibre contexte/segmentation',
    chunkSize: 15000,
    targetWords: '900-1100 mots',
    promptModifier: `
**Chunks Moyens (15k caractères par segment)** :
- 7 segments pour analyser 100k caractères de contenu
- Équilibre entre contexte par segment et nombre de segments
- Génère 2-3 thèmes par section avec couverture équilibrée
- Bon compromis détail/segmentation`,
  },
  detailed: {
    name: 'Petits chunks',
    description: 'Petits segments = plus de segmentation, moins de contexte par segment',
    chunkSize: 10000,
    targetWords: '1200-1500 mots',
    promptModifier: `
**Petits Chunks (10k caractères par segment)** :
- 10 segments pour analyser 100k caractères de contenu
- Beaucoup de segmentation = moins de contexte par morceau
- Pour compenser, génère plus de thèmes par section (3-4 thèmes)
`,
  },
  fullInjection: {
    name: 'Complet (non recommandé)',
    description: 'Tout le contenu en une seule requête (pas de segmentation)',
    chunkSize: 1000000, // Effectively unlimited
    targetWords: 'Illimité',
    promptModifier: `
**Injection Complète (sans segmentation - NON RECOMMANDÉ)** :
- ⚠️ ATTENTION : Tout le contenu est injecté en une seule passe
- ⚠️ Non recommandé pour documents >50 000 caractères
- Risques : dépassement de contexte, réponses tronquées, timeouts API
- Avantages : pas de perte de contexte inter-segments (pour petits docs)
- Utilisez SEULEMENT pour documents <15k caractères
`,
  },
} as const

/**
 * Map phase prompt for extracting key information from text chunks
 * Used in Map-Reduce strategy for large documents
 * IMPORTANT: Removed "concise" to encourage detailed extraction
 */
export const MAP_PHASE_PROMPT = `À partir de l'extrait de presse suivant, extraire toutes les informations clés, détails importants, et citations directes concernant :

- La France ou les relations franco-turques.
- La politique étrangère turque (visites, déclarations, diplomatie).
- La politique intérieure turque (gouvernement/opposition, droits de l'homme, économie, questions sociales).
- Entités spécifiques : CHP, MHP, DEM, İYİ, AKP, Erdoğan, Özel, Bahçeli, İmamoğlu, etc.
- Thèmes régionaux : Gaza, Syrie, Irak, PKK, "FETÖ".

Présenter les points extraits de manière claire et **détaillée**, en conservant :
- Les citations exactes et leurs contextes
- Les noms de journaux et sources
- Tous les détails pertinents (dates, chiffres, déclarations exactes)

Cet extrait servira à construire une analyse approfondie et substantielle.`

/**
 * Generates the system prompt for Conversion mode (content-to-JSON without rewriting)
 * This mode preserves existing structure and original text verbatim
 * @param minThemes - Minimum number of themes per section if no structure exists (1-6, default: 3)
 * @returns The formatted system prompt for conversion mode
 */
export function generateConversionSystemPrompt(minThemes: number = 3): string {
  return defaultMagicReviewConversionSystemPrompt
    .trim()
    .replaceAll('{{MIN_THEMES}}', String(minThemes))
}
