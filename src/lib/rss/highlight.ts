import { foldForMatching } from './textAnalysis'

export interface HighlightSegment {
  text: string
  match: boolean
}

/**
 * Découpe un texte autour de la première occurrence d’une recherche, avec la
 * même tolérance que le filtre de la liste (casse, diacritiques, İ/ı turcs).
 *
 * Le repli peut changer la longueur d’un caractère (« ß » → « ss ») : on garde
 * donc, pour chaque caractère replié, l’indice du caractère d’origine, afin de
 * surligner exactement ce que l’utilisateur voit.
 */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const foldedQuery = foldForMatching(query.trim())
  if (!foldedQuery || !text) return [{ text, match: false }]

  let folded = ''
  const origin: number[] = []
  const chars = Array.from(text)
  let offset = 0
  for (const char of chars) {
    const foldedChar = foldForMatching(char)
    for (let index = 0; index < foldedChar.length; index += 1) origin.push(offset)
    folded += foldedChar
    offset += char.length
  }

  const start = folded.indexOf(foldedQuery)
  if (start < 0) return [{ text, match: false }]

  const from = origin[start]
  const lastOrigin = origin[start + foldedQuery.length - 1]
  const to = lastOrigin + (text.codePointAt(lastOrigin)! > 0xffff ? 2 : 1)

  return [
    { text: text.slice(0, from), match: false },
    { text: text.slice(from, to), match: true },
    { text: text.slice(to), match: false },
  ].filter((segment) => segment.text.length > 0)
}
