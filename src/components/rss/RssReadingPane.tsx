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
  Send,
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
  /** Sujet de tendance de l'article, pour le relier à la constellation. */
  topic?: ReaderTopic
  /** Ouvre la vue Tendances sur le sujet de l'article. */
  onShowTopic?: () => void
  /** Sujets proposés quand aucun article n'est ouvert. */
  suggestions?: ReaderSuggestion[]
}

export interface ReaderTopic {
  label: string
  color: string
  delta: string
  related: { label: string; color: string }[]
  /** Autres sources qui couvrent le même sujet. */
  alsoCoveredBy: string[]
}

export interface ReaderSuggestion {
  key: string
  label: string
  color: string
  delta: string
  count: number
  onSelect: () => void
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
  topic,
  onShowTopic,
  suggestions = [],
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
      <div className="flex h-full flex-col items-center justify-center overflow-auto p-10 text-center">
        <div className="cst-rise flex max-w-md flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <Newspaper className="h-6 w-6 text-[var(--link)]" aria-hidden="true" />
          </span>
          <p className="font-serif text-2xl font-medium text-[var(--text-primary)]">Aucun article ouvert</p>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            Choisissez un article dans la liste, ou partez d’un sujet qui monte.
          </p>
          {suggestions.length > 0 ? (
            <ul className="mt-3 flex w-full flex-col gap-1.5">
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.key} className="cst-rise" style={{ animationDelay: `${0.1 + index * 0.06}s` }}>
                  <button
                    type="button"
                    onClick={suggestion.onSelect}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors pointer-fine:hover:bg-[var(--hover)]"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: suggestion.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{suggestion.label}</span>
                    <span className="text-xs text-[var(--text-muted)] tabular-nums">{suggestion.count} articles</span>
                    <span className="font-mono text-xs tabular-nums" style={{ color: suggestion.color }}>
                      {suggestion.delta}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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

  const savedActionLabel = item.savedAt ? 'Retirer des sauvegardés' : 'Sauvegarder l’article'
  const readActionLabel = item.readAt ? 'Marquer non lu' : 'Marquer lu'
  const navButtonClass =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors active:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-30 pointer-fine:hover:bg-[var(--hover)]'

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
        {/* Barre d'outils : la source à gauche, les actions à droite. */}
        <header className="flex flex-shrink-0 flex-wrap items-center gap-1 border-b border-[var(--border)] px-2 py-2 sm:flex-nowrap sm:px-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Retour à la liste d’articles"
              className={navButtonClass}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <span className="hidden min-w-0 flex-1 items-center gap-2.5 sm:flex">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold text-[#0b0d12]"
              style={{ backgroundColor: topic?.color ?? 'var(--accent)' }}
            >
              {(feed?.title ?? '?').trim().charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{feed?.title ?? 'Flux inconnu'}</span>
              <time
                className="text-[11px] text-[var(--text-muted)]"
                dateTime={item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined}
              >
                {formatRelativeDate(item.publishedAt ?? item.fetchedAt)}
              </time>
            </span>
          </span>
          {onBack ? <span className="flex-1 sm:hidden" /> : null}

          {onBack ? (
            <span className="flex shrink-0 items-center">
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
            </span>
          ) : null}

          <span className="flex shrink-0 items-center gap-0.5 max-[389px]:basis-full max-[389px]:justify-end">
            <ToolbarButton onClick={onTranslate} disabled={isTranslating} label={translateLabel} active={showTranslated}>
              {isTranslating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Languages className="h-4 w-4" aria-hidden="true" />
              )}
            </ToolbarButton>
            <ToolbarButton onClick={onToggleSaved} label={savedActionLabel} active={Boolean(item.savedAt)} activeColor="var(--trend-hot)">
              {item.savedAt ? (
                <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bookmark className="h-4 w-4" aria-hidden="true" />
              )}
            </ToolbarButton>
            <ToolbarButton onClick={onToggleRead} label={readActionLabel}>
              {item.readAt ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </ToolbarButton>
            <ToolbarButton onClick={() => void handleShare()} disabled={!shareLink} label={shareLabel}>
              {shareSucceeded ? <Check className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            </ToolbarButton>
            <button
              type="button"
              onClick={onOpenOriginal}
              disabled={!item.link}
              className="ml-1 hidden h-9 items-center gap-1.5 rounded-full bg-[var(--text-primary)] px-4 text-xs font-semibold text-[var(--bg-primary)] transition-opacity disabled:opacity-40 pointer-fine:hover:opacity-90 lg:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Ouvrir l’original
            </button>
          </span>
        </header>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-auto">
          <div key={item.id} className="cst-rise mx-auto flex max-w-[700px] flex-col gap-5 px-5 pt-6 pb-10 sm:px-10 sm:pt-10">
            {topic ? (
              <button
                type="button"
                onClick={onShowTopic}
                disabled={!onShowTopic}
                className="flex min-h-11 w-fit max-w-full items-center gap-2 rounded-full border border-[var(--border)] py-1 pr-3 pl-2 text-xs text-[var(--text-primary)] transition-colors pointer-fine:enabled:hover:bg-[var(--hover)]"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: topic.color }} aria-hidden="true" />
                <span className="min-w-0 truncate font-medium">{topic.label}</span>
                <span className="font-mono tabular-nums" style={{ color: topic.color }}>
                  {topic.delta}
                </span>
              </button>
            ) : null}

            <h2 className={cn('font-serif font-medium tracking-[-0.01em] text-[var(--text-primary)]', textStyle.title)}>
              {title}
            </h2>

            <p className="-mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--text-muted)]">
              <span className="font-medium text-[var(--link)] sm:hidden">{feed?.title ?? 'Flux inconnu'}</span>
              <span className="sm:hidden" aria-hidden="true">·</span>
              {item.author ? (
                <>
                  <span>{item.author}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span>Publié le {formatAbsoluteDate(item.publishedAt)}</span>
              {showTranslated ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Traduit en {targetLanguageLabel}
                    {cachedTranslation?.detectedSourceLanguage
                      ? ` depuis : ${cachedTranslation.detectedSourceLanguage}`
                      : ''}
                  </span>
                </>
              ) : null}
            </p>

            {translationError ? <Alert type="error">{translationError}</Alert> : null}

            {summary ? (
              <p
                data-testid="reading-pane-summary"
                className={cn('font-serif whitespace-pre-line text-[var(--text-secondary)]', textStyle.body)}
              >
                {summary}
              </p>
            ) : (
              <p className={cn('font-serif italic text-[var(--text-muted)]', textStyle.body)}>
                Ce flux ne fournit pas de résumé pour cet article.
              </p>
            )}

            {item.categories.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {item.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-[var(--hover)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]"
                  >
                    {category}
                  </span>
                ))}
              </div>
            ) : null}

