import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RssFeed, RssItem, RssItemTranslation } from '@/types/rss'
import { buildArticleShareContent } from '@/lib/rss/articleSharing'
import { RssReadingPane } from './RssReadingPane'

// `false` partout : composition tactile, sans « animations réduites ».
vi.mock('@/lib/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))

/**
 * jsdom n'expose ni `navigator.clipboard` ni `document.execCommand` : le repli
 * du service échouerait pour une raison sans rapport avec ce qu'on vérifie ici,
 * à savoir le câblage du bouton de partage.
 */
const { copyToClipboardMock } = vi.hoisted(() => ({ copyToClipboardMock: vi.fn() }))
vi.mock('@/lib/platform/clipboardService', () => ({
  copyToClipboard: copyToClipboardMock,
  readFromClipboard: vi.fn(),
}))

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

const translation: RssItemTranslation = {
  title: 'Article synthétique 3',
  summary: 'Résumé 3',
  targetLanguage: 'fr',
  translatedAt: now,
}

/** Installe une carte de partage système là où jsdom n'en propose aucune. */
function stubNativeShare(implementation: (data: ShareData) => Promise<void>) {
  const share = vi.fn(implementation)
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  return share
}

afterEach(() => {
  cleanup()
  copyToClipboardMock.mockReset()
  copyToClipboardMock.mockResolvedValue(undefined)
  Reflect.deleteProperty(navigator, 'share')
})

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

/**
 * Le CSS (`touch-action: pan-y`) suffit à WebKit, pas à Chrome Android : sans
 * `preventDefault`, celui-ci convertit le balayage en navigation par geste et
 * annule la séquence de pointeurs. D'où ce contrat, vérifié ici plutôt que sur
 * l'appareil : une fois la direction décidée, le geste nous appartient.
 */
describe('RssReadingPane gesture claim', () => {
  function touchMove(element: Element) {
    const event = new Event('touchmove', { bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event
  }

  it('leaves scrolling alone until the drag is locked horizontally', () => {
    renderPane()
    const pane = screen.getByRole('article')

    fireEvent(pane, pointerEvent('pointerdown', { clientX: 200, clientY: 300 }, 0))
    expect(touchMove(pane).defaultPrevented).toBe(false)

    // Verrouillé à la verticale : le défilement doit rester au navigateur.
    fireEvent(pane, pointerEvent('pointermove', { clientX: 202, clientY: 380 }, 50))
    expect(touchMove(pane).defaultPrevented).toBe(false)
  })

  it('claims the gesture once the drag is locked horizontally', () => {
    renderPane()
    const pane = screen.getByRole('article')

    fireEvent(pane, pointerEvent('pointerdown', { clientX: 200, clientY: 300 }, 0))
    fireEvent(pane, pointerEvent('pointermove', { clientX: 140, clientY: 305 }, 50))
    expect(touchMove(pane).defaultPrevented).toBe(true)

    // Relâché : le geste est rendu, le défilement redevient possible.
    fireEvent(pane, pointerEvent('pointerup', { clientX: 140, clientY: 305 }, 60))
    expect(touchMove(pane).defaultPrevented).toBe(false)
  })
})

describe('RssReadingPane text size', () => {
  it('keeps the current size when no preference is stored', () => {
    renderPane()

    expect(screen.getByTestId('reading-pane-summary')).toHaveClass('text-[18px]', 'leading-[1.65]')
  })

  it('applies the chosen size to the article body and title', () => {
    renderPane({ textSize: 'xlarge' })

    expect(screen.getByTestId('reading-pane-summary')).toHaveClass('text-[22px]', 'leading-[1.7]')
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('text-[38px]')
  })

  it('shrinks the body one step below the default', () => {
    renderPane({ textSize: 'small' })

    expect(screen.getByTestId('reading-pane-summary')).toHaveClass('text-[16px]', 'leading-[1.6]')
  })
})

describe('RssReadingPane sharing', () => {
  const COPIED_MESSAGE = 'Article copié dans le presse papier'

  it('copies the formatted article when the platform has no share card', async () => {
    renderPane()

    fireEvent.click(screen.getByRole('button', { name: 'Partager l’article' }))

    expect(await screen.findByText(COPIED_MESSAGE)).toBeInTheDocument()
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      buildArticleShareContent(item, feed, null).text
    )
  })

  it('hands the article to the system share card when there is one', async () => {
    const share = stubNativeShare(async () => {})
    renderPane()

    fireEvent.click(screen.getByRole('button', { name: 'Partager l’article' }))

    await act(async () => {})
    expect(share).toHaveBeenCalledWith({
      title: 'Synthetic article 3',
      text: buildArticleShareContent(item, feed, null).text,
    })
    // La carte système est son propre accusé de réception.
    expect(copyToClipboardMock).not.toHaveBeenCalled()
    expect(screen.queryByText(COPIED_MESSAGE)).not.toBeInTheDocument()
  })

  /** Fermer la carte est un choix : rien à confirmer, rien à rattraper. */
  it('stays silent when the share card is dismissed', async () => {
    stubNativeShare(async () => {
      throw Object.assign(new Error('dismissed'), { name: 'AbortError' })
    })
    renderPane()

    fireEvent.click(screen.getByRole('button', { name: 'Partager l’article' }))

    await act(async () => {})
    expect(copyToClipboardMock).not.toHaveBeenCalled()
    expect(screen.queryByText(COPIED_MESSAGE)).not.toBeInTheDocument()
  })

  it('falls back to the clipboard when the share card refuses', async () => {
    stubNativeShare(async () => {
      throw Object.assign(new Error('nope'), { name: 'NotAllowedError' })
    })
    renderPane()

    fireEvent.click(screen.getByRole('button', { name: 'Partager l’article' }))

    expect(await screen.findByText(COPIED_MESSAGE)).toBeInTheDocument()
    expect(copyToClipboardMock).toHaveBeenCalledTimes(1)
  })

  it('says so when nothing could be copied', async () => {
    copyToClipboardMock.mockRejectedValue(new Error('clipboard blocked'))
    renderPane()

    fireEvent.click(screen.getByRole('button', { name: 'Partager l’article' }))

    expect(await screen.findByText('Impossible de copier l’article.')).toBeInTheDocument()
  })

  it('shares the translation while it is the version on screen', async () => {
    renderPane({ item: { ...item, translation } })

    fireEvent.click(screen.getByRole('button', { name: 'Partager la traduction' }))

    await screen.findByText(COPIED_MESSAGE)
    const shared = copyToClipboardMock.mock.calls[0][0] as string
    expect(shared).toContain('« Article synthétique 3 »')
    expect(shared).toContain('Résumé 3')
    expect(shared).toContain('(titre original : Synthetic article 3)')
  })

  it('shares the original again once the reader switches back to it', async () => {
    renderPane({ item: { ...item, translation }, showOriginal: true })

    fireEvent.click(screen.getByRole('button', { name: 'Partager l’article' }))

    await screen.findByText(COPIED_MESSAGE)
    const shared = copyToClipboardMock.mock.calls[0][0] as string
    expect(shared).toContain('« Synthetic article 3 »')
    expect(shared).not.toContain('titre original')
  })

  it('clears the confirmation on its own', async () => {
    vi.useFakeTimers()
    try {
      renderPane()
      fireEvent.click(screen.getByRole('button', { name: 'Partager l’article' }))

      // Le partage passe par une promesse : laisser la file s'écouler avant
      // de juger de l'affichage.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText(COPIED_MESSAGE)).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })
      expect(screen.queryByText(COPIED_MESSAGE)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * Le mot avait été sacrifié une première fois pour tenir dans les 320 px, et
   * l'icône seule ne se laissait pas deviner. Ces deux garde-fous figent ce que
   * la reprise a établi : un libellé visible, et une place à part.
   */
  it('stays in the reader toolbar with an explicit name at every width', () => {
    renderPane()

    const share = screen.getByRole('button', { name: 'Partager l’article' })
    expect(share.closest('header')).not.toBeNull()
    expect(share).not.toHaveClass('hidden')
  })

  it('disables sharing when neither the article nor its source has a link', () => {
    renderPane({ item: { ...item, link: '' }, feed: { ...feed, siteUrl: undefined } })

    expect(screen.getByRole('button', { name: 'Partager l’article' })).toBeDisabled()
  })
})
