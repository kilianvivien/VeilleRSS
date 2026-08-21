/**
 * Service de dialogues — implémentation navigateur uniquement.
 * Les options natives (titre, libellés) ne sont pas restituables avec
 * window.confirm/alert : le message seul est affiché.
 */

export async function confirmDialog(
  message: string,
  _options?: {
    title?: string
    okLabel?: string
    cancelLabel?: string
    kind?: 'info' | 'warning' | 'error'
  }
): Promise<boolean> {
  void _options
  return window.confirm(message)
}

export async function alertDialog(
  message: string,
  _options?: {
    title?: string
    kind?: 'info' | 'warning' | 'error'
  }
): Promise<void> {
  void _options
  window.alert(message)
}
