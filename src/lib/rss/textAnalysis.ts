/**
 * Extraction de termes multilingue pour l’analyse de tendances RSS.
 *
 * Le lecteur mélange des sources turques, françaises et anglophones : la
 * normalisation replie donc les diacritiques des trois langues, y compris le
 * couple i sans point / I avec point du turc, pour qu’un même mot écrit
 * « Türkiye », « Turkiye » ou « TÜRKİYE » compte une seule fois.
 */

const FRENCH_STOPWORDS = [
  'alors',
  'apres',
  'as',
  'au',
  'aucun',
  'aussi',
  'autre',
  'autres',
  'aux',
  'avait',
  'avant',
  'avec',
  'avoir',
  'bien',
  'car',
  'ce',
  'cela',
  'ces',
  'cet',
  'cette',
  'ceux',
  'chaque',
  'chez',
  'comme',
  'comment',
  'dans',
  'de',
  'debut',
  'dedans',
  'dehors',
  'depuis',
  'des',
  'deux',
  'devrait',
  'doit',
  'donc',
  'dont',
  'du',
  'elle',
  'elles',
  'en',
  'encore',
  'entre',
  'est',
  'et',
  'etaient',
  'etait',
  'etant',
  'ete',
  'etre',
  'eu',
  'fait',
  'faire',
  'fois',
  'font',
  'hors',
  'ici',
  'il',
  'ils',
  'jusqu',
  'la',
  'le',
  'les',
  'leur',
  'leurs',
  'lors',
  'lui',
  'mais',
  'me',
  'meme',
  'mes',
  'moins',
  'mon',
  'ne',
  'ni',
  'nos',
  'notre',
  'nous',
  'nouveau',
  'on',
  'ont',
  'ou',
  'par',
  'parce',
  'pas',
  'peut',
  'peu',
  'plupart',
  'plus',
  'pour',
  'pourquoi',
  'quand',
  'que',
  'quel',
  'quelle',
  'quelles',
  'quels',
  'qui',
  'sa',
  'sans',
  'se',
  'sera',
  'ses',
  'seulement',
  'si',
  'sien',
  'son',
  'sont',
  'sous',
  'soyez',
  'sujet',
  'sur',
  'ta',
  'tandis',
  'tels',
  'tes',
  'ton',
  'tous',
  'tout',
  'toute',
  'toutes',
  'tres',
  'trop',
  'tu',
  'un',
  'une',
  'va',
  'voient',
  'vont',
  'votre',
  'vous',
  'y',
  'gens',
  'personne',
  'personnes',
  'sera',
  'seraient',
  'serait',
  'seront',
  'a',
  'l',
  'd',
  'c',
  'j',
  'n',
  's',
  't',
  'm',
  'qu',
]

const ENGLISH_STOPWORDS = [
  'about',
  'after',
  'again',
  'against',
  'all',
  'also',
  'among',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'however',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'may',
  'me',
  'might',
  'more',
  'most',
  'must',
  'my',
  'new',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'out',
  'over',
  'own',
  'said',
  'says',
  'same',
  'she',
  'should',
  'since',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'people',
  'person',
  'persons',
  'become',
  'became',
  'becomes',
  'going',
]

