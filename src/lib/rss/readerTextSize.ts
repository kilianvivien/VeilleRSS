import type { RssReaderTextSize } from '@/types/rss'

/**
 * Taille du texte dans le volet de lecture.
 *
 * Un flux RSS ne fournit qu'un résumé : c'est le seul texte long de
 * l'application, et le seul qui se lit de bout en bout. Il mérite donc son
 * propre réglage, indépendant de la densité de la liste — celle-ci resserre
 * des lignes que l'on survole, pas un texte que l'on lit.
 *
 * L'échelle part du corps actuel (`normal`) : une taille en dessous pour qui
 * veut voir plus de texte d'un coup, deux au-dessus pour le confort de
 * lecture. Chaque cran monte le corps ET l'interligne : agrandir les seules
 * lettres tasserait les lignes et rendrait le texte moins lisible, pas plus.
 */
export const READER_TEXT_SIZE_STYLES: Record<
  RssReaderTextSize,
  { title: string; body: string }
> = {
  // Échelle éditoriale du thème « Constellation » : titre et corps en serif
  // (Newsreader), interligne généreux pour un texte que l'on lit en entier.
  small: { title: 'text-[24px] leading-[1.2]', body: 'text-[16px] leading-[1.6]' },
  normal: { title: 'text-[30px] leading-[1.15]', body: 'text-[18px] leading-[1.65]' },
  large: { title: 'text-[34px] leading-[1.12]', body: 'text-[20px] leading-[1.7]' },
  xlarge: { title: 'text-[38px] leading-[1.1]', body: 'text-[22px] leading-[1.7]' },
}

export const DEFAULT_READER_TEXT_SIZE: RssReaderTextSize = 'normal'

export const READER_TEXT_SIZE_OPTIONS: Array<{ value: RssReaderTextSize; label: string }> = [
  { value: 'small', label: 'Petite' },
  { value: 'normal', label: 'Normale (par défaut)' },
  { value: 'large', label: 'Grande' },
  { value: 'xlarge', label: 'Très grande' },
]

/**
 * Ramène une valeur persistée à une taille connue. Les réglages enregistrés
 * avant ce réglage n'ont pas le champ : ils retombent sur le corps actuel,
 * donc rien ne change à l'écran pour les utilisateurs existants.
 */
export function normalizeReaderTextSize(value: RssReaderTextSize | undefined): RssReaderTextSize {
  return value && value in READER_TEXT_SIZE_STYLES ? value : DEFAULT_READER_TEXT_SIZE
}
