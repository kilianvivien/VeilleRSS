import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

let isWideViewport = false
vi.mock('@/lib/hooks/useMediaQuery', () => ({
  useMediaQuery: () => isWideViewport,
}))

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onOpenChange = vi.fn()
  render(
    <Modal open onOpenChange={onOpenChange} title="Paramètres" {...props}>
      <p>Contenu</p>
    </Modal>
  )
  const root = document.querySelector('.modal-content-root')
  if (!root) throw new Error('conteneur de modale introuvable')
  return { onOpenChange, root }
}

afterEach(() => {
  cleanup()
  isWideViewport = false
})

describe('Modal — feuille mobile', () => {
  it('closes when the exposed area above the sheet is tapped', () => {
    const { onOpenChange, root } = renderModal()

    fireEvent.click(root)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays open when the tap lands on the sheet itself', () => {
    const { onOpenChange } = renderModal()

    fireEvent.click(screen.getByText('Contenu'))
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('honours disableDismiss', () => {
    const { onOpenChange, root } = renderModal({ disableDismiss: true })

    fireEvent.click(root)
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('Modal — carte bureau', () => {
  it('ignores clicks on the surrounding padding', () => {
    isWideViewport = true
    const { onOpenChange, root } = renderModal()

    fireEvent.click(root)
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
