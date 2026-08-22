/**
 * Langues de traduction — module feuille, volontairement sans aucun import.
 *
 * Ces constantes vivaient dans `translationService.ts`, qui importe tous les
 * services fournisseurs (dont `@google/genai`). Les composants qui n'ont
 * besoin que de la liste des langues tiraient donc l'intégralité de la pile
 * IA dans le chunk d'entrée. Importer depuis ce fichier casse cette arête.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'tr', label: 'Turc' },
  { code: 'ru', label: 'Russe' },
  { code: 'ar', label: 'Arabe' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'zh', label: 'Chinois' },
  { code: 'ja', label: 'Japonais' },
  { code: 'pt', label: 'Portugais' },
  { code: 'hi', label: 'Hindi' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']
