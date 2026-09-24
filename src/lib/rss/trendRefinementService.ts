import { generateWithProvider } from '@/lib/ai/pdfGeneration/providerRouter'
import { createRequestControlContext } from '@/lib/ai/requestControl'
import { getLocalAiTimeoutMs } from '@/lib/ai/localAiTimeout'
import { createLogger } from '@/lib/utils/logger'
import type { AiProvider, Settings } from '@/types/settings'
import type { RssFeed, RssItem, RssTrendAiSelection } from '@/types/rss'
import type { TrendReport, TrendTerm } from './trendAnalysis'

const logger = createLogger('rss:trend-refinement')
const MAX_CANDIDATES = 24
const MAX_HEADLINES_PER_TERM = 4
const MAX_LABEL_LENGTH = 80

const SYSTEM_PROMPT = `Tu es un filtre taxonomique éditorial pour une veille presse multilingue.
Le calcul local a déjà mesuré la fréquence, la progression et la diversité des sources. Ton rôle est uniquement d'écarter les candidats sans valeur éditoriale et, si nécessaire, de rendre leur libellé plus clair.

Règles impératives :
- conserve seulement des sujets concrets : personne nommée, organisation, lieu, politique publique, événement, conflit, accord, décision ou enjeu précis ;
- rejette les mots grammaticaux, verbes auxiliaires, verbes de titraille, quantités vagues et noms humains génériques (par exemple « kişi », « people », « personnes », « olacak », « will be ») ;
- rejette un terme dont les titres associés ne parlent pas d'un même sujet ;
- n'invente aucun sujet et n'ajoute aucune clé ;
- garde la langue d'origine du sujet ;
- classe les termes retenus du plus important au moins important ;
- réponds uniquement avec un objet JSON de la forme {"terms":[{"key":"clé exacte fournie","label":"libellé concis"}]}.
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
      sourceCount: term.sourceCount,
      headlines: term.itemIds.slice(0, MAX_HEADLINES_PER_TERM).flatMap((itemId) => {
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
