import type { AiProvider } from '@/types/settings'

/** @deprecated Use `AiProvider` from `@/types/settings` instead */
export type AiProviderId = AiProvider

export interface AiProviderErrorOptions {
  provider: AiProviderId
  message: string
  status?: number
  retryAfterMs?: number
  isRateLimit?: boolean
  isTransient?: boolean
  cause?: unknown
}

export class AiProviderError extends Error {
  provider: AiProviderId
  status?: number
  retryAfterMs?: number
  isRateLimit: boolean
  isTransient: boolean
  override cause?: unknown

  constructor(options: AiProviderErrorOptions) {
    super(options.message)
    this.name = 'AiProviderError'
    this.provider = options.provider
    this.status = options.status
    this.retryAfterMs = options.retryAfterMs
    this.isRateLimit = options.isRateLimit ?? options.status === 429
    this.isTransient =
      options.isTransient ??
      (this.isRateLimit || (typeof options.status === 'number' && options.status >= 500))
    this.cause = options.cause
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError
}

export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  const asSeconds = Number(normalized)
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000)
  }

  const asDate = Date.parse(normalized)
  if (!Number.isFinite(asDate)) {
    return undefined
  }

  const delta = asDate - Date.now()
  return delta > 0 ? delta : undefined
}

// ─── User-friendly error classification ───────────────────────────────────────

export type AiErrorCategory =
  | 'rate_limit'
  | 'auth'
  | 'model_unavailable'
  | 'server'
  | 'network'
  | 'other'

const MODEL_KEYWORD_PATTERN = /model|modèle|modele/i
const MODEL_FAILURE_PATTERN =
  /not found|unknown|invalid|does not exist|introuvable|inconnu|invalide|retiré|retire|deprecated|decommissioned/i

function looksLikeModelUnavailable(status: number | undefined, message: string): boolean {
  if (status === 404) return true
  if (status === 400) {
    return MODEL_KEYWORD_PATTERN.test(message) && MODEL_FAILURE_PATTERN.test(message)
  }
  return false
}

/**
 * Classify any thrown value into a broad, actionable category.
 * Prefers structured AiProviderError fields; falls back to message heuristics.
 */
export function classifyAiError(err: unknown): AiErrorCategory {
  if (isAiProviderError(err)) {
    if (err.isRateLimit) return 'rate_limit'
    if (err.status === 401 || err.status === 403) return 'auth'
    if (looksLikeModelUnavailable(err.status, err.message)) return 'model_unavailable'
    if (typeof err.status === 'number' && err.status >= 500) return 'server'
    if (err.isTransient) return 'network'
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  if (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('too many') ||
    msg.includes('limite de requêtes') ||
    msg.includes('trop de requêtes')
  )
    return 'rate_limit'
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('api key') ||
    msg.includes('clé api') ||
    msg.includes('invalide') ||
    msg.includes('révoquée')
  )
    return 'auth'
  if (msg.includes('404') || (MODEL_KEYWORD_PATTERN.test(msg) && MODEL_FAILURE_PATTERN.test(msg)))
    return 'model_unavailable'
  if (
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('indisponible')
  )
    return 'server'
  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('connexion') ||
    msg.includes('fetch') ||
    msg.includes('timeout')
  )
    return 'network'
  return 'other'
}

/**
 * Returns a non-technical French explanation for a classified error.
 * Returns an empty string for 'other' (caller should fall back to err.message).
 */
export function friendlyAiErrorMessage(category: AiErrorCategory, providerLabel?: string): string {
  const p = providerLabel ? ` ${providerLabel}` : ''
  switch (category) {
    case 'rate_limit':
      return `Le quota de requêtes${p} est dépassé. Attendez quelques minutes ou utilisez un autre fournisseur IA.`
    case 'auth':
      return `La clé API${p} est invalide ou expirée. Vérifiez vos paramètres ou utilisez un autre fournisseur.`
    case 'model_unavailable':
      return `Le modèle${p} sélectionné est indisponible ou a été retiré par le fournisseur. Vérifiez le modèle dans Paramètres → IA.`
    case 'server':
      return `Le service${p} est momentanément indisponible. Réessayez dans quelques instants ou changez de fournisseur.`
    case 'network':
      return `Impossible de joindre le service${p}. Vérifiez votre connexion internet ou changez de fournisseur.`
    default:
      return ''
  }
}

/**
 * Single mapper from any thrown value to a user-facing French message.
 * UI catch blocks should call this instead of rendering raw `error.message`.
 */
export function aiErrorToUserMessage(err: unknown, providerLabel?: string): string {
  if (isAiProviderError(err) && err.provider === 'apple') return err.message
  const category = classifyAiError(err)
  const friendly = friendlyAiErrorMessage(category, providerLabel)
  if (friendly) {
    return friendly
  }
  return err instanceof Error && err.message ? err.message : 'Une erreur inattendue est survenue.'
}

// ──────────────────────────────────────────────────────────────────────────────

export function createHttpProviderError(input: {
  provider: AiProviderId
  status: number
  responseStatusText?: string
  apiMessage?: string
  retryAfterHeader?: string | null
  defaultPrefix: string
}): AiProviderError {
  const statusText = input.apiMessage || input.responseStatusText || 'Erreur inconnue'
  return new AiProviderError({
    provider: input.provider,
    status: input.status,
    retryAfterMs: parseRetryAfterMs(input.retryAfterHeader),
    message: `${input.defaultPrefix}: ${statusText}`,
    isRateLimit: input.status === 429,
    isTransient: input.status === 429 || input.status >= 500,
  })
}
