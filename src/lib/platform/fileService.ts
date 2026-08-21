/**
 * Service de fichiers — implémentation navigateur uniquement.
 * Téléchargement via Blob + ancre ; ouverture via input[type=file].
 */

export async function saveFile(
  content: string | Blob | Uint8Array,
  filename: string,
  mimeType?: string
): Promise<void> {
  const blob =
    content instanceof Blob
      ? content
      : content instanceof Uint8Array
        ? new Blob([new Uint8Array(content)], { type: mimeType || 'application/octet-stream' })
        : new Blob([content], { type: mimeType || 'text/plain' })

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function openFileDialog(options?: {
  multiple?: boolean
  filters?: { name: string; extensions: string[] }[]
}): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options?.multiple ?? false
    const accept = buildAcceptAttribute(options?.filters)
    if (accept) {
      input.accept = accept
    }

    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      resolve(files.length > 0 ? files : null)
    }

    input.oncancel = () => {
      resolve(null)
    }

    input.click()
  })
}

function buildAcceptAttribute(
  filters?: { name: string; extensions: string[] }[]
): string | undefined {
  const extensions = filters?.flatMap((filter) => filter.extensions ?? []) ?? []
  if (!extensions.length) {
    return undefined
  }

  const accepted = Array.from(
    new Set(
      extensions
        .map((ext) => ext.trim().toLowerCase())
        .filter(Boolean)
        .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
    )
  )
  return accepted.length ? accepted.join(',') : undefined
}
