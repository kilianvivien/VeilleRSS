import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Settings } from '@/types/settings'
import { defaultSettings } from '@/lib/constants/settingsDefaults'

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
      version: 2,
      /**
       * v2 : le modèle Mistral par défaut passe de `small` à `medium`.
       * Les réglages persistés contiennent toujours une valeur explicite —
       * `defaultSettings` l'y écrit dès la première visite. On ne remplace
       * donc que l'ancien défaut, jamais un modèle réellement choisi.
       */
      migrate: (persisted, version) => {
        const state = persisted as Partial<Settings> | undefined
        if (state && version < 2 && state.mistralModel === 'mistral-small-latest') {
          return { ...state, mistralModel: defaultSettings.mistralModel } as SettingsState
        }
        return state as SettingsState
      },
    }
  )
)
