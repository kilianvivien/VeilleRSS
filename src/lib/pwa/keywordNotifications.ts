/**
 * Notifications locales sur les mots-clés suivis.
 *
 * Strictement local : aucun serveur de push, aucune clé VAPID. Les
 * notifications sont émises par le service worker à la demande de la page, ce
 * qui implique une limite à assumer — elles n'arrivent que tant que l'onglet
 * vit (onglet caché, ou PWA en arrière-plan sur Android). Sans Web Push ni
 * Periodic Background Sync, rien ne réveille l'application fermée.
 *
 * Chargé en import dynamique depuis le planificateur : ce module ne doit
 * jamais peser sur le chunk d'entrée.
 */

import { foldForMatching } from '@/lib/rss/textAnalysis'
import { useRssStore } from '@/stores/rssStore'
import type { RssItem } from '@/types/rss'
import { getServiceWorkerRegistration } from './pwaService'

/**
 * Déduplication en localStorage, PAS dans le store : celui-ci est persisté
 * dans IndexedDB, et y écrire réécrirait tout le tableau `items` à chaque tick.
 */
const NOTIFIED_STORAGE_KEY = 'veille-notified-item-ids'
const NOTIFIED_MAX = 500
/** Au-delà, on regroupe le reste dans une notification de synthèse. */
const MAX_NOTIFICATIONS_PER_CYCLE = 3

function readNotifiedIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(NOTIFIED_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeNotifiedIds(ids: string[]) {
  try {
    window.localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(ids.slice(-NOTIFIED_MAX)))
  } catch {
    /* Quota atteint : la déduplication repart de zéro, sans casse. */
  }
}

function searchableText(item: RssItem): string {
  return foldForMatching(`${item.title} ${item.contentSnippet ?? ''} ${item.summary ?? ''}`)
}

export async function notifyWatchedKeywordMatches(freshItems: RssItem[]): Promise<void> {
  if (typeof window === 'undefined' || freshItems.length === 0) return

  const { settings } = useRssStore.getState()
  if (!settings.keywordNotificationsEnabled) return
  if (settings.watchedKeywords.length === 0) return
  // `Notification` n'existe pas dans Safari iOS en mode navigateur : il faut
  // que l'application soit installée sur l'écran d'accueil.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const registration = await getServiceWorkerRegistration()
  if (!registration) return

  const alreadyNotified = readNotifiedIds()
  const buckets = new Map<string, { term: string; items: RssItem[] }>()

  for (const item of freshItems) {
    if (alreadyNotified.has(item.id)) continue
    const haystack = searchableText(item)

    for (const keyword of settings.watchedKeywords) {
      // Un mot-clé ajouté après coup ne doit pas notifier rétroactivement.
      if (item.fetchedAt < keyword.createdAt) continue
      const folded = foldForMatching(keyword.term)
      if (!folded || !haystack.includes(folded)) continue

      const bucket = buckets.get(folded) ?? { term: keyword.term, items: [] }
      bucket.items.push(item)
      buckets.set(folded, bucket)
      break // un article ne notifie qu'une fois, sur son premier mot-clé
    }
  }

  if (buckets.size === 0) return

  const entries = [...buckets.entries()]
  const shown = entries.slice(0, MAX_NOTIFICATIONS_PER_CYCLE)
  const overflow = entries.slice(MAX_NOTIFICATIONS_PER_CYCLE)
  const notifiedIds: string[] = []

  for (const [folded, bucket] of shown) {
    await registration.showNotification(`Veille : ${bucket.term}`, {
      body:
        bucket.items.length === 1
          ? bucket.items[0].title
          : `${bucket.items.length} nouveaux articles · ${bucket.items[0].title}`,
      // Un seul bandeau par mot-clé : le suivant remplace le précédent au lieu
      // d'empiler une pile illisible.
      tag: `veille-kw-${folded}`,
      icon: '/pwa-192.png',
      badge: '/favicon-64.png',
      data: { term: bucket.term },
    })
    notifiedIds.push(...bucket.items.map((item) => item.id))
  }

  if (overflow.length > 0) {
    const count = overflow.reduce((total, [, bucket]) => total + bucket.items.length, 0)
    await registration.showNotification('Veille RSS', {
      body: `${count} autres articles correspondent à vos mots-clés suivis.`,
      tag: 'veille-kw-digest',
      icon: '/pwa-192.png',
      badge: '/favicon-64.png',
    })
    notifiedIds.push(...overflow.flatMap(([, bucket]) => bucket.items.map((item) => item.id)))
  }

  writeNotifiedIds([...alreadyNotified, ...notifiedIds])
}
