import { useMemo, useState } from 'react'
import { ChevronDown, Eye, EyeOff, GraduationCap, Moon, Sparkles } from 'lucide-react'
import { Button, Input, Modal, Select, Switch } from '@/components/ui'
import { useRssStore } from '@/stores/rssStore'
import type { RssReaderTextSize } from '@/types/rss'
import { useSettingsStore } from '@/stores/settingsStore'
import type { AiProvider, Settings } from '@/types/settings'
import {
  MOBILE_VISIBLE_PROVIDERS,
  PROVIDER_REGISTRY,
  RETIRED_PROVIDERS,
} from '@/lib/ai/providerRegistry'
import { getEffectiveProvider } from '@/lib/utils/aiProvider'
import { normalizeLocalAiTimeoutSeconds } from '@/lib/ai/localAiTimeout'
import { generateAppleFmSummary, isValidAppleFmBridgeUrl } from '@/lib/ai/appleFmService'
import { TREND_WINDOW_OPTIONS } from '@/lib/rss/trendAnalysis'
import { REFRESH_INTERVAL_OPTIONS, REFRESH_OFF } from '@/lib/rss/refreshIntervals'
import {
  normalizeReaderTextSize,
  READER_TEXT_SIZE_OPTIONS,
} from '@/lib/rss/readerTextSize'
import { SUPPORTED_LANGUAGES } from '@/lib/ai/languages'
import { cn } from '@/lib/utils/cn'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { InstallAppSection } from '@/components/pwa/InstallAppSection'
import { AboutContent } from '@/components/about/AboutContent'

/**
 * Paramètres de l'outil de veille — un seul panneau pour les flux RSS et
 * les fournisseurs IA. Version web autonome de DiploRevue : les clés API
 * restent dans le localStorage du navigateur et chaque fournisseur est
 * repliable pour garder le panneau court.
 */

const ITEMS_LIMIT_OPTIONS = [
  { value: '50', label: '50 articles' },
  { value: '100', label: '100 articles' },
  { value: '200', label: '200 articles' },
  { value: '500', label: '500 articles' },
]

const TREND_WINDOW_SETTING_OPTIONS = [
  { value: '6', label: '6 heures' },
  { value: '24', label: '24 heures' },
  { value: '72', label: '3 jours' },
  { value: '168', label: '7 jours' },
]

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((language) => ({
  value: language.code,
  label: language.label,
}))

const AI_PROVIDER_SLOTS = [
  {
    field: 'aiProvider' as const,
    label: 'Par défaut',
    hint: 'Toutes les fonctions IA sans réglage spécifique.',
  },
  {
    field: 'translationAiProvider' as const,
    label: 'Traduction',
    hint: 'Vide : utilise le fournisseur par défaut.',
  },
  {
    field: 'rssAiProvider' as const,
    label: 'Veille (tendances & briefing)',
    hint: 'Tri IA des tendances et Briefing IA.',
  },
]

interface ProviderDescriptorLike {
  id: AiProvider
  label: string
  requiresApiKey: boolean
  settingsApiKeyField?: keyof Settings
  settingsModelField?: keyof Settings
  defaultModel?: string
  recommendedModels: Array<{ id: string; label: string; note?: string }>
}

/** Fournisseurs à clé — « heuristic » et « local » sont traités à part. */
const KEY_PROVIDERS = (Object.values(PROVIDER_REGISTRY) as ProviderDescriptorLike[]).filter(
  (descriptor) =>
    descriptor.requiresApiKey &&
    descriptor.settingsApiKeyField &&
    !RETIRED_PROVIDERS.includes(descriptor.id)
)

const SELECTABLE_PROVIDERS = [
  ...KEY_PROVIDERS.map((descriptor) => ({
    value: descriptor.id as string,
    label: descriptor.label,
  })),
  { value: 'local', label: PROVIDER_REGISTRY.local.label },
  { value: 'apple', label: PROVIDER_REGISTRY.apple.label },
]

const LOCAL_TIMEOUT_OPTIONS = [
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
  { value: '600', label: '10 minutes' },
]

