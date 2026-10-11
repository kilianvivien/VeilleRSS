import type { PersistStorage, StorageValue } from 'zustand/middleware'

import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('storage:idb')

/** Base d'origine : un object store clé/valeur, tout l'état dans une seule chaîne JSON. */
const LEGACY_DB_NAME = 'veille-web'
const LEGACY_STORE_NAME = 'kv'

/**
 * Base par enregistrement. Elle porte un nom distinct plutôt qu'une version 2
 * de la base d'origine : une montée de version resterait bloquée tant qu'un
 * onglet servi par l'ancien service worker garde la base ouverte.
 */
const DB_NAME = 'veille-rss'
const DB_VERSION = 1
const FEEDS_STORE = 'feeds'
const ITEMS_STORE = 'items'
const META_STORE = 'meta'
const RECORD_STORES = [FEEDS_STORE, ITEMS_STORE, META_STORE]

interface Identified {
  id: string
}

/** Forme minimale de l'état persisté : deux collections identifiées, le reste est opaque. */
interface RecordState {
  feeds: Identified[]
  items: Identified[]
}

interface MetaRecord {
  version?: number
  /** `getAll` rend les flux par identifiant : l'ordre choisi par l'utilisateur vit ici. */
  feedOrder: string[]
  /** Tout l'état persisté hors `feeds` et `items`. */
  state: Record<string, unknown>
}

/** Dernier état écrit, pour ne réécrire que les enregistrements modifiés. */
interface WrittenSnapshot {
  feeds: Map<string, Identified>
  items: Map<string, Identified>
  feedsRef: Identified[]
  itemsRef: Identified[]
  metaJson: string
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction annulée.'))
  })
}

function openRecordsDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(FEEDS_STORE)) {
          db.createObjectStore(FEEDS_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(ITEMS_STORE)) {
          db.createObjectStore(ITEMS_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE)
        }
      }
      request.onsuccess = () => {
        const db = request.result
        // Laisse passer une future montée de version ouverte depuis un autre onglet.
        db.onversionchange = () => db.close()
        resolve(db)
      }
      request.onerror = () => {
        logger.warn('IndexedDB indisponible, bascule en mémoire de session.', request.error)
        resolve(null)
      }
    } catch (error) {
      logger.warn('IndexedDB indisponible, bascule en mémoire de session.', error)
      resolve(null)
    }
  })
}

/**
 * Ouvre la base d'origine sans la créer : chez un nouvel utilisateur, la
 * création est annulée depuis `onupgradeneeded` et l'ouverture échoue.
 */
function openLegacyDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(LEGACY_DB_NAME)
      request.onupgradeneeded = (event) => {
        if (event.oldVersion === 0) request.transaction?.abort()
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = (event) => {
        event.preventDefault()
        resolve(null)
      }
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function readLegacyValue<T>(legacyKey: string): Promise<StorageValue<T> | null> {
  const db = await openLegacyDb()
  if (!db) return null
  try {
    if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) return null
    const raw = await runRequest(
      db.transaction(LEGACY_STORE_NAME, 'readonly').objectStore(LEGACY_STORE_NAME).get(legacyKey)
    )
    return typeof raw === 'string' ? (JSON.parse(raw) as StorageValue<T>) : null
  } finally {
    db.close()
  }
}

