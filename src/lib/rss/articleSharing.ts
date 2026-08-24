import type { RssFeed, RssItem, RssItemTranslation } from '@/types/rss'

/**
 * Longueur maximale du résumé recopié dans le message de partage.
 *
 * Un flux peut livrer plusieurs milliers de caractères ; collé tel quel dans
 * une messagerie, le partage devient illisible et le lien — ce qui compte —
 * se retrouve noyé. 400 caractères tiennent en un coup d'œil tout en donnant
 * l'angle de l'article.
 */
const MAX_SHARED_SUMMARY_LENGTH = 400

export interface ArticleShareContent {
  /** Titre seul, pour le champ `title` de la carte de partage du système. */
  title: string
  /** Bloc complet, lien inclus : presse-papiers comme carte de partage. */
  text: string
}

function formatShareDate(timestamp: number | null): string | null {
  if (!timestamp) return null
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(timestamp))
}

/**
 * Tronque sur une frontière de mot plutôt qu'au caractère près : couper au
 * milieu d'un nom propre donnerait l'impression d'un texte corrompu.
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  // Sans espace exploitable (une langue sans séparateurs, une URL géante), on
  // s'en tient à la coupe brute : mieux vaut tronquer que ne rien partager.
  const base = lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped
  return `${base.replace(/[\s,;:.…-]+$/, '')}…`
}

/**
 * Compose le message de partage d'un article : titre, source, date, résumé et
 * lien, dans cet ordre.
 *
 * `translation` n'est fourni que lorsque le lecteur affiche effectivement la
 * traduction. Le titre original est alors rappelé sous la source : le
 * destinataire reçoit un texte qu'il comprend sans perdre de quoi retrouver
 * l'article dans sa langue d'origine.
 */
export function buildArticleShareContent(
  item: RssItem,
  feed: RssFeed | undefined,
  translation: RssItemTranslation | null
): ArticleShareContent {
  const originalSummary = item.summary || item.contentSnippet
  const title = (translation?.title || item.title).trim() || 'Sans titre'
  const summary = (translation?.summary || originalSummary).trim()
  const source = feed?.title?.trim() || 'Flux inconnu'
  const date = formatShareDate(item.publishedAt)
  const link = item.link || feed?.siteUrl || ''

  const lines = [`« ${title} »`, date ? `${source} · ${date}` : source]

  const originalTitle = item.title.trim()
  if (translation && originalTitle && originalTitle !== title) {
    lines.push(`(titre original : ${originalTitle})`)
  }

  if (summary) {
    lines.push('', truncateAtWordBoundary(summary, MAX_SHARED_SUMMARY_LENGTH))
  }

  if (link) {
    lines.push('', link)
  }

  return { title, text: lines.join('\n') }
}