export function SettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const rssSettings = useRssStore((state) => state.settings)
  const updateRssSettings = useRssStore((state) => state.updateSettings)
  const aiSettings = useSettingsStore()
  const updateAiSettings = useSettingsStore((state) => state.updateSettings)

  /** Même seuil que la vue de veille : en dessous, on est en composition mobile. */
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [showKeys, setShowKeys] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null)
  const [appleTestBusy, setAppleTestBusy] = useState(false)
  const [appleTestResult, setAppleTestResult] = useState<string | null>(null)

  const hasWatchedKeywords = (rssSettings.watchedKeywords?.length ?? 0) > 0

  /**
   * Sur mobile on n'expose que les fournisseurs utilisables depuis un
   * téléphone (cf. `MOBILE_VISIBLE_PROVIDERS`) : les autres restent
   * configurés et actifs, simplement masqués de ce panneau.
   */
  const visibleKeyProviders = useMemo(
    () =>
      isDesktop
        ? KEY_PROVIDERS
        : KEY_PROVIDERS.filter((descriptor) => MOBILE_VISIBLE_PROVIDERS.includes(descriptor.id)),
    [isDesktop]
  )

  const selectableProviders = useMemo(
    () =>
      isDesktop
        ? SELECTABLE_PROVIDERS
        : SELECTABLE_PROVIDERS.filter((option) =>
            MOBILE_VISIBLE_PROVIDERS.includes(option.value as AiProvider)
          ),
    [isDesktop]
  )

  /**
   * Options d'un slot d'affectation. Un fournisseur choisi sur bureau mais
   * masqué ici reste listé : sans lui, Radix afficherait un menu vide et le
   * moindre changement effacerait silencieusement le réglage.
   */
  const optionsForSlot = (current: AiProvider | undefined) => {
    const options = [{ value: '', label: 'Par défaut' }, ...selectableProviders]
    if (
      current &&
      !RETIRED_PROVIDERS.includes(current) &&
      !options.some((option) => option.value === current)
    ) {
      options.push({ value: current, label: PROVIDER_REGISTRY[current].label })
    }
    return options
  }

  /**
   * Active les alertes de mots-clés.
   *
   * `Notification.requestPermission()` doit être atteint depuis le geste
   * utilisateur : Safari rejette silencieusement tout appel différé. D'où
   * l'absence de tout `await` avant la demande.
   */
  const handleToggleKeywordNotifications = async (enabled: boolean) => {
    setNotificationNotice(null)

    if (!enabled) {
      updateRssSettings({ keywordNotificationsEnabled: false })
      return
    }

    if (typeof Notification === 'undefined') {
      // Cas iPhone le plus courant : l'API n'existe qu'en PWA installée (16.4+).
      setNotificationNotice(
        'Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d’abord l’application à votre écran d’accueil.'
      )
      return
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setNotificationNotice(
        'Autorisation refusée. Réactivez les notifications pour ce site dans les réglages du navigateur.'
      )
      return
    }

    updateRssSettings({ keywordNotificationsEnabled: true })
  }

  const toggleSection = (id: string) => {
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const keyType = showKeys ? 'text' : 'password'
  const trendWindowHours = rssSettings.trendWindowHours ?? 24

  const testAppleFm = async () => {
    setAppleTestBusy(true)
    setAppleTestResult(null)
    try {
      await generateAppleFmSummary('Réponds uniquement OK.', 'Réponds brièvement en français.', 32, {
        timeoutMs: 30_000,
      }, aiSettings.appleFmBridgeUrl)
      setAppleTestResult('Connexion à Apple Foundation Models réussie.')
    } catch (error) {
      setAppleTestResult(error instanceof Error ? error.message : 'Échec de la connexion locale.')
    } finally {
      setAppleTestBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Paramètres"
      description="Réglages des flux RSS et des fournisseurs IA. Les données restent dans ce navigateur."
      size="lg"
      bodyClassName="sm:max-h-[calc(100dvh-12rem)] sm:overflow-y-auto sm:overscroll-contain"
    >
      <div className="space-y-6">
        {/* ── Apparence ────────────────────────────────────────────────
            Mobile uniquement : sur bureau, la bascule vit dans la barre
            d'outils, à portée immédiate. */}
        {!isDesktop ? (
          <section className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <Moon
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">Mode sombre</p>
                <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                  Appliqué immédiatement, mémorisé pour les prochaines visites.
                </p>
              </div>
            </div>
            <Switch
              checked={aiSettings.theme === 'dark'}
              onChange={(checked) => updateAiSettings({ theme: checked ? 'dark' : 'light' })}
              label="Mode sombre"
            />
          </section>
        ) : null}

        {/* ── Flux RSS ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="rss-section-label text-[var(--text-secondary)]">FLUX RSS</h3>
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <div>
              <Select
                size="sm"
                label="Actualisation par défaut"
                value={
                  rssSettings.defaultRefreshIntervalMinutes !== null
                    ? String(rssSettings.defaultRefreshIntervalMinutes)
                    : REFRESH_OFF
                }
                onValueChange={(value) =>
                  updateRssSettings({
                    defaultRefreshIntervalMinutes: value === REFRESH_OFF ? null : Number(value),
                  })
                }
                options={REFRESH_INTERVAL_OPTIONS}
              />
              <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
                Pour les nouveaux flux, le catalogue et les imports OPML.
              </p>
            </div>

            <div>
              <Select
                size="sm"
                label="Articles conservés par flux"
                value={String(rssSettings.itemsPerFeedLimit)}
                onValueChange={(value) =>
                  updateRssSettings({ itemsPerFeedLimit: Number(value) })
                }
                options={ITEMS_LIMIT_OPTIONS}
              />
              <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
                Les articles sauvegardés ou importés restent conservés au-delà de la limite.
              </p>
            </div>

            <div>
              <Select
                size="sm"
                label="Fenêtre d’analyse des tendances"
                value={String(
                  TREND_WINDOW_OPTIONS.includes(trendWindowHours as never) ? trendWindowHours : 24
                )}
                onValueChange={(value) => updateRssSettings({ trendWindowHours: Number(value) })}
                options={TREND_WINDOW_SETTING_OPTIONS}
              />
              <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
                Comparée à la période précédente de même durée.
              </p>
            </div>

            <div>
              <Select
                size="sm"
                label="Taille du texte des articles"
                value={normalizeReaderTextSize(rssSettings.readerTextSize)}
                onValueChange={(value) =>
                  updateRssSettings({ readerTextSize: value as RssReaderTextSize })
                }
                options={READER_TEXT_SIZE_OPTIONS}
              />
              <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
                Corps du texte dans le volet de lecture, sur mobile comme sur ordinateur.
              </p>
            </div>

            <div>
              <Select
                size="sm"
                label="Langue de traduction"
                value={rssSettings.translationTargetLanguage || 'fr'}
                onValueChange={(value) =>
                  updateRssSettings({ translationTargetLanguage: value })
                }
                options={LANGUAGE_OPTIONS}
              />
              <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
                Langue du bouton Traduire ; la source est détectée automatiquement.
              </p>
            </div>

            <SettingCheckbox
              checked={rssSettings.refreshImportedFeeds}
              onChange={(checked) => updateRssSettings({ refreshImportedFeeds: checked })}
              label="Rafraîchir les flux après import OPML"
              hint="Lance un premier chargement automatiquement après un import."
            />

            <SettingCheckbox
              checked={rssSettings.markReadOnOpen !== false}
              onChange={(checked) => updateRssSettings({ markReadOnOpen: checked })}
              label="Marquer comme lu à l’ouverture"
              hint="Un article ouvert dans le volet de lecture passe automatiquement en lu."
            />

            <div className="sm:col-span-2">
              <SettingCheckbox
                checked={rssSettings.showTrendsByDefault !== false}
                onChange={(checked) => updateRssSettings({ showTrendsByDefault: checked })}
                label="Ouvrir sur le panneau Tendances"
                hint="Affiche le tableau de bord des tendances à l’arrivée sur la veille presse."
              />
            </div>

            <div className="sm:col-span-2">
              <SettingCheckbox
                checked={rssSettings.keywordNotificationsEnabled === true}
                disabled={!hasWatchedKeywords}
                onChange={(checked) => void handleToggleKeywordNotifications(checked)}
                label="Alerter sur les mots-clés suivis"
                hint={
                  hasWatchedKeywords
                    ? 'Uniquement quand l’application tourne en arrière-plan : sans serveur de notification, rien ne la réveille une fois fermée.'
                    : 'Ajoutez d’abord un mot-clé suivi depuis le panneau Tendances.'
                }
              />
              {notificationNotice ? (
                <p className="mt-1 pl-6 text-[11px] leading-4 text-[var(--warning)]">
                  {notificationNotice}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Application (PWA) ─────────────────────────────────────── */}
        <div className="border-t border-[var(--border)] pt-5">
          <InstallAppSection />
        </div>

        {/* ── Intelligence artificielle ────────────────────────────── */}
        <section className="space-y-3 border-t border-[var(--border)] pt-5">
          <h3 className="rss-section-label text-[var(--text-secondary)]">
            INTELLIGENCE ARTIFICIELLE
          </h3>

          {/* Affectation des fournisseurs par fonctionnalité */}
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
            {AI_PROVIDER_SLOTS.map((slot) => (
              <Select
                key={slot.field}
                size="sm"
                label={slot.label}
                value={aiSettings[slot.field] ?? ''}
                onValueChange={(value) =>
                  updateAiSettings({ [slot.field]: value || undefined } as Partial<Settings>)
                }
                options={optionsForSlot(aiSettings[slot.field])}
              />
            ))}
          </div>
          <p className="text-[11px] leading-4 text-[var(--text-muted)]">
            Un slot vide utilise le fournisseur par défaut.
          </p>

          {/* Clés API et modèles : un bloc repliable par fournisseur */}
          <div className="flex items-center justify-between pt-1">
            <h4 className="rss-section-label text-[var(--text-secondary)]">CLÉS API & MODÈLES</h4>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowKeys((current) => !current)}
              title={showKeys ? 'Masquer les clés' : 'Afficher les clés'}
            >
              {showKeys ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              {showKeys ? 'Masquer' : 'Afficher'}
            </Button>
          </div>

          <div className="space-y-1.5">
            {visibleKeyProviders.map((descriptor) => {
              const keyField = descriptor.settingsApiKeyField as keyof Settings
              const modelField = descriptor.settingsModelField as keyof Settings | undefined
              const currentKey = (aiSettings[keyField] as string | undefined) ?? ''
              const currentModel = modelField
                ? ((aiSettings[modelField] as string | undefined) ?? '')
                : ''
              const configured = Boolean(currentKey.trim())

              return (
                <Collapsible
                  key={descriptor.id}
                  id={descriptor.id}
                  title={descriptor.label}
                  configured={configured}
                  open={openSections.has(descriptor.id)}
                  onToggle={() => toggleSection(descriptor.id)}
                >
                  <Input
                    type={keyType}
                    label="Clé API"
                    value={currentKey}
                    onChange={(event) =>
                      updateAiSettings({ [keyField]: event.target.value } as Partial<Settings>)
                    }
                    placeholder="Collez la clé API…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {modelField ? (
                    <Input
                      label="Modèle"
                      value={currentModel}
                      onChange={(event) =>
                        updateAiSettings({
                          [modelField]: event.target.value,
                        } as Partial<Settings>)
                      }
                      placeholder={
                        descriptor.defaultModel
                          ? `${descriptor.defaultModel} (par défaut)`
                          : 'Modèle'
                      }
                      autoComplete="off"
                      spellCheck={false}
                      list={`models-${descriptor.id}`}
                    />
                  ) : null}
                  {descriptor.recommendedModels.length > 0 ? (
                    <datalist id={`models-${descriptor.id}`}>
                      {descriptor.recommendedModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </datalist>
                  ) : null}
                </Collapsible>
              )
            })}

            {/* IA locale : endpoint + délai d'attente, pas de clé.
                Masquée sur mobile — un téléphone n'atteint pas un serveur
                qui tourne sur la machine de bureau. */}
            {isDesktop ? (
              <Collapsible
                id="local"
                title={PROVIDER_REGISTRY.local.label}
                configured={Boolean(aiSettings.localAiEndpoint?.trim())}
                open={openSections.has('local')}
                onToggle={() => toggleSection('local')}
              >
                <Input
                  label="Endpoint (Ollama, LM Studio…)"
                  value={aiSettings.localAiEndpoint ?? ''}
                  onChange={(event) => updateAiSettings({ localAiEndpoint: event.target.value })}
                  placeholder="http://localhost:11434"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Select
                  size="sm"
                  label="Délai d’attente"
                  value={String(normalizeLocalAiTimeoutSeconds(aiSettings.localAiTimeoutSeconds))}
                  onValueChange={(value) =>
                    updateAiSettings({ localAiTimeoutSeconds: Number(value) })
                  }
                  options={LOCAL_TIMEOUT_OPTIONS}
                />
              </Collapsible>
            ) : null}
            {isDesktop ? (
              <Collapsible
                id="apple"
                title={PROVIDER_REGISTRY.apple.label}
                configured={isValidAppleFmBridgeUrl(aiSettings.appleFmBridgeUrl)}
                open={openSections.has('apple')}
                onToggle={() => toggleSection('apple')}
              >
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  Modèle « system » embarqué sur un Mac compatible macOS 27. Aucune clé API.
                  Dans le Terminal du Mac, lancez ces deux commandes :
                </p>
                <code className="block select-all rounded bg-[var(--hover)] px-2 py-1.5 text-xs">
                  fm serve --host 127.0.0.1 --port 1976
                </code>
                <code className="block select-all rounded bg-[var(--hover)] px-2 py-1.5 text-xs">
                  npm run apple:bridge
                </code>
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  Gardez la PWA ouverte sur https://veille-rss.vercel.app. Dans Safari, le relais
                  doit utiliser HTTPS avec un certificat local approuvé. Dans Chrome ou Edge,
                  autorisez l’accès au réseau local si demandé.{' '}
                  <a
                    href="https://github.com/kilianvivien/VeilleRSS#avec-safari-sur-le-mac"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] underline"
                  >
                    Instructions Safari
                  </a>
                </p>
                <Input
                  label="Adresse du relais local"
                  value={aiSettings.appleFmBridgeUrl ?? ''}
                  onChange={(event) => updateAiSettings({ appleFmBridgeUrl: event.target.value })}
                  placeholder="http://127.0.0.1:1977/v1/chat/completions"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button size="sm" variant="secondary" onClick={testAppleFm} disabled={appleTestBusy || !isValidAppleFmBridgeUrl(aiSettings.appleFmBridgeUrl)}>
                  {appleTestBusy ? 'Connexion…' : 'Tester la connexion'}
                </Button>
                {appleTestResult ? <p role="status" className="text-xs text-[var(--text-secondary)]">{appleTestResult}</p> : null}
              </Collapsible>
            ) : null}
          </div>

          {/* Rappel de l'affectation effective */}
          <p className="flex items-start gap-1.5 rounded-lg bg-[var(--hover)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            <Sparkles
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
              aria-hidden="true"
            />
            <span>
              Traduction : {describeSlot(aiSettings.translationAiProvider, aiSettings)} · Veille :{' '}
              {describeSlot(aiSettings.rssAiProvider, aiSettings)}
            </span>
          </p>
        </section>

        {/* ── Tutoriel ─────────────────────────────────────────────── */}
        <section className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <GraduationCap
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">Tutoriel de démarrage</p>
              <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                Revoir la présentation des fonctions clés.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              // Fermer d'abord : le tutoriel s'affiche par-dessus l'application,
              // pas par-dessus le panneau qui vient de le lancer.
              onOpenChange(false)
              updateAiSettings({ onboardingCompleted: false })
            }}
          >
            Revoir
          </Button>
        </section>

        {/* ── À propos ─────────────────────────────────────────────────
            Plus d'icône « i » dans les barres d'outils : les mentions
            atterrissent ici, sur mobile comme sur bureau. */}
        <section className="space-y-3 border-t border-[var(--border)] pt-5">
          <h3 className="rss-section-label text-[var(--text-secondary)]">À PROPOS</h3>
          <AboutContent />
        </section>
      </div>
    </Modal>
  )
}

