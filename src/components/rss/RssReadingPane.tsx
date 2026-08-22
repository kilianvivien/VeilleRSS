import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Newspaper,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Alert, Button } from '@/components/ui'
import { usePointerSwipe } from '@/lib/hooks/usePointerSwipe'
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
  onTranslate: () => void
  onToggleRead: () => void
  onToggleSaved: () => void
  onOpenOriginal: () => void
}

/**
 * Volet de lecture. Les flux RSS ne fournissent qu’un résumé : le volet l’affiche
 * en entier et met l’ouverture de l’article original en action principale, plutôt
 * que de laisser croire au texte complet.
 */
export function RssReadingPane({
  item,
  feed,
  targetLanguage,
  isTranslating,
  translationError,
  showOriginal,
  onBack,
  onTranslate,
  onToggleRead,
  onToggleSaved,
  onOpenOriginal,
}: RssReadingPaneProps) {
  const rootRef = useRef<HTMLElement>(null)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [swipeOffset, setSwipeOffset] = useState(0)

  // `onBack` n'est fourni qu'en composition mobile : le geste ne s'arme donc
  // jamais au bureau, où il entrerait en conflit avec la sélection de texte.
  usePointerSwipe(rootRef, {
    enabled: Boolean(onBack),
    onSwipeRight: onBack,
    // Sous « animations réduites », le geste se valide toujours : on retire
    // le mouvement, pas la capacité.
    onMove: prefersReducedMotion ? undefined : (state) => setSwipeOffset(Math.max(0, state.dx)),
  })

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

  return (
    <article
      ref={rootRef}
      // `pan-y` laisse le défilement vertical au compositeur et nous réserve
      // l'horizontale : c'est ce qui rend le balayage fluide.
      className={cn(
        'flex h-full min-h-0 flex-col',
        Boolean(onBack) && 'touch-pan-y'
      )}
      style={
        swipeOffset > 0
          ? { transform: `translate3d(${swipeOffset * 0.5}px, 0, 0)` }
          : undefined
      }
    >
      <header className="flex-shrink-0 border-b border-[var(--border)] px-3 py-2.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour à la liste d’articles"
            className="-ml-1.5 mb-1 inline-flex min-h-10 items-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--hover)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à la liste
          </button>
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

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
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
    </article>
  )
}
