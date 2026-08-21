import type { PersistStorage, StorageValue } from 'zustand/middleware'

import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('storage:idb')

const DB_NAME = 'veille-web'
const DB_VERSION = 1
const STORE_NAME = 'kv'

/** Mémoire de secours si IndexedDB est indisponible (mode privé, quota…). */
const memoryFallback = new Map<string, string>()

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null)
        return
      }
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME)
          }
        }
        request.onsuccess = () => resolve(request.result)
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
  return dbPromise
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Persistance zustand dans IndexedDB, sans dépendance : une seule base,
 * un object store clé/valeur par magasin nommé. Les données volumineuses
 * (cache d'articles RSS) ne passent pas par la limite des 5 Mo du localStorage.
 */
export function createIndexedDBStorage<T>(name: string): PersistStorage<T> {
  return {
    getItem: async (key): Promise<StorageValue<T> | null> => {
      try {
        const db = await openDb()
        if (!db) {
          const raw = memoryFallback.get(`${name}:${key}`)
          return raw ? (JSON.parse(raw) as StorageValue<T>) : null
        }
        const raw = await runRequest(
          db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(`${name}:${key}`)
        )
        if (typeof raw !== 'string') return null
        return JSON.parse(raw) as StorageValue<T>
      } catch (error) {
        logger.warn(`Lecture impossible pour « ${name} ».`, error)
        return null
      }
    },

    setItem: async (key, value) => {
      const raw = JSON.stringify(value)
      try {
        const db = await openDb()
        if (!db) {
          memoryFallback.set(`${name}:${key}`, raw)
          return
        }
        await runRequest(
          db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(raw, `${name}:${key}`)
        )
      } catch (error) {
        logger.warn(`Écriture impossible pour « ${name} ».`, error)
        memoryFallback.set(`${name}:${key}`, raw)
      }
    },

    removeItem: async (key) => {
      try {
        const db = await openDb()
        if (!db) {
          memoryFallback.delete(`${name}:${key}`)
          return
        }
        await runRequest(
          db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .delete(`${name}:${key}`)
        )
      } catch (error) {
        logger.warn(`Suppression impossible pour « ${name} ».`, error)
      }
    },
  }
}
