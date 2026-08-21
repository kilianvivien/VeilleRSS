interface OpenAiModelsResponse {
  data?: Array<{ id?: unknown }>
}

interface OllamaModelsResponse {
  models?: Array<{ name?: unknown; model?: unknown }>
}

const DEFAULT_TIMEOUT_MS = 3500

function normalizeModelList(models: string[]): string[] {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))
  )
}

function toJsonResponse(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function buildOpenAiCandidates(endpoint: URL): string[] {
  const normalizedPath = endpoint.pathname.replace(/\/+$/, '')
  const pathWithoutCompletions = normalizedPath
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/completions$/i, '')

  const candidates = [
    `${endpoint.origin}/v1/models`,
    `${endpoint.origin}/models`,
  ]

  if (pathWithoutCompletions && pathWithoutCompletions !== '/') {
    candidates.unshift(`${endpoint.origin}${pathWithoutCompletions}/models`)
  }

  return Array.from(new Set(candidates))
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractOpenAiModels(payload: unknown): string[] {
  const data = toJsonResponse(payload) as OpenAiModelsResponse | null
  if (!data || !Array.isArray(data.data)) {
    return []
  }

  const models = data.data
    .map((item) => (typeof item?.id === 'string' ? item.id : ''))
    .filter(Boolean)

  return normalizeModelList(models)
}

function getCollectionFromPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
  }

  const data = toJsonResponse(payload)
  if (!data) {
    return []
  }

  if (Array.isArray(data.data)) {
    return data.data.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
    )
  }
  if (Array.isArray(data.models)) {
    return data.models.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
    )
  }
  return []
}

function extractModelIdentifier(item: Record<string, unknown>): string {
  if (typeof item.id === 'string' && item.id.trim()) return item.id
  if (typeof item.model === 'string' && item.model.trim()) return item.model
  if (typeof item.name === 'string' && item.name.trim()) return item.name
  if (typeof item.key === 'string' && item.key.trim()) return item.key
  return ''
}

function isLoadedStateString(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'loaded' || normalized === 'ready' || normalized === 'active') {
    return true
  }
  if (normalized.includes('not_loaded') || normalized.includes('unloaded')) {
    return false
  }
  return false
}

function hasTruthyBoolean(item: Record<string, unknown>, key: string): boolean {
  return item[key] === true
}

function hasLoadedInstances(item: Record<string, unknown>): boolean {
  const loadedInstances = item.loaded_instances
  if (Array.isArray(loadedInstances)) return loadedInstances.length > 0
  if (typeof loadedInstances === 'number') return loadedInstances > 0
  return false
}

function isLoadedModelRecord(item: Record<string, unknown>): boolean {
  if (
    hasTruthyBoolean(item, 'loaded') ||
    hasTruthyBoolean(item, 'is_loaded') ||
    hasTruthyBoolean(item, 'isLoaded') ||
    hasTruthyBoolean(item, 'active') ||
    hasTruthyBoolean(item, 'in_use')
  ) {
    return true
  }

  if (hasLoadedInstances(item)) {
    return true
  }

  if (typeof item.state === 'string' && isLoadedStateString(item.state)) {
    return true
  }
  if (typeof item.status === 'string' && isLoadedStateString(item.status)) {
    return true
  }

  if (typeof item.state === 'object' && item.state !== null) {
    const state = item.state as Record<string, unknown>
    if (isLoadedModelRecord(state)) {
      return true
    }
  }

  return false
}

function extractLoadedLmStudioModels(payload: unknown): string[] {
  const records = getCollectionFromPayload(payload)
  const loadedModels = records
    .map((item) => {
      const modelId = extractModelIdentifier(item)
      if (!modelId) return ''

      return isLoadedModelRecord(item) ? modelId : ''
    })
    .filter(Boolean)

  return normalizeModelList(loadedModels)
}

function extractOllamaModels(payload: unknown): string[] {
  const data = toJsonResponse(payload) as OllamaModelsResponse | null
  if (!data || !Array.isArray(data.models)) {
    return []
  }

  const models = data.models
    .map((item) => {
      if (typeof item?.name === 'string') return item.name
      if (typeof item?.model === 'string') return item.model
      return ''
    })
    .filter(Boolean)

  return normalizeModelList(models)
}

export async function discoverLocalModels(
  endpoint: string | undefined,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string[]> {
  if (!endpoint) {
    return []
  }

  let parsedEndpoint: URL
  try {
    parsedEndpoint = new URL(endpoint)
  } catch {
    return []
  }

  // Prefer currently loaded LM Studio models when available.
  const lmStudioCandidates = [
    `${parsedEndpoint.origin}/api/v1/models`,
    `${parsedEndpoint.origin}/api/v0/models`,
  ]
  for (const candidate of lmStudioCandidates) {
    const lmStudioPayload = await fetchJsonWithTimeout(candidate, timeoutMs)
    const loadedLmStudioModels = extractLoadedLmStudioModels(lmStudioPayload)
    if (loadedLmStudioModels.length > 0) {
      return loadedLmStudioModels
    }
  }

  const openAiCandidates = buildOpenAiCandidates(parsedEndpoint)
  for (const candidate of openAiCandidates) {
    const payload = await fetchJsonWithTimeout(candidate, timeoutMs)
    const models = extractOpenAiModels(payload)
    if (models.length > 0) {
      return models
    }
  }

  const ollamaPayload = await fetchJsonWithTimeout(
    `${parsedEndpoint.origin}/api/tags`,
    timeoutMs
  )
  return extractOllamaModels(ollamaPayload)
}
