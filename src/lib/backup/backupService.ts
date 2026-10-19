import type { RssFeed, RssItem, RssItemTranslation, RssSettings, RssWatchedKeyword } from '@/types/rss'
import {
  ACCENT_COLORS,
  CONSTELLATION_STYLES,
  TREND_PALETTES,
  type AccentColor,
  type ConstellationStyle,
  type Settings,
  type TrendPalette,
} from '@/types/settings'
import { defaultRssSettings, useRssStore } from '@/stores/rssStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { SECRET_SETTINGS_KEYS, SETTINGS_KEYS, defaultSettings } from '@/lib/constants/settingsDefaults'
import { isKnownProvider } from '@/lib/ai/providerRegistry'
import { validateRssFeedUrl } from '@/lib/rss/rssUrlValidation'

/**
 * Sauvegarde complète de la veille : flux, articles (lus, sauvegardés,
 * traduits), mots-clés suivis et préférences.
 *
 * Les données ne vivent que dans ce navigateur, qui peut les évincer ; l'OPML
 * ne couvre que la liste des flux. Le fichier produit ne contient ni clé API
 * ni adresse de relais IA : restauré sur un autre appareil, il ne doit pas
 * pouvoir rediriger les requêtes IA.
 */

export const BACKUP_APP_ID = 'veille-rss'
export const BACKUP_FORMAT_VERSION = 1
const MAX_BACKUP_BYTES = 50 * 1024 * 1024
const MAX_WATCHED_KEYWORDS = 30

/** Réglages jamais exportés ni restaurés. */
const EXCLUDED_PREFERENCE_KEYS = new Set<keyof Settings>([
  ...SECRET_SETTINGS_KEYS,
  'localAiEndpoint',
  'appleFmBridgeUrl',
])

const PROVIDER_PREFERENCE_KEYS = new Set<keyof Settings>([
  'aiProvider',
  'translationAiProvider',
  'rssAiProvider',
])

export interface VeilleBackup {
  app: typeof BACKUP_APP_ID
  formatVersion: number
  exportedAt: number
  appVersion: string
  rss: {
    feeds: RssFeed[]
    items: RssItem[]
    settings: RssSettings
  }
  preferences: Partial<Settings>
}

export interface BackupSummary {
  exportedAt: number
  feedCount: number
  itemCount: number
  savedCount: number
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
}

function exportablePreferences(settings: Settings): Partial<Settings> {
  const preferences: Record<string, unknown> = {}
  for (const key of SETTINGS_KEYS) {
    if (EXCLUDED_PREFERENCE_KEYS.has(key)) continue
    const value = settings[key]
    if (value !== undefined) preferences[key] = value
  }
  return preferences as Partial<Settings>
}

export function createBackup(now = Date.now()): VeilleBackup {
  const { feeds, items, settings } = useRssStore.getState()
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    appVersion: __APP_VERSION__,
    rss: { feeds, items, settings },
    preferences: exportablePreferences(useSettingsStore.getState()),
  }
}

export function backupFilename(now = Date.now()): string {
  return `veille-rss-sauvegarde-${new Date(now).toISOString().slice(0, 10)}.json`
}

function parseFeed(value: unknown): RssFeed | null {
  if (!isObject(value)) return null
  const id = asString(value.id)
  const validation = validateRssFeedUrl(asString(value.url) ?? '', { allowHttp: true })
  if (!id || !validation.ok) return null

  const now = Date.now()
  const refreshInterval = asTimestamp(value.refreshIntervalMinutes)
  return {
    id,
    title: asString(value.title)?.trim() || new URL(validation.url).hostname,
    url: validation.url,
    siteUrl: asString(value.siteUrl),
    description: asString(value.description),
    category: asString(value.category),
    catalogId: asString(value.catalogId),
    enabled: value.enabled !== false,
    refreshIntervalMinutes: refreshInterval !== null && refreshInterval > 0 ? refreshInterval : null,
    lastFetchedAt: asTimestamp(value.lastFetchedAt),
    lastSuccessAt: asTimestamp(value.lastSuccessAt),
    lastError: asString(value.lastError) ?? null,
    consecutiveFailures: Math.max(0, asTimestamp(value.consecutiveFailures) ?? 0),
    createdAt: asTimestamp(value.createdAt) ?? now,
    updatedAt: asTimestamp(value.updatedAt) ?? now,
  }
}

