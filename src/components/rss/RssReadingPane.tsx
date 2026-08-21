import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Newspaper,
} from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import type { RssFeed, RssItem } from '@/types/rss'
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/lib/ai/translationService'
import { formatAbsoluteDate, formatRelativeDate } from './rssFormatting'

interface RssReadingPaneProps {
  item: RssItem | null
  feed?: RssFeed
  targetLanguage: LanguageCode
  isTranslating: boolean
  translationError?: string
  showOriginal: boolean
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
  onTranslate,
  onToggleRead,
  onToggleSaved,
  onOpenOriginal,
}: RssReadingPaneProps) {
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

  return (
    <article className="flex h-full min-h-0 flex-col">
      <header className="flex-shrink-0 border-b border-[var(--border)] px-3 py-2.5">
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

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button size="sm" variant="primary" onClick={onOpenOriginal} disabled={!item.link}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Ouvrir l’original
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onTranslate}
            disabled={isTranslating}
            title={translateLabel}
            aria-label={translateLabel}
          >
            {isTranslating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Languages className="h-4 w-4" aria-hidden="true" />
            )}
            {translateActionLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleSaved}
            title={item.savedAt ? 'Retirer des sauvegardés' : 'Sauvegarder l’article'}
          >
            {item.savedAt ? (
              <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            )}
            {savedLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleRead}
            title={readActionLabel}
            aria-label={readActionLabel}
          >
            {item.readAt ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
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
