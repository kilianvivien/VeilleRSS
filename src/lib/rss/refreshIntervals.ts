/**
 * Cadences de rafraîchissement proposées, partagées par les paramètres
 * généraux et la fiche de chaque flux — les deux listes doivent rester
 * identiques, sinon un flux affiche une valeur que l'autre écran ne sait pas
 * proposer.
 *
 * Le planificateur bat la seconde toutes les minutes (`useRssRefreshScheduler`)
 * et n'interroge qu'un flux échu : la cadence d'une minute est donc bien la
 * plus courte que l'application puisse honorer.
 */

export const REFRESH_OFF = 'off'

/** Cadence appliquée aux nouveaux flux, au catalogue et aux imports OPML. */
export const RECOMMENDED_REFRESH_MINUTES = 30

export const REFRESH_INTERVAL_OPTIONS = [
  { value: REFRESH_OFF, label: 'Désactivée' },
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: String(RECOMMENDED_REFRESH_MINUTES), label: '30 minutes (recommandé)' },
  { value: '60', label: '1 heure' },
  { value: '180', label: '3 heures' },
  { value: '360', label: '6 heures' },
]
