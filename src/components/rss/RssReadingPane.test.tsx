import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RssFeed, RssItem } from '@/types/rss'
import { RssReadingPane } from './RssReadingPane'

// `false` partout : composition tactile, sans « animations réduites ».
vi.mock('@/lib/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))

const now = Date.now()

const feed: RssFeed = {
  id: 'feed-1',
  title: 'Synthetic feed',
  url: 'https://example.com/rss.xml',
  enabled: true,
  refreshIntervalMinutes: 60,
  lastFetchedAt: now,
  lastSuccessAt: now,
  lastError: null,
  consecutiveFailures: 0,
  createdAt: now,
  updatedAt: now,
}

const item: RssItem = {
  id: 'item-3',
  feedId: feed.id,
  guid: 'guid-3',
  title: 'Synthetic article 3',
  link: 'https://example.com/articles/3',
  publishedAt: now,
  summary: 'Summary 3',
  contentSnippet: 'Snippet 3',
  categories: [],
  readAt: null,
  savedAt: null,
  importedReviewIds: [],
  importedAt: null,
  fetchedAt: now,
}

/**
 * `timeStamp` n'est pas réglable via le dictionnaire d'initialisation, et sans
 * lui deux évènements consécutifs sont séparés de zéro milliseconde : la
 * vélocité exploserait et TOUT balayage serait validé, y compris ceux que ce
 * fichier vérifie justement comme trop timides.
 */
function pointerEvent(type: string, init: PointerEventInit, timeStamp: number) {
  const event = new PointerEvent(type, {
    bubbles: true,
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    ...init,
  })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  return event
}

/** Balayage horizontal complet, en trois évènements comme un vrai doigt. */
function swipe(
  element: Element,
  { dx, dy = 0, durationMs = 300 }: { dx: number; dy?: number; durationMs?: number }
) {
  // Loin du bord gauche, qui appartient au geste « retour » du système.
  const startX = 200
  const startY = 300
  fireEvent(element, pointerEvent('pointerdown', { clientX: startX, clientY: startY }, 0))
  fireEvent(
    element,
    pointerEvent(
      'pointermove',
      { clientX: startX + dx / 2, clientY: startY + dy / 2 },
      durationMs / 2
    )
  )
  fireEvent(
    element,
    pointerEvent('pointermove', { clientX: startX + dx, clientY: startY + dy }, durationMs)
  )
  fireEvent(
    element,
    pointerEvent('pointerup', { clientX: startX + dx, clientY: startY + dy }, durationMs)
  )
}

function renderPane(overrides: Partial<Parameters<typeof RssReadingPane>[0]> = {}) {
  const props = {
    item,
    feed,
    targetLanguage: 'fr' as const,
    isTranslating: false,
    showOriginal: false,
    onBack: vi.fn(),
    onPreviousItem: vi.fn(),
    onNextItem: vi.fn(),
    position: { index: 3, total: 10 },
    onTranslate: vi.fn(),
    onToggleRead: vi.fn(),
    onToggleSaved: vi.fn(),
    onOpenOriginal: vi.fn(),
    ...overrides,
  }
  render(<RssReadingPane {...props} />)
  return props
}

afterEach(cleanup)

describe('RssReadingPane article navigation', () => {
  it('shows the position and wires both chevrons', () => {
    const props = renderPane()

    expect(screen.getByText('4/10')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Article précédent' }))
    expect(props.onPreviousItem).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Article suivant' }))
    expect(props.onNextItem).toHaveBeenCalledTimes(1)
  })

  it('disables the chevrons at both ends of the list', () => {
    renderPane({ onPreviousItem: undefined, onNextItem: undefined })

    expect(screen.getByRole('button', { name: 'Article précédent' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Article suivant' })).toBeDisabled()
  })

  it('swipes left to the next article and right to the previous one', () => {
    const props = renderPane()
    const pane = screen.getByRole('article')

    swipe(pane, { dx: -150 })
    expect(props.onNextItem).toHaveBeenCalledTimes(1)
    expect(props.onBack).not.toHaveBeenCalled()

    swipe(pane, { dx: 150 })
    expect(props.onPreviousItem).toHaveBeenCalledTimes(1)
    expect(props.onBack).not.toHaveBeenCalled()
  })

  /**
   * Le cas qui décide de la cohérence du geste : sur le premier article il n'y
   * a rien avant, et un balayage vers la droite doit ramener à la liste plutôt
   * que de ne rien faire.
   */
  it('falls back to the list when swiping right on the first article', () => {
    const props = renderPane({ onPreviousItem: undefined, position: { index: 0, total: 10 } })

    swipe(screen.getByRole('article'), { dx: 150 })
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('ignores a swipe that is too short and too slow to be deliberate', () => {
    const props = renderPane()

    swipe(screen.getByRole('article'), { dx: -60, durationMs: 400 })
    expect(props.onNextItem).not.toHaveBeenCalled()
    expect(props.onBack).not.toHaveBeenCalled()
  })

  it('ignores a mostly vertical drag, which belongs to scrolling', () => {
    const props = renderPane()

    swipe(screen.getByRole('article'), { dx: -150, dy: 220 })
    expect(props.onNextItem).not.toHaveBeenCalled()
    expect(props.onPreviousItem).not.toHaveBeenCalled()
  })

  it('does not arm the gesture in the desktop composition', () => {
    const props = renderPane({ onBack: undefined, onPreviousItem: undefined })

    swipe(screen.getByRole('article'), { dx: -150 })
    expect(props.onNextItem).not.toHaveBeenCalled()
    // Pas de chevrons non plus : la liste est visible juste à côté.
    expect(screen.queryByRole('button', { name: 'Article suivant' })).not.toBeInTheDocument()
  })

  it('reveals the swipe hint only once the drag is locked horizontally', () => {
    renderPane()
    const pane = screen.getByRole('article')

    expect(screen.queryByText('Suivant')).not.toBeInTheDocument()

    fireEvent(pane, pointerEvent('pointerdown', { clientX: 200, clientY: 300 }, 0))
    fireEvent(pane, pointerEvent('pointermove', { clientX: 140, clientY: 300 }, 100))
    expect(screen.getByText('Suivant')).toBeInTheDocument()

    fireEvent(pane, pointerEvent('pointerup', { clientX: 140, clientY: 300 }, 100))
    expect(screen.queryByText('Suivant')).not.toBeInTheDocument()
  })
})
