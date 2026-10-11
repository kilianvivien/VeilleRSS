# AGENTS.md

Instructions pour les agents qui interviennent dans ce dépôt.

## Projet

- Veille RSS est une SPA React 19 + TypeScript construite avec Vite.
- Node.js 22 ou supérieur est requis.
- Les données utilisateur sont locales au navigateur : IndexedDB pour la veille et `localStorage` pour les préférences et la configuration IA.
- Les clés API ne doivent jamais être committées, copiées dans des logs ou ajoutées à une image Docker.

## Vérifications attendues

Avant de livrer une modification applicative, exécuter selon la portée du changement :

```bash
npm run typecheck
npm test
npm run build
```

Pour le package d'auto-hébergement, valider aussi :

```bash
node --check docker/server.mjs
docker compose config
docker build -t veille-rss:local .
```

Si le daemon Docker n'est pas disponible, le signaler clairement et tester directement `docker/server.mjs` contre le contenu de `dist/`.

## Déploiements

- **Vercel est et doit rester la cible principale.** Préserver `vercel.json`, `api/rss-proxy.ts`, la génération du service worker et le fonctionnement du déploiement existant.
- Docker est une solution secondaire d'auto-hébergement. Ne pas remplacer la route Vercel ni faire dépendre le build Vercel du serveur Docker.
- Les trois environnements doivent conserver leur route de proxy : `/__rss-proxy` en développement Vite, `/api/rss-proxy` sur Vercel et `/api/rss-proxy` dans Docker.
- Toute modification d'un proxy public doit maintenir : validation HTTP/HTTPS, blocage des réseaux locaux et privés après résolution DNS, validation de chaque redirection, délai maximal et taille maximale de réponse.

## GitHub et sandbox

- Les commandes GitHub CLI qui contactent `api.github.com` doivent être lancées **hors sandbox**, avec les permissions réseau escaladées. Cela inclut notamment `gh auth status`, `gh release`, `gh api`, `gh pr` et `gh issue`.
- Ne pas conclure que l'authentification GitHub est invalide à partir d'un échec réseau obtenu dans la sandbox. Refaire d'abord la commande hors sandbox.
- Les commandes Git distantes telles que `git push` peuvent également nécessiter l'accès réseau autorisé ; utiliser le mécanisme d'escalade prévu plutôt qu'un contournement.
- Ne pas réécrire ou déplacer un tag de release déjà publié sans demande explicite.

## Releases

- Le numéro de version de l'application provient de `package.json` et est injecté par Vite dans l'écran À propos.
- Pour une release : vérifier la version, exécuter les tests et le build, créer un commit propre, créer un tag annoté `vX.Y.Z`, pousser le commit et le tag, puis créer la fiche GitHub Release.
- Les notes de release doivent rappeler que Vercel est la route recommandée et présenter Docker comme une option d'auto-hébergement.

## Documentation et captures

- Le README principal est rédigé en français et doit rester compréhensible pour un public non technique, avec une section technique séparée.
- Les captures de référence vivent dans `public/screenshots/`.
- Après ajout, suppression ou remplacement d'une capture, mettre à jour à la fois `README.md` et la section `screenshots` de `public/manifest.webmanifest`, avec les dimensions réelles.
- Ne pas réintroduire les anciennes références à `public/captures/`.

## Discipline de modification

- Préserver les changements utilisateur non liés déjà présents dans l'arbre de travail.
- Utiliser `rg` pour les recherches et `apply_patch` pour les modifications manuelles.
- Ne pas committer `dist/`, `node_modules/`, les fichiers `.env`, les caches ou les journaux.
