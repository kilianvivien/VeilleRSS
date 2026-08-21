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
      version: 1,
    }
  )
)
