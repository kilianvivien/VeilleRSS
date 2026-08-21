import { fetchRssFeedXml } from './rssFetchService'
import { isDatedRssItem, parseRssFeed } from './rssParser'

/**
 * Vérification d'une source du catalogue.
 *
 * Une URL peut répondre 200 tout en ne servant aucun article — page d'index de
 * flux servie en HTML, rubrique inexistante, flux abandonné par l'éditeur. Ces
 * cas se traduisaient par une source silencieusement vide dans le lecteur ;
 * ici ils sont nommés.
 */
export type FeedProbeStatus = 'ok' | 'empty' | 'error'

export interface FeedProbeResult {
  status: FeedProbeStatus
  /** Articles retenus, c'est-à-dire datés. */
  itemCount: number
  /** Articles écartés faute de date de publication lisible. */
  undatedCount: number
  /** Titre annoncé par le flux, utile quand il diffère du titre du catalogue. */
  title?: string
  message: string
}

export async function probeFeed(url: string): Promise<FeedProbeResult> {
  try {
    const xml = await fetchRssFeedXml(url)
    const parsed = parseRssFeed(xml, url)
    const dated = parsed.items.filter(isDatedRssItem)
    const undatedCount = parsed.items.length - dated.length

    if (dated.length === 0) {
      return {
        status: 'empty',
        itemCount: 0,
        undatedCount,
        title: parsed.title,
        message:
          undatedCount > 0
            ? `${undatedCount} article${undatedCount > 1 ? 's' : ''} sans date : le lecteur n'en affichera aucun.`
            : 'Le flux répond mais ne contient aucun article.',
      }
    }

    return {
      status: 'ok',
      itemCount: dated.length,
      undatedCount,
      title: parsed.title,
      message: `${dated.length} article${dated.length > 1 ? 's' : ''} lus${
        undatedCount > 0 ? `, ${undatedCount} sans date écarté${undatedCount > 1 ? 's' : ''}` : ''
      }.`,
    }
  } catch (error) {
    return {
      status: 'error',
      itemCount: 0,
      undatedCount: 0,
      message: error instanceof Error ? error.message : 'Flux illisible.',
    }
  }
}
