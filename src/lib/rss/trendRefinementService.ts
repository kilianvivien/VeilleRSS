import { generateWithProvider } from '@/lib/ai/pdfGeneration/providerRouter'
import { createRequestControlContext } from '@/lib/ai/requestControl'
import { getLocalAiTimeoutMs } from '@/lib/ai/localAiTimeout'
import { createLogger } from '@/lib/utils/logger'
import type { AiProvider, Settings } from '@/types/settings'
import type { RssFeed, RssItem, RssTrendAiSelection } from '@/types/rss'
import type { TrendReport, TrendTerm } from './trendAnalysis'

const logger = createLogger('rss:trend-refinement')
const MAX_CANDIDATES = 24
const MAX_HEADLINES_PER_TERM = 5
/** Part minimale d'articles communs pour signaler un doublon possible à l'IA. */
const OVERLAP_HINT_THRESHOLD = 0.3
const MAX_LABEL_LENGTH = 80

const SYSTEM_PROMPT = `Tu es éditeur·rice de veille presse internationale. Tu reçois des candidats-sujets extraits automatiquement des titres d'articles RSS, déjà mesurés localement (volume, progression, nombre de sources). Tu ne recalcules aucun chiffre : tu tries, tu dédoublonnes et tu nommes.

Pour chaque candidat, lis ses titres d'exemple avant de juger le libellé : c'est le sujet réel des articles qui compte, pas le mot extrait.

1. Écarte (en l'omettant de ta réponse) :
   - les mots grammaticaux, verbes, adverbes, quantités, dates seules, mots de titraille (« live », « vidéo », « exclusif », « direct », « analyse », « olacak », « will be »…) ;
   - les noms communs génériques sans objet précis (« personnes », « kişi », « people », « gouvernement », « président », « police ») sauf si les titres montrent qu'ils désignent un seul événement ;
   - les noms de médias, de rubriques ou de sources ;
   - un candidat dont les titres parlent de sujets sans rapport entre eux.
2. Dédoublonne : quand plusieurs candidats désignent la même personne, la même organisation ou le même événement (variantes de nom, traductions, formes fléchies, angles d'une même affaire — voir \`overlapsWith\`, qui indique la part d'articles en commun), garde une seule clé, celle qui a le plus d'articles, et omets les autres.
3. Nomme chaque sujet retenu avec un libellé concis (1 à 5 mots) :
   - forme canonique avec majuscules et diacritiques corrects (« Emmanuel Macron », « Gözaltı », « Union européenne ») ;
   - pour un événement, un libellé qui dit ce qui se passe (« Grève du 17 octobre », « Sommet de l'OTAN ») plutôt qu'un mot isolé ;
   - langue d'origine du sujet ; pas de ponctuation finale, pas de guillemets, aucune information absente des titres.
4. Classe les sujets retenus par importance éditoriale : nombre de sources indépendantes, progression, puis portée de l'enjeu. Un sujet couvert par une seule source passe après les sujets multisources.

N'invente aucun sujet ni aucune clé : chaque \`key\` doit être recopiée exactement depuis l'entrée.
Réponds uniquement avec un objet JSON, sans texte autour : {"terms":[{"key":"clé exacte fournie","label":"libellé concis"}]}
`

interface AiSelectionEntry {
  key?: unknown
  label?: unknown
}

interface AiSelectionPayload {
  terms?: unknown
}

export interface RefineTrendReportInput {
  report: TrendReport
  items: RssItem[]
  feeds: RssFeed[]
  provider: AiProvider
  settings: Settings
  signal?: AbortSignal
}

export interface RefinedTrendResult {
  terms: TrendTerm[]
  /** Clés soumises à l’IA et écartées : à conserver pour rejouer le tri. */
  rejectedKeys: string[]
  refinedAt: number
  provider: AiProvider
}

function stripJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function cleanLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.length > MAX_LABEL_LENGTH) return fallback
  return cleaned
}

/**
 * Applique une sélection IA sans jamais lui permettre d'inventer une tendance
 * ni de modifier les statistiques calculées localement.
 */
export function applyAiTrendSelection(
  candidates: TrendTerm[],
  rawResponse: string
): { terms: TrendTerm[]; rejectedKeys: string[] } {
  let parsed: AiSelectionPayload
  try {
    parsed = JSON.parse(stripJsonFence(rawResponse)) as AiSelectionPayload
  } catch {
    throw new Error("La réponse IA n'est pas un JSON de tendances valide.")
  }

  if (!Array.isArray(parsed.terms)) {
    throw new Error('La réponse IA ne contient pas de liste de tendances.')
  }

  const candidatesByKey = new Map(candidates.map((term) => [term.key, term]))
  const seen = new Set<string>()
  const refined: TrendTerm[] = []

  for (const entry of parsed.terms as AiSelectionEntry[]) {
    if (!entry || typeof entry !== 'object' || typeof entry.key !== 'string') continue
    const candidate = candidatesByKey.get(entry.key)
    if (!candidate || seen.has(candidate.key)) continue
    seen.add(candidate.key)
    refined.push({ ...candidate, label: cleanLabel(entry.label, candidate.label) })
  }

  if (candidates.length > 0 && refined.length === 0) {
    throw new Error("L'IA n'a retenu aucune tendance vérifiable.")
  }

  return {
    terms: refined,
    rejectedKeys: candidates.filter((term) => !seen.has(term.key)).map((term) => term.key),
  }
}