const TURKISH_STOPWORDS = [
  'acaba',
  'ama',
  'ancak',
  'arada',
  'arasinda',
  'arasindaki',
  'ardindan',
  'artik',
  'asla',
  'ayrica',
  'az',
  'bana',
  'bazen',
  'bazi',
  'belki',
  'ben',
  'benim',
  'beri',
  'beş',
  'bile',
  'bir',
  'birçok',
  'biri',
  'birkaç',
  'birlikte',
  'birşey',
  'biz',
  'bizim',
  'bu',
  'buna',
  'bunda',
  'bundan',
  'bunlar',
  'bunu',
  'bunun',
  'burada',
  'çok',
  'çünkü',
  'da',
  'daha',
  'dahi',
  'dan',
  'den',
  'de',
  'defa',
  'değil',
  'diğer',
  'diye',
  'dolayi',
  'edecek',
  'eden',
  'ederek',
  'edilecek',
  'ediliyor',
  'edilmesi',
  'ediyor',
  'eger',
  'en',
  'etme',
  'etmesi',
  'etti',
  'ettigi',
  'gibi',
  'göre',
  'hem',
  'henüz',
  'hep',
  'hepsi',
  'her',
  'herhangi',
  'hiç',
  'ile',
  'ilgili',
  'ise',
  'için',
  'iken',
  'işte',
  'kadar',
  'karsin',
  'katrilyon',
  'kendi',
  'kez',
  'ki',
  'kim',
  'kimse',
  'mi',
  'mu',
  'mü',
  'nasil',
  'ne',
  'neden',
  'nerde',
  'nerede',
  'nereye',
  'niye',
  'niçin',
  'o',
  'olan',
  'olarak',
  'oldu',
  'olduğu',
  'olduklarini',
  'olmadi',
  'olmak',
  'olmasi',
  'olmaz',
  'olsa',
  'olsun',
  'olup',
  'olur',
  'ona',
  'onlar',
  'onlari',
  'onlarin',
  'onu',
  'onun',
  'oysa',
  'öyle',
  'pek',
  'rağmen',
  'sadece',
  'sanki',
  'sen',
  'senin',
  'siz',
  'sizin',
  'sonra',
  'şey',
  'şeyden',
  'şeyi',
  'şu',
  'şuna',
  'tarafindan',
  'trilyon',
  'tüm',
  'üzere',
  'var',
  'vardi',
  've',
  'veya',
  'ya',
  'yani',
  'yapacak',
  'yapilan',
  'yapilmasi',
  'yapiyor',
  'yapmak',
  'yaptigi',
  'yeni',
  'yerine',
  'yine',
  'yoksa',
  'zaten',
  // Les apostrophes turques détachent parfois les suffixes des noms propres
  // (AfD'den, AKP'nin). Ces fragments grammaticaux ne sont jamais des sujets.
  'daki',
  'deki',
  'dir',
  'dır',
  'dur',
  'dür',
  'ndan',
  'nden',
  'nin',
  'nun',
  'nün',
  'tir',
  'tır',
  'tur',
  'tür',
  'yla',
  'yle',
  // Nombres, repères temporels et verbes de dépêche trop génériques pour un classement éditorial.
  'bin',
  'iki',
  'ikiye',
  'üç',
  'dört',
  'gun',
  'gün',
  'gunde',
  'gundeme',
  'yil',
  'yillar',
  'yillik',
  'acikladi',
  'aldi',
  'bulundu',
  'cikti',
  'dedi',
  'geldi',
  'gelen',
  'yapti',
  // Noms humains très larges, auxiliaires et verbes de titraille : ils décrivent
  // la syntaxe d'un titre, pas son sujet. Les variantes fréquentes sont gardées
  // ici en plus du filtre morphologique ci-dessous pour rester explicites.
  'insan',
  'insanlar',
  'kisi',
  'kisiler',
  'kisilik',
  'kisinin',
  'kisiyi',
  'kisiye',
  'kisiden',
  'olacak',
  'olacakti',
  'olacagi',
  'olabilecegi',
  'olabilir',
  'oldugu',
  'oldugunu',
  'oldugunda',
  'oluyor',
  'oluyorlar',
  'olunacak',
  'olundu',
  'olunuyor',
  'olunur',
  'belirtti',
  'bildirdi',
  'duyurdu',
  'ifade',
  'ifadeler',
  'kaydetti',
  'konustu',
  'soyledi',
  'alacak',
  'alindi',
  'altina',
  'belli',
  'dustu',
  'hakkinda',
  'hayatini',
  'kaybetti',
  'korkutan',
  'oglu',
  'pes',
  'pese',
  'feci',
  'adliyede',
  'baba',
  'ceken',
  'edildi',
  'ortaya',
  'saat',
  'supheli',
  'tek',
  'tutuklandi',
  'uzerine',
  'yasindaki',
  'yakalandi',
  'nda',
  'nde',
]

/** Mots présents dans presque toutes les dépêches : ils écrasent le classement. */
const NEWSROOM_STOPWORDS = [
  'actualite',
  'actualites',
  'ajansi',
  'article',
  'articles',
  'breaking',
  'dakika',
  'gundem',
  'haber',
  'haberler',
  'haberi',
  'info',
  'journal',
  'lire',
  'live',
  'news',
  'photo',
  'photos',
  'presse',
  'read',
  'report',
  'reuters',
  'son',
  'update',
  'updates',
  'video',
  'videos',
  'watch',
]

const COMBINING_MARKS = /[\u0300-\u036f]/g
const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u

/**
 * Le turc agglutine personne, temps, modalité et cas. Une liste exacte seule
 * laisse donc passer de nouvelles variantes de « kişi », « olmak », « yapmak »
 * ou « etmek ». Ces motifs sont volontairement bornés à des flexions
 * grammaticales connues : « olay » ou « etkinlik », par exemple, ne correspondent
 * pas et restent des candidats valides.
 */
const TURKISH_LOW_INFORMATION_PATTERNS = [
  /^kisi(?:ler|lik|likti|liktir|nin|yi|ye|den|de|yle)?$/,
  /^insan(?:lar|larin|lari|lara|lardan|lik)?$/,
  /^ol(?:acak(?:ti|tir)?|acagi|abilecegi|du(?:gu|gunu|gunda|ktan)?|uyor(?:lar)?|abilir|mali|masi|madan|unca|ursa|sa|sun|up|mak|madi|maz|an)$/,
  /^yap(?:acak|acagi|ildi|iliyor|ilacak|ilan|ilmasi|iyor|iyorlar|mak|masi|madan|mis|ti|tigi)$/,
  /^ed(?:ecek|en|erek|ilecek|iliyor|ilmesi|iyor)$/,
  /^et(?:mek|mesi|meden|ti|tigi|tiler|mis)$/,
] as const

