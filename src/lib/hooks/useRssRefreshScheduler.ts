import { useEffect, useRef } from 'react'
import { useRssStore } from '@/stores/rssStore'
import { isOnline } from './useOnlineStatus'

const SCHEDULER_TICK_MS = 60_000
/**
 * Au-delà de ce temps passé en arrière-plan, un retour au premier plan est
 * traité comme un rattrapage : les nouveautés peuvent alors notifier.
 */
const BACKGROUND_NOTIFY_AFTER_MS = 5 * 60_000

type TickReason = 'interval' | 'resume' | 'online'

/**
 * Rafraîchissement automatique des flux arrivés à échéance.
 *
 * Sensible à la visibilité et à la connectivité : l'intervalle seul ne suffit
 * pas sur mobile, où le système gèle les minuteurs en arrière-plan. Sans
 * rattrapage au réveil, l'application affichait des articles périmés jusqu'au
 * tick suivant ; et sans garde de visibilité, elle sollicitait le proxy sur un
 * téléphone verrouillé.
 */
export function useRssRefreshScheduler() {
  const inFlightRef = useRef(false)
  const lastTickRef = useRef(Date.now())
  const hiddenSinceRef = useRef<number | null>(null)

  useEffect(() => {
    const tick = async (reason: TickReason) => {
      if (reason === 'interval' && document.hidden) return
      if (!isOnline() || inFlightRef.current) return

      const state = useRssStore.getState()
      const now = Date.now()
      const dueFeeds = state.feeds.filter((feed) => {
        if (!feed.enabled || !feed.refreshIntervalMinutes) return false
        const lastRefresh = feed.lastFetchedAt ?? feed.createdAt
        return now - lastRefresh >= feed.refreshIntervalMinutes * 60_000
      })

      if (dueFeeds.length === 0) {
        lastTickRef.current = now
        return
      }

      // Instantané AVANT fusion : la différence isole exactement les articles
      // que cette passe a fait apparaître.
      const knownIds = new Set(state.items.map((item) => item.id))
      const wasHiddenLongEnough =
        hiddenSinceRef.current !== null &&
        Date.now() - hiddenSinceRef.current > BACKGROUND_NOTIFY_AFTER_MS

      inFlightRef.current = true
      try {
        await Promise.allSettled(dueFeeds.map((feed) => state.refreshFeed(feed.id)))

        const freshItems = useRssStore
          .getState()
          .items.filter((item) => !knownIds.has(item.id))

        // On ne notifie que si l'utilisateur ne regarde pas déjà la liste.
        if (freshItems.length > 0 && (document.hidden || wasHiddenLongEnough)) {
          const { notifyWatchedKeywordMatches } = await import('@/lib/pwa/keywordNotifications')
          await notifyWatchedKeywordMatches(freshItems)
        }
      } finally {
        inFlightRef.current = false
        lastTickRef.current = Date.now()
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now()
        return
      }
      // Rattrapage : l'intervalle n'a pas tourné, ou a été bridé par le système.
      if (Date.now() - lastTickRef.current >= SCHEDULER_TICK_MS) {
        void tick('resume')
      }
      hiddenSinceRef.current = null
    }

    const onOnline = () => void tick('online')

    void tick('resume')
    const interval = window.setInterval(() => void tick('interval'), SCHEDULER_TICK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [])
}