/**
 * Candidats qui partagent une part notable d'articles avec `term` : indice de
 * doublon (« Macron » / « Emmanuel Macron ») ou d'angles d'un même événement.
 */
function overlapHints(
  term: TrendTerm,
  candidates: TrendTerm[],
  itemSets: Map<string, Set<string>>
): { key: string; sharedRatio: number }[] {
  const own = itemSets.get(term.key)
  if (!own || own.size === 0) return []
  return candidates
    .flatMap((other) => {
      if (other.key === term.key) return []
      const otherSet = itemSets.get(other.key)
      if (!otherSet) return []
      let shared = 0
      for (const id of own) if (otherSet.has(id)) shared += 1
      const ratio = shared / Math.min(own.size, otherSet.size)
      return ratio >= OVERLAP_HINT_THRESHOLD ? [{ key: other.key, sharedRatio: Math.round(ratio * 100) / 100 }] : []
    })
    .sort((a, b) => b.sharedRatio - a.sharedRatio)
    .slice(0, 3)
}

/** Titres d'exemple : les plus récents, une source à la fois tant que possible. */
function pickHeadlineIds(term: TrendTerm, itemById: Map<string, RssItem>): string[] {
  const sorted = term.itemIds
    .flatMap((id) => {
      const item = itemById.get(id)
      return item ? [item] : []
    })
    .sort((a, b) => (b.publishedAt ?? b.fetchedAt) - (a.publishedAt ?? a.fetchedAt))
  const picked: RssItem[] = []
  const feeds = new Set<string>()
  for (const item of sorted) {
    if (picked.length >= MAX_HEADLINES_PER_TERM) break
    if (feeds.has(item.feedId)) continue
    feeds.add(item.feedId)
    picked.push(item)
  }
  for (const item of sorted) {
    if (picked.length >= MAX_HEADLINES_PER_TERM) break
    if (!picked.includes(item)) picked.push(item)
  }
  return picked.map((item) => item.id)
}

/** Convertit un affinage tout juste produit en sélection persistable. */
export function toStoredTrendSelection(
  result: RefinedTrendResult,
  options: { providerLabel: string; windowHours: number }
): RssTrendAiSelection {
  return {
    keptKeys: result.terms.map((term) => term.key),
    labels: Object.fromEntries(result.terms.map((term) => [term.key, term.label])),
    rejectedKeys: result.rejectedKeys,
    providerLabel: options.providerLabel,
    refinedAt: result.refinedAt,
    windowHours: options.windowHours,
  }
}

export async function refineTrendReportWithAi({
  report,
  items,
  feeds,
  provider,
  settings,
  signal,
}: RefineTrendReportInput): Promise<RefinedTrendResult> {
  if (provider === 'heuristic') {
    throw new Error('Sélectionnez un fournisseur IA dans Paramètres → IA.')
  }

  const candidates = report.terms.slice(0, MAX_CANDIDATES)
  if (candidates.length === 0) {
    return { terms: [], rejectedKeys: [], refinedAt: Date.now(), provider }
  }

  const itemById = new Map(items.map((item) => [item.id, item]))
  const itemSets = new Map(candidates.map((term) => [term.key, new Set(term.itemIds)]))
  const feedById = new Map(feeds.map((feed) => [feed.id, feed]))
  const payload = {
    windowHours: report.windowHours,
    articleCount: report.itemCount,
    sourceCount: report.sourceCount,
    candidates: candidates.map((term) => ({
      key: term.key,
      label: term.label,
      articleCount: term.count,
      previousCount: term.previousCount,
      isNew: term.isNew,
      sourceCount: term.sourceCount,
      overlapsWith: overlapHints(term, candidates, itemSets),
      // Titres les plus récents et, autant que possible, de sources différentes.
      headlines: pickHeadlineIds(term, itemById).flatMap((itemId) => {
        const item = itemById.get(itemId)
        if (!item) return []
        return [
          {
            title: item.title,
            source: feedById.get(item.feedId)?.title ?? item.feedId,
          },
        ]
      }),
    })),
  }

  const requestControl = createRequestControlContext({
    signal,
    timeoutMs: provider === 'local' || provider === 'apple' ? getLocalAiTimeoutMs(settings) : 90_000,
  })

  try {
    const response = await generateWithProvider(
      provider,
      SYSTEM_PROMPT,
      JSON.stringify(payload),
      () => undefined,
      requestControl.signal
    )
    const selection = applyAiTrendSelection(candidates, response)
    return {
      terms: selection.terms,
      rejectedKeys: selection.rejectedKeys,
      refinedAt: Date.now(),
      provider,
    }
  } catch (error) {
    logger.warn('AI trend refinement failed', { provider, error })
    throw error
  } finally {
    requestControl.cleanup()
  }
}
