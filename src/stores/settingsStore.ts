import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Settings } from '@/types/settings'
import { defaultSettings, SETTINGS_KEYS } from '@/lib/constants/settingsDefaults'
import { isKnownProvider } from '@/lib/ai/providerRegistry'

const PROVIDER_SELECTION_FIELDS = ['aiProvider', 'translationAiProvider', 'rssAiProvider'] as const

/**
 * Réglages de l'outil de veille — version web autonome.
 *
 * Contrairement à DiploRevue (clés API dans le trousseau via Tauri), tout est
 * persisté dans le localStorage du navigateur : l'outil tourne localement et
 * n'envoie les clés qu'aux fournisseurs IA configurés par l'utilisateur.
 */
interface SettingsState extends Settings {
  updateSettings: (updates: Partial<Settings>) => void
  resetSettings: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      updateSettings: (updates) => {
        set((state) => ({
          ...state,
          ...updates,
        }))
      },

      resetSettings: () => {
        set({ ...defaultSettings })
      },
    }),
    {
      name: 'veille-web-settings',
      storage: createJSONStorage(() => localStorage),
      version: 5,
      /**
       * v2 : le modèle Mistral par défaut passe de `small` à `medium`.
       * Les réglages persistés contiennent toujours une valeur explicite —
       * `defaultSettings` l'y écrit dès la première visite. On ne remplace
       * donc que l'ancien défaut, jamais un modèle réellement choisi.
       * v3 : les sélections Vertex AI et CLIProxyAPI reviennent au fournisseur
       * par défaut ; les clés et modèles enregistrés restent intacts.
       * v4 : NVIDIA est retiré. Ses sélections et ses secrets persistés sont effacés.
       * v5 : Vertex AI et CLIProxyAPI sont supprimés du code. Leurs clés, adresses
       * et modèles persistés sont effacés ; toute sélection d'un fournisseur
       * inconnu du registre revient au fournisseur par défaut. Les réglages
       * hérités de DiploRevue (mise en page, Revue Magique…) sont abandonnés :
       * seuls les champs de `SETTINGS_KEYS` survivent.
       */
      migrate: (persisted, version) => {
        const state = persisted as Partial<Settings> | undefined
        const migrated = { ...state }
        if (version < 2 && migrated.mistralModel === 'mistral-small-latest') {
          migrated.mistralModel = defaultSettings.mistralModel
        }
        if (version < 5) {
          for (const field of PROVIDER_SELECTION_FIELDS) {
            if (migrated[field] && !isKnownProvider(migrated[field])) {
              migrated[field] = undefined
            }
          }
          const known = new Set<string>(SETTINGS_KEYS)
          const obsolete = migrated as Record<string, unknown>
          for (const key of Object.keys(obsolete)) {
            if (!known.has(key)) delete obsolete[key]
          }
        }
        return migrated as SettingsState
      },
    }
  )
)
