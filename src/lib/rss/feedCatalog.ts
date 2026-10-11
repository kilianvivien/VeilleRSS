/**
 * Catalogue de sources intégré.
 *
 * Ces flux sont proposés dans la fenêtre « Ajouter des sources » du lecteur RSS.
 * Ils ne sont jamais ajoutés automatiquement : l’utilisateur choisit un bouquet
 * ou des sources unitaires. Les URL doivent rester en HTTPS pour éviter
 * l’avertissement de flux non chiffré.
 */

import { foldForMatching } from './textAnalysis'

export type CatalogLanguage = 'tr' | 'en' | 'fr' | 'ar' | 'el' | 'de' | 'es' | 'pt'

export interface CatalogFeed {
  /** Identifiant stable, utilisé pour retenir ce qui a déjà été ajouté. */
  id: string
  title: string
  url: string
  siteUrl?: string
  language: CatalogLanguage
  /** Étiquette courte affichée sous le titre (type de source). */
  kind: string
}

export interface CatalogPack {
  id: string
  title: string
  description: string
  /** Regroupe les bouquets dans la fenêtre du catalogue. */
  region: string
  feeds: CatalogFeed[]
}

export const CATALOG_LANGUAGE_LABELS: Record<CatalogLanguage, string> = {
  tr: 'Turc',
  en: 'Anglais',
  fr: 'Français',
  ar: 'Arabe',
  el: 'Grec',
  de: 'Allemand',
  es: 'Espagnol',
  pt: 'Portugais',
}

