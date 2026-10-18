# Extension française et européenne du catalogue

Contrôle effectué le **18 octobre 2026**, vers **17:00 UTC**, avec `npm run check:feeds` (même méthode que ci-dessous : proxy de production, parseur de l'application, au moins un article daté et lié).

Le catalogue passe de **107 à 201 sources** et de **16 à 29 bouquets**. Les **94 nouvelles sources** ont toutes répondu avec des articles datés.

- **France** : grands quotidiens, audiovisuel et information continue, politique et débats d'idées, regards sur le monde, économie, presse régionale, action publique et administration.
- **Europe francophone** : Belgique et Suisse.
- **Europe** : affaires européennes en français, presse allemande, Europe du Sud, Europe du Nord et îles britanniques, Europe centrale, orientale et balte.
- **Institutions** : Parlement européen, Conseil de l'UE (français) et BCE.

Langues ajoutées : italien, néerlandais, polonais, finnois et suédois.

Candidats écartés : flux figés depuis plusieurs mois (Corriere della Sera, Ifri, Bruegel, numerique.gouv.fr) ; réponses 403 ou 404 depuis le proxy (Euractiv, Le Point, La Gazette des communes, Courrier des maires, info.gouv.fr, Sud Ouest, Le Télégramme, ECFR, Kathimerini) ; formats non lus (Vie publique, Les Echos « Une », Institut Delors). **Acteurs publics** publie un flux valide, mais vide : aucune de ses rubriques n'expose d'article en RSS à la date du contrôle.

# Vérification de l’extension internationale du catalogue

Contrôle effectué le **30 août 2026**, vers **08:00 UTC**, depuis l’environnement local de développement.

Le catalogue passe de **84 à 107 sources**, réparties en **16 bouquets**. Les **23 nouvelles sources** ont toutes renvoyé du XML exploitable, avec des articles datés et des liens HTTP(S), lors des contrôles répétés. Cinq nouveaux bouquets couvrent l’Europe, le Moyen-Orient et l’Afrique du Nord, l’Afrique, l’Asie-Pacifique et les Amériques ; les bouquets international et voisinage sont également enrichis. L’allemand, l’espagnol et le portugais disposent de libellés de langue et sont recherchables.

## Méthode et périmètre

Le contrôle appelle localement la fonction de production `api/rss-proxy.ts` contre les serveurs réels des éditeurs, puis utilise `parseRssFeed` et `isDatedRssItem` de l’application avec JSDOM. Il conserve les protections DNS et redirections, le délai maximal de 8 secondes et la limite de 5 Mio. Aucune clé ni authentification n’est nécessaire.

Un statut HTTP 200 seul ne suffit pas : il faut du RSS/Atom accepté par le parseur, au moins un article daté et au moins un article daté lié par HTTP(S). Les titres annoncés par les flux ont également été relus pour vérifier les rubriques ; le premier candidat ABC était sportif et a été remplacé par le fil généraliste « Just In ».

Les 38 flux internationaux, régionaux et institutionnels ont été audités ; les 69 sources des bouquets turcs ne font pas partie de ce relevé. Le dernier passage groupé donne **37 réussites sur 38**. Le flux existant **Balkan Insight** avait répondu avec 90 articles datés lors des premiers passages, mais a ensuite dépassé le délai de 8 secondes, y compris lors d’un nouvel essai isolé. Il est conservé sans modification et doit être revérifié avant abonnement.

## Résultats du dernier passage groupé

Les dates sont celles déclarées par les éditeurs, normalisées en UTC. Tous les flux réussis contenaient des articles datés du 28 au 30 août ; aucun article sans date n’a été compté. Daily Maverick annonce une date maximale de 09:13 UTC, ultérieure à l’heure du contrôle : la disponibilité est confirmée, mais cet horodatage éditeur mérite prudence.

| Source (lien vers le flux testé) | Résultat | Articles datés | Date maximale annoncée (UTC) |
| --- | --- | ---: | --- |
| [`intl-lemonde`](https://www.lemonde.fr/international/rss_full.xml) | 200 — OK | 20 | 2026-08-30 |
| [`intl-france24-fr`](https://www.france24.com/fr/rss) | 200 — OK | 23 | 2026-08-30 |
| [`intl-rfi`](https://www.rfi.fr/fr/monde/rss) | 200 — OK | 30 | 2026-08-30 |
| [`intl-bbc-world`](https://feeds.bbci.co.uk/news/world/rss.xml) | 200 — OK | 34 | 2026-08-30 |
| [`intl-guardian-world`](https://www.theguardian.com/world/rss) | 200 — OK | 45 | 2026-08-30 |
| [`intl-aljazeera`](https://www.aljazeera.com/xml/rss/all.xml) | 200 — OK | 25 | 2026-08-30 |
| [`intl-dw-en`](https://rss.dw.com/rdf/rss-en-all) | 200 — OK | 133 | 2026-08-30 |
| [`intl-euronews-ar`](https://arabic.euronews.com/rss) | 200 — OK | 50 | 2026-08-30 |
| [`intl-ips`](https://www.ipsnews.net/feed/) | 200 — OK | 35 | 2026-08-28 |
| [`intl-npr-world`](https://feeds.npr.org/1004/rss.xml) | 200 — OK | 10 | 2026-08-30 |
| [`reg-cyprus-mail`](https://cyprus-mail.com/feed/) | 200 — OK | 20 | 2026-08-30 |
| [`reg-oc-media`](https://oc-media.org/feed/) | 200 — OK | 16 | 2026-08-28 |
| [`reg-euronews-greek`](https://gr.euronews.com/rss?format=mrss&level=theme&name=news) | 200 — OK | 50 | 2026-08-30 |
| [`reg-balkan-insight`](https://balkaninsight.com/feed/) | 504 — délai dépassé | — | — |
| [`reg-civil-georgia`](https://civil.ge/feed) | 200 — OK | 10 | 2026-08-29 |
| [`eu-politico`](https://www.politico.eu/feed/) | 200 — OK | 10 | 2026-08-29 |
| [`eu-euronews`](https://www.euronews.com/rss) | 200 — OK | 50 | 2026-08-30 |
| [`eu-kyiv-independent`](https://kyivindependent.com/news-archive/rss/) | 200 — OK | 15 | 2026-08-30 |
| [`eu-moscow-times`](https://www.themoscowtimes.com/rss/news) | 200 — OK | 50 | 2026-08-29 |
| [`eu-dw-de`](https://rss.dw.com/rdf/rss-de-all) | 200 — OK | 88 | 2026-08-30 |
| [`mena-middle-east-eye`](https://www.middleeasteye.net/rss) | 200 — OK | 20 | 2026-08-30 |
| [`mena-times-of-israel`](https://www.timesofisrael.com/feed/) | 200 — OK | 15 | 2026-08-30 |
| [`mena-aljazeera-ar`](https://www.aljazeera.net/aljazeerarss/ar/all.xml) | 200 — OK | 25 | 2026-08-30 |
| [`mena-france24`](https://www.france24.com/fr/moyen-orient/rss) | 200 — OK | 29 | 2026-08-29 |
| [`af-africanews`](https://www.africanews.com/feed/rss) | 200 — OK | 50 | 2026-08-30 |
| [`af-rfi`](https://www.rfi.fr/fr/afrique/rss) | 200 — OK | 23 | 2026-08-30 |
| [`af-daily-maverick`](https://www.dailymaverick.co.za/dmrss/) | 200 — OK | 51 | 2026-08-30 |
| [`ap-cna`](https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml) | 200 — OK | 20 | 2026-08-30 |
| [`ap-dawn`](https://www.dawn.com/feeds/home) | 200 — OK | 28 | 2026-08-30 |
| [`ap-abc-australia`](https://www.abc.net.au/news/feed/51120/rss.xml) | 200 — OK | 25 | 2026-08-30 |
| [`ap-rnz-pacific`](https://www.rnz.co.nz/rss/pacific.xml) | 200 — OK | 16 | 2026-08-30 |
| [`am-cbc-world`](https://www.cbc.ca/webfeed/rss/rss-world) | 200 — OK | 20 | 2026-08-29 |
| [`am-elpais-america`](https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada) | 200 — OK | 103 | 2026-08-30 |
| [`am-agencia-brasil`](https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml) | 200 — OK | 10 | 2026-08-29 |
| [`am-mercopress`](https://en.mercopress.com/rss) | 200 — OK | 10 | 2026-08-29 |
| [`inst-europa-commission`](https://ec.europa.eu/commission/presscorner/api/rss?language=fr) | 200 — OK | 10 | 2026-08-28 |
| [`inst-un-news`](https://news.un.org/feed/subscribe/fr/news/all/rss.xml) | 200 — OK | 30 | 2026-08-29 |
| [`inst-eu-council`](https://www.consilium.europa.eu/en/rss/pressreleases.ashx) | 200 — OK | 20 | 2026-08-28 |

## Corrections et candidats écartés

- L’URL existante d’Euronews en arabe avec paramètres renvoyait HTTP 406. Le chemin officiel simplifié `https://arabic.euronews.com/rss` répond avec 50 articles et remplace cette URL ; l’identifiant de catalogue est conservé.
- Les candidats refusés ou illisibles n’ont pas été ajoutés : notamment Euractiv, eKathimerini, L’Orient-Le Jour, The Hindu, The EastAfrican, Hespress et Eurasianet (403), Mail & Guardian (404), GhanaWeb (XML illisible), RFE/RL (aucun article daté lisible) et Global Voices (échec réseau).
- Pour The Kyiv Independent, les chemins génériques `/rss/` et `/feed/` échouaient ; le fil `/news-archive/rss/` a été validé.

## Reproduire

Après `npm ci`, avec un accès réseau :

```bash
npm run check:feeds -- intl-agencies regional-neighbours regional-europe regional-middle-east regional-africa regional-asia-pacific regional-americas institutions
```

On peut restreindre à un bouquet, un identifiant de source ou une URL HTTPS candidate, et ajouter `--json` pour obtenir les résultats structurés. Sans argument, `npm run check:feeds` vérifie tout le catalogue. Une erreur de flux produit un code de sortie non nul ; les appels sont limités à quatre simultanément.

Le bouton **Vérifier** de chaque bouquet reste disponible dans l’application. Ce relevé est ponctuel : il ne garantit ni l’accès depuis chaque région ou infrastructure Vercel, ni la disponibilité future, ni le texte intégral des articles. Aucun déploiement n’a été effectué.

Vérifications applicatives : `npm run typecheck`, `npm test` (38 tests) et `npm run build` réussis. Un contrôle local a également confirmé l’unicité des identifiants et URL, les URL HTTPS, les libellés de langue et la recherche des nouvelles régions et langues.
