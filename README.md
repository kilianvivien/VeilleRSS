<p align="center">
  <img src="public/pwa-512.png" width="112" height="112" alt="Icône de Veille RSS">
</p>

<h1 align="center">Veille RSS</h1>

<p align="center">
  <strong>Votre veille de presse, au même endroit.</strong><br>
  Centralisez vos sources, classez vos lectures, repérez les sujets qui montent<br>
  et produisez des briefings assistés par IA — sans compte utilisateur.
</p>

<p align="center">
  <a href="https://github.com/kilianvivien/VeilleRSS/releases/tag/v0.1.0"><img src="https://img.shields.io/badge/version-v0.1.0-2563eb?style=flat-square" alt="Version v0.1.0"></a>
  <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square" alt="PWA installable">
  <img src="https://img.shields.io/badge/Docker-prêt-2496ed?style=flat-square&logo=docker&logoColor=white" alt="Compatible Docker">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-2f855a?style=flat-square" alt="Licence MIT"></a>
</p>

<p align="center">
  <a href="#aperçu">Aperçu</a> ·
  <a href="#fonctionnalités">Fonctionnalités</a> ·
  <a href="#démarrage-rapide">Démarrage</a> ·
  <a href="#auto-hébergement-avec-docker">Docker</a> ·
  <a href="#architecture-technique">Technique</a>
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkilianvivien%2FVeilleRSS"><img src="https://vercel.com/button" alt="Déployer sur Vercel"></a>
</p>

> **Déploiement recommandé : Vercel.** Le dépôt contient également une image Docker autonome pour les personnes qui souhaitent auto-héberger l'application.

---

## Aperçu

### Tableau de veille sur ordinateur

