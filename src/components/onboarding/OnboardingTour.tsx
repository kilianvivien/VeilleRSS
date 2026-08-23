import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Modal } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { usePointerSwipe } from '@/lib/hooks/usePointerSwipe'
import {
  AiVisual,
  InstallVisual,
  ReadingVisual,
  SourcesVisual,
  TrendsVisual,
  WelcomeVisual,
} from './OnboardingVisuals'
import { ApiKeyInfo } from './ApiKeyInfo'
import { InstallStepActions } from './InstallStepActions'

/**
 * Tutoriel de démarrage — cinq écrans, une fonction clé par écran.
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
    title: 'Votre veille de presse, au même endroit',
    body: 'Suivez vos sources RSS, repérez les sujets qui montent et préparez un briefing — sans quitter le navigateur.',
    bullets: [
      'Tout reste sur cet appareil : aucun compte, aucun serveur.',
      'Fonctionne hors connexion une fois les articles chargés.',
    ],
    visual: <WelcomeVisual />,
  },
  {
    id: 'sources',
    eyebrow: 'Étape 1',
    title: 'Choisissez vos sources',
    body: 'Partez d’un bouquet du catalogue — presse turque, agences, sources internationales — ou ajoutez n’importe quel flux RSS.',
    bullets: [
      'Le bouton Sources ouvre le catalogue vérifié.',
      'Collez une URL de flux, ou importez un fichier OPML.',
    ],
    visual: <SourcesVisual />,
  },
  {
    id: 'reading',
    eyebrow: 'Étape 2',
    title: 'Lisez et triez sans effort',
    body: 'Les articles arrivent dans une liste unique. Ouvrez, marquez, mettez de côté ce qui mérite un second regard.',
    bullets: [
      'Sur mobile, balayez une ligne pour la marquer lue ou la sauvegarder.',
      'La recherche et les filtres réduisent la liste instantanément.',
    ],
    visual: <ReadingVisual />,
  },
  {
    id: 'trends',
    eyebrow: 'Étape 3',
    title: 'Voyez ce qui monte',
    body: 'Le panneau Tendances compare la période choisie à la précédente et fait ressortir les termes en hausse.',
    bullets: [
      'Fenêtre ajustable : 6 heures, 24 heures, 3 ou 7 jours.',
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
        Avec une clé API <ApiKeyInfo className="mx-0.5" />, l’application traduit les articles, trie
        les tendances et rédige un briefing prêt à relire.
      </>
    ),
    bullets: [
      'Ajoutez votre clé dans Paramètres → Intelligence artificielle.',
      'Sans clé, la veille et les tendances fonctionnent quand même.',
    ],
    visual: <AiVisual />,
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

  const content = (
    <div
      ref={swipeRef}
      className="flex min-h-0 flex-1 touch-pan-y flex-col justify-center"
      key={prefersReducedMotion ? undefined : step.id}
    >
      <div
        className={cn(
          // Plafonnée sur mobile : sans borne, l'illustration s'étire sur un
          // grand écran et repousse le texte hors du champ de lecture.
          'flex min-h-[9rem] max-h-[32vh] flex-1 items-center justify-center px-2 py-4',
          'sm:max-h-none sm:min-h-[11rem]',
          !prefersReducedMotion && 'animate-fade-in'
        )}
      >
        {step.visual}
      </div>

      <div className={cn('px-1', !prefersReducedMotion && 'animate-fade-in')}>
        <p className="rss-section-label text-[var(--accent)]">{step.eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)] sm:text-[1.375rem]">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{step.body}</p>
        <ul className="mt-3 space-y-1.5">
          {step.bullets.map((bullet) => (
            <li
              key={bullet}
              className="flex items-start gap-2 text-[13px] leading-5 text-[var(--text-secondary)]"
            >
              <Check
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                aria-hidden="true"
              />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        {step.extra ? <div className="mt-4">{step.extra}</div> : null}
      </div>
    </div>
  )

  const dots = (
    <div className="flex items-center gap-1.5" role="tablist" aria-label="Étapes du tutoriel">
      {STEPS.map((item, dotIndex) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={dotIndex === index}
          aria-label={`Étape ${dotIndex + 1} sur ${STEPS.length} : ${item.title}`}
          onClick={() => goTo(dotIndex)}
          className={cn(
            'h-1.5 rounded-full transition-all duration-200',
            dotIndex === index
              ? 'w-6 bg-[var(--accent)]'
              : 'w-1.5 bg-[var(--border)] hover:bg-[var(--text-muted)]'
          )}
        />
      ))}
    </div>
  )

  const skipButton = (
    <button
      type="button"
      onClick={onFinish}
      className="rounded-macos px-2.5 py-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      Passer
    </button>
  )

  const nextButton = (
    <button
      type="button"
      onClick={goNext}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-macos border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-muted)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_26%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-macos text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  )

  if (isDesktop) {
    return (
      <Modal
        open
        onOpenChange={(next) => {
          // Fermer par la croix ou Échap vaut « passer » : dans les deux cas
          // le tutoriel ne doit pas revenir au prochain lancement.
          if (!next) onFinish()
        }}
        size="lg"
        className="sm:max-w-lg"
        bodyClassName="pt-6"
        footer={
          <div className="flex w-full items-center gap-3">
            {dots}
            <div className="ml-auto flex items-center gap-1">
              {skipButton}
              {previousButton}
              {nextButton}
            </div>
          </div>
        }
      >
        {content}
      </Modal>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tutoriel de démarrage"
      className="fixed inset-0 z-[80] flex flex-col bg-[var(--bg-primary)]"
    >
      <div className="flex flex-shrink-0 items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-1">
        <span className="text-xs font-medium tabular-nums text-[var(--text-muted)]">
          {index + 1} / {STEPS.length}
        </span>
        {skipButton}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-6 pb-4">
        {content}
      </div>

      <div className="flex flex-shrink-0 items-center gap-3 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {previousButton}
        {dots}
        <div className="ml-auto">{nextButton}</div>
      </div>
    </div>
  )
}
