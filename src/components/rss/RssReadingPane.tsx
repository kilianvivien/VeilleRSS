import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Newspaper,
  Share2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button } from '@/components/ui'
import { usePointerSwipe, type SwipeState } from '@/lib/hooks/usePointerSwipe'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { shareOrCopy } from '@/lib/platform/shareService'
import { buildArticleShareContent } from '@/lib/rss/articleSharing'
import { cn } from '@/lib/utils/cn'
import type { RssFeed, RssItem, RssReaderTextSize } from '@/types/rss'
import { normalizeReaderTextSize, READER_TEXT_SIZE_STYLES } from '@/lib/rss/readerTextSize'
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/lib/ai/languages'
import { formatAbsoluteDate, formatRelativeDate } from './rssFormatting'

interface RssReadingPaneProps {
  item: RssItem | null
  feed?: RssFeed
  targetLanguage: LanguageCode
  isTranslating: boolean
  translationError?: string
  showOriginal: boolean
  /** Taille du texte de l’article, réglable dans les paramètres. */
  textSize?: RssReaderTextSize
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
 * Durée d'affichage de la pastille de confirmation du partage.
 *
 * Elle accuse réception d'une action déjà terminée : assez longue pour être
 * lue sans effort, assez courte pour ne pas rester en travers du texte.
 */
const SHARE_FEEDBACK_MS = 2500

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
  textSize,
  onBack,
  onPreviousItem,
  onNextItem,
  position,
  onTranslate,
  onToggleRead,
  onToggleSaved,
  onOpenOriginal,
}: RssReadingPaneProps) {
  const textStyle = READER_TEXT_SIZE_STYLES[normalizeReaderTextSize(textSize)]
  const rootRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [swipe, setSwipe] = useState<SwipeState>({ dx: 0, active: false })
  const [shareFeedback, setShareFeedback] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)

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
    // Même raison : sans cela, la confirmation d'un partage suivrait le
    // lecteur jusque sur l'article suivant.
    setShareFeedback(null)
  }, [item?.id])

  // Chaque partage produit un objet neuf : réafficher le même message relance
  // bien le compte à rebours au lieu de laisser filer celui d'avant.
  useEffect(() => {
    if (!shareFeedback) return
    const timeout = window.setTimeout(() => setShareFeedback(null), SHARE_FEEDBACK_MS)
    return () => window.clearTimeout(timeout)
  }, [shareFeedback])

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
  const shareLabel = showTranslated ? 'Partager la traduction' : 'Partager l’article'
  const shareLink = item.link || feed?.siteUrl || ''
  const shareSucceeded = shareFeedback?.kind === 'success'

  /**
   * Un seul geste, deux issues selon la plateforme : la carte de partage du
   * système là où elle existe, le presse-papiers ailleurs. Le contenu est
   * composé de façon synchrone — une attente ici consommerait le geste
   * utilisateur dont dépend le partage natif.
   */
  // Capturé hors de la fermeture : le garde « aucun article ouvert » plus haut
  // ne suit pas jusque dans un gestionnaire asynchrone.
  const sharedItem = item

  async function handleShare() {
    const content = buildArticleShareContent(
      sharedItem,
      feed,
      showTranslated ? cachedTranslation : null
    )
    const outcome = await shareOrCopy(content)
    if (outcome === 'copied') {
      setShareFeedback({ kind: 'success', message: 'Article copié dans le presse papier' })
    } else if (outcome === 'failed') {
      setShareFeedback({ kind: 'error', message: 'Impossible de copier l’article.' })
    }
    // `shared` et `cancelled` : la carte du système s'est chargée du retour.
  }

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

      {/* Confirmation du partage : ancrée au volet, elle reste visible en
          lecture plein écran mobile comme au bureau — le bandeau en tête
          d'application, lui, serait hors du champ de vision du lecteur. */}
      {shareFeedback ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <span
            role="status"
            className={cn(
              'animate-fade-in max-w-full truncate rounded-full px-3 py-1.5 text-xs font-medium shadow-lg',
              shareFeedback.kind === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
            )}
          >
            {shareFeedback.message}
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
          <h2
            className={cn(
              'mt-1.5 font-semibold text-[var(--text-primary)]',
              textStyle.title
            )}
          >
            {title}
          </h2>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Publié le {formatAbsoluteDate(item.publishedAt)}
          </p>

          {/* Sous 640 px la rangée ne se replie pas : elle défile plutôt que de
              rogner un bouton ou de mordre sur la marge de l'en-tête. */}
          <div className="mt-3 flex flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:gap-1 sm:overflow-x-visible [&::-webkit-scrollbar]:hidden">
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
            {/* Libellé masqué sous `sm` : la rangée est en `flex-nowrap` et
                quatre boutons y tiennent déjà tout juste sur un petit écran. */}
            <Button
              size="sm"
              variant="ghost"
              // Sans libellé sous `sm`, l'icône n'a pas besoin d'autant de
              // flancs : ces quelques pixels sont ce qui fait tenir la rangée
              // entière sur un écran de 320 px.
              className={cn(mobileActionClass, 'px-1')}
              onClick={() => void handleShare()}
              disabled={!shareLink}
              title={shareLabel}
              aria-label={shareLabel}
            >
              {shareSucceeded ? (
                <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              ) : (
                <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">Partager</span>
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
            <p
              data-testid="reading-pane-summary"
              className={cn('whitespace-pre-line text-[var(--text-secondary)]', textStyle.body)}
            >
              {summary}
            </p>
          ) : (
            <p className={cn('italic text-[var(--text-muted)]', textStyle.body)}>
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
