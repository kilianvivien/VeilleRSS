// Note : FeedCatalogModal et TrendBriefingPanel ne sont
// volontairement PAS ré-exportés ici — ils sont chargés en `React.lazy`
// depuis leur chemin direct, et un export de baril les ramènerait dans le
// chunk d'entrée.
export { FeedRail } from './FeedRail'
export type { FeedRailGroup, SmartView } from './FeedRail'
export { RssArticleRow } from './RssArticleRow'
export { RssReadingPane } from './RssReadingPane'
export { Sparkline } from './Sparkline'
export { formatAbsoluteDate, formatRefreshInterval, formatRelativeDate } from './rssFormatting'
