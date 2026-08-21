/**
 * Service de presse-papiers — implémentation navigateur uniquement.
 */

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  // Repli pour les contextes sans Clipboard API (http non sécurisé…).
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

export async function readFromClipboard(): Promise<string | null> {
  try {
    return (await navigator.clipboard?.readText()) ?? null
  } catch {
    return null
  }
}
