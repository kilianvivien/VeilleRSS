import defaultSummarySystemPrompt from '../../../docs/prompt-en-bref-system.md?raw'

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
