import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Modal } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { usePointerSwipe } from '@/lib/hooks/usePointerSwipe'
import {
  AiVisual,
  InstallVisual,
  PersonalizeVisual,
  ReadingVisual,
  SourcesVisual,
  TrendsVisual,
  WelcomeVisual,
} from './OnboardingVisuals'
import { ApiKeyInfo } from './ApiKeyInfo'
import { InstallStepActions } from './InstallStepActions'

/**
 * Tutoriel de démarrage — sept écrans, une fonction clé par écran.
 *
 * Bureau : une carte modale. Mobile : plein écran, parce qu'une feuille
 * laisserait l'application derrière voler l'attention du premier contact.
 * Les deux compositions partagent le contenu et la navigation ; seule
 * l'enveloppe change.
 */

interface OnboardingStep {
  id: string
  eyebrow: string
  title: string
  /** Texte enrichi : l'étape IA y glisse la bulle d'aide « clé API ». */
  body: ReactNode
  bullets: string[]
  visual: ReactNode
  /** Bloc d'action propre à l'étape, sous les puces. */
  extra?: ReactNode
}

const STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    eyebrow: 'Bienvenue',
    title: 'Votre veille de presse, en constellation',
    body: 'Suivez des centaines de médias, voyez les sujets qui montent et comment ils se relient, puis faites rédiger la synthèse — sans quitter le navigateur.',
    bullets: [
      'Tout reste sur cet appareil : aucun compte, aucun serveur.',
      'Fonctionne hors connexion une fois les articles chargés.',
    ],
    visual: <WelcomeVisual />,
  },
  {
    id: 'sources',
    eyebrow: 'Étape 1',
    title: 'Composez votre revue',
    body: 'Plus de 200 médias vérifiés, en bouquets : presse française nationale et régionale, action publique, presse européenne, turque et internationale.',
    bullets: [
      '« Ajouter des sources » : filtrez par région ou par langue, ajoutez un bouquet ou composez votre sélection.',
      'Une source absente ? Collez son adresse RSS, ou importez un fichier OPML.',
    ],
    visual: <SourcesVisual />,
  },
  {
    id: 'reading',
    eyebrow: 'Étape 2',
    title: 'Lisez l’essentiel, sans bruit',
    body: 'Une liste unique, triée et filtrable. Chaque article porte son sujet ; le lecteur le replace dans la constellation et montre qui d’autre en parle.',
    bullets: [
      'Tous, non lus ou sauvegardés en un clic ; la recherche surligne ce qu’elle trouve.',
      '« En ce moment » filtre la liste sur un sujet qui monte.',
      'Sur mobile, balayez une ligne pour la marquer lue ou la garder.',
    ],
    visual: <ReadingVisual />,
  },
  {
    id: 'trends',
    eyebrow: 'Étape 3',
    title: 'Voyez ce qui monte, et ce qui se relie',
    body: 'La constellation dessine les sujets de la période : la taille dit le volume, la couleur l’élan, les liens les articles communs. Essayez : touchez un sujet.',
    bullets: [
      'Fenêtre de 6 heures à 7 jours, comparée à la période précédente.',
      'Suivez un mot-clé pour être alerté dès qu’il repart à la hausse.',
    ],
    visual: <TrendsVisual />,
  },
  {
    id: 'ai',
    eyebrow: 'Étape 4',
    title: 'Faites rédiger la synthèse',
    body: (
      <>
        Avec une clé API <ApiKeyInfo className="mx-0.5" />, l’application traduit les articles, affine
        les tendances et rédige un briefing éditorial, sur toute la période ou sur un sujet.
      </>
    ),
    bullets: [
      'Ajoutez votre clé dans Paramètres → Intelligence artificielle.',
      'Sans clé, la veille et les tendances fonctionnent quand même.',
    ],
    visual: <AiVisual />,
  },
  {
    id: 'personalize',
    eyebrow: 'Étape 5',
    title: 'Faites-la vôtre',
    body: 'Choisissez votre couleur d’accent et votre thème : l’application change sous vos yeux. Tout se retrouve ensuite dans Paramètres.',
    bullets: ['Cinq accents, mode clair ou sombre.', 'Densité de liste et taille du texte de lecture réglables.'],
    visual: <PersonalizeVisual />,
  },
  {
    id: 'install',
    eyebrow: 'Pour finir',
    title: 'Installez-la sur votre appareil',
    body: 'Depuis l’écran d’accueil, l’outil s’ouvre en plein écran, démarre instantanément et garde vos articles consultables hors connexion.',
    bullets: [
      'Rien à télécharger : c’est la page elle-même qui s’installe.',
      'Sur iPhone, les alertes de mots-clés n’existent qu’une fois installée.',
    ],
    visual: <InstallVisual />,
    extra: <InstallStepActions />,
  },
]

