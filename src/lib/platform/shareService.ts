import { copyToClipboard } from './clipboardService'

export interface ShareableContent {
  /** Titre seul, pour le champ `title` de la carte de partage du système. */
  title: string
  /** Bloc complet, lien inclus. */
  text: string
}

/**
 * `shared` : remis à la carte de partage du système.
 * `cancelled` : carte ouverte puis fermée sans choisir de destinataire.
 * `copied` : recopié dans le presse-papiers.
 * `failed` : ni l'un ni l'autre n'a abouti.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed'

/**
 * Partage un contenu par la carte du système lorsqu'elle existe, sinon par le
 * presse-papiers.
 *
 * Le lien voyage **dans** `text`, jamais dans le champ `url` : plusieurs
 * plateformes — iOS en particulier — ignorent `text` dès qu'un `url` est
 * fourni, et le destinataire ne recevrait alors qu'une URL nue. Le bloc
 * formaté étant tout l'intérêt de la fonction, on le garde entier ; les
 * messageries détectent le lien d'elles-mêmes et en tirent l'aperçu.
 *
 * À appeler sans `await` préalable dans un gestionnaire de clic : le partage
 * système exige un geste utilisateur, qu'une attente aurait déjà consommé.
 */
export async function shareOrCopy(content: ShareableContent): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: content.title, text: content.text })
      return 'shared'
    } catch (error) {
      // Fermer la carte est un choix, pas un échec : rien à rattraper.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // Tout autre refus (permission, plateforme capricieuse) retombe sur le
      // presse-papiers plutôt que de laisser l'utilisateur sans rien.
    }
  }

  try {
    await copyToClipboard(content.text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
