import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageValue } from 'zustand/middleware'
import { createRecordStorage } from './indexedDBStorage'

interface TestState {
  feeds: Array<{ id: string; title: string }>
  items: Array<{ id: string; readAt: number | null }>
  settings: { density: string }
}

const NAME = 'test-rss'
const KEY = 'test-rss'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function open(name: string, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  const req = indexedDB.open(name)
  req.onupgradeneeded = () => upgrade?.(req.result)
  return request(req)
}

async function seedLegacy(value: StorageValue<TestState>): Promise<void> {
  const db = await open('veille-web', (created) => created.createObjectStore('kv'))
  await request(db.transaction('kv', 'readwrite').objectStore('kv').put(JSON.stringify(value), `${NAME}:${KEY}`))
  db.close()
}

async function readLegacy(): Promise<unknown> {
  const db = await open('veille-web')
  const raw = await request(db.transaction('kv').objectStore('kv').get(`${NAME}:${KEY}`))
  db.close()
  return raw
}

function sampleState(): TestState {
  return {
    feeds: [
      { id: 'feed-b', title: 'B' },
      { id: 'feed-a', title: 'A' },
    ],
    items: [
      { id: 'item-1', readAt: null },
      { id: 'item-2', readAt: null },
      { id: 'item-3', readAt: null },
    ],
    settings: { density: 'compact' },
  }
}

/** Ouvre un stockage déjà hydraté, comme zustand le fait à la création du store. */
async function hydratedStorage() {
  const storage = createRecordStorage<TestState>(NAME)
  await storage.getItem(KEY)
  return storage
}

describe('createRecordStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  it('relit l’état écrit, dans l’ordre des flux choisi par l’utilisateur', async () => {
    const storage = await hydratedStorage()
    await storage.setItem(KEY, { state: sampleState(), version: 5 })

    const reloaded = await createRecordStorage<TestState>(NAME).getItem(KEY)
    expect(reloaded?.version).toBe(5)
    expect(reloaded?.state.feeds.map((feed) => feed.id)).toEqual(['feed-b', 'feed-a'])
    expect(reloaded?.state.items).toHaveLength(3)
    expect(reloaded?.state.settings).toEqual({ density: 'compact' })
  })

  it('ne réécrit que les enregistrements modifiés', async () => {
    const storage = await hydratedStorage()
    const state = sampleState()
    await storage.setItem(KEY, { state, version: 5 })

    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    const clear = vi.spyOn(IDBObjectStore.prototype, 'clear')
    const next: TestState = {
      ...state,
      items: state.items.map((item) => (item.id === 'item-2' ? { ...item, readAt: 42 } : item)),
    }
    await storage.setItem(KEY, { state: next, version: 5 })

    expect(clear).not.toHaveBeenCalled()
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][0]).toEqual({ id: 'item-2', readAt: 42 })
    put.mockRestore()
    clear.mockRestore()

    const reloaded = await createRecordStorage<TestState>(NAME).getItem(KEY)
    expect(reloaded?.state.items.find((item) => item.id === 'item-2')?.readAt).toBe(42)
  })

  it('supprime les enregistrements disparus', async () => {
    const storage = await hydratedStorage()
    const state = sampleState()
    await storage.setItem(KEY, { state, version: 5 })
    await storage.setItem(KEY, {
      state: { ...state, feeds: [state.feeds[1]], items: [state.items[0]] },
      version: 5,
    })

    const reloaded = await createRecordStorage<TestState>(NAME).getItem(KEY)
    expect(reloaded?.state.feeds.map((feed) => feed.id)).toEqual(['feed-a'])
    expect(reloaded?.state.items.map((item) => item.id)).toEqual(['item-1'])
  })

  it('poursuit les écritures partielles après un rechargement', async () => {
    const first = await hydratedStorage()
    await first.setItem(KEY, { state: sampleState(), version: 5 })

    const second = createRecordStorage<TestState>(NAME)
    const loaded = await second.getItem(KEY)
    const put = vi.spyOn(IDBObjectStore.prototype, 'put')
    await second.setItem(KEY, {
      state: { ...loaded!.state, items: loaded!.state.items.slice(1) },
      version: 5,
    })
    expect(put).not.toHaveBeenCalled()
    put.mockRestore()

    const reloaded = await createRecordStorage<TestState>(NAME).getItem(KEY)
    expect(reloaded?.state.items).toHaveLength(2)
  })

  it('ignore une écriture émise avant la fin de la première lecture', async () => {
    const first = await hydratedStorage()
    await first.setItem(KEY, { state: sampleState(), version: 5 })

    const second = createRecordStorage<TestState>(NAME)
    const reading = second.getItem(KEY)
    await second.setItem(KEY, { state: { feeds: [], items: [], settings: { density: 'x' } }, version: 5 })
    await reading

    const reloaded = await createRecordStorage<TestState>(NAME).getItem(KEY)
    expect(reloaded?.state.items).toHaveLength(3)
  })

  it('convertit l’ancienne chaîne unique, puis la supprime', async () => {
    await seedLegacy({ state: sampleState(), version: 5 })

    const converted = await createRecordStorage<TestState>(NAME).getItem(KEY)
    expect(converted?.state.items).toHaveLength(3)
    expect(converted?.version).toBe(5)
    expect(await readLegacy()).toBeUndefined()

    const reloaded = await createRecordStorage<TestState>(NAME).getItem(KEY)
    expect(reloaded?.state.feeds.map((feed) => feed.id)).toEqual(['feed-b', 'feed-a'])
    expect(reloaded?.state.items).toHaveLength(3)
    expect(reloaded?.state.settings).toEqual({ density: 'compact' })
  })

  it('garde l’ancienne chaîne si la conversion échoue', async () => {
    await seedLegacy({ state: sampleState(), version: 5 })
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('quota')
    })

    const loaded = await createRecordStorage<TestState>(NAME).getItem(KEY)
    put.mockRestore()

    expect(loaded?.state.items).toHaveLength(3)
    expect(typeof (await readLegacy())).toBe('string')
  })

  it('ne crée pas la base d’origine chez un nouvel utilisateur', async () => {
    expect(await createRecordStorage<TestState>(NAME).getItem(KEY)).toBeNull()
    const names = (await indexedDB.databases()).map((db) => db.name)
    expect(names).not.toContain('veille-web')
  })

  it('efface tout sur removeItem', async () => {
    const storage = await hydratedStorage()
    await storage.setItem(KEY, { state: sampleState(), version: 5 })
    await storage.removeItem(KEY)
    expect(await createRecordStorage<TestState>(NAME).getItem(KEY)).toBeNull()
  })
})
