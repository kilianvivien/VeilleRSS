/**
 * Cycle de vie du service worker et invites PWA.
 *
 * - `registerServiceWorker` : appelée une fois au démarrage (build de
 *   production uniquement). Enregistre le worker, remonte celui en attente à
 *   la bannière de mise à jour, et vérifie périodiquement les nouveautés.
 * - `initInstallCapture` : capte `beforeinstallprompt` AVANT le montage de
 *   React — Chrome émet souvent l'événement plus tôt qu'un `useEffect`.
 * - `usePwaUpdate` / `usePwaInstall` : état consommé par les bannières et par
 *   la section « Application » des paramètres.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

type Listener = () => void

/** Intervalle de vérification d'une nouvelle version en session longue. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60_000
/** Espacement minimal entre deux vérifications, tous déclencheurs confondus. */
const UPDATE_CHECK_MIN_GAP_MS = 15 * 60_000
/**
 * Filet de sécurité si `controllerchange` n'arrive jamais. Généreux à dessein :
 * l'événement arrive normalement en moins de 200 ms, et un délai trop court
 * déclenchait un second rechargement pendant une activation lente.
 */
const FALLBACK_RELOAD_MS = 10_000

const updateListeners = new Set<Listener>()
let pendingRegistration: ServiceWorkerRegistration | null = null
let registrationStarted = false
let registrationPromise: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null)
let lastUpdateCheck = 0

let isReloading = false
let fallbackReloadTimer: number | null = null

/** Recharge au plus une fois : `controllerchange` et le filet de sécurité
 *  peuvent se déclencher tous les deux, et deux rechargements concurrents
 *  donnent un écran blanc sur Safari. */
function reloadOnce() {
  if (isReloading) return
  isReloading = true
  if (fallbackReloadTimer !== null) {
    window.clearTimeout(fallbackReloadTimer)
    fallbackReloadTimer = null
  }
  window.location.reload()
}

function notifyUpdateAvailable() {
  for (const listener of updateListeners) listener()
}

/** Registration résolue, ou `null` hors production / navigateur incompatible. */
export function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  return registrationPromise
}

function checkForUpdate(registration: ServiceWorkerRegistration, force = false) {
  const now = Date.now()
  if (!force && now - lastUpdateCheck < UPDATE_CHECK_MIN_GAP_MS) return
  lastUpdateCheck = now
  void registration.update().catch(() => {
    /* Réseau absent : la prochaine occasion réessaiera. */
  })
}

export function registerServiceWorker() {
  if (registrationStarted || typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  registrationStarted = true

  registrationPromise = new Promise((resolve) => {
    window.addEventListener('load', () => {
      // `updateViaCache: 'none'` : le script du worker ne doit jamais être
      // servi depuis le cache HTTP, sinon une mise à jour peut rester
      // invisible malgré les en-têtes.
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(
        (registration) => {
          // Un worker installé lors d'une session précédente attend encore :
          // on propose la mise à jour dès l'ouverture.
          if (registration.waiting && navigator.serviceWorker.controller) {
            pendingRegistration = registration
            notifyUpdateAvailable()
          }

          registration.addEventListener('updatefound', () => {
            const installing = registration.installing
            if (!installing) return
            installing.addEventListener('statechange', () => {
              // Pas de contrôleur = première installation : on applique
              // directement, sans bannière.
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                pendingRegistration = registration
                notifyUpdateAvailable()
              }
            })
          })

          // Sans ces vérifications, une PWA laissée ouverte plusieurs jours ne
          // découvre jamais de nouvelle version : il n'y a pas de navigation
          // dure dans une application à écran unique.
          window.setInterval(() => checkForUpdate(registration), UPDATE_CHECK_INTERVAL_MS)
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) checkForUpdate(registration)
          })
          window.addEventListener('online', () => checkForUpdate(registration, true))

          void requestPersistentStorage()
          resolve(registration)
        },
        (error) => {
          console.warn('[pwa] Enregistrement du service worker impossible', error)
          resolve(null)
        }
      )
    })
  })
}

/**
 * Demande au navigateur de ne pas évincer le stockage.
 *
 * Le cache d'articles vit dans IndexedDB : sans persistance, une pression
 * mémoire peut le vider et l'application perd tout son contenu hors connexion.
 * Chrome accorde silencieusement selon l'engagement et l'installation, Firefox
 * affiche une invite. Un refus n'est pas une erreur.
 */
let persistentStoragePromise: Promise<boolean> | null = null
export function requestPersistentStorage(): Promise<boolean> {
  if (persistentStoragePromise) return persistentStoragePromise
  persistentStoragePromise = (async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    try {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    } catch {
      return false
    }
  })()
  return persistentStoragePromise
}

