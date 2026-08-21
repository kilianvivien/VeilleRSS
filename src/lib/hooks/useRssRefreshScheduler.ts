import { useEffect, useRef } from 'react'
import { useRssStore } from '@/stores/rssStore'

const SCHEDULER_TICK_MS = 60_000

export function useRssRefreshScheduler() {
  const inFlightRef = useRef(false)

  useEffect(() => {
    const tick = async () => {
      if (inFlightRef.current) return

      const state = useRssStore.getState()
      const now = Date.now()
      const dueFeeds = state.feeds.filter((feed) => {
        if (!feed.enabled || !feed.refreshIntervalMinutes) return false
        const lastRefresh = feed.lastFetchedAt ?? feed.createdAt
        return now - lastRefresh >= feed.refreshIntervalMinutes * 60_000
      })

      if (dueFeeds.length === 0) return

      inFlightRef.current = true
      try {
        await Promise.allSettled(dueFeeds.map((feed) => state.refreshFeed(feed.id)))
      } finally {
        inFlightRef.current = false
      }
    }

    void tick()
    const interval = window.setInterval(() => void tick(), SCHEDULER_TICK_MS)
    return () => window.clearInterval(interval)
  }, [])
}

