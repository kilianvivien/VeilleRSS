import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error('Chunk introuvable')
  return <p>Application</p>
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    // React journalise l'erreur rattrapée : on tait le bruit attendu.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders its children while nothing throws', () => {
    render(
      <AppErrorBoundary>
        <Boom explode={false} />
      </AppErrorBoundary>
    )

    expect(screen.getByText('Application')).toBeInTheDocument()
  })

  it('shows the French recovery screen and can retry', () => {
    const { rerender } = render(
      <AppErrorBoundary>
        <Boom explode />
      </AppErrorBoundary>
    )

    expect(screen.getByRole('heading', { name: 'L’application s’est interrompue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recharger l’application/ })).toBeInTheDocument()

    // Les détails restent repliés jusqu'à demande explicite.
    expect(screen.queryByText(/Chunk introuvable/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Détails techniques/ }))
    expect(screen.getByText(/Chunk introuvable/)).toBeInTheDocument()

    // « Réessayer » remonte l'arbre : sans l'erreur, l'app revient.
    rerender(
      <AppErrorBoundary>
        <Boom explode={false} />
      </AppErrorBoundary>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(screen.getByText('Application')).toBeInTheDocument()
  })

  it('asks for confirmation before wiping settings', () => {
    render(
      <AppErrorBoundary>
        <Boom explode />
      </AppErrorBoundary>
    )

    expect(screen.queryByRole('button', { name: 'Confirmer la réinitialisation' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser les réglages/ }))
    expect(screen.getByRole('button', { name: 'Confirmer la réinitialisation' })).toBeInTheDocument()
  })
})
