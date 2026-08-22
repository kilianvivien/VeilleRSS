/**
 * Intentions de lancement passées en query string.
 *
 * Deux usages, tous deux déclarés dans le manifeste :
 *  - `?view=` : raccourcis d'application (appui long sur l'icône) ;
 *  - `?url=` / `?text=` : cible de partage — partager une page depuis le
 *    navigateur ouvre l'ajout de source prérempli.
 *
 * L'URL est nettoyée immédiatement après lecture : l'application n'a pas de
 * routeur, une query résiduelle serait rejouée à chaque rechargement (et
 * rouvrirait la modale d'ajout indéfiniment).
 */

export type LaunchView = 'all' | 'unread' | 'saved' | 'trends' | 'briefing'

export interface LaunchIntent {
  view?: LaunchView
  /** URL partagée depuis une autre application. */
  sharedUrl?: string
}

const LAUNCH_VIEWS: LaunchView[] = ['all', 'unread', 'saved', 'trends', 'briefing']

/** Une cible de partage reçoit souvent le lien dans `text`, pas dans `url`. */
function firstHttpUrl(value: string): string | undefined {
  return value.match(/https?:\/\/\S+/)?.[0]
}

export function readLaunchIntent(): LaunchIntent {
  if (typeof window === 'undefined') return {}

  const params = new URLSearchParams(window.location.search)
  if ([...params.keys()].length === 0) return {}

  const intent: LaunchIntent = {}

  const view = params.get('view')
  if (view && (LAUNCH_VIEWS as string[]).includes(view)) {
    intent.view = view as LaunchView
  }

  const shared = params.get('url')?.trim() || params.get('text')?.trim()
  if (shared) {
    const candidate = /^https?:\/\//i.test(shared) ? shared : firstHttpUrl(shared)
    if (candidate) intent.sharedUrl = candidate
  }

  if (intent.view || intent.sharedUrl) {
    window.history.replaceState(null, '', window.location.pathname)
  }

  return intent
}
