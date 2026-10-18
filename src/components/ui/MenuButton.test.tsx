import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuButton } from './MenuButton'

afterEach(cleanup)

describe('MenuButton', () => {
  it('opens from the keyboard, skips disabled actions, and restores focus on Escape', () => {
    render(<MenuButton label="Actions" entries={[
      { label: 'Indisponible', onSelect: vi.fn(), disabled: true },
      { label: 'Modifier', onSelect: vi.fn() },
      { label: 'Exporter', onSelect: vi.fn() },
    ]}>Ouvrir</MenuButton>)
    const trigger = screen.getByRole('button', { name: 'Actions' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Exporter' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('portals outside a scrolling container and closes on an outside press', () => {
    render(<section data-testid="scroller" style={{ overflow: 'hidden' }}>
      <MenuButton label="Actions" entries={[{ label: 'Modifier', onSelect: vi.fn() }]}>Ouvrir</MenuButton>
    </section>)
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.getByTestId('scroller')).not.toContainElement(screen.getByRole('menu'))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
