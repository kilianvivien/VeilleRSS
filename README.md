# Outil de veille · Flux RSS (veille-web)

Version **web autonome** de la vue « Flux RSS » de DiploRevue : lecteur de flux,
catalogue de sources, import/export OPML, tendances locales, cartographie,
mots-clés suivis, traduction d'articles et Briefing IA — sans Tauri, sans
compte, tout reste dans le navigateur.

## Lancer

```bash
npm install
npm run dev        # http://localhost:5174
```

Le serveur de développement embarque un **proxy RSS** (`/__rss-proxy`) : la
plupart des flux refusent les requêtes CORS directes du navigateur, le proxy
Vite rapatrie donc le XML côté Node. C'est le mode recommandé.

`npm run build` produit un site statique dans `dist/` ; hébergé tel quel, les
flux qui bloquent CORS afficheront une erreur explicite (aucun proxy distant
n'est imposé).

## Fonctionnalités

- Ajout de flux RSS/Atom, catalogue intégré (presse turque, agences,
  internationales), import/export OPML.
- Lu / non lu / sauvegardés, recherche, tri, densité d'affichage,
  rafraîchissement automatique par flux (`useRssRefreshScheduler`).
- Tendances locales (fenêtre 6 h → 7 j), mots-clés suivis, cartographie.
- Traduction des articles, tri IA des tendances, Briefing IA.
- Export de la sélection d'articles en Markdown (remplace l'envoi vers la
  Revue Magique de DiploRevue).

## Paramètres IA

Contrairement à DiploRevue, l'outil n'a pas de paramètres partagés : le bouton
**✨ (Paramètres IA)** de l'en-tête ouvre un panneau dédié où configurer :

- le fournisseur par défaut, celui de la traduction et celui de la veille
  (tendances + briefing) — Gemini, Mistral, Vertex AI, OpenRouter, NVIDIA,
  Albert, CLIProxyAPI, IA locale (Ollama/LM Studio) ;
- les clés API et modèles de chaque fournisseur ;
- l'endpoint IA local et son délai d'attente ;
- le thème clair/sombre.

Les réglages sont stockés dans le `localStorage` du navigateur (les clés API
ne quittent la machine que vers le fournisseur choisi). Le cache des flux
(lu/sauvegardé/articles) est stocké dans IndexedDB.

## Architecture

Extrait de DiploRevue (`../DiploRevue/src`) :

- `src/views/RssFeeds.tsx` + `src/components/rss/*` — interface complète ;
- `src/lib/rss/*` — parsing, déduplication, OPML, catalogue, analyse de
  tendances, briefing ;
- `src/lib/ai/*` — services fournisseurs + routeur (le mode « heuristic » de
  la Revue Magique est neutralisé) ;
- `src/stores/rssStore.ts` — état persistant (zustand + IndexedDB) ;
- shims web : `lib/storage/indexedDBStorage.ts`, `lib/platform/*`
  (fichiers/dialogues/presse-papiers), `stores/settingsStore.ts`.

Différences volontaires avec DiploRevue : pas de fenêtre détachée, pas
d'envoi vers la Revue Magique (export Markdown à la place), dialogues natifs
remplacés par `window.confirm/alert`, clés API en `localStorage` au lieu du
trousseau système.
