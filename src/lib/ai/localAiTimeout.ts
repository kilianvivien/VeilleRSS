export const DEFAULT_LOCAL_AI_TIMEOUT_SECONDS = 300
export const MIN_LOCAL_AI_TIMEOUT_SECONDS = 60
export const MAX_LOCAL_AI_TIMEOUT_SECONDS = 900

export function normalizeLocalAiTimeoutSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LOCAL_AI_TIMEOUT_SECONDS
  }

  const rounded = Math.round(value)
  return Math.min(MAX_LOCAL_AI_TIMEOUT_SECONDS, Math.max(MIN_LOCAL_AI_TIMEOUT_SECONDS, rounded))
}

export function localAiTimeoutSecondsToMs(value: unknown): number {
  return normalizeLocalAiTimeoutSeconds(value) * 1000
}

export function getLocalAiTimeoutMs(settings: { localAiTimeoutSeconds?: unknown }): number {
  return localAiTimeoutSecondsToMs(settings.localAiTimeoutSeconds)
}