function SettingCheckbox({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2.5 text-sm text-[var(--text-primary)]',
        disabled && 'opacity-60'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
      />
      <span>
        {label}
        <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-muted)]">{hint}</span>
      </span>
    </label>
  )
}

function Collapsible({
  id,
  title,
  configured,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  configured: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  void id
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--hover)]"
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            configured ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span
          className={cn(
            'shrink-0 text-xs',
            configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'
          )}
        >
          {configured ? 'Prêt' : 'À configurer'}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>
      {open ? (
        <div className="space-y-2.5 border-t border-[var(--border)] px-3 py-3">{children}</div>
      ) : null}
    </div>
  )
}

function describeSlot(slotProvider: AiProvider | undefined, settings: Settings): string {
  const effective = getEffectiveProvider(slotProvider, settings.aiProvider)
  const descriptor = PROVIDER_REGISTRY[effective]
  const configured = isConfigured(effective, settings)
  const suffix = slotProvider ? '' : ' (par défaut)'
  return `${descriptor.label}${suffix} — ${configured ? 'prêt' : 'à configurer'}`
}

function isConfigured(provider: AiProvider, settings: Settings): boolean {
  const descriptor = PROVIDER_REGISTRY[provider] as ProviderDescriptorLike | undefined
  if (!descriptor) return false
  if (descriptor.settingsApiKeyField) {
    const key = settings[descriptor.settingsApiKeyField]
    if (typeof key !== 'string' || !key.trim()) return false
    return true
  }
  if (provider === 'local') {
    return Boolean(settings.localAiEndpoint?.trim())
  }
  if (provider === 'apple') return isValidAppleFmBridgeUrl(settings.appleFmBridgeUrl)
  return true
}
