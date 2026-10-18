import type { ReactNode } from 'react'
import { Download, Link2, MoreHorizontal, Moon, RefreshCw, ScrollText, Settings, Sun, Upload, WifiOff } from 'lucide-react'
import { AddSourcesButton } from './AddSourcesButton'
import { cn } from '@/lib/utils/cn'
import { MenuButton } from '@/components/ui/MenuButton'
import { AppIcon } from './AppIcon'

export type AppNavView = 'article' | 'trends' | 'briefing'

interface AppNavRailProps {
  view: AppNavView
  onNavigate: (view: AppNavView) => void
  unreadCount: number
  feedCount: number
  /** Au moins un sujet en forte hausse ou nouveau : pastille sur « Tendances ». */
  hasRisingTopics: boolean
  isRefreshing: boolean
  isOnline: boolean
  /** Dernier rafraîchissement réussi, toutes sources confondues. */
  lastRefreshAt: number | null
  isDarkTheme: boolean
  onRefresh: () => void
  onOpenCatalog: () => void
  onAddFeedUrl: () => void
  onImportOpml: () => void
  onExportOpml: () => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  /** Liste des sources (rail existant), affichée sous la navigation. */
  children: ReactNode
}

const TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Pictogramme de la constellation : trois nœuds reliés. */
export function ConstellationIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="6" cy="17" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
      <path d="M7.5 15.8 16.5 8.2M16.6 8.9 15.4 15" />
    </svg>
  )
}

export function ArticlesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M5 6h14M5 12h14M5 18h9" />
    </svg>
  )
}

/**
 * Rail de navigation du bureau (thème « Constellation ») : marque, vues
 * principales, liste des sources, puis les actions globales en pied.
 * Remplace l'en-tête horizontal : chaque pixel vertical va aux contenus.
 */
export function AppNavRail({
  view,
  onNavigate,
  unreadCount,
  feedCount,
  hasRisingTopics,
  isRefreshing,
  isOnline,
  lastRefreshAt,
  isDarkTheme,
  onRefresh,
  onOpenCatalog,
  onAddFeedUrl,
  onImportOpml,
  onExportOpml,
  onToggleTheme,
  onOpenSettings,
  children,
}: AppNavRailProps) {
  const canRefresh = feedCount > 0 && isOnline && !isRefreshing
  const refreshLabel = !isOnline
    ? 'Hors connexion'
    : isRefreshing
      ? 'Actualisation…'
      : lastRefreshAt
        ? `Actualisé à ${TIME_FORMATTER.format(lastRefreshAt)}`
        : 'Actualiser les sources'
  const items: {
    value: AppNavView
    label: string
    icon: ReactNode
    trailing?: ReactNode
  }[] = [
    {
      value: 'article',
      label: 'Articles',
      icon: <ArticlesIcon className="h-[17px] w-[17px]" />,
      trailing: unreadCount > 0 ? <span className="font-mono text-[11px] tabular-nums">{unreadCount}</span> : null,
    },
    {
      value: 'trends',
      label: 'Tendances',
      icon: <ConstellationIcon className="h-[17px] w-[17px]" />,
      trailing: hasRisingTopics ? (
        <span className="block h-[7px] w-[7px] rounded-full bg-[var(--trend-hot)]">
          <span className="sr-only">Sujets en hausse</span>
        </span>
      ) : null,
    },
    { value: 'briefing', label: 'Briefing IA', icon: <ScrollText className="h-[17px] w-[17px]" aria-hidden="true" /> },
  ]

  return (
    <nav aria-label="Navigation principale" className="flex min-h-0 flex-col bg-[var(--bg-primary)]">
      <div className="flex flex-shrink-0 items-center gap-2.5 px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-4">
        <AppIcon size={32} />
        <div className="min-w-0 leading-tight">
          <p className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Veille</p>
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            {feedCount === 0 ? 'Aucune source suivie' : `${feedCount} source${feedCount > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <ul className="flex flex-shrink-0 flex-col gap-0.5 px-3">
        {items.map((item) => {
          const active = item.value === view
          return (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => onNavigate(item.value)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[38px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] transition-colors duration-200',
                  active
                    ? 'bg-[var(--accent-muted)] font-medium text-[var(--text-primary)] [&>svg]:text-[var(--link)]'
                    : 'text-[var(--text-muted)] pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]'
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {item.trailing ? (
                  <span className={cn(active ? 'text-[var(--link)]' : 'text-[var(--text-muted)]')}>{item.trailing}</span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mx-5 mt-4 mb-1 flex-shrink-0 border-t border-[var(--border)]" />
      <div className="min-h-0 flex-1 overflow-auto px-1 py-1">{children}</div>

      <div className="flex flex-shrink-0 flex-col gap-2 border-t border-[var(--border)] px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="flex gap-1.5">
          <AddSourcesButton onClick={onOpenCatalog} />
          <SourcesMenu
            canExport={feedCount > 0}
            onAddFeedUrl={onAddFeedUrl}
            onImportOpml={onImportOpml}
            onExportOpml={onExportOpml}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!canRefresh}
            title="Rafraîchir toutes les sources"
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 text-left text-xs text-[var(--text-muted)] transition-colors disabled:cursor-default pointer-fine:enabled:hover:bg-[var(--hover)] pointer-fine:enabled:hover:text-[var(--text-primary)]"
          >
            {isOnline ? (
              <RefreshCw className={cn('h-3.5 w-3.5 shrink-0', isRefreshing && 'animate-spin')} aria-hidden="true" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden="true" />
            )}
            <span className="truncate">{refreshLabel}</span>
          </button>
          <RailIconButton
            label={isDarkTheme ? 'Passer en mode clair' : 'Passer en mode sombre'}
            onClick={onToggleTheme}
            pressed={isDarkTheme}
          >
            {isDarkTheme ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </RailIconButton>
          <RailIconButton label="Paramètres" onClick={onOpenSettings}>
            <Settings className="h-4 w-4" aria-hidden="true" />
          </RailIconButton>
        </div>
      </div>
    </nav>
  )
}

function RailIconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-muted)] transition-colors disabled:opacity-40 pointer-fine:hover:bg-[var(--hover)] pointer-fine:hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  )
}

/** Actions secondaires sur les sources, regroupées derrière un seul bouton. */
function SourcesMenu({
  canExport,
  onAddFeedUrl,
  onImportOpml,
  onExportOpml,
}: {
  canExport: boolean
  onAddFeedUrl: () => void
  onImportOpml: () => void
  onExportOpml: () => void
}) {
  return (
    <MenuButton
      label="Autres actions sur les sources"
      placement="top"
      className="flex h-12 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-secondary)] transition-colors pointer-fine:hover:bg-[var(--hover)]"
      entries={[
        { label: 'Coller l’adresse d’un flux', icon: <Link2 className="h-4 w-4" aria-hidden="true" />, onSelect: onAddFeedUrl },
        { label: 'Importer un fichier OPML', icon: <Upload className="h-4 w-4" aria-hidden="true" />, onSelect: onImportOpml },
        { label: 'Exporter en OPML', icon: <Download className="h-4 w-4" aria-hidden="true" />, onSelect: onExportOpml, disabled: !canExport },
      ]}
    >
      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
    </MenuButton>
  )
}