            {topic ? (
              <section
                aria-label="Dans la constellation"
                className="flex flex-col gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="relative h-9 w-14 shrink-0">
                    <span className="absolute top-[17px] left-2 h-0.5 w-10 -rotate-12 bg-[color-mix(in_srgb,var(--text-primary)_22%,transparent)]" />
                    <span
                      className="absolute top-3 left-0 h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: topic.related[0]?.color ?? 'var(--trend-calm)' }}
                    />
                    <span className="absolute top-1 left-[18px] h-7 w-7 rounded-full" style={{ backgroundColor: topic.color }} />
                    <span
                      className="absolute top-0 left-[44px] h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: topic.related[1]?.color ?? 'var(--trend-new)' }}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[11px] text-[var(--text-muted)]">Dans la constellation</span>
                    <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {topic.label} · {topic.delta}
                    </span>
                  </span>
                  {onShowTopic ? (
                    <button
                      type="button"
                      onClick={onShowTopic}
                      className="min-h-11 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--link)] transition-colors pointer-fine:hover:bg-[var(--hover)]"
                    >
                      Voir la tendance →
                    </button>
                  ) : null}
                </div>
                {topic.related.length > 0 || topic.alsoCoveredBy.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    {topic.alsoCoveredBy.length > 0 ? (
                      <>
                        <span>Aussi couvert par</span>
                        {topic.alsoCoveredBy.map((source) => (
                          <span key={source} className="max-w-[12rem] truncate rounded-full bg-[var(--hover)] px-2.5 py-0.5 text-[var(--text-primary)]">
                            {source}
                          </span>
                        ))}
                      </>
                    ) : null}
                    {topic.related.length > 0 ? (
                      <>
                        <span className={cn(topic.alsoCoveredBy.length > 0 && 'ml-1')}>Lié à</span>
                        {topic.related.map((related) => (
                          <span key={related.label} className="flex items-center gap-1 rounded-full bg-[var(--hover)] px-2.5 py-0.5 text-[var(--text-primary)]">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: related.color }} aria-hidden="true" />
                            {related.label}
                          </span>
                        ))}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="flex flex-col items-start gap-3 border-t border-[var(--border)] pt-5">
              <p className="text-xs text-[var(--text-muted)]">
                Résumé fourni par le flux. Le texte intégral est sur le site de l’éditeur.
              </p>
              <Button variant="primary" onClick={onOpenOriginal} disabled={!item.link}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Lire l’article complet
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function ToolbarButton({
  onClick,
  disabled,
  label,
  active = false,
  activeColor = 'var(--link)',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  active?: boolean
  activeColor?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors disabled:opacity-40 sm:h-9 sm:w-9 pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)]"
      style={active ? { color: activeColor } : undefined}
    >
      {children}
    </button>
  )
}
