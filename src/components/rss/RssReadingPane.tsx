import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Newspaper,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button } from '@/components/ui'
import { usePointerSwipe, type SwipeState } from '@/lib/hooks/usePointerSwipe'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { cn } from '@/lib/utils/cn'
import type { RssFeed, RssItem } from '@/types/rss'
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/lib/ai/languages'
import { formatAbsoluteDate, formatRelativeDate } from './rssFormatting'

interface RssReadingPaneProps {
  item: RssItem | null
  feed?: RssFeed
  targetLanguage: LanguageCode
  isTranslating: boolean
  translationError?: string
  showOriginal: boolean
  /** Affiché en lecture plein écran mobile : bouton retour vers la liste. */
  onBack?: () => void
  /** Article précédent de la liste. Absent sur le premier. Mobile uniquement. */
  onPreviousItem?: () => void
  /** Article suivant de la liste. Absent sur le dernier. Mobile uniquement. */
  onNextItem?: () => void
  /** Rang de l’article dans la liste courante, affiché entre les deux chevrons. */
  position?: { index: number; total: number }
  onTranslate: () => void
  onToggleRead: () => void
  onToggleSaved: () => void
  onOpenOriginal: () => void
}

/**
 * Distance de validation du balayage de navigation.
 *
 * Volontairement plus longue que celle d'une ligne de liste (88 px) : on est
 * ici dans un texte que l'on fait défiler, et changer d'article sous les yeux
 * du lecteur est bien plus coûteux qu'un simple « marquer lu ». Le geste doit
 * être décidé, jamais le résidu horizontal d'un défilement vertical.
 */
const NAV_COMMIT_DISTANCE = 104

/** Le volet suit le doigt à vitesse réduite : le geste se lit, sans dérive. */
const FOLLOW_RATIO = 0.45

/** Aux extrémités de la liste, le volet résiste au lieu de suivre. */
const DEAD_END_RATIO = 0.12

/**
 * Volet de lecture. Les flux RSS ne fournissent qu’un résumé : le volet l’affiche
 * en entier et met l’ouverture de l’article original en action principale, plutôt
 * que de laisser croire au texte complet.
 *
 * Sur mobile, le volet se balaie d'un article à l'autre : vers la gauche pour
 * le suivant, vers la droite pour le précédent. Sur le premier article il n'y a
 * rien avant — le balayage vers la droite retombe alors sur le retour à la
 * liste, d'où l'on vient : le geste ne rencontre jamais de cul-de-sac.
 */
