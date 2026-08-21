import { discoverLocalModels } from './localModelDiscovery'

const CACHE_TTL_MS = 15000

interface CacheEntry {
  model: string | null
  expiresAt: number
}

const resolutionCache = new Map<string, CacheEntry>()
const inFlightResolutions = new Map<string, Promise<string | null>>()

export async function resolveActiveLocalModel(
  endpoint: string | undefined,
  fallbackModel: string = 'Local'
): Promise<string> {
  const normalizedEndpoint = endpoint?.trim()
  if (!normalizedEndpoint) {
    return fallbackModel
  }

  const now = Date.now()
  const cached = resolutionCache.get(normalizedEndpoint)
  if (cached && cached.expiresAt > now) {
    return cached.model || fallbackModel
  }

  const inFlight = inFlightResolutions.get(normalizedEndpoint)
  if (inFlight) {
    const model = await inFlight
    return model || fallbackModel
  }

  const resolutionPromise = discoverLocalModels(normalizedEndpoint)
    .then((models) => (models[0] ? models[0] : null))
    .catch(() => null)
    .finally(() => {
      inFlightResolutions.delete(normalizedEndpoint)
    })

  inFlightResolutions.set(normalizedEndpoint, resolutionPromise)
  const resolvedModel = await resolutionPromise
  resolutionCache.set(normalizedEndpoint, {
    model: resolvedModel,
    expiresAt: now + CACHE_TTL_MS,
  })

  return resolvedModel || fallbackModel
}

export function clearLocalModelResolutionCache(endpoint?: string): void {
  if (endpoint?.trim()) {
    resolutionCache.delete(endpoint.trim())
    inFlightResolutions.delete(endpoint.trim())
    return
  }

  resolutionCache.clear()
  inFlightResolutions.clear()
}
