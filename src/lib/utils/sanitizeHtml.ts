import DOMPurify from 'dompurify'

const SAFE_URL_PATTERN = /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpeg|gif|webp);base64,|\/|#)/i
const ALLOWED_TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify'])

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'u',
    'b',
    'i',
    'ul',
    'ol',
    'li',
    'a',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'img',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'src', 'alt'],
  ALLOWED_URI_REGEXP: SAFE_URL_PATTERN,
  // A custom `ALLOWED_URI_REGEXP` makes DOMPurify validate *every* attribute
  // value as a URL, not just `href` and `src`. `target="_blank"` and
  // `rel="noopener noreferrer nofollow"` are not URLs, so they would be
  // stripped although allow-listed above. Exempting them from the URL check
  // leaves `href` and `src` validated as before.
  ADD_URI_SAFE_ATTR: ['target', 'rel'],
  KEEP_CONTENT: true,
} satisfies Parameters<typeof DOMPurify.sanitize>[1]

function extractSafeTextAlign(styleValue: string): string | null {
  let textAlign: string | null = null

  styleValue.split(';').forEach((declaration) => {
    const [property, ...valueParts] = declaration.split(':')
    if (!property || valueParts.length === 0) {
      return
    }

    if (property.trim().toLowerCase() !== 'text-align') {
      return
    }

    const normalized = valueParts
      .join(':')
      .trim()
      .toLowerCase()
      .replace(/\s*!important\s*$/, '')

    if (ALLOWED_TEXT_ALIGN_VALUES.has(normalized)) {
      textAlign = normalized
    }
  })

  return textAlign
}

/**
 * Drop images whose source is not on the allowlist.
 *
 * DOMPurify cannot do this for us: its `DATA_URI_TAGS` allowance lets *any*
 * `data:` URI through on an `<img>`, bypassing `ALLOWED_URI_REGEXP` entirely —
 * `data:image/svg+xml` included, which is a scriptable format we never produce.
 */
function removeUnsafeImages(container: Element): void {
  container.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src')

    if (!src) {
      image.remove()
      return
    }

    // Control characters and spaces are stripped first, the way DOMPurify does,
    // so `java\tscript:` style smuggling cannot slip past the pattern.
    const collapsed = Array.from(src)
      .filter((character) => character.charCodeAt(0) > 0x20)
      .join('')

    if (!SAFE_URL_PATTERN.test(collapsed)) {
      image.remove()
    }
  })
}

/**
 * `target="_blank"` sans `rel` laisse la page ouverte accéder à l'onglet
 * d'origine. Un contenu de flux peut n'avoir que le `target` : on complète
 * plutôt que de retirer le lien.
 */
function hardenBlankTargets(container: Element): void {
  container.querySelectorAll('a[target="_blank"]').forEach((anchor) => {
    const rel = new Set((anchor.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean))
    if (rel.has('noopener') && rel.has('noreferrer')) return
    rel.add('noopener')
    rel.add('noreferrer')
    anchor.setAttribute('rel', Array.from(rel).join(' '))
  })
}

function normalizeAllowedInlineStyles(html: string): string {
  if (
    !html ||
    (!html.includes('style=') && !html.includes('<img') && !html.includes('target="_blank"'))
  ) {
    return html
  }

  if (typeof DOMParser === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const container = doc.body.firstElementChild

  if (!container) {
    return html
  }

  container.querySelectorAll('[style]').forEach((element) => {
    const styleValue = element.getAttribute('style')
    if (!styleValue) {
      element.removeAttribute('style')
      return
    }

    const textAlign = extractSafeTextAlign(styleValue)
    if (textAlign) {
      element.setAttribute('style', `text-align: ${textAlign};`)
      return
    }

    element.removeAttribute('style')
  })

  removeUnsafeImages(container)
  hardenBlankTargets(container)

  return container.innerHTML
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeRichHtml(value: string): string {
  if (!value) {
    return ''
  }

  const sanitized = DOMPurify.sanitize(value, PURIFY_CONFIG) as string
  return normalizeAllowedInlineStyles(sanitized)
}
