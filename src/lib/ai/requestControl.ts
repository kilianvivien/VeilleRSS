import { isAiProviderError } from './aiProviderError'

const DEFAULT_TIMEOUT_MS = 90_000

export class RequestTimeoutError extends Error {
  timeoutMs: number

  constructor(timeoutMs: number) {
    super(`La requete IA a depasse ${Math.round(timeoutMs / 1000)} secondes.`)
    this.name = 'RequestTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export interface RequestControlOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** Per-call override of the shared retry policy (e.g. health checks pass `{ maxAttempts: 1 }`). */
  retryPolicy?: RetryPolicy
}

export interface RequestControlContext {
  signal: AbortSignal
  timeoutMs: number
  cleanup: () => void
}

export function createRequestControlContext(
  options: RequestControlOptions = {}
): RequestControlContext {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const abortFromParent = () => {
    controller.abort(options.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
  }

  if (options.signal) {
    if (options.signal.aborted) {
      abortFromParent()
    } else {
      options.signal.addEventListener('abort', abortFromParent, { once: true })
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort(new RequestTimeoutError(timeoutMs))
    }, timeoutMs)
  }

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    options.signal?.removeEventListener('abort', abortFromParent)
  }

  return {
    signal: controller.signal,
    timeoutMs,
    cleanup,
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function isRequestTimeoutError(error: unknown, signal?: AbortSignal): boolean {
  if (error instanceof RequestTimeoutError) {
    return true
  }

  const reason = signal?.reason
  if (reason instanceof RequestTimeoutError) {
    return true
  }

  return false
}

/**
 * Shared retry policy for AI provider calls:
 * retry on transient errors (429 / 500 / 503 / 504, normalized
 * `AiProviderError.isTransient`); up to `maxAttempts` total attempts;
 * exponential backoff starting at `baseDelayMs`, capped at `maxDelayMs`,
 * with ±25% jitter to avoid thundering herd. A `retry-after` hint from the
 * provider (`AiProviderError.retryAfterMs`) takes precedence over the
 * computed backoff. Total time spent waiting is bounded by `maxTotalWaitMs`.
 * Aborts immediately on AbortError / RequestTimeoutError so user
 * cancellation is honored, including during a backoff wait when `signal`
 * is provided.
 */
export interface RetryPolicy {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Upper bound on cumulative backoff waiting across all attempts. */
  maxTotalWaitMs?: number
  retryableStatuses?: ReadonlyArray<number>
  /** Abort signal observed during backoff waits. */
  signal?: AbortSignal
  /** Hook for tests to skip the actual sleep. */
  sleep?: (ms: number) => Promise<void>
  /** Hook for tests to inject deterministic jitter (returns 0..1). */
  random?: () => number
}

const DEFAULT_RETRYABLE_STATUSES: ReadonlyArray<number> = [429, 500, 503, 504]
const DEFAULT_MAX_TOTAL_WAIT_MS = 60_000

function getStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = (error as { status?: unknown }).status
  return typeof candidate === 'number' ? candidate : undefined
}

export function isRetryableAiError(
  error: unknown,
  retryableStatuses: ReadonlyArray<number> = DEFAULT_RETRYABLE_STATUSES
): boolean {
  if (isAbortError(error) || isRequestTimeoutError(error)) {
    return false
  }
  // Normalized provider errors carry an explicit transience flag.
  if (isAiProviderError(error)) {
    return error.isTransient
  }
  const status = getStatus(error)
  if (status !== undefined) {
    return retryableStatuses.includes(status)
  }
  // Fallback: substring match in case the SDK wraps the error.
  if (error instanceof Error) {
    const msg = error.message
    if (
      retryableStatuses.some((s) => msg.includes(String(s))) ||
      /rate limit|quota|too many|temporarily unavailable|service unavailable|failed to fetch|load failed/i.test(
        msg
      )
    ) {
      return true
    }
  }
  return false
}

/**
 * Resolves after `ms`, or rejects immediately with the abort reason if the
 * signal fires (or is already aborted) so user cancellation interrupts a
 * backoff wait without delay.
 */
export async function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  }
  if (ms <= 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeoutId)
      cleanup()
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Execute `fn` with exponential backoff + jitter on retryable provider errors.
 * Throws the last error if attempts or the total wait budget are exhausted.
 */
export async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy = {}
): Promise<T> {
  const maxAttempts = policy.maxAttempts ?? 3
  const baseDelayMs = policy.baseDelayMs ?? 1000
  const maxDelayMs = policy.maxDelayMs ?? 30_000
  const maxTotalWaitMs = policy.maxTotalWaitMs ?? DEFAULT_MAX_TOTAL_WAIT_MS
  const retryableStatuses = policy.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES
  const sleep = policy.sleep ?? ((ms: number) => waitWithAbort(ms, policy.signal))
  const random = policy.random ?? Math.random

  let totalWaitMs = 0
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts || !isRetryableAiError(error, retryableStatuses)) {
        throw error
      }

      const retryAfterMs =
        isAiProviderError(error) && typeof error.retryAfterMs === 'number' && error.retryAfterMs > 0
          ? error.retryAfterMs
          : undefined

      let delay: number
      if (retryAfterMs !== undefined) {
        // Provider told us when to come back — trust it (capped).
        delay = Math.min(retryAfterMs, maxDelayMs)
      } else {
        const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
        // Jitter: ±25% of exp.
        const jitter = exp * 0.5 * (random() - 0.5) * 2
        delay = Math.max(0, Math.round(exp + jitter))
      }

      if (totalWaitMs + delay > maxTotalWaitMs) {
        throw error
      }
      totalWaitMs += delay
      await sleep(delay)
    }
  }
  throw lastError
}
