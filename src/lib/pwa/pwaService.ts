/**
 * Gestion du cycle de vie du service worker et des prompts PWA.
 *
 * - `registerServiceWorker` : appelée une fois au démarrage (build de
 *   production uniquement) ; elle remonte le worker en attente à la bannière
 *   de mise à jour.
 * - `usePwaUpdate` : expose l'état « nouvelle version disponible » et
 *   l'activation (message SKIP_WAITING + rechargement).
 * - `usePwaInstall` : capte l'événement `beforeinstallprompt` (Chrome,
 *   Edge, Safari 17+…) pour proposer l'installation au bon moment, et
 *   détecte Safari iOS qui ne supporte pas cet événement.
 */

import { useCallback, useEffect, useState } from 'react'

type UpdateListener = () => void

let updateListeners = new Set<UpdateListener>()
let pendingRegistration: ServiceWorkerRegistration | null = null
let registrationStarted = false

function notifyUpdateAvailable() {
  for (const listener of updateListeners) listener()
}

export function registerServiceWorker() {
  if (registrationStarted || typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  registrationStarted = true

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(
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
      },
      (error) => {
        console.warn('[pwa] Enregistrement du service worker impossible', error)
      }
    )
  })
}

export function usePwaUpdate() {
  const [updateReady, setUpdateReady] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    const listener = () => setUpdateReady(true)
    updateListeners.add(listener)
    if (pendingRegistration) setUpdateReady(true)

    const onControllerChange = () => {
      // Le nouveau worker a pris le contrôle : recharge complet pour servir
      // les nouveaux bundles référencés par le nouveau HTML. Garde-fou :
      // clients.claim() déclenche aussi controllerchange lors de la toute
      // première installation — dans ce cas il n'y a rien à recharger.
      if (!pendingRegistration) return
      pendingRegistration = null
      window.location.reload()
    }
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange)

    return () => {
      updateListeners.delete(listener)
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    setIsApplying(true)
    pendingRegistration?.waiting?.postMessage('SKIP_WAITING')
    // Si aucun controllerchange n'arrive (cas marginal), on force le rechargement.
    window.setTimeout(() => window.location.reload(), 3000)
  }, [])

  return { updateReady, isApplying, applyUpdate }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_STORAGE_KEY = 'veille-pwa-install-dismissed-at'
const DISMISS_DELAY_MS = 14 * 24 * 60 * 60 * 1000

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // iOS Safari expose la propriété non standard `navigator.standalone`.
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

/** Safari iOS / iPadOS : pas de beforeinstallprompt, installation manuelle. */
function isIosSafari(): boolean {
  if (typeof document === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1) // iPadOS en mode desktop
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
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(isStandaloneDisplay)
  const [iosManual, setIosManual] = useState(false)
  const [dismissed, setDismissed] = useState(wasRecentlyDismissed)
  const [engaged, setEngaged] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setStandalone(true)
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // Laisser d'abord le visiteur découvrir l'interface. Le prompt apparaît
    // ensuite comme une suggestion contextuelle plutôt qu'une interstitial.
    const engagementTimer = window.setTimeout(() => setEngaged(true), 3500)

    let iosTimer: number | null = null
    if (isIosSafari() && !isStandaloneDisplay()) {
      iosTimer = window.setTimeout(() => setIosManual(true), 4000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.clearTimeout(engagementTimer)
      if (iosTimer !== null) window.clearTimeout(iosTimer)
    }
  }, [])

  const context: InstallContext = standalone
    ? 'unsupported'
    : installEvent && engaged && !dismissed
      ? 'native'
      : iosManual && engaged && !dismissed
        ? 'ios-manual'
        : 'unsupported'

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!installEvent) return null
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    setInstallEvent(null)
    return choice.outcome
  }, [installEvent])

  const dismiss = useCallback(() => {
    markDismissed()
    setDismissed(true)
    setInstallEvent(null)
    setIosManual(false)
  }, [])

  return {
    context,
    install,
    dismiss,
  }
}