export function OnboardingTour({ onFinish }: { onFinish: () => void }) {
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [index, setIndex] = useState(0)

  const step = STEPS[index]
  const isLast = index === STEPS.length - 1

  const goTo = useCallback((next: number) => {
    setIndex(Math.min(STEPS.length - 1, Math.max(0, next)))
  }, [])

  const goNext = useCallback(() => {
    setIndex((current) => {
      if (current === STEPS.length - 1) {
        onFinish()
        return current
      }
      return current + 1
    })
  }, [onFinish])

  const goPrevious = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  // Flèches du clavier : la navigation attendue d'un carrousel au bureau.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [role="radiogroup"], [role="slider"]')) return
      if (event.key === 'ArrowRight') goNext()
      if (event.key === 'ArrowLeft') goPrevious()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goNext, goPrevious])

  const swipeRef = useRef<HTMLDivElement>(null)
  usePointerSwipe(swipeRef, {
    enabled: !isDesktop,
    onSwipeLeft: goNext,
    onSwipeRight: goPrevious,
  })

  const visualPane = (
    <div
      key={prefersReducedMotion ? undefined : `${step.id}-visual`}
      className={cn(
        'flex items-center justify-center',
        isDesktop ? 'h-full p-8' : 'min-h-[11rem] max-h-[36vh] flex-1 px-2 py-4',
        !prefersReducedMotion && 'cst-rise'
      )}
    >
      {step.visual}
    </div>
  )

  const textPane = (
    <div key={prefersReducedMotion ? undefined : `${step.id}-text`} className={cn('px-1', !prefersReducedMotion && 'cst-rise')}>
      <p className="rss-section-label uppercase text-[var(--link)]">{step.eyebrow}</p>
      <h2 className="mt-2 font-serif text-[26px] leading-tight font-medium text-[var(--text-primary)] sm:text-[30px]">
        {step.title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{step.body}</p>
      <ul className="mt-4 space-y-2">
        {step.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2.5 text-[13px] leading-5 text-[var(--text-secondary)]">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--link)]" aria-hidden="true" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      {step.extra ? <div className="mt-4">{step.extra}</div> : null}
    </div>
  )

  const content = (
    <div ref={swipeRef} className="flex min-h-0 flex-1 touch-pan-y flex-col justify-center">
      {visualPane}
      {textPane}
    </div>
  )

  const dots = (
    <div className="flex items-center gap-0 sm:gap-1.5" role="tablist" aria-label="Étapes du tutoriel">
      {STEPS.map((item, dotIndex) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={dotIndex === index}
          aria-label={`Étape ${dotIndex + 1} sur ${STEPS.length} : ${item.title}`}
          onClick={() => goTo(dotIndex)}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--hover)] sm:h-8 sm:w-7'
          )}
        >
          <span aria-hidden="true" className={cn('h-1.5 rounded-full transition-all duration-300', dotIndex === index ? 'w-6 bg-[var(--accent)]' : dotIndex < index ? 'w-1.5 bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]' : 'w-1.5 bg-[var(--border-strong)]')} />
        </button>
      ))}
    </div>
  )

  const skipButton = (
    <button
      type="button"
      onClick={onFinish}
      className="min-h-11 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      Passer
    </button>
  )

  const nextButton = (
    <button
      type="button"
      onClick={goNext}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] px-5 text-sm font-semibold text-[var(--bg-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      {isLast ? 'Commencer' : 'Suivant'}
      {isLast ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </button>
  )

  const previousButton = (
    <button
      type="button"
      onClick={goPrevious}
      disabled={index === 0}
      aria-label="Étape précédente"
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  )

  if (isDesktop) {
    return (
      <Modal
        open
        accessibleTitle="Tutoriel de démarrage"
        onOpenChange={(next) => {
          // Fermer par la croix ou Échap vaut « passer » : dans les deux cas
          // le tutoriel ne doit pas revenir au prochain lancement.
          if (!next) onFinish()
        }}
        size="xl"
        className="overflow-hidden sm:max-w-[920px]"
        bodyClassName="p-0! sm:p-0!"
        footer={
          <div className="flex w-full items-center gap-3">
            {dots}
            <span className="ml-2 text-xs text-[var(--text-muted)] tabular-nums">
              {index + 1} / {STEPS.length}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {skipButton}
              {previousButton}
              {nextButton}
            </div>
          </div>
        }
      >
        <div ref={swipeRef} className="grid min-h-[440px] grid-cols-[1.05fr_1fr]">
          <div className="border-r border-[var(--border)] bg-[var(--bg-secondary)]">{visualPane}</div>
          <div className="flex flex-col justify-center p-9">{textPane}</div>
        </div>
      </Modal>
    )
  }

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) onFinish() }}>
    <Dialog.Portal>
    <Dialog.Content
      aria-label="Tutoriel de démarrage"
      aria-describedby={undefined}
      className="fixed inset-0 z-[80] flex flex-col bg-[var(--bg-primary)]"
    >
      <Dialog.Title className="sr-only">Tutoriel de démarrage</Dialog.Title>
      <div className="flex flex-shrink-0 items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-1">
        <span className="text-xs font-medium tabular-nums text-[var(--text-muted)]">
          {index + 1} / {STEPS.length}
        </span>
        {skipButton}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-4">
        {content}
      </div>

      <div className="flex shrink-0 justify-center">{dots}</div>
      <div className="flex flex-shrink-0 items-center justify-between gap-3 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {previousButton}
        <div className="ml-auto">{nextButton}</div>
      </div>
    </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  )
}
