import { describe, expect, it } from 'vitest'
import { useSettingsStore } from './settingsStore'

describe('settingsStore — migration', () => {
  it('efface les fournisseurs retirés et les réglages hérités, garde le reste', async () => {
    const migrate = useSettingsStore.persist.getOptions().migrate!
    const migrated = (await migrate(
      {
        theme: 'dark',
        aiProvider: 'vertex',
        translationAiProvider: 'cliproxy',
        rssAiProvider: 'mistral',
        geminiApiKey: 'cle-gemini',
        vertexApiKey: 'cle-vertex',
        cliProxyApiKey: 'cle-cliproxy',
        cliProxyBaseUrl: 'http://127.0.0.1:8317/v1',
        translationVertexModel: 'x',
        nvidiaApiKey: 'cle-nvidia',
        headerTitle: 'Revue de Presse',
        mcpAgent: { enabled: false },
        mistralModel: 'mistral-large-latest',
      },
      4
    )) as unknown as Record<string, unknown>

    expect(migrated).toEqual({
      theme: 'dark',
      aiProvider: undefined,
      translationAiProvider: undefined,
      rssAiProvider: 'mistral',
      geminiApiKey: 'cle-gemini',
      mistralModel: 'mistral-large-latest',
    })
  })
})