export function usePwaUpdate() {
  const [updateReady, setUpdateReady] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    const listener = () => setUpdateReady(true)
    updateListeners.add(listener)
    if (pendingRegistration) setUpdateReady(true)

    const onControllerChange = () => {
      // Le nouveau worker a pris le contrôle : rechargement complet pour
      // servir les bundles référencés par le nouveau HTML. Garde-fou :
      // `clients.claim()` déclenche aussi cet événement à la toute première
      // installation — dans ce cas il n'y a rien à recharger.
      if (!pendingRegistration) return
      pendingRegistration = null
      reloadOnce()
    }
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange)

    return () => {
      updateListeners.delete(listener)
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    const waiting = pendingRegistration?.waiting
    if (!waiting) {
      // Le worker a déjà pris la main entre-temps : rien à réveiller.
      reloadOnce()
      return
    }
    setIsApplying(true)
    // Chaîne brute et non objet : c'est le protocole que comprennent les
    // workers déjà déployés.
    waiting.postMessage('SKIP_WAITING')
    fallbackReloadTimer = window.setTimeout(reloadOnce, FALLBACK_RELOAD_MS)
  }, [])

  return { updateReady, isApplying, applyUpdate }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_STORAGE_KEY = 'veille-pwa-install-dismissed-at'
const DISMISS_DELAY_MS = 14 * 24 * 60 * 60 * 1000

let deferredInstallEvent: BeforeInstallPromptEvent | null = null
const installListeners = new Set<Listener>()
let installCaptureStarted = false

function notifyInstallChanged() {
  for (const listener of installListeners) listener()
}

/**
 * À appeler depuis `main.tsx`, avant le rendu React.
 *
 * Chrome émet `beforeinstallprompt` très tôt — souvent avant qu'un
 * `useEffect` n'ait pu s'abonner. Capté au niveau module, l'événement n'est
 * plus perdu au chargement à froid.
 */
export function initInstallCapture() {
  if (installCaptureStarted || typeof window === 'undefined') return
  installCaptureStarted = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstallEvent = event as BeforeInstallPromptEvent
    notifyInstallChanged()
  })

  window.addEventListener('appinstalled', () => {
    deferredInstallEvent = null
    notifyInstallChanged()
    // L'installation est le signal le plus fort accepté par Chrome pour
    // accorder le stockage persistant.
    void requestPersistentStorage()
  })
}

function subscribeInstall(onChange: Listener) {
  installListeners.add(onChange)
  return () => installListeners.delete(onChange)
}

const STANDALONE_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
  '(display-mode: window-controls-overlay)',
]

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    STANDALONE_QUERIES.some((query) => window.matchMedia(query).matches) ||
    // iOS Safari expose la propriété non standard `navigator.standalone`.
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function subscribeStandalone(onChange: Listener) {
  const lists = STANDALONE_QUERIES.map((query) => window.matchMedia(query))
  lists.forEach((list) => list.addEventListener('change', onChange))
  return () => lists.forEach((list) => list.removeEventListener('change', onChange))
}

/**
 * Safari iOS / iPadOS : pas de `beforeinstallprompt`, installation manuelle.
 *
 * Faux positif connu : un Mac équipé d'un écran tactile. Sans conséquence
 * depuis que les paramètres offrent un point d'entrée explicite — cette
 * heuristique ne conditionne plus que le contenu d'une bannière.
 */
function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1) // iPadOS en mode bureau
  return isIos && /AppleWebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function wasRecentlyDismissed(): boolean {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_STORAGE_KEY))
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DELAY_MS
  } catch {
    return false
  }
}

function markDismissed() {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()))
  } catch {
    /* localStorage indisponible — la bannière réapparaîtra. */
  }
}

export type InstallContext = 'native' | 'ios-manual' | 'unsupported'

export function usePwaInstall() {
  const installEvent = useSyncExternalStore(
    subscribeInstall,
    () => deferredInstallEvent,
    () => null
  )
  const standalone = useSyncExternalStore(subscribeStandalone, isStandaloneDisplay, () => false)
  const [iosManual, setIosManual] = useState(false)
  const [dismissed, setDismissed] = useState(wasRecentlyDismissed)
  const [engaged, setEngaged] = useState(false)

  useEffect(() => {
    // Laisser d'abord le visiteur découvrir l'interface. L'invite apparaît
    // ensuite comme une suggestion contextuelle, pas comme un interstitiel.
    const engagementTimer = window.setTimeout(() => setEngaged(true), 3500)

    let iosTimer: number | null = null
    if (isIosSafari() && !isStandaloneDisplay()) {
      iosTimer = window.setTimeout(() => setIosManual(true), 4000)
    }

    return () => {
      window.clearTimeout(engagementTimer)
      if (iosTimer !== null) window.clearTimeout(iosTimer)
    }
  }, [])

  /** Contexte de la bannière flottante : soumis aux temporisations et au rejet. */
  const context: InstallContext = standalone
    ? 'unsupported'
    : installEvent && engaged && !dismissed
      ? 'native'
      : iosManual && engaged && !dismissed
        ? 'ios-manual'
        : 'unsupported'

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!deferredInstallEvent) return null
    const event = deferredInstallEvent
    await event.prompt()
    const choice = await event.userChoice
    // L'événement n'est pas réutilisable après `prompt()`.
    deferredInstallEvent = null
    notifyInstallChanged()
    return choice.outcome
  }, [])

  const dismiss = useCallback(() => {
    markDismissed()
    setDismissed(true)
    setIosManual(false)
  }, [])

  return {
    context,
    install,
    dismiss,
    isStandalone: standalone,
    /** Point d'entrée explicite (paramètres) : ignore délais et rejet. */
    canPromptInstall: Boolean(installEvent) && !standalone,
    /** Afficher la marche à suivre manuelle iOS. */
    needsIosInstructions: isIosSafari() && !standalone,
  }
}
