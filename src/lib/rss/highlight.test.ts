import { describe, expect, it } from 'vitest'
import { splitHighlight } from './highlight'

describe('splitHighlight', () => {
  it('returns the whole text when the query is empty or absent', () => {
    expect(splitHighlight('Budget 2027', '')).toEqual([{ text: 'Budget 2027', match: false }])
    expect(splitHighlight('Budget 2027', 'chypre')).toEqual([{ text: 'Budget 2027', match: false }])
  })

  it('ignores case and diacritics while keeping the original characters', () => {
    expect(splitHighlight('Élargissement de l’UE', 'elargis')).toEqual([
      { text: 'Élargis', match: true },
      { text: 'sement de l’UE', match: false },
    ])
  })

  it('matches Turkish dotted and dotless i', () => {
    expect(splitHighlight('İstanbul ve Ankara', 'istanbul')).toEqual([
      { text: 'İstanbul', match: true },
      { text: ' ve Ankara', match: false },
    ])
  })

  it('maps folds that change length back to the original text', () => {
    expect(splitHighlight('Die Straße nach Berlin', 'nach')).toEqual([
      { text: 'Die Straße ', match: false },
      { text: 'nach', match: true },
      { text: ' Berlin', match: false },
    ])
  })
})