![Tableau de veille RSS sur ordinateur, avec les sources, la liste d'articles et les tendances](public/screenshots/ordinateur@0.5x.png)

<p align="center"><sub>Sources, articles et tendances réunis dans un tableau de veille à trois volets.</sub></p>

### Une interface pensée pour le mobile

<p align="center">
  <img src="public/screenshots/iphone@0.5x.png" width="300" alt="Liste d'articles de Veille RSS sur iPhone">
  &nbsp;&nbsp;
  <img src="public/screenshots/android@0.5x.png" width="270" alt="Cartographie des tendances de Veille RSS sur Android">
</p>

<p align="center"><sub>Une navigation tactile dédiée sur iPhone et Android, jusqu'à la cartographie des sujets.</sub></p>

---

## À quoi sert l'application ?

Veille RSS s'adresse aux journalistes, chercheurs, analystes, communicants et à toute personne qui consulte régulièrement plusieurs médias. Elle remplace l'ouverture manuelle de nombreux sites par un espace unique : les nouvelles publications arrivent dans une liste, les contenus importants peuvent être sauvegardés et les tendances sont calculées à partir de l'ensemble des articles reçus.

L'intelligence artificielle est facultative. Sans clé API, la lecture, la recherche, le classement et l'analyse locale des tendances restent pleinement utilisables.

<table>
  <tr>
    <td width="25%"><strong>📰 Centraliser</strong><br><sub>RSS, Atom, catalogue de sources et OPML.</sub></td>
    <td width="25%"><strong>🔎 Trier</strong><br><sub>Recherche, non lus, sauvegardes et sélections.</sub></td>
    <td width="25%"><strong>📈 Comprendre</strong><br><sub>Tendances, mots-clés et cartographie locale.</sub></td>
    <td width="25%"><strong>✨ Synthétiser</strong><br><sub>Traduction et briefings IA facultatifs.</sub></td>
  </tr>
</table>

## Fonctionnalités

### 🛰️ Sources et collecte

- ajout de n'importe quel flux RSS ou Atom à partir de son URL ;
- détection automatique du flux lorsqu'une page web compatible est collée ;
- catalogue de sources prêt à l'emploi, notamment pour la presse turque, les agences et les médias internationaux ;
- classement des sources par catégories ;
- import et export OPML pour migrer facilement depuis ou vers un autre lecteur RSS ;
- actualisation manuelle ou automatique, avec une fréquence réglable par source ;
- indicateur de santé des flux et déduplication des articles.

### 📖 Lecture et organisation

- vues **Tous les articles**, **Non lus** et **Sauvegardés** ;
- recherche instantanée dans les titres, extraits, auteurs et noms de sources ;
- tri par date ou par source et choix de la densité d'affichage ;
- marquage lu/non lu, sauvegarde et sélection multiple ;
- lecteur intégré avec taille de texte réglable et lien vers l'article original ;
- partage d'un article en un geste, vers la carte de partage du système ou le presse-papiers, dans sa version originale ou traduite ;
- navigation tactile : tirer pour actualiser, balayer un article pour le classer et passer au précédent ou au suivant dans le lecteur ;
- export d'une sélection d'articles en Markdown.

### 📈 Tendances et suivi

- analyse locale sur une fenêtre de 6 heures, 24 heures, 3 jours ou 7 jours ;
- comparaison avec la période précédente, volumes, évolutions et mini-graphiques ;
- détection des termes en progression à partir des articles déjà collectés ;
- suivi de mots-clés et filtrage immédiat des articles correspondants ;
- notifications locales pour les nouveaux résultats lorsque l'application tourne en arrière-plan ;
- cartographie interactive des sujets et de leurs termes associés.

### ✨ Intelligence artificielle

- traduction d'un article vers la langue choisie ;
- affinage des tendances afin d'écarter les termes trop génériques ;
- génération d'un briefing éditorial, avec conclusions, statistiques et graphiques ;
- fournisseur différent possible pour la traduction et pour la veille ;
- prise en charge de Gemini, Mistral, Vertex AI, OpenRouter, NVIDIA NIM, Albert, CLIProxyAPI et d'un modèle local compatible (Ollama ou LM Studio).

Les appels IA sont envoyés directement depuis le navigateur au fournisseur configuré. Les clés API sont stockées dans le `localStorage` de l'appareil : utilisez de préférence des clés dédiées, limitées en quota, et évitez les appareils partagés.

### 📲 Application installable et hors connexion

- installation sur ordinateur, Android, iPhone et iPad depuis le navigateur ;
- interface responsive adaptée aux écrans tactiles ;
- thème clair ou sombre ;
- démarrage et consultation hors connexion des articles déjà chargés ;
- détection des nouvelles versions avec proposition de mise à jour ;
- raccourcis PWA et partage d'une URL vers l'application sur les plateformes compatibles ;
- tutoriel de prise en main au premier lancement.

> La récupération de nouveaux flux, la traduction et la génération IA nécessitent une connexion. Les notifications sont locales : sans serveur de notification, elles ne peuvent pas réveiller une application complètement fermée. Sur iPhone, elles nécessitent l'installation de la PWA.

---

## Démarrage rapide

### Utiliser le déploiement Vercel

Vercel est la cible principale du projet. Le bouton ci-dessous crée un projet avec le site statique, la fonction sécurisée de proxy RSS et les en-têtes nécessaires à la PWA :

[![Déployer sur Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkilianvivien%2FVeilleRSS)

Aucune variable d'environnement n'est requise. Les clés des fournisseurs IA sont saisies ensuite dans **Paramètres → Intelligence artificielle** et restent propres à chaque navigateur.

### Installer l'application sur son appareil

1. Ouvrez le site dans Chrome, Edge ou Safari.
2. Utilisez le bouton **Installer l'application** proposé dans les paramètres.
3. Sur iPhone ou iPad, choisissez **Partager → Sur l'écran d'accueil**.

Le tutoriel intégré guide ensuite l'ajout des premières sources.

## Auto-hébergement avec Docker

La release `v0.1.0` fournit un déploiement Docker secondaire et autonome. Le conteneur compile l'interface, sert les fichiers statiques et expose le proxy RSS sur le même domaine.

> **En bref :** aucune base de données, aucun volume et aucune variable secrète ne sont nécessaires. Les données restent dans le navigateur de chaque utilisateur.

### Avec Docker Compose

```bash
docker compose up -d --build
```

Ouvrez ensuite [http://localhost:8080](http://localhost:8080). Pour arrêter le service :

```bash
docker compose down
```

### Avec Docker seul

```bash
docker build -t veille-rss:0.1.0 .
docker run --name veille-rss -p 8080:8080 --restart unless-stopped veille-rss:0.1.0
```

Le port interne peut être changé avec `PORT`. En production, placez idéalement le conteneur derrière un reverse proxy HTTPS :

```bash
docker run -p 3000:3000 -e PORT=3000 veille-rss:0.1.0
```

Un point de contrôle est disponible sur `/healthz`. Aucune persistance Docker n'est nécessaire, car les données utilisateur sont stockées dans le navigateur et non dans le conteneur.

---

## Développement local

### Prérequis

- Node.js 20 ou supérieur ;
- npm 10 ou supérieur recommandé.

```bash
git clone https://github.com/kilianvivien/VeilleRSS.git
cd VeilleRSS
npm ci
npm run dev
```

L'application est alors accessible sur [http://localhost:5174](http://localhost:5174). Le serveur Vite fournit automatiquement `/__rss-proxy`, car la plupart des éditeurs n'autorisent pas un navigateur à télécharger directement leurs flux (CORS).

### Commandes utiles

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance le serveur de développement sur le port 5174 |
| `npm run build` | Vérifie TypeScript et produit le build dans `dist/` |
| `npm run preview` | Prévisualise le build avec un proxy RSS local |
| `npm run typecheck` | Vérifie les types sans produire de fichiers |
| `npm test` | Exécute la suite de tests Vitest |
| `docker compose up -d --build` | Construit et lance le package Docker |

## Architecture technique

Veille RSS est une application web monopage en React 19 et TypeScript, construite avec Vite 7. L'état est géré avec Zustand et l'interface utilise Tailwind CSS 4, Radix UI et Lucide.

| Couche | Technologies | Responsabilité |
| --- | --- | --- |
| Interface | React 19, TypeScript, Tailwind CSS 4, Radix UI | Lecture, navigation responsive et accessibilité |
| État local | Zustand, IndexedDB, localStorage | Sources, articles, statuts et préférences |
| Analyse | Modules TypeScript locaux | Déduplication, tendances, mots-clés et cartographie |
| IA | Connecteurs chargés à la demande | Traduction, affinage et briefing |
| Livraison | Vite, Vercel Functions, PWA, Docker | Build, proxy RSS, cache et auto-hébergement |

```text
src/
├── components/       Interface, lecteur, tendances, carte, paramètres et PWA
├── lib/ai/           Connecteurs et routage des fournisseurs IA
├── lib/rss/          Collecte, parsing, OPML, déduplication et analyse locale
├── lib/pwa/          Installation, mises à jour et notifications
├── stores/           État persistant Zustand
└── views/            Vue principale de veille
api/rss-proxy.ts      Fonction de proxy RSS pour Vercel
docker/server.mjs     Serveur statique et proxy RSS de l'image Docker
public/               Manifeste, icônes et captures
```

### Stockage des données

- **IndexedDB** : sources, articles, statuts lu/sauvegardé, sélections et résultats de veille ;
- **localStorage** : préférences d'interface, configuration IA et clés API ;
- **aucune base de données serveur** et aucun compte utilisateur.

Le navigateur peut effacer ces données si l'utilisateur supprime les données du site. L'export OPML permet de sauvegarder la liste des sources, mais ne constitue pas une sauvegarde complète des articles ou des préférences.

### Pourquoi un proxy RSS ?

De nombreux flux bloquent les requêtes venant directement d'une page web. L'application passe donc par une route du même domaine :

- `/__rss-proxy` avec le serveur Vite en développement ;
- `/api/rss-proxy` avec une Function sur Vercel ;
- `/api/rss-proxy` avec le serveur Node intégré à l'image Docker.

Les proxys de production limitent les protocoles, refusent les destinations locales ou privées, revalident les redirections et plafonnent la durée et la taille des réponses afin de réduire les risques SSRF et les abus.

### PWA et cache

Le service worker est généré au moment du build avec un identifiant déterministe basé sur les fichiers produits. Il précache le cœur de l'application, met les vues secondaires en cache à l'usage et conserve les articles déjà enregistrés dans IndexedDB. Les en-têtes Vercel existants restent la configuration de référence ; Docker reproduit les règles de cache nécessaires aux ressources et au service worker.

## Vie privée et sécurité

- Les données de veille ne sont pas synchronisées vers un serveur du projet.
- Les fournisseurs IA ne reçoivent du contenu que lorsqu'une action IA est lancée.
- Chaque fournisseur applique ses propres conditions de conservation et de traitement.
- Les clés API présentes dans le navigateur sont accessibles au code exécuté sur cette origine : déployez uniquement une version de confiance et protégez l'accès à l'appareil.
- L'application assainit le HTML des flux avant affichage, mais un flux ou un article externe reste une source tierce.

## Limites connues

- Certains éditeurs protègent ou désactivent leur flux et peuvent refuser le proxy.
- Les données ne sont pas synchronisées automatiquement entre plusieurs appareils.
- Le mode hors connexion porte sur l'application et les éléments déjà chargés, pas sur la récupération de nouvelles actualités.
- Les fonctions IA peuvent engendrer des coûts auprès du fournisseur choisi.

## Contribuer

Les issues et pull requests sont les bienvenues. Avant de proposer un changement :

```bash
npm run typecheck
npm test
npm run build
```

Merci de ne jamais committer de clé API ou de donnée privée. Les changements concernant le proxy RSS doivent conserver les protections contre les réseaux privés, les redirections non contrôlées, les réponses trop volumineuses et les requêtes trop longues.

## Licence

Ce projet est distribué sous licence [MIT](LICENSE). © 2026 Kilian Vivien.

<p align="center"><sub>Conçu pour transformer un flux d'actualités en veille exploitable.</sub></p>
