import { describe, expect, it } from 'vitest'
import { extractTerms } from './textAnalysis'

const keys = (text: string) => extractTerms(text).map((term) => term.key)

describe('extractTerms', () => {
  it('ignores function words of the other catalog languages', () => {
    const extracted = keys('Die Regierung und der Kanzler streiten über den Haushalt')
    expect(extracted).not.toContain('die')
    expect(extracted).not.toContain('der')
    expect(extracted).not.toContain('und')
    expect(extracted).toContain('kanzler')
  })

  it('never makes a month a topic on its own, but keeps it inside a phrase', () => {
    const extracted = keys('Violences du 17 octobre : Paris mobilise')
    expect(extracted).not.toContain('octobre')
    expect(extracted.some((key) => key.includes('octobre'))).toBe(true)
  })
})