async function deleteLegacyValue(legacyKey: string): Promise<void> {
  const db = await openLegacyDb()
  if (!db) return
  try {
    if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) return
    const transaction = db.transaction(LEGACY_STORE_NAME, 'readwrite')
    transaction.objectStore(LEGACY_STORE_NAME).delete(legacyKey)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

function indexById(records: Identified[]): Map<string, Identified> {
  return new Map(records.map((record) => [record.id, record]))
}

/** Écrit les ajouts et modifications, supprime les disparus. Rend vrai s'il y a eu une écriture. */
function writeCollection(
  store: IDBObjectStore,
  next: Identified[],
  previous: { records: Map<string, Identified>; ref: Identified[] } | null
): boolean {
  if (!previous) {
    store.clear()
    for (const record of next) store.put(record)
    return true
  }
  if (previous.ref === next) return false

  let changed = false
  const seen = new Set<string>()
  for (const record of next) {
    seen.add(record.id)
    if (previous.records.get(record.id) !== record) {
      store.put(record)
      changed = true
    }
  }
  for (const id of previous.records.keys()) {
    if (!seen.has(id)) {
      store.delete(id)
      changed = true
    }
  }
  return changed
}

/**
 * Persistance zustand dans IndexedDB, sans dépendance, un enregistrement par
 * flux et par article.
 *
 * L'ancienne persistance sérialisait tout l'état dans une seule chaîne : marquer
 * un article comme lu réécrivait tous les flux et tous les articles. Ici, seuls
 * les enregistrements dont la référence a changé sont réécrits — l'état zustand
 * étant immuable, une référence identique garantit un contenu identique.
 *
 * Au premier chargement, l'ancienne chaîne est convertie puis supprimée ; elle
 * n'est supprimée qu'une fois la nouvelle écriture validée.
 */
export function createRecordStorage<T extends RecordState>(name: string): PersistStorage<T> {
  let dbPromise: Promise<IDBDatabase | null> | null = null
  /** Mémoire de secours si IndexedDB est indisponible (mode privé, quota…). */
  let memoryFallback: StorageValue<T> | null = null
  let written: WrittenSnapshot | null = null
  let writeQueue: Promise<void> = Promise.resolve()
  /**
   * Faux tant que la première lecture n'est pas terminée. Une écriture émise
   * avant porte l'état initial, vide : comparée au contenu lu, elle effacerait
   * tout. Elle est ignorée — l'hydratation la remplace de toute façon.
   */
  let hydrated = false

  const getDb = () => (dbPromise ??= openRecordsDb())
  const storageKey = (key: string) => `${name}:${key}`

  const toMeta = (value: StorageValue<T>): MetaRecord => {
    const { feeds, items, ...state } = value.state
    void items
    return { version: value.version, feedOrder: feeds.map((feed) => feed.id), state }
  }

  const write = async (key: string, value: StorageValue<T>): Promise<void> => {
    const db = await getDb()
    if (!db) {
      memoryFallback = value
      return
    }

    const { feeds, items } = value.state
    const meta = toMeta(value)
    const metaJson = JSON.stringify(meta)
    const previous = written

    try {
      const transaction = db.transaction(RECORD_STORES, 'readwrite')
      const done = transactionDone(transaction)
      writeCollection(
        transaction.objectStore(FEEDS_STORE),
        feeds,
        previous ? { records: previous.feeds, ref: previous.feedsRef } : null
      )
      writeCollection(
        transaction.objectStore(ITEMS_STORE),
        items,
        previous ? { records: previous.items, ref: previous.itemsRef } : null
      )
      if (!previous || previous.metaJson !== metaJson) {
        transaction.objectStore(META_STORE).put(meta, storageKey(key))
      }
      await done
      written = {
        feeds: previous?.feedsRef === feeds ? previous.feeds : indexById(feeds),
        items: previous?.itemsRef === items ? previous.items : indexById(items),
        feedsRef: feeds,
        itemsRef: items,
        metaJson,
      }
    } catch (error) {
      // L'état de la base est incertain : la prochaine écriture repart de zéro.
      written = null
      throw error
    }
  }

  const read = async (db: IDBDatabase, key: string): Promise<StorageValue<T> | null> => {
    const transaction = db.transaction(RECORD_STORES, 'readonly')
    const [meta, feeds, items] = await Promise.all([
      runRequest<MetaRecord | undefined>(
        transaction.objectStore(META_STORE).get(storageKey(key))
      ),
      runRequest<Identified[]>(transaction.objectStore(FEEDS_STORE).getAll()),
      runRequest<Identified[]>(transaction.objectStore(ITEMS_STORE).getAll()),
    ])
    if (!meta) return null

    const rank = new Map(meta.feedOrder.map((id, index) => [id, index]))
    const orderedFeeds = [...feeds].sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
    )
    const value = {
      state: { ...meta.state, feeds: orderedFeeds, items },
      version: meta.version,
    } as StorageValue<T>

    written = {
      feeds: indexById(orderedFeeds),
      items: indexById(items),
      feedsRef: orderedFeeds,
      itemsRef: items,
      metaJson: JSON.stringify(toMeta(value)),
    }
    return value
  }

  return {
    getItem: async (key): Promise<StorageValue<T> | null> => {
      try {
        const db = await getDb()
        if (!db) return memoryFallback

        const stored = await read(db, key)
        if (stored) {
          // Reliquat d'une conversion interrompue juste avant son nettoyage.
          void deleteLegacyValue(storageKey(key)).catch(() => undefined)
          return stored
        }

        const legacy = await readLegacyValue<T>(storageKey(key))
        if (!legacy) return null
        try {
          await write(key, legacy)
          await deleteLegacyValue(storageKey(key))
        } catch (error) {
          // L'ancienne chaîne est intacte : la conversion sera retentée.
          logger.warn(`Conversion du stockage impossible pour « ${name} ».`, error)
        }
        return legacy
      } catch (error) {
        logger.warn(`Lecture impossible pour « ${name} ».`, error)
        return null
      } finally {
        hydrated = true
      }
    },

    setItem: (key, value) => {
      if (!hydrated) return
      writeQueue = writeQueue
        .then(() => write(key, value))
        .catch((error) => {
          logger.warn(`Écriture impossible pour « ${name} ».`, error)
          memoryFallback = value
        })
      return writeQueue
    },

    removeItem: async (key) => {
      memoryFallback = null
      written = null
      try {
        const db = await getDb()
        if (!db) return
        const transaction = db.transaction(RECORD_STORES, 'readwrite')
        transaction.objectStore(FEEDS_STORE).clear()
        transaction.objectStore(ITEMS_STORE).clear()
        transaction.objectStore(META_STORE).delete(storageKey(key))
        await transactionDone(transaction)
        await deleteLegacyValue(storageKey(key))
      } catch (error) {
        logger.warn(`Suppression impossible pour « ${name} ».`, error)
      }
    },
  }
}
