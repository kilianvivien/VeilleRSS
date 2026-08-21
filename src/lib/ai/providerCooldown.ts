import type { AiProvider } from '@/types/settings'
import { getProviderLabel } from '@/lib/utils/aiProvider'
import { AiProviderError } from './aiProviderError'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('ai:provider-cooldown')

/** Consecutive transient failures before a provider is put on cooldown. */
const FAILURE_THRESHOLD = 3
/** How long a tripped provider stays unavailable. */
const COOLDOWN_MS = 2 * 60_000

interface CooldownEntry {
  consecutiveFailures: number
  cooldownUntil: number
}

// In-memory only by design: a restart clears all cooldowns.
const entries = new Map<AiProvider, CooldownEntry>()

function getEntry(provider: AiProvider): CooldownEntry {
  let entry = entries.get(provider)
  if (!entry) {
    entry = { consecutiveFailures: 0, cooldownUntil: 0 }
    entries.set(provider, entry)
  }
  return entry
}

/** Any successful call resets the provider's failure streak and cooldown. */
export function recordProviderSuccess(provider: AiProvider): void {
  entries.delete(provider)
}

/** Record a transient failure; trips the cooldown after FAILURE_THRESHOLD in a row. */
export function recordProviderFailure(provider: AiProvider, now: number = Date.now()): void {
  const entry = getEntry(provider)
  entry.consecutiveFailures += 1
  if (entry.consecutiveFailures >= FAILURE_THRESHOLD) {
    entry.cooldownUntil = now + COOLDOWN_MS
    logger.warn('Provider placed on cooldown after consecutive transient failures', {
      provider,
      consecutiveFailures: entry.consecutiveFailures,
      cooldownUntil: entry.cooldownUntil,
    })
  }
}

export function getProviderCooldownRemainingMs(
  provider: AiProvider,
  now: number = Date.now()
): number {
  const entry = entries.get(provider)
  if (!entry || entry.cooldownUntil <= now) {
    return 0
  }
  return entry.cooldownUntil - now
}

export function isProviderOnCooldown(provider: AiProvider, now: number = Date.now()): boolean {
  return getProviderCooldownRemainingMs(provider, now) > 0
}

/**
 * Throws a French AiProviderError if the provider is currently on cooldown.
 * Called by the provider router before dispatching a request.
 */
export function assertProviderAvailable(provider: AiProvider, now: number = Date.now()): void {
  const remainingMs = getProviderCooldownRemainingMs(provider, now)
  if (remainingMs <= 0) {
    return
  }
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
  throw new AiProviderError({
    provider,
    isTransient: false,
    message:
      `Le fournisseur ${getProviderLabel(provider)} a échoué plusieurs fois d'affilée — ` +
      `nouvel essai possible dans ${remainingSeconds} s.`,
  })
}

/** Test helper: clears all cooldown state. */
export function resetProviderCooldowns(): void {
  entries.clear()
}