function parseTranslation(value: unknown): RssItemTranslation | null {
  if (!isObject(value)) return null
  const title = asString(value.title)
  const summary = asString(value.summary)
  const targetLanguage = asString(value.targetLanguage)
  if (title === undefined || summary === undefined || !targetLanguage) return null
  return {
    title,
    summary,
    targetLanguage,
    detectedSourceLanguage: asString(value.detectedSourceLanguage),
    translatedAt: asTimestamp(value.translatedAt) ?? Date.now(),
  }
}

function parseItem(value: unknown): RssItem | null {
  if (!isObject(value)) return null
  const id = asString(value.id)
  const feedId = asString(value.feedId)
  const publishedAt = asTimestamp(value.publishedAt)
  // Même règle qu'à la collecte : un article sans date n'est pas affichable.
  if (!id || !feedId || publishedAt === null) return null

  const link = asString(value.link) ?? ''
  const summary = asString(value.summary) ?? ''
  return {
    id,
    feedId,
    guid: asString(value.guid) || link || id,
    title: asString(value.title) || 'Sans titre',
    // Le lien finit dans un `href` : rien d'autre que du HTTP(S).
    link: /^https?:\/\//i.test(link) ? link : '',
    author: asString(value.author),
    publishedAt,
    summary,
    contentSnippet: asString(value.contentSnippet) ?? summary.slice(0, 500),
    categories: asStringArray(value.categories),
    readAt: asTimestamp(value.readAt),
    savedAt: asTimestamp(value.savedAt),
    importedReviewIds: asStringArray(value.importedReviewIds),
    importedAt: asTimestamp(value.importedAt),
    fetchedAt: asTimestamp(value.fetchedAt) ?? publishedAt,
    translation: parseTranslation(value.translation),
  }
}

function parseWatchedKeywords(value: unknown): RssWatchedKeyword[] {
  if (!Array.isArray(value)) return []
  const keywords: RssWatchedKeyword[] = []
  for (const entry of value) {
    if (!isObject(entry)) continue
    const term = asString(entry.term)?.trim()
    if (!term) continue
    keywords.push({ term, createdAt: asTimestamp(entry.createdAt) ?? Date.now() })
  }
  return keywords.slice(0, MAX_WATCHED_KEYWORDS)
}

function parseRssSettings(value: unknown): RssSettings {
  const source = isObject(value) ? value : {}
  const settings: Record<string, unknown> = { ...defaultRssSettings }

  for (const [key, fallback] of Object.entries(defaultRssSettings)) {
    const candidate = source[key]
    if (candidate !== undefined && typeof candidate === typeof fallback && !Array.isArray(fallback)) {
      settings[key] = candidate
    }
  }
  if (source.defaultRefreshIntervalMinutes === null) settings.defaultRefreshIntervalMinutes = null

  const watchedKeywords = parseWatchedKeywords(source.watchedKeywords)
  settings.watchedKeywords = watchedKeywords
  settings.savedKeywordSearches = watchedKeywords.map((keyword) => keyword.term)
  // L'autorisation de notifier appartient au navigateur, pas à la sauvegarde.
  settings.keywordNotificationsEnabled =
    source.keywordNotificationsEnabled === true &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'

  return settings as unknown as RssSettings
}

