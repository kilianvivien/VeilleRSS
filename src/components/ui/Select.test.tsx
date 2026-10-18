import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Select } from './Select'

afterEach(cleanup)

function ProviderChoice() {
  const [value, setValue] = useState('gemini')
  return <><Select label="Fournisseur" value={value} onValueChange={setValue} options={[
    { value: '', label: 'Par défaut' }, { value: 'gemini', label: 'Gemini' },
  ]} /><output aria-label="Valeur enregistrée">{value || 'héritée'}</output></>
}

describe('Select', () => {
  it('keeps its placeholder when empty has no corresponding choice', () => {
    render(<Select label="Modèle" value="" placeholder="Choisir un modèle" options={[{ value: 'model', label: 'Modèle' }]} />)
    expect(screen.getByRole('combobox', { name: 'Modèle' })).toHaveTextContent('Choisir un modèle')
  })

  it('offers an explicit default without crashing Radix or storing its internal sentinel', async () => {
    render(<ProviderChoice />)
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Fournisseur' }), { key: 'ArrowDown' })
    const fallback = await screen.findByRole('option', { name: 'Par défaut' })
    fallback.focus()
    fireEvent.keyDown(fallback, { key: 'Enter' })
    expect(screen.getByLabelText('Valeur enregistrée')).toHaveTextContent('héritée')
    expect(screen.getByRole('combobox', { name: 'Fournisseur' })).toHaveTextContent('Par défaut')
  })
})
