export type RssUrlValidationResult =
  | { ok: true; url: string; isHttp: boolean; warning: string | null }
  | { ok: false; error: string }

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
]

export function validateRssFeedUrl(value: string, options: { allowHttp?: boolean } = {}): RssUrlValidationResult {
  const trimmed = value.trim()
  if (!trimmed) {
    return { ok: false, error: 'Saisissez une URL de flux.' }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: 'URL de flux invalide.' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Seuls les flux HTTP et HTTPS sont autorisés.' }
  }

  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    return { ok: false, error: 'Les adresses locales ou privées ne sont pas autorisées pour les flux RSS.' }
  }

  if (url.protocol === 'http:' && !options.allowHttp) {
    return {
      ok: false,
      error: 'Ce flux utilise HTTP. Confirmez le risque pour ajouter un flux non chiffré.',
    }
  }

  return {
    ok: true,
    url: url.toString(),
    isHttp: url.protocol === 'http:',
    warning: url.protocol === 'http:' ? 'Flux HTTP non chiffré.' : null,
  }
}