function parsePreferences(value: unknown): Partial<Settings> {
  if (!isObject(value)) return {}
  const defaults = defaultSettings as Record<string, unknown>
  const preferences: Record<string, unknown> = {}

  for (const key of SETTINGS_KEYS) {
    if (EXCLUDED_PREFERENCE_KEYS.has(key)) continue
    const candidate = value[key]
    if (candidate === undefined) continue

    if (PROVIDER_PREFERENCE_KEYS.has(key)) {
      if (isKnownProvider(candidate)) preferences[key] = candidate
    } else if (key === 'theme') {
      if (candidate === 'light' || candidate === 'dark' || candidate === 'system') {
        preferences[key] = candidate
      }
    } else if (key === 'accentColor') {
      if (ACCENT_COLORS.includes(candidate as AccentColor)) preferences[key] = candidate
    } else if (key === 'trendPalette') {
      if (TREND_PALETTES.includes(candidate as TrendPalette)) preferences[key] = candidate
    } else if (key === 'constellationStyle') {
      if (CONSTELLATION_STYLES.includes(candidate as ConstellationStyle)) preferences[key] = candidate
    } else if (defaults[key] === undefined) {
      // Champs sans valeur par défaut : uniquement des identifiants de modèle.
      if (typeof candidate === 'string') preferences[key] = candidate
    } else if (typeof candidate === typeof defaults[key]) {
      preferences[key] = candidate
    }
  }
  return preferences as Partial<Settings>
}

function uniqueById<T extends { id: string }>(records: T[]): T[] {
  return Array.from(new Map(records.map((record) => [record.id, record])).values())
}

/**
 * Lit un fichier de sauvegarde. Rien n'est repris tel quel : chaque flux,
 * article et réglage est reconstruit champ par champ, et ce qui est illisible
 * est écarté.
 */
export function parseBackup(text: string): VeilleBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Fichier de sauvegarde illisible : ce n’est pas du JSON valide.')
  }

  if (!isObject(raw) || raw.app !== BACKUP_APP_ID || !isObject(raw.rss)) {
    throw new Error('Ce fichier n’est pas une sauvegarde de Veille RSS.')
  }
  const formatVersion = asTimestamp(raw.formatVersion)
  if (formatVersion === null || formatVersion < 1) {
    throw new Error('Ce fichier n’est pas une sauvegarde de Veille RSS.')
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      'Cette sauvegarde vient d’une version plus récente de l’application. Mettez l’application à jour avant de la restaurer.'
    )
  }

  const rawFeeds = Array.isArray(raw.rss.feeds) ? raw.rss.feeds : []
  const rawItems = Array.isArray(raw.rss.items) ? raw.rss.items : []
  const feeds = uniqueById(rawFeeds.map(parseFeed).filter((feed) => feed !== null))
  const items = uniqueById(rawItems.map(parseItem).filter((item) => item !== null))

  if (feeds.length === 0 && items.length === 0 && rawFeeds.length + rawItems.length > 0) {
    throw new Error('Aucun flux ni article lisible dans cette sauvegarde.')
  }

  return {
    app: BACKUP_APP_ID,
    formatVersion,
    exportedAt: asTimestamp(raw.exportedAt) ?? Date.now(),
    appVersion: asString(raw.appVersion) ?? '',
    rss: { feeds, items, settings: parseRssSettings(raw.rss.settings) },
    preferences: parsePreferences(raw.preferences),
  }
}

export async function readBackupFile(file: File): Promise<VeilleBackup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('Fichier trop volumineux pour être une sauvegarde de Veille RSS.')
  }
  return parseBackup(await file.text())
}

export function summarizeBackup(backup: VeilleBackup): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    feedCount: backup.rss.feeds.length,
    itemCount: backup.rss.items.length,
    savedCount: backup.rss.items.filter((item) => item.savedAt).length,
  }
}

/**
 * Remplace les flux, articles et réglages de veille par ceux de la sauvegarde.
 * Les clés API et adresses de relais déjà saisies dans ce navigateur restent
 * en place.
 */
export function restoreBackup(backup: VeilleBackup): void {
  useRssStore.getState().replaceData(backup.rss)
  useSettingsStore.getState().updateSettings(backup.preferences)
}
