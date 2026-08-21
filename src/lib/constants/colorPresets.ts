import type { ColorPalette, ThemePresetName } from '@/types/settings'

/**
 * Default color palette used as the base
 */
export const defaultColorPalette: ColorPalette = {
  // Header colors
  headerPrimary: '#004a99',
  headerSecondary: '#0066cc',
  headerText: '#ffffff',

  // Content colors
  primary: '#004a99',
  secondary: '#0056b3',

  // Background colors
  background: '#ffffff',
  backgroundAlt: '#f8f9fa',

  // Text colors
  textPrimary: '#333333',
  textSecondary: '#555555',
  textMuted: '#888888',

  // Borders & dividers
  border: '#dddddd',
  borderLight: '#eeeeee',

  // Accents
  accent: '#0066cc',
}

/**
 * Theme color presets - 7 options including Personnalisé
 * Each preset defines a complete ColorPalette
 */
export const themePresets: Record<ThemePresetName, ColorPalette | null> = {
  diplomatique: {
    // Current default - navy/gold diplomatic style
    headerPrimary: '#004a99',
    headerSecondary: '#0066cc',
    headerText: '#ffffff',
    primary: '#004a99',
    secondary: '#0056b3',
    background: '#ffffff',
    backgroundAlt: '#f8f9fa',
    textPrimary: '#333333',
    textSecondary: '#555555',
    textMuted: '#888888',
    border: '#dddddd',
    borderLight: '#eeeeee',
    accent: '#0066cc',
  },
  moderne: {
    // Clean grays with blue accents
    headerPrimary: '#1f2937',
    headerSecondary: '#374151',
    headerText: '#ffffff',
    primary: '#3b82f6',
    secondary: '#2563eb',
    background: '#ffffff',
    backgroundAlt: '#f9fafb',
    textPrimary: '#111827',
    textSecondary: '#4b5563',
    textMuted: '#9ca3af',
    border: '#e5e7eb',
    borderLight: '#f3f4f6',
    accent: '#3b82f6',
  },
  classique: {
    // Serif feel with burgundy/cream
    headerPrimary: '#7c2d12',
    headerSecondary: '#9a3412',
    headerText: '#fefce8',
    primary: '#7c2d12',
    secondary: '#92400e',
    background: '#fffbeb',
    backgroundAlt: '#fef3c7',
    textPrimary: '#422006',
    textSecondary: '#78350f',
    textMuted: '#a16207',
    border: '#d6d3d1',
    borderLight: '#e7e5e4',
    accent: '#b91c1c',
  },
  presse: {
    // High contrast B&W newspaper style
    headerPrimary: '#0a0a0a',
    headerSecondary: '#171717',
    headerText: '#ffffff',
    primary: '#000000',
    secondary: '#262626',
    background: '#ffffff',
    backgroundAlt: '#fafafa',
    textPrimary: '#0a0a0a',
    textSecondary: '#404040',
    textMuted: '#737373',
    border: '#a3a3a3',
    borderLight: '#d4d4d4',
    accent: '#000000',
  },
  gouvernement: {
    // French tricolor accents (subtle)
    headerPrimary: '#002395',
    headerSecondary: '#003399',
    headerText: '#ffffff',
    primary: '#002395',
    secondary: '#0055a4',
    background: '#ffffff',
    backgroundAlt: '#f5f5f5',
    textPrimary: '#1a1a1a',
    textSecondary: '#4a4a4a',
    textMuted: '#8a8a8a',
    border: '#d1d5db',
    borderLight: '#e5e7eb',
    accent: '#ed2939', // Red accent
  },
  mobile: {
    // High contrast, warm tones for mobile portrait reading
    headerPrimary: '#1e293b',
    headerSecondary: '#334155',
    headerText: '#f8fafc',
    primary: '#0f172a',
    secondary: '#1e40af',
    background: '#fffbf5',
    backgroundAlt: '#fef7ed',
    textPrimary: '#1c1917',
    textSecondary: '#44403c',
    textMuted: '#78716c',
    border: '#d6d3d1',
    borderLight: '#e7e5e4',
    accent: '#ea580c',
  },
  personnalise: null, // User-customized, no preset palette
}

/**
 * French labels for theme presets
 */
export const themePresetLabels: Record<ThemePresetName, string> = {
  diplomatique: 'Diplomatique',
  moderne: 'Moderne',
  classique: 'Classique',
  presse: 'Presse',
  gouvernement: 'Gouvernement',
  mobile: 'Mobile',
  personnalise: 'Personnalisé',
}

/**
 * Theme preset descriptions for UI
 */
export const themePresetDescriptions: Record<ThemePresetName, string> = {
  diplomatique: 'Style officiel bleu marine et or',
  moderne: 'Gris épurés avec accents bleus',
  classique: 'Tons bordeaux et crème élégants',
  presse: 'Noir et blanc haute lisibilité',
  gouvernement: 'Bleu France avec accent tricolore',
  mobile: 'Optimisé pour lecture sur téléphone',
  personnalise: 'Couleurs personnalisées',
}
