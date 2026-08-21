/** Formats de date partagés par les composants du lecteur RSS. */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatAbsoluteDate(timestamp: number | null): string {
  if (!timestamp) return 'Date inconnue'
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

/**
 * Ancienneté lisible d’un coup d’œil (« il y a 12 min »), qui bascule sur une
 * date absolue au-delà d’une semaine — la fraîcheur est ce qui compte pour
 * suivre l’actualité, pas la date exacte d’un article d’il y a trois mois.
 */
export function formatRelativeDate(timestamp: number | null, now = Date.now()): string {
  if (!timestamp) return 'Date inconnue'

  const elapsed = now - timestamp
  if (elapsed < 0) return formatAbsoluteDate(timestamp)
  if (elapsed < MINUTE) return 'À l’instant'
  if (elapsed < HOUR) return `il y a ${Math.floor(elapsed / MINUTE)} min`
  if (elapsed < DAY) return `il y a ${Math.floor(elapsed / HOUR)} h`
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY)
    return `il y a ${days} j`
  }

  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(timestamp))
}

export function formatRefreshInterval(value: number | null): string {
  if (!value) return 'Auto désactivée'
  if (value < 60) return `Auto ${value} min`
  return `Auto ${value / 60} h`
}