export function RssReadingPane({
  item,
  feed,
  targetLanguage,
  isTranslating,
  translationError,
  showOriginal,
  onBack,
  onPreviousItem,
  onNextItem,
  position,
  onTranslate,
  onToggleRead,
  onToggleSaved,
  onOpenOriginal,
}: RssReadingPaneProps) {
  const rootRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [swipe, setSwipe] = useState<SwipeState>({ dx: 0, active: false })

  // Les gestes ne sont câblés qu'en composition mobile — `onBack` en est le
  // marqueur. Au bureau la liste est visible en permanence à côté, et un
  // cliquer-glisser doit rester une sélection de texte.
  const gesturesEnabled = Boolean(onBack)
  // Vers la droite : l'article précédent, ou à défaut le retour à la liste.
  const swipeRightAction = onPreviousItem ?? onBack

  usePointerSwipe(rootRef, {
    enabled: gesturesEnabled,
    commitDistance: NAV_COMMIT_DISTANCE,
    // Un balayage franc mais court reste accepté ; le seuil est relevé pour
    // que seule une intention nette passe.
    commitVelocity: 0.75,
    // |dx| doit valoir le double de |dy| : un défilement en diagonale ne
    // bascule pas d'article.
    directionRatio: 2,
    onSwipeRight: swipeRightAction,
    onSwipeLeft: onNextItem,
    // Sous « animations réduites », le geste se valide toujours : on retire
    // le mouvement, pas la capacité.
    onMove: prefersReducedMotion ? undefined : setSwipe,
  })

  // Le composant n'est pas remonté d'un article à l'autre : sans cela, on
  // arriverait sur le suivant au milieu du texte du précédent.
  useEffect(() => {
    const content = contentRef.current
    if (content) content.scrollTop = 0
  }, [item?.id])

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--hover)]">
          <Newspaper className="h-6 w-6 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Aucun article ouvert</p>
        <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">
          Sélectionnez un article dans la liste pour lire son résumé, le traduire ou l’ouvrir à la source.
        </p>
      </div>
    )
  }

  const cachedTranslation =
    item.translation && item.translation.targetLanguage === targetLanguage ? item.translation : null
  const showTranslated = Boolean(cachedTranslation) && !showOriginal
  const targetLanguageLabel =
    SUPPORTED_LANGUAGES.find((language) => language.code === targetLanguage)?.label ?? targetLanguage

  const originalSummary = item.summary || item.contentSnippet
  const title = showTranslated && cachedTranslation ? cachedTranslation.title : item.title
  const summary =
    showTranslated && cachedTranslation ? cachedTranslation.summary || originalSummary : originalSummary

  const translateLabel = isTranslating
    ? 'Traduction…'
    : cachedTranslation
      ? showTranslated
        ? 'Voir l’original'
        : `Voir en ${targetLanguageLabel}`
      : `Traduire en ${targetLanguageLabel}`
  const translateActionLabel = isTranslating
    ? 'Traduction…'
    : cachedTranslation
      ? showTranslated
        ? 'Original'
        : targetLanguageLabel
      : 'Traduire'
  const savedLabel = item.savedAt ? 'Sauvé' : 'Sauver'
  const readLabel = item.readAt ? 'Non lu' : 'Lu'
  const readActionLabel = item.readAt ? 'Marquer non lu' : 'Marquer lu'
  const mobileActionClass =
    'h-10 shrink-0 px-1.5 text-[11px] min-[390px]:px-2 sm:h-9 sm:px-2.5 sm:text-xs'
  const navButtonClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors active:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-30 pointer-fine:hover:bg-[var(--hover)]'

  // ── Indice visuel du balayage ────────────────────────────────────────────
  // Le volet suit le doigt de façon amortie ; une pastille discrète apparaît
  // du côté vers lequel on va et se remplit une fois le seuil franchi. Rien
  // ne s'affiche tant que le geste n'est pas verrouillé à l'horizontale.
  const goingBack = swipe.dx > 0
  const swipeTarget = goingBack ? swipeRightAction : onNextItem
  const followRatio = swipeTarget ? FOLLOW_RATIO : DEAD_END_RATIO
  const swipeProgress = Math.min(1, Math.abs(swipe.dx) / NAV_COMMIT_DISTANCE)
  const swipeArmed = swipeProgress >= 1
  const showSwipeHint = swipe.active && swipe.dx !== 0 && Boolean(swipeTarget)
  const hintIsBackToList = goingBack && !onPreviousItem
  const HintIcon = hintIsBackToList ? ArrowLeft : goingBack ? ChevronLeft : ChevronRight
  const hintLabel = hintIsBackToList ? 'Retour à la liste' : goingBack ? 'Précédent' : 'Suivant'

  return (
    <article
      ref={rootRef}
      // `pan-y` laisse le défilement vertical au compositeur et nous réserve
      // l'horizontale : c'est ce qui rend le balayage fluide.
      className={cn(
        'relative flex h-full min-h-0 flex-col overflow-hidden',
        gesturesEnabled && 'touch-pan-y'
      )}
    >
      {showSwipeHint ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 z-10 flex items-center px-3',
            goingBack ? 'left-0' : 'right-0'
          )}
          aria-hidden="true"
        >
          <span
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              swipeArmed
                ? 'border-transparent bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]'
            )}
            style={{
              opacity: 0.3 + swipeProgress * 0.7,
              transform: `scale(${0.9 + swipeProgress * 0.1})`,
            }}
          >
            <HintIcon className="h-3.5 w-3.5" />
            {hintLabel}
          </span>
        </div>
      ) : null}

      {/* Couche mobile : c'est elle qui glisse, la pastille reste en place. */}
      <div
        className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]"
        style={{
          transform: swipe.dx !== 0 ? `translate3d(${swipe.dx * followRatio}px, 0, 0)` : undefined,
          // Au relâchement, le volet revient en place au lieu de sauter.
          transition: swipe.active ? undefined : 'transform 180ms ease-out',
          willChange: swipe.active ? 'transform' : undefined,
        }}
      >
        <header className="flex-shrink-0 border-b border-[var(--border)] px-3 py-2.5">
          {onBack ? (
            <div className="-mx-1.5 mb-1 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onBack}
                aria-label="Retour à la liste d’articles"
                className="inline-flex min-h-10 items-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--hover)]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Retour à la liste
              </button>

              {/* Contrepartie visible du balayage : sans elle, le geste
                  resterait invisible pour qui ne l'essaie pas. */}
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={onPreviousItem}
                  disabled={!onPreviousItem}
                  aria-label="Article précédent"
                  title="Article précédent"
                  className={navButtonClass}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                {position ? (
                  <span className="min-w-11 text-center text-[11px] tabular-nums text-[var(--text-muted)]">
                    {position.index + 1}/{position.total}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={onNextItem}
                  disabled={!onNextItem}
                  aria-label="Article suivant"
                  title="Article suivant"
                  className={navButtonClass}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--accent)]">{feed?.title ?? 'Flux inconnu'}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined}>
              {formatRelativeDate(item.publishedAt ?? item.fetchedAt)}
            </time>
            {item.author ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{item.author}</span>
              </>
            ) : null}
          </p>
          <h2 className="mt-1.5 text-lg font-semibold leading-6 text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Publié le {formatAbsoluteDate(item.publishedAt)}
          </p>

          <div className="mt-3 flex flex-nowrap items-center gap-0.5 sm:flex-wrap sm:gap-1">
            <Button
              size="sm"
              variant="primary"
              className={mobileActionClass}
              onClick={onOpenOriginal}
              disabled={!item.link}
            >
              <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="min-[360px]:hidden">Original</span>
              <span className="hidden min-[360px]:inline">Ouvrir l’original</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={mobileActionClass}
              onClick={onTranslate}
              disabled={isTranslating}
              title={translateLabel}
              aria-label={translateLabel}
            >
              {isTranslating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" aria-hidden="true" />
              ) : (
                <Languages className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              )}
              {translateActionLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={mobileActionClass}
              onClick={onToggleSaved}
              title={item.savedAt ? 'Retirer des sauvegardés' : 'Sauvegarder l’article'}
            >
              {item.savedAt ? (
                <BookmarkCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              ) : (
                <Bookmark className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              )}
              {savedLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={mobileActionClass}
              onClick={onToggleRead}
              title={readActionLabel}
              aria-label={readActionLabel}
            >
              {item.readAt ? (
                <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              )}
              {readLabel}
            </Button>
          </div>
        </header>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-auto px-3 py-3">
          {translationError ? (
            <Alert type="error" className="mb-3">
              {translationError}
            </Alert>
          ) : null}

          {showTranslated ? (
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Traduit en {targetLanguageLabel}
              {cachedTranslation?.detectedSourceLanguage
                ? ` · langue détectée : ${cachedTranslation.detectedSourceLanguage}`
                : ''}
            </p>
          ) : null}

          {summary ? (
            <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">{summary}</p>
          ) : (
            <p className="text-sm italic text-[var(--text-muted)]">
              Ce flux ne fournit pas de résumé pour cet article.
            </p>
          )}

          {item.categories.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {item.categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                >
                  {category}
                </span>
              ))}
            </div>
          ) : null}

          <p className="mt-4 text-[11px] text-[var(--text-muted)]">
            Résumé fourni par le flux. Ouvrez l’original pour le texte intégral.
          </p>
        </div>
      </div>
    </article>
  )
}