export const FEED_CATALOG: CatalogPack[] = [
  {
    id: 'tr-agencies',
    title: 'Agences de presse turques',
    description:
      'Fils d’agence turcs, y compris l’agence d’État. À croiser avec la presse indépendante pour distinguer la ligne officielle.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-aa-tr',
        title: 'Anadolu Ajansı',
        url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel',
        siteUrl: 'https://www.aa.com.tr',
        language: 'tr',
        kind: 'Agence publique',
      },
      {
        id: 'tr-aa-en',
        title: 'Anadolu Agency (English)',
        // Le paramètre `cat` reprend le slug de rubrique du site : `guncel`
        // côté turc, `turkey` côté anglais. `live` n’en est pas un et renvoyait
        // un canal vide, d’où une source « en panne » sans message d’erreur.
        url: 'https://www.aa.com.tr/en/rss/default?cat=turkey',
        siteUrl: 'https://www.aa.com.tr/en',
        language: 'en',
        kind: 'Agence publique',
      },
      {
        id: 'tr-aa-fr',
        title: 'Anadolu Ajansı (français)',
        url: 'https://www.aa.com.tr/fr/rss/default?cat=turquie',
        siteUrl: 'https://www.aa.com.tr/fr',
        language: 'fr',
        kind: 'Agence publique',
      },
      {
        id: 'tr-bianet-tr',
        title: 'Bianet',
        url: 'https://bianet.org/rss/bianet',
        siteUrl: 'https://bianet.org',
        language: 'tr',
        kind: 'Agence indépendante',
      },
      {
        id: 'tr-bianet-en',
        title: 'Bianet English',
        url: 'https://bianet.org/rss/english',
        siteUrl: 'https://bianet.org/english',
        language: 'en',
        kind: 'Agence indépendante',
      },
    ],
  },
  {
    id: 'tr-dailies',
    title: 'Grands quotidiens turcs',
    description:
      'Principaux titres nationaux en turc, du pro-gouvernemental à l’opposition. Le bouquet complet donne le spectre éditorial du pays.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-hurriyet',
        title: 'Hürriyet',
        url: 'https://www.hurriyet.com.tr/rss/anasayfa',
        siteUrl: 'https://www.hurriyet.com.tr',
        language: 'tr',
        kind: 'Quotidien généraliste',
      },
      {
        id: 'tr-milliyet',
        title: 'Milliyet',
        url: 'https://www.milliyet.com.tr/rss/rssnew/gundemrss.xml',
        siteUrl: 'https://www.milliyet.com.tr',
        language: 'tr',
        kind: 'Quotidien généraliste',
      },
      {
        id: 'tr-sabah',
        title: 'Sabah',
        url: 'https://www.sabah.com.tr/rss/gundem.xml',
        siteUrl: 'https://www.sabah.com.tr',
        language: 'tr',
        kind: 'Quotidien pro-gouvernemental',
      },
      {
        id: 'tr-yenisafak',
        title: 'Yeni Şafak',
        url: 'https://www.yenisafak.com/rss?xml=gundem',
        siteUrl: 'https://www.yenisafak.com',
        language: 'tr',
        kind: 'Quotidien conservateur',
      },
      {
        id: 'tr-cumhuriyet',
        title: 'Cumhuriyet',
        // `/rss` sert la page d’index des flux, pas un document XML : le lecteur
        // la rejetait comme « flux illisible ». Le fil réel est son_dakika.xml.
        url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml',
        siteUrl: 'https://www.cumhuriyet.com.tr',
        language: 'tr',
        kind: 'Quotidien kémaliste',
      },
      {
        id: 'tr-sozcu',
        title: 'Sözcü',
        url: 'https://www.sozcu.com.tr/feeds-rss-category-gundem',
        siteUrl: 'https://www.sozcu.com.tr',
        language: 'tr',
        kind: 'Quotidien d’opposition',
      },
      {
        id: 'tr-birgun',
        title: 'BirGün',
        url: 'https://www.birgun.net/rss/home',
        siteUrl: 'https://www.birgun.net',
        language: 'tr',
        kind: 'Quotidien de gauche',
      },
      {
        id: 'tr-karar',
        title: 'Karar',
        url: 'https://www.karar.com/service/rss.php',
        siteUrl: 'https://www.karar.com',
        language: 'tr',
        kind: 'Quotidien conservateur critique',
      },
      {
        id: 'tr-star',
        title: 'Star',
        url: 'https://www.star.com.tr/rss/rss.asp',
        siteUrl: 'https://www.star.com.tr',
        language: 'tr',
        kind: 'Quotidien pro-gouvernemental',
      },
      {
        id: 'tr-aksam',
        title: 'Akşam',
        url: 'https://www.aksam.com.tr/rss/rss.asp',
        siteUrl: 'https://www.aksam.com.tr',
        language: 'tr',
        kind: 'Quotidien pro-gouvernemental',
      },
      {
        id: 'tr-turkiye-gazetesi',
        title: 'Türkiye Gazetesi',
        url: 'https://www.turkiyegazetesi.com.tr/feed',
        siteUrl: 'https://www.turkiyegazetesi.com.tr',
        language: 'tr',
        kind: 'Quotidien conservateur',
      },
      {
        id: 'tr-yeni-akit',
        title: 'Yeni Akit',
        url: 'https://www.yeniakit.com.tr/rss/haber/gundem',
        siteUrl: 'https://www.yeniakit.com.tr',
        language: 'tr',
        kind: 'Quotidien islamiste',
      },
      {
        id: 'tr-milli-gazete',
        title: 'Milli Gazete',
        url: 'https://www.milligazete.com.tr/rss',
        siteUrl: 'https://www.milligazete.com.tr',
        language: 'tr',
        kind: 'Quotidien islamiste (Milli Görüş)',
      },
      {
        id: 'tr-yenicag',
        title: 'Yeniçağ',
        url: 'https://www.yenicaggazetesi.com.tr/service/rss.php',
        siteUrl: 'https://www.yenicaggazetesi.com.tr',
        language: 'tr',
        kind: 'Quotidien nationaliste',
      },
      {
        id: 'tr-aydinlik',
        title: 'Aydınlık',
        url: 'https://www.aydinlik.com.tr/feed',
        siteUrl: 'https://www.aydinlik.com.tr',
        language: 'tr',
        kind: 'Quotidien nationaliste de gauche',
      },
      {
        id: 'tr-evrensel',
        title: 'Evrensel',
        url: 'https://www.evrensel.net/rss/haber.xml',
        siteUrl: 'https://www.evrensel.net',
        language: 'tr',
        kind: 'Quotidien de gauche',
      },
      {
        id: 'tr-sol-haber',
        title: 'soL Haber',
        url: 'https://haber.sol.org.tr/rss.xml',
        siteUrl: 'https://haber.sol.org.tr',
        language: 'tr',
        kind: 'Quotidien de gauche',
      },
      {
        id: 'tr-dunya',
        title: 'Dünya (économie)',
        url: 'https://www.dunya.com/rss?dunya',
        siteUrl: 'https://www.dunya.com',
        language: 'tr',
        kind: 'Quotidien économique',
      },
    ],
  },
  {
    id: 'tr-broadcast-digital',
    title: 'Télévisions et médias numériques turcs',
    description:
      'Flux généralistes de chaînes d’information et de grands médias numériques turcs, utiles pour suivre rapidement l’actualité nationale.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-trt-haber-gundem',
        title: 'TRT Haber — Gündem',
        url: 'https://www.trthaber.com/gundem_articles.rss',
        siteUrl: 'https://www.trthaber.com/gundem.html',
        language: 'tr',
        kind: 'Chaîne publique d’information',
      },
      {
        id: 'tr-ntv-son-dakika',
        title: 'NTV — Son dakika',
        url: 'https://www.ntv.com.tr/son-dakika.rss',
        siteUrl: 'https://www.ntv.com.tr/son-dakika',
        language: 'tr',
        kind: 'Chaîne privée d’information',
      },
      {
        id: 'tr-cnn-turk',
        title: 'CNN Türk',
        url: 'https://www.cnnturk.com/feed/rss/all/news',
        siteUrl: 'https://www.cnnturk.com',
        language: 'tr',
        kind: 'Chaîne privée d’information',
      },
      {
        id: 'tr-a-haber',
        title: 'A Haber',
        url: 'https://www.ahaber.com.tr/rss/gundem.xml',
        siteUrl: 'https://www.ahaber.com.tr',
        language: 'tr',
        kind: 'Chaîne pro-gouvernementale',
      },
      {
        id: 'tr-tgrt-haber',
        title: 'TGRT Haber',
        url: 'https://www.tgrthaber.com/rss/manset',
        siteUrl: 'https://www.tgrthaber.com',
        language: 'tr',
        kind: 'Chaîne conservatrice',
      },
      {
        id: 'tr-haber-global',
        title: 'Haber Global',
        url: 'https://haberglobal.com.tr/rss',
        siteUrl: 'https://haberglobal.com.tr',
        language: 'tr',
        kind: 'Chaîne privée d’information',
      },
      {
        id: 'tr-halk-tv',
        title: 'Halk TV',
        url: 'https://halktv.com.tr/service/rss.php',
        siteUrl: 'https://halktv.com.tr',
        language: 'tr',
        kind: 'Chaîne proche de l’opposition',
      },
      {
        id: 'tr-tele1',
        title: 'Tele1',
        url: 'https://www.tele1.com.tr/rss',
        siteUrl: 'https://www.tele1.com.tr',
        language: 'tr',
        kind: 'Chaîne proche de l’opposition',
      },
      {
        id: 'tr-ulusal-kanal',
        title: 'Ulusal Kanal',
        url: 'https://www.ulusal.com.tr/rss',
        siteUrl: 'https://www.ulusal.com.tr',
        language: 'tr',
        kind: 'Chaîne nationaliste de gauche',
      },
      {
        id: 'tr-haberturk',
        title: 'Habertürk',
        url: 'https://www.haberturk.com/rss',
        siteUrl: 'https://www.haberturk.com',
        language: 'tr',
        kind: 'Média numérique généraliste',
      },
    ],
  },
  {
    id: 'tr-independent',
    title: 'Presse turque indépendante et analyse',
    description:
      'Sources d’analyse indépendantes, utiles pour approfondir les sujets politiques au-delà du cycle de dépêches.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-gazete-duvar',
        title: 'Gazete Duvar',
        url: 'https://www.gazeteduvar.com.tr/export/rss',
        siteUrl: 'https://www.gazeteduvar.com.tr',
        language: 'tr',
        kind: 'Quotidien en ligne indépendant',
      },
      {
        id: 'tr-diken',
        title: 'Diken',
        url: 'https://www.diken.com.tr/feed/',
        siteUrl: 'https://www.diken.com.tr',
        language: 'tr',
        kind: 'Quotidien en ligne indépendant',
      },
      {
        id: 'tr-arti-gercek',
        title: 'Artı Gerçek',
        url: 'https://artigercek.com/service/rss.php',
        siteUrl: 'https://artigercek.com',
        language: 'tr',
        kind: 'Site d’opposition',
      },
      {
        id: 'tr-kisa-dalga',
        title: 'Kısa Dalga',
        url: 'https://kisadalga.net/service/rss.php',
        siteUrl: 'https://kisadalga.net',
        language: 'tr',
        kind: 'Radio et site indépendants',
      },
      {
        id: 'tr-serbestiyet',
        title: 'Serbestiyet',
        url: 'https://serbestiyet.com/feed/',
        siteUrl: 'https://serbestiyet.com',
        language: 'tr',
        kind: 'Site d’analyse et de débat',
      },
      {
        id: 'tr-perspektif',
        title: 'Perspektif',
        url: 'https://www.perspektif.online/feed/',
        siteUrl: 'https://www.perspektif.online',
        language: 'tr',
        kind: 'Revue d’analyse politique',
      },
      {
        id: 'tr-journo',
        title: 'Journo',
        url: 'https://journo.com.tr/feed',
        siteUrl: 'https://journo.com.tr',
        language: 'tr',
        kind: 'Journalisme et médias',
      },
      {
        id: 'tr-teyit',
        title: 'Teyit',
        url: 'https://teyit.org/feed?lang=tr',
        siteUrl: 'https://teyit.org',
        language: 'tr',
        kind: 'Vérification des faits',
      },
      {
        id: 'tr-dokuz8',
        title: 'Dokuz8 Haber',
        url: 'https://dokuz8haber.net/rss.xml',
        siteUrl: 'https://dokuz8haber.net',
        language: 'tr',
        kind: 'Journalisme citoyen',
      },
      {
        id: 'tr-odatv',
        title: 'OdaTV',
        url: 'https://www.odatv.com/rss.xml',
        siteUrl: 'https://www.odatv.com',
        language: 'tr',
        kind: 'Site d’investigation',
      },
      {
        id: 'tr-agos',
        title: 'Agos',
        url: 'https://www.agos.com.tr/rss',
        siteUrl: 'https://www.agos.com.tr',
        language: 'tr',
        kind: 'Hebdomadaire arménien d’Istanbul',
      },
      {
        id: 'tr-yeni-yasam',
        title: 'Yeni Yaşam',
        url: 'https://yeniyasamgazetesi9.com/feed/',
        siteUrl: 'https://yeniyasamgazetesi9.com',
        language: 'tr',
        kind: 'Quotidien proche du mouvement kurde',
      },
      {
        id: 'tr-yetkin-report',
        title: 'Yetkin Report',
        url: 'https://yetkinreport.com/feed/',
        siteUrl: 'https://yetkinreport.com',
        language: 'tr',
        kind: 'Analyse politique indépendante',
      },
    ],
  },
  {
    id: 'tr-international-turkish',
    title: 'Médias internationaux en turc',
    description:
      'Éditions turcophones de médias internationaux, utiles pour comparer leur cadrage avec celui des quotidiens nationaux.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-bbc-turkce',
        title: 'BBC News Türkçe',
        url: 'https://feeds.bbci.co.uk/turkce/rss.xml',
        siteUrl: 'https://www.bbc.com/turkce',
        language: 'tr',
        kind: 'Média international en turc',
      },
      {
        id: 'tr-dw-turkce',
        title: 'DW Türkçe',
        url: 'https://rss.dw.com/rdf/rss-tur-all',
        siteUrl: 'https://www.dw.com/tr',
        language: 'tr',
        kind: 'Média international en turc',
      },
      {
        id: 'tr-euronews-turkce',
        title: 'Euronews Türkçe',
        url: 'https://tr.euronews.com/rss?format=mrss&level=theme&name=news',
        siteUrl: 'https://tr.euronews.com',
        language: 'tr',
        kind: 'Média européen en turc',
      },
      {
        id: 'tr-harici',
        title: 'Harici',
        url: 'https://harici.com.tr/feed/',
        siteUrl: 'https://harici.com.tr',
        language: 'tr',
        kind: 'Site de politique étrangère',
      },
      {
        id: 'tr-sputnik-turkiye',
        title: 'Anlatılanın Ötesi (Sputnik)',
        url: 'https://anlatilaninotesi.com.tr/export/rss2/archive/index.xml',
        siteUrl: 'https://anlatilaninotesi.com.tr',
        language: 'tr',
        kind: 'Média d’État russe en turc',
      },
      {
        id: 'tr-cgtn-turk',
        title: 'CGTN Türk',
        url: 'https://www.cgtnturk.com/rss',
        siteUrl: 'https://www.cgtnturk.com',
        language: 'tr',
        kind: 'Média d’État chinois en turc',
      },
      {
        id: 'tr-irna-turkce',
        title: 'IRNA Türkçe',
        url: 'https://tr.irna.ir/rss',
        siteUrl: 'https://tr.irna.ir',
        language: 'tr',
        kind: 'Agence d’État iranienne en turc',
      },
      {
        id: 'tr-al-ain-turkce',
        title: 'Al Ain Türkçe',
        url: 'https://tr.al-ain.com/feed',
        siteUrl: 'https://tr.al-ain.com',
        language: 'tr',
        kind: 'Média émirati en turc',
      },
      {
        id: 'tr-independent-turkce',
        title: 'Independent Türkçe',
        url: 'https://www.indyturk.com/rss.xml',
        siteUrl: 'https://www.indyturk.com',
        language: 'tr',
        kind: 'Média international en turc',
      },
    ],
  },
  {
    id: 'tr-economy',
    title: 'Économie et finance turques',
    description:
      'Presse économique turque : conjoncture, lire, budget et grands groupes. Le complément indispensable du fil politique dès qu’un dossier touche au commerce ou à l’énergie.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-bloomberg-ht',
        title: 'Bloomberg HT',
        url: 'https://www.bloomberght.com/rss',
        siteUrl: 'https://www.bloomberght.com',
        language: 'tr',
        kind: 'Chaîne économique',
      },
      {
        id: 'tr-ekonomim',
        title: 'Ekonomim',
        url: 'https://www.ekonomim.com/export/rss',
        siteUrl: 'https://www.ekonomim.com',
        language: 'tr',
        kind: 'Quotidien économique',
      },
      {
        id: 'tr-ntv-ekonomi',
        title: 'NTV Ekonomi',
        url: 'https://www.ntv.com.tr/ekonomi.rss',
        siteUrl: 'https://www.ntv.com.tr/ekonomi',
        language: 'tr',
        kind: 'Rubrique économique',
      },
      {
        id: 'tr-sozcu-ekonomi',
        title: 'Sözcü Ekonomi',
        url: 'https://www.sozcu.com.tr/feeds-rss-category-ekonomi',
        siteUrl: 'https://www.sozcu.com.tr/kategori/ekonomi',
        language: 'tr',
        kind: 'Rubrique économique',
      },
      {
        id: 'tr-forbes-turkiye',
        title: 'Forbes Türkiye',
        url: 'https://www.forbes.com.tr/rss',
        siteUrl: 'https://www.forbes.com.tr',
        language: 'tr',
        kind: 'Magazine économique',
      },
      {
        id: 'tr-capital',
        title: 'Capital',
        url: 'https://www.capital.com.tr/rss/all',
        siteUrl: 'https://www.capital.com.tr',
        language: 'tr',
        kind: 'Magazine des affaires',
      },
    ],
  },
  {
    id: 'tr-defence',
    title: 'Défense et industrie de défense turques',
    description:
      'Presse spécialisée sur les programmes d’armement, les exportations et la coopération militaire — un dossier permanent de la relation bilatérale.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-c4defence',
        title: 'C4 Defence',
        url: 'https://www.c4defence.com/tr/feed/',
        siteUrl: 'https://www.c4defence.com/tr',
        language: 'tr',
        kind: 'Presse de défense',
      },
      {
        id: 'tr-defenceturk',
        title: 'DefenceTurk',
        url: 'https://www.defenceturk.net/feed',
        siteUrl: 'https://www.defenceturk.net',
        language: 'tr',
        kind: 'Presse de défense',
      },
      {
        id: 'tr-savunmasanayist',
        title: 'SavunmaSanayiST',
        url: 'https://www.savunmasanayist.com/feed/',
        siteUrl: 'https://www.savunmasanayist.com',
        language: 'tr',
        kind: 'Industrie de défense',
      },
      {
        id: 'tr-savunmatr',
        title: 'SavunmaTR',
        url: 'https://www.savunmatr.com/feed/',
        siteUrl: 'https://www.savunmatr.com',
        language: 'tr',
        kind: 'Industrie de défense',
      },
    ],
  },
  {
    id: 'tr-international-editions',
    title: 'Éditions internationales turques',
    description:
      'Ce que la Turquie publie à destination de l’étranger, en anglais. À comparer avec les éditions turques pour mesurer les écarts de cadrage.',
    region: 'Turquie',
    feeds: [
      {
        id: 'tr-daily-sabah',
        title: 'Daily Sabah',
        url: 'https://www.dailysabah.com/rssFeed/homepage',
        siteUrl: 'https://www.dailysabah.com',
        language: 'en',
        kind: 'Quotidien anglophone',
      },
      {
        id: 'tr-turkishminute',
        title: 'Turkish Minute',
        url: 'https://www.turkishminute.com/feed',
        siteUrl: 'https://www.turkishminute.com',
        language: 'en',
        kind: 'Média en exil',
      },
      {
        id: 'tr-al-monitor-turkey',
        title: 'Al-Monitor — Turkey',
        url: 'https://www.al-monitor.com/rss',
        siteUrl: 'https://www.al-monitor.com',
        language: 'en',
        kind: 'Analyse régionale',
      },
      {
        id: 'tr-crisis-group-turkey',
        title: 'International Crisis Group — Türkiye',
        url: 'https://www.crisisgroup.org/rss/58',
        siteUrl: 'https://www.crisisgroup.org/europe-central-asia/western-europemediterranean/turkiye',
        language: 'en',
        kind: 'Analyse des conflits',
      },
    ],
  },
  {
    id: 'intl-agencies',
    title: 'Agences et médias internationaux',
    description:
      'Fils généralistes et regards croisés sur l’actualité mondiale, la diplomatie et le développement.',
    region: 'International',
    feeds: [
      {
        id: 'intl-lemonde',
        title: 'Le Monde — International',
        url: 'https://www.lemonde.fr/international/rss_full.xml',
        siteUrl: 'https://www.lemonde.fr/international/',
        language: 'fr',
        kind: 'Quotidien français',
      },
      {
        id: 'intl-france24-fr',
        title: 'France 24 — Monde',
        url: 'https://www.france24.com/fr/rss',
        siteUrl: 'https://www.france24.com/fr/',
        language: 'fr',
        kind: 'Média public international',
      },
      {
        id: 'intl-rfi',
        title: 'RFI — Monde',
        url: 'https://www.rfi.fr/fr/monde/rss',
        siteUrl: 'https://www.rfi.fr/fr/monde/',
        language: 'fr',
        kind: 'Radio publique internationale',
      },
      {
        id: 'intl-bbc-world',
        title: 'BBC News — World',
        url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
        siteUrl: 'https://www.bbc.com/news/world',
        language: 'en',
        kind: 'Média public britannique',
      },
      {
        id: 'intl-guardian-world',
        title: 'The Guardian — World',
        url: 'https://www.theguardian.com/world/rss',
        siteUrl: 'https://www.theguardian.com/world',
        language: 'en',
        kind: 'Quotidien britannique',
      },
      {
        id: 'intl-aljazeera',
        title: 'Al Jazeera English',
        url: 'https://www.aljazeera.com/xml/rss/all.xml',
        siteUrl: 'https://www.aljazeera.com',
        language: 'en',
        kind: 'Média international',
      },
      {
        id: 'intl-dw-en',
        title: 'DW — Top stories',
        url: 'https://rss.dw.com/rdf/rss-en-all',
        siteUrl: 'https://www.dw.com/en/',
        language: 'en',
        kind: 'Média public allemand',
      },
      {
        id: 'intl-euronews-ar',
        title: 'Euronews العربية',
        url: 'https://arabic.euronews.com/rss',
        siteUrl: 'https://arabic.euronews.com',
        language: 'ar',
        kind: 'Média européen en arabe',
      },
      {
        id: 'intl-ips',
        title: 'Inter Press Service',
        url: 'https://www.ipsnews.net/feed/',
        siteUrl: 'https://www.ipsnews.net',
        language: 'en',
        kind: 'Agence internationale — développement',
      },
      {
        id: 'intl-npr-world',
        title: 'NPR — World',
        url: 'https://feeds.npr.org/1004/rss.xml',
        siteUrl: 'https://www.npr.org/sections/world/',
        language: 'en',
        kind: 'Radio américaine — international',
      },
    ],
  },
  {
    id: 'regional-neighbours',
    title: 'Voisinage et Méditerranée orientale',
    description:
      'Sources grecques, chypriotes, balkaniques et caucasiennes pour suivre les dossiers régionaux depuis les pays voisins.',
    region: 'Voisinage',
    feeds: [
      {
        id: 'reg-cyprus-mail',
        title: 'Cyprus Mail',
        url: 'https://cyprus-mail.com/feed/',
        siteUrl: 'https://cyprus-mail.com',
        language: 'en',
        kind: 'Quotidien chypriote',
      },
      {
        id: 'reg-oc-media',
        title: 'OC Media (Caucase)',
        url: 'https://oc-media.org/feed/',
        siteUrl: 'https://oc-media.org',
        language: 'en',
        kind: 'Média régional',
      },
      {
        id: 'reg-euronews-greek',
        title: 'Euronews Ελληνικά',
        url: 'https://gr.euronews.com/rss?format=mrss&level=theme&name=news',
        siteUrl: 'https://gr.euronews.com',
        language: 'el',
        kind: 'Média européen en grec',
      },
      {
        id: 'reg-balkan-insight',
        title: 'Balkan Insight',
        url: 'https://balkaninsight.com/feed/',
        siteUrl: 'https://balkaninsight.com',
        language: 'en',
        kind: 'Média régional des Balkans',
      },
      {
        id: 'reg-civil-georgia',
        title: 'Civil Georgia',
        url: 'https://civil.ge/feed',
        siteUrl: 'https://civil.ge',
        language: 'en',
        kind: 'Média géorgien — politique et société',
      },
    ],
  },
  {
    id: 'regional-europe',
    title: 'Europe et espace postsoviétique',
    description:
      'Affaires européennes, actualité ukrainienne et russe, et regard allemand : plusieurs perspectives pour suivre le continent.',
    region: 'Europe',
    feeds: [
      {
        id: 'eu-politico',
        title: 'POLITICO Europe',
        url: 'https://www.politico.eu/feed/',
        siteUrl: 'https://www.politico.eu',
        language: 'en',
        kind: 'Média spécialisé en politique européenne',
      },
      {
        id: 'eu-euronews',
        title: 'Euronews — English',
        url: 'https://www.euronews.com/rss',
        siteUrl: 'https://www.euronews.com',
        language: 'en',
        kind: 'Chaîne européenne d’information',
      },
      {
        id: 'eu-kyiv-independent',
        title: 'The Kyiv Independent',
        url: 'https://kyivindependent.com/news-archive/rss/',
        siteUrl: 'https://kyivindependent.com',
        language: 'en',
        kind: 'Média ukrainien indépendant',
      },
      {
        id: 'eu-moscow-times',
        title: 'The Moscow Times',
        url: 'https://www.themoscowtimes.com/rss/news',
        siteUrl: 'https://www.themoscowtimes.com',
        language: 'en',
        kind: 'Média indépendant sur la Russie',
      },
      {
        id: 'eu-dw-de',
        title: 'Deutsche Welle — Deutsch',
        url: 'https://rss.dw.com/rdf/rss-de-all',
        siteUrl: 'https://www.dw.com/de/',
        language: 'de',
        kind: 'Média public allemand',
      },
    ],
  },
  {
    id: 'regional-middle-east',
    title: 'Moyen-Orient et Afrique du Nord',
    description:
      'Actualité régionale en français, anglais et arabe. Croiser les rédactions et les langues pour suivre les conflits, la diplomatie et les sociétés.',
    region: 'Moyen-Orient et Afrique du Nord',
    feeds: [
      {
        id: 'mena-middle-east-eye',
        title: 'Middle East Eye',
        url: 'https://www.middleeasteye.net/rss',
        siteUrl: 'https://www.middleeasteye.net',
        language: 'en',
        kind: 'Média spécialisé sur le Moyen-Orient',
      },
      {
        id: 'mena-times-of-israel',
        title: 'The Times of Israel',
        url: 'https://www.timesofisrael.com/feed/',
        siteUrl: 'https://www.timesofisrael.com',
        language: 'en',
        kind: 'Média israélien anglophone',
      },
      {
        id: 'mena-aljazeera-ar',
        title: 'Al Jazeera — العربية',
        url: 'https://www.aljazeera.net/aljazeerarss/ar/all.xml',
        siteUrl: 'https://www.aljazeera.net',
        language: 'ar',
        kind: 'Chaîne qatarie en arabe',
      },
      {
        id: 'mena-france24',
        title: 'France 24 — Moyen-Orient',
        url: 'https://www.france24.com/fr/moyen-orient/rss',
        siteUrl: 'https://www.france24.com/fr/moyen-orient/',
        language: 'fr',
        kind: 'Média public international — rubrique régionale',
      },
    ],
  },
  {
    id: 'regional-africa',
    title: 'Afrique : actualité continentale et régionale',
    description:
      'Couverture panafricaine, suivi francophone et presse sud-africaine pour élargir la veille politique, économique et sociale.',
    region: 'Afrique',
    feeds: [
      {
        id: 'af-africanews',
        title: 'Africanews',
        url: 'https://www.africanews.com/feed/rss',
        siteUrl: 'https://www.africanews.com',
        language: 'en',
        kind: 'Chaîne panafricaine d’information',
      },
      {
        id: 'af-rfi',
        title: 'RFI — Afrique',
        url: 'https://www.rfi.fr/fr/afrique/rss',
        siteUrl: 'https://www.rfi.fr/fr/afrique/',
        language: 'fr',
        kind: 'Radio publique — rubrique Afrique',
      },
      {
        id: 'af-daily-maverick',
        title: 'Daily Maverick',
        url: 'https://www.dailymaverick.co.za/dmrss/',
        siteUrl: 'https://www.dailymaverick.co.za',
        language: 'en',
        kind: 'Média sud-africain — enquêtes et analyses',
      },
    ],
  },
  {
    id: 'regional-asia-pacific',
    title: 'Asie et Pacifique',
    description:
      'Regards depuis Singapour, le Pakistan, l’Australie et les îles du Pacifique sur les enjeux politiques et les évolutions régionales.',
    region: 'Asie-Pacifique',
    feeds: [
      {
        id: 'ap-cna',
        title: 'CNA',
        url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
        siteUrl: 'https://www.channelnewsasia.com',
        language: 'en',
        kind: 'Chaîne d’information singapourienne',
      },
      {
        id: 'ap-dawn',
        title: 'Dawn',
        url: 'https://www.dawn.com/feeds/home',
        siteUrl: 'https://www.dawn.com',
        language: 'en',
        kind: 'Quotidien pakistanais',
      },
      {
        id: 'ap-abc-australia',
        title: 'ABC News — Australia',
        url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
        siteUrl: 'https://www.abc.net.au/news',
        language: 'en',
        kind: 'Média public australien',
      },
      {
        id: 'ap-rnz-pacific',
        title: 'RNZ — Pacific',
        url: 'https://www.rnz.co.nz/rss/pacific.xml',
        siteUrl: 'https://www.rnz.co.nz/international',
        language: 'en',
        kind: 'Radio publique néo-zélandaise — Pacifique',
      },
    ],
  },
  {
    id: 'regional-americas',
    title: 'Amériques : du Canada au Cône Sud',
    description:
      'Sources canadiennes, latino-américaines et brésiliennes, en anglais, espagnol et portugais, pour suivre le continent au-delà de Washington.',
    region: 'Amériques',
    feeds: [
      {
        id: 'am-cbc-world',
        title: 'CBC — World',
        url: 'https://www.cbc.ca/webfeed/rss/rss-world',
        siteUrl: 'https://www.cbc.ca/news/world',
        language: 'en',
        kind: 'Média public canadien — international',
      },
      {
        id: 'am-elpais-america',
        title: 'El País — América',
        url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada',
        siteUrl: 'https://elpais.com/america/',
        language: 'es',
        kind: 'Quotidien espagnol — édition Amérique',
      },
      {
        id: 'am-agencia-brasil',
        title: 'Agência Brasil',
        url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
        siteUrl: 'https://agenciabrasil.ebc.com.br',
        language: 'pt',
        kind: 'Agence publique brésilienne',
      },
      {
        id: 'am-mercopress',
        title: 'MercoPress',
        url: 'https://en.mercopress.com/rss',
        siteUrl: 'https://en.mercopress.com',
        language: 'en',
        kind: 'Agence régionale — Amérique du Sud',
      },
    ],
  },
  {
    id: 'institutions',
    title: 'Institutions et diplomatie',
    description:
      'Communications officielles utiles pour recouper une annonce reprise par la presse.',
    region: 'Institutions',
    feeds: [
      {
        id: 'inst-europa-commission',
        title: 'Commission européenne — Communiqués',
        url: 'https://ec.europa.eu/commission/presscorner/api/rss?language=fr',
        siteUrl: 'https://ec.europa.eu/commission/presscorner/',
        language: 'fr',
        kind: 'Institution européenne',
      },
      {
        id: 'inst-un-news',
        title: 'ONU Info',
        url: 'https://news.un.org/feed/subscribe/fr/news/all/rss.xml',
        siteUrl: 'https://news.un.org/fr/',
        language: 'fr',
        kind: 'Organisation internationale',
      },
      {
        id: 'inst-eu-council',
        title: 'Conseil de l’Union européenne',
        url: 'https://www.consilium.europa.eu/en/rss/pressreleases.ashx',
        siteUrl: 'https://www.consilium.europa.eu/en/press/press-releases/',
        language: 'en',
        kind: 'Institution européenne',
      },
    ],
  },
]

export const CATALOG_REGIONS = Array.from(new Set(FEED_CATALOG.map((pack) => pack.region)))

export function getAllCatalogFeeds(): CatalogFeed[] {
  return FEED_CATALOG.flatMap((pack) => pack.feeds)
}

/**
 * Filtre le catalogue sur une recherche libre (titre, type, langue, bouquet).
 * La comparaison ignore casse et diacritiques, pour que « sozcu » trouve
 * « Sözcü ». Les bouquets sans résultat sont retirés.
 */
export function searchCatalog(query: string): CatalogPack[] {
  const normalized = foldForMatching(query.trim())
  if (!normalized) return FEED_CATALOG

  return FEED_CATALOG.map((pack) => {
    const packMatches = foldForMatching([pack.title, pack.description, pack.region].join(' ')).includes(
      normalized
    )

    if (packMatches) return pack

    const feeds = pack.feeds.filter((feed) =>
      foldForMatching(
        [feed.title, feed.kind, CATALOG_LANGUAGE_LABELS[feed.language], feed.url].join(' ')
      ).includes(normalized)
    )

    return feeds.length > 0 ? { ...pack, feeds } : null
  }).filter((pack): pack is CatalogPack => pack !== null)
}