export const TREND_STOPWORDS: ReadonlySet<string> = new Set(
  [...FRENCH_STOPWORDS, ...ENGLISH_STOPWORDS, ...TURKISH_STOPWORDS, ...NEWSROOM_STOPWORDS].map(
    (word) => foldForMatching(word)
  )
)

/**
 * Réduit un mot à sa forme comparable : minuscules, sans diacritiques, avec les
 * variantes turques du i ramenées à « i » et « ß » à « ss ».
 */
export function foldForMatching(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
}

/**
 * Ces mots peuvent préciser un sujet dans une expression (« sosyal medya »,
 * « yerel seçim », « yardım görevlileri »), mais sont trop larges pour être
 * affichés seuls comme tendance.
 */
export const TREND_GENERIC_UNIGRAMS: ReadonlySet<string> = new Set(
  [
    'dunya',
    'gorevli',
    'anne',
    'ayrilik',
    'bakan',
    'cumhurbaskani',
    'kaza',
    'karari',
    'kontrol',
    'kritik',
    'mudahale',
    'okul',
    'olay',
    'orman',
    'parti',
    'politika',
    'sorusturma',
    'sosyal',
    'turk',
    'yardim',
    'yarali',
    'yerel',
    'world',
    'local',
    'social',
    'help',
    'monde',
    'aide',
  ].map((word) => foldForMatching(word))
)

/** Expressions de titraille récurrentes qui restent vagues même assemblées. */
const LOW_INFORMATION_PHRASES: ReadonlySet<string> = new Set(
  ['kontrol altina', 'altina alindi', 'kontrol altina alindi', 'pes pese'].map((phrase) =>
    foldForMatching(phrase)
  )
)

const MIN_TOKEN_LENGTH = 3

function isPhraseToken(folded: string): boolean {
  if (folded.length < MIN_TOKEN_LENGTH) return false
  if (TREND_STOPWORDS.has(folded)) return false
  if (TURKISH_LOW_INFORMATION_PATTERNS.some((pattern) => pattern.test(folded))) return false
  // Un nombre seul (année, compteur) n’est pas un sujet.
  return !/^\d+$/.test(folded)
}

function isStandaloneToken(folded: string): boolean {
  return isPhraseToken(folded) && !TREND_GENERIC_UNIGRAMS.has(folded)
}

export interface ExtractedTerm {
  /** Clé de comparaison, repliée. */
  key: string
  /** Forme affichée, telle qu’écrite dans l’article. */
  display: string
  /** 1 pour un mot seul, 2 ou 3 pour une expression contiguë. */
  size: 1 | 2 | 3
}

/**
 * Extrait les mots et expressions contiguës de deux ou trois mots d’un texte.
 * Chaque terme n’est retourné qu’une fois par texte : un article qui répète
 * « Erdoğan » dix fois pèse autant qu’un article qui l’écrit une fois, pour que
 * le classement mesure le nombre d’articles et non la verbosité de la source.
 */
export function extractTerms(text: string): ExtractedTerm[] {
  if (!text) return []

  const rawTokens = text.split(TOKEN_SPLIT).filter(Boolean)
  const terms = new Map<string, ExtractedTerm>()

  for (let index = 0; index < rawTokens.length; index += 1) {
    const raw = rawTokens[index]
    const folded = foldForMatching(raw)

    if (isPhraseToken(folded)) {
      if (isStandaloneToken(folded) && !terms.has(folded)) {
        terms.set(folded, { key: folded, display: raw, size: 1 })
      }

      const nextRaw = rawTokens[index + 1]
      if (nextRaw) {
        const nextFolded = foldForMatching(nextRaw)
        if (isPhraseToken(nextFolded)) {
          const bigramKey = `${folded} ${nextFolded}`
          if (!LOW_INFORMATION_PHRASES.has(bigramKey) && !terms.has(bigramKey)) {
            terms.set(bigramKey, {
              key: bigramKey,
              display: `${raw} ${nextRaw}`,
              size: 2,
            })
          }

          const thirdRaw = rawTokens[index + 2]
          if (thirdRaw) {
            const thirdFolded = foldForMatching(thirdRaw)
            if (isPhraseToken(thirdFolded)) {
              const trigramKey = `${bigramKey} ${thirdFolded}`
              if (!LOW_INFORMATION_PHRASES.has(trigramKey) && !terms.has(trigramKey)) {
                terms.set(trigramKey, {
                  key: trigramKey,
                  display: `${raw} ${nextRaw} ${thirdRaw}`,
                  size: 3,
                })
              }
            }
          }
        }
      }
    }
  }

  return Array.from(terms.values())
}

/** Vrai si le texte contient le mot-clé, en ignorant casse et diacritiques. */
export function matchesKeyword(text: string, keyword: string): boolean {
  const foldedKeyword = foldForMatching(keyword).trim()
  if (!foldedKeyword) return false
  return foldForMatching(text).includes(foldedKeyword)
}
