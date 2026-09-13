// Author/creator: nattapat2871 (https://nattapat2871.me)
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { LibrarySourceSelect } from '../components/LibrarySourceSelect'
import { HomeView } from '../views/HomeView'
import { InstancesView } from '../views/InstancesView'
import { SkinsView } from '../views/SkinsView'
import { LibraryView } from '../views/LibraryView'
import { SettingsView } from '../views/SettingsView'
import { InstanceSelect } from '../components/InstanceSelect'
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Cpu,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  FolderOpen,
  HardDrive,
  Home,
  ImageIcon,
  Info,
  Languages,
  LayoutGrid,
  Library,
  Loader2,
  LogOut,
  MessageCircle,
  Minus,
  MonitorDown,
  MoreVertical,
  Package,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Shirt,
  Sparkles,
  Square,
  Trash2,
  AlertTriangle,
  Upload,
  User,
  Users,
  WifiOff,
  Wrench,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion'
import { getAllVersions, getLatestVersion } from '../lib/mojang'
import type { SkinLibraryData } from '../components/SkinPage'
import type {
  InstancePlaceQuickPlay,
  InstancePlacesApi,
  MinecraftServerPlace
} from '../components/WorldsServersPanel'
import { MinecraftServerMotd, type MinecraftServerPing } from '../components/MinecraftServerMotd'
import LibraryPagination from '../components/LibraryPagination'
import ModpackInstallActivityCard, {
  type ModpackInstallActivity
} from '../components/ModpackInstallActivityCard'
import LoaderIcon from '../components/LoaderIcon'
import { clampLibraryPage, getLibraryTotalPages } from '../libraryPagination'
import { filterInstanceContent } from '../instanceContentSearch'
import {
  getInstanceDetailNavigation,
  getInstanceModsLibraryNavigation,
  resolveSelectedInstanceId
} from '../instanceSelection'
import { uiText, type LauncherLanguage } from '../appText'
import { storage } from '../storageKeys'
import { resolveHomeModpackArtwork } from '../homeModpackArtwork'
import { PARTNER_SERVERS, type PartnerServerDefinition } from '../../shared/partnerServers'
import type { MinecraftCrashDiagnosis } from '../../shared/minecraftCrashDiagnosis'
import type { MinecraftGameIssue } from '../../shared/minecraftFailureClassification'
import type {
  LauncherUpdateBlockReason,
  LauncherUpdateInstallResult
} from '../../shared/launcherUpdate'
import { classifyLauncherUpdateFailureMessage } from '../../shared/launcherUpdate'
import type { StartupUpdateResult } from '../../shared/startupUpdate'
import { getLoaderUpdateCandidate, type LoaderUpdateCandidate } from '../../shared/loaderUpdate'
import {
  OFFLINE_USERNAME_HTML_PATTERN,
  OFFLINE_USERNAME_MAX_LENGTH,
  OFFLINE_USERNAME_MIN_LENGTH,
  isValidOfflineUsername,
  sanitizeOfflineUsernameInput
} from '../../shared/offlineUsername'
import {
  DEFAULT_LIBRARY_SEARCH_FILTERS,
  LIBRARY_LOADERS,
  LIBRARY_SEARCH_QUERY_MAX_LENGTH,
  countActiveLibraryFilters,
  isLibraryInstanceCompatibilityAvailable,
  isLibraryLoaderFilterAvailable,
  normalizeLibrarySearchQuery,
  normalizeLibraryTotalHits,
  resolveLibrarySearchFilters,
  type LibraryEnvironment,
  type LibraryProjectType,
  type LibrarySearchFilters,
  type LibrarySort
} from '../../shared/librarySearchFilters'
import {
  Account,
  AccountHead,
  AccountSessionExpiredNotice,
  AccountSessionExpiredPayload,
  CachedImage,
  ConfirmDialogState,
  ContentStatus,
  ContentUpdateItem,
  CurseForgeManualProjectType,
  DATA_LOCATION_TIMEOUT_MS,
  DEFAULT_LAUNCHER_SETTINGS,
  DEFAULT_SKIN_ASSET_REVISION,
  DEFAULT_STEVE_TEXTURE_URL,
  DataLocationStatus,
  DiscordLogo,
  DiscordStatus,
  ExportInstanceMrpackResult,
  GameLogEntry,
  GameLogResult,
  HOME_SERVER_STATUS_CACHE_LIMIT,
  HOME_SERVER_STATUS_CACHE_TTL_MS,
  HOME_SERVER_STATUS_CONCURRENCY,
  HOME_SERVER_STATUS_DELAY_MS,
  HOME_SERVER_STATUS_MAX_RECENT,
  HomeServerStatusCacheEntry,
  HomeServerStatusEntry,
  INSTANCE_CONTENT_KINDS,
  Instance,
  InstanceContentCache,
  InstanceContentItem,
  InstanceContentKind,
  InstanceIcon,
  InstanceSettingsTab,
  InstanceUpdateSummary,
  LIBRARY_SEARCH_CACHE_LIMIT,
  LIBRARY_SEARCH_CACHE_TTL_MS,
  LIBRARY_SEARCH_DEBOUNCE_MS,
  LauncherDataLocation,
  LauncherDiscordAccountState,
  LauncherErrorReport,
  LauncherSettings,
  LauncherStats,
  LauncherUpdateInfo,
  LauncherUpdateProgress,
  LegalDocument,
  LegalSection,
  LibrarySource,
  LoaderType,
  MINISAND_PARTNER_URL,
  ManualCurseForgeDownloadItem,
  MicrosoftMark,
  ModpackInstallResult,
  ModrinthVersionOption,
  NAMLAUNCHER_DISCORD_URL,
  PerformanceProfile,
  RecentInstancePlace,
  RunningServerInfo,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  ScreenshotDragState,
  ScreenshotPan,
  SetupLogEntry,
  SkinPage,
  SwitchControl,
  ViewId,
  WorldsServersPanel,
  classNames,
  formatBytes,
  formatDate,
  formatPlaytime,
  formatRelativeDate,
  getContentDisplayName,
  getHomeServerStatusKey,
  getMinecraftVersionId,
  getRecentPlayablePlaces,
  isCurseForgeManualDownloadRequired,
  isDirectImageSource,
  isMicrosoftSessionExpiredMessage,
  loadSkinPageModule,
  loadWorldsServersPanelModule,
  navItems,
  normalizeHomeServerAddress,
  normalizeStoredInstances,
  readFileAsDataUrl,
  readInstanceIconFile,
  readRecentInstancePlaces,
  resizeImageDataUrl,
  uniqueStrings
} from './launcherCommon'

type CurrentTargetLoaderVersionsState = {
  requestKey: string
  versions: Array<{ id: string; type: string }>
  loading: boolean
}

const LOADER_UPDATE_DISMISSAL_LIMIT = 128

const readLoaderUpdateDismissals = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storage.loaderUpdateDismissals) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .slice(-LOADER_UPDATE_DISMISSAL_LIMIT)
  } catch {
    return []
  }
}

const getLoaderUpdateRequestKey = (instance: Instance | null) => instance
  ? [instance.id, instance.loader, instance.version].map((value) => encodeURIComponent(String(value || ''))).join('|')
  : ''

const getLoaderUpdateDismissalKey = (instance: Instance, update: LoaderUpdateCandidate) => [
  instance.id,
  instance.loader,
  instance.version,
  update.latestVersion
].map((value) => encodeURIComponent(String(value || ''))).join('|')

export const useLauncherController = () => {
  const [activeView, setActiveView] = useState<ViewId>('home')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountSkinTextures, setAccountSkinTextures] = useState<Record<string, string>>({})
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [loginStep, setLoginStep] = useState<'select' | 'offline'>('select')
  const [offlineName, setOfflineName] = useState('')
  const [offlineNameInputRejected, setOfflineNameInputRejected] = useState(false)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<AccountSessionExpiredNotice | null>(null)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)

  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [recentPlaces, setRecentPlaces] = useState<RecentInstancePlace[]>(readRecentInstancePlaces)
  const [homeServerStatuses, setHomeServerStatuses] = useState<Record<string, HomeServerStatusEntry>>({})
  const [homeServerStatusesRefreshing, setHomeServerStatusesRefreshing] = useState(false)
  const [homeServerStatusRefresh, setHomeServerStatusRefresh] = useState(0)
  const homeServerStatusCacheRef = useRef<Map<string, HomeServerStatusCacheEntry>>(new Map())
  const homeServerStatusRequestIdRef = useRef(0)
  const homeServerPingInFlightRef = useRef<Map<string, Promise<MinecraftServerPing[]>>>(new Map())
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem(storage.sidebarWidth))
    if (!Number.isFinite(saved) || saved <= 0) return SIDEBAR_DEFAULT_WIDTH
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, saved))
  })
  const [latestVersion, setLatestVersion] = useState('1.20.1')
  const [versions, setVersions] = useState<any[]>([])
  const [minecraftVersionsLoading, setMinecraftVersionsLoading] = useState(false)
  const [loaderVersions, setLoaderVersions] = useState<Array<{ id: string; type: string }>>([])
  const [showInstanceModal, setShowInstanceModal] = useState(false)
  const [deletingInstanceId, setDeletingInstanceId] = useState<string | null>(null)
  const [newInstance, setNewInstance] = useState({
    name: 'New Instance',
    version: '',
    loader: 'vanilla' as LoaderType,
    loaderVersion: '',
    iconUrl: ''
  })
  const [showInstanceSettings, setShowInstanceSettings] = useState(false)
  const [instanceSettingsTab, setInstanceSettingsTab] = useState<InstanceSettingsTab>('general')
  const [instanceSettingsTargetId, setInstanceSettingsTargetId] = useState<string | null>(null)
  const [instanceSettingsDraft, setInstanceSettingsDraft] = useState({
    name: '',
    version: '',
    loader: 'vanilla' as LoaderType,
    loaderVersion: '',
    iconUrl: ''
  })
  const [instanceSettingsLoaderVersions, setInstanceSettingsLoaderVersions] = useState<Array<{ id: string; type: string }>>([])
  const [instanceSettingsLoaderVersionsLoading, setInstanceSettingsLoaderVersionsLoading] = useState(false)
  const [savingInstanceSettings, setSavingInstanceSettings] = useState(false)
  const [updatingInstanceLoader, setUpdatingInstanceLoader] = useState(false)
  const [currentTargetLoaderVersions, setCurrentTargetLoaderVersions] = useState<CurrentTargetLoaderVersionsState>({
    requestKey: '',
    versions: [],
    loading: false
  })
  const currentTargetLoaderVersionsRequestIdRef = useRef(0)
  const [currentTargetLoaderVersionsRefresh, setCurrentTargetLoaderVersionsRefresh] = useState(0)
  const [dismissedLoaderUpdates, setDismissedLoaderUpdates] = useState<string[]>(readLoaderUpdateDismissals)
  const [instanceSettingsEditingInstallation, setInstanceSettingsEditingInstallation] = useState(false)
  const [instanceActionMenuOpen, setInstanceActionMenuOpen] = useState(false)
  const instanceActionMenuRef = useRef<HTMLDivElement | null>(null)

  const [mods, setMods] = useState<any[]>([])
  const [modQuery, setModQuery] = useState('')
  const [libraryType, setLibraryType] = useState<LibraryProjectType>('mod')
  const [librarySource, setLibrarySource] = useState<LibrarySource>('modrinth')
  const [libraryFilters, setLibraryFilters] = useState<LibrarySearchFilters>(() => ({
    ...DEFAULT_LIBRARY_SEARCH_FILTERS
  }))
  const [libraryPage, setLibraryPage] = useState(0)
  const [totalHits, setTotalHits] = useState(0)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [homeModpacks, setHomeModpacks] = useState<any[]>([])
  const [homeModpacksLoading, setHomeModpacksLoading] = useState(false)
  const [homeModpacksError, setHomeModpacksError] = useState(false)
  const [homeModpacksLoaded, setHomeModpacksLoaded] = useState(false)
  const [homeModpacksRetry, setHomeModpacksRetry] = useState(0)
  const homeModpackRequestIdRef = useRef(0)
  const mainScrollRef = useRef<HTMLElement | null>(null)
  const discordAccountSectionRef = useRef<HTMLDivElement | null>(null)
  const pendingDiscordAccountFocusRef = useRef(false)
  const [curseForgeConfigured, setCurseForgeConfigured] = useState(false)
  const librarySectionRef = useRef<HTMLElement | null>(null)
  const libraryHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const pendingLibraryHeadingFocusRef = useRef(false)
  const pendingLibraryPageFocusRef = useRef<number | null>(null)
  const [installingProjectId, setInstallingProjectId] = useState<string | null>(null)
  const [activeInstallTaskId, setActiveInstallTaskId] = useState<string | null>(null)
  const cancelledInstallTasksRef = useRef<Set<string>>(new Set())
  const [contentStatuses, setContentStatuses] = useState<Record<string, ContentStatus>>({})
  const [, setContentStatusLoading] = useState(false)
  const librarySearchCacheRef = useRef<Map<string, { hits: any[]; total_hits: number; storedAt: number }>>(new Map())
  const installedContentStatusOverridesRef = useRef<Record<string, ContentStatus>>({})
  const [instanceUpdateSummaries, setInstanceUpdateSummaries] = useState<Record<string, InstanceUpdateSummary>>({})
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updatingInstanceId, setUpdatingInstanceId] = useState<string | null>(null)
  const [updatingProjectId, setUpdatingProjectId] = useState<string | null>(null)
  const [updatingProjectIds, setUpdatingProjectIds] = useState<string[]>([])
  const updatingProjectIdsRef = useRef<Set<string>>(new Set())
  const activeContentUpdatesRef = useRef(0)
  const [showModpackModal, setShowModpackModal] = useState(false)
  const [modpackProject, setModpackProject] = useState<any | null>(null)
  const [modpackVersions, setModpackVersions] = useState<ModrinthVersionOption[]>([])
  const [modpackVersionsLoading, setModpackVersionsLoading] = useState(false)
  const [selectedModpackVersionId, setSelectedModpackVersionId] = useState('')
  const [libraryProjectDetails, setLibraryProjectDetails] = useState<any | null>(null)
  const [libraryProjectVersions, setLibraryProjectVersions] = useState<ModrinthVersionOption[]>([])
  const [libraryProjectVersionsLoading, setLibraryProjectVersionsLoading] = useState(false)
  const [libraryProjectVersionError, setLibraryProjectVersionError] = useState('')
  const [selectedLibraryVersionId, setSelectedLibraryVersionId] = useState('')
  const libraryProjectDialogRef = useRef<HTMLDivElement | null>(null)
  const libraryProjectTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [modpackInstallActivity, setModpackInstallActivity] = useState<ModpackInstallActivity | null>(null)
  const modpackInstallMinimizedRef = useRef(false)
  const [manualDownloadItems, setManualDownloadItems] = useState<ManualCurseForgeDownloadItem[]>([])
  const [manualDownloadInstance, setManualDownloadInstance] = useState<Instance | null>(null)
  const [manualDownloadDirectory, setManualDownloadDirectory] = useState('')
  const [manualDownloadStatuses, setManualDownloadStatuses] = useState<Record<string, 'pending' | 'checking' | 'complete' | 'failed'>>({})
  const [manualDownloadMessage, setManualDownloadMessage] = useState('')
  const manualDownloadStatusesRef = useRef<Record<string, 'pending' | 'checking' | 'complete' | 'failed'>>({})
  const manualDownloadInFlightRef = useRef<Set<string>>(new Set())
  const manualDownloadCompletionAnnouncedRef = useRef(false)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [confirmDialogBusy, setConfirmDialogBusy] = useState(false)
  const [confirmDialogError, setConfirmDialogError] = useState('')
  const [importingMrpack, setImportingMrpack] = useState(false)
  const [exportingInstanceId, setExportingInstanceId] = useState<string | null>(null)

  const [contentTab, setContentTab] = useState<InstanceContentKind>('mods')
  const [instanceContent, setInstanceContent] = useState<InstanceContentItem[]>([])
  const [instanceContentCache, setInstanceContentCache] = useState<InstanceContentCache>({})
  const instanceContentCacheRef = useRef<InstanceContentCache>({})
  const currentContentTargetIdRef = useRef<string | null>(null)
  const currentContentTabRef = useRef<InstanceContentKind>('mods')
  const [instanceContentQuery, setInstanceContentQuery] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [busyContentId, setBusyContentId] = useState<string | null>(null)
  const [contentDropActive, setContentDropActive] = useState(false)
  const [contentImporting, setContentImporting] = useState(false)
  const [selectedScreenshot, setSelectedScreenshot] = useState<InstanceContentItem | null>(null)
  const [screenshotZoom, setScreenshotZoom] = useState(1)
  const [screenshotPan, setScreenshotPan] = useState<ScreenshotPan>({ x: 0, y: 0 })
  const [screenshotDragging, setScreenshotDragging] = useState(false)
  const screenshotDragRef = useRef<ScreenshotDragState>(null)
  const screenshotPanFrameRef = useRef<number | null>(null)
  const screenshotPanPendingRef = useRef<ScreenshotPan | null>(null)
  const [instancePanelView, setInstancePanelView] = useState<'content' | 'places' | 'logs'>('content')
  const instanceHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const pendingInstanceHeadingFocusRef = useRef(false)
  const [gameLogLines, setGameLogLines] = useState<string[]>([])
  const [gameLogPath, setGameLogPath] = useState('')
  const [gameLogLoading, setGameLogLoading] = useState(false)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const [memoryGb, setMemoryGb] = useState(4)
  const [discordSettings, setDiscordSettings] = useState<LauncherSettings>(() => ({ ...DEFAULT_LAUNCHER_SETTINGS }))
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null)
  const [launcherDiscordAccount, setLauncherDiscordAccount] = useState<LauncherDiscordAccountState | null>(null)
  const [launcherDiscordAccountBusy, setLauncherDiscordAccountBusy] = useState(false)
  const [launcherDiscordAccountError, setLauncherDiscordAccountError] = useState('')
  const [checkingLauncherUpdate, setCheckingLauncherUpdate] = useState(false)
  const [dataLocation, setDataLocation] = useState<LauncherDataLocation | null>(null)
  const [dataLocationStatus, setDataLocationStatus] = useState<DataLocationStatus>('loading')
  const [dataLocationError, setDataLocationError] = useState('')
  const dataLocationRequestIdRef = useRef(0)
  const [movingDataLocation, setMovingDataLocation] = useState(false)
  const [microsoftLoginLoading, setMicrosoftLoginLoading] = useState(false)

  const [launchingInstanceIds, setLaunchingInstanceIds] = useState<string[]>([])
  const [launcherErrorReport, setLauncherErrorReport] = useState<LauncherErrorReport | null>(null)
  const [minecraftGameIssue, setMinecraftGameIssue] = useState<MinecraftGameIssue | null>(null)
  const [gameIssueCopyResult, setGameIssueCopyResult] = useState<{
    id: string
    state: 'copying' | 'copied' | 'failed'
  } | null>(null)
  const [errorCopyState, setErrorCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const [errorSubmitState, setErrorSubmitState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [errorSubmitDetail, setErrorSubmitDetail] = useState('')
  const submittedErrorReportsRef = useRef<Set<string>>(new Set())
  const [runningInstances, setRunningInstances] = useState<Record<string, number>>({})
  const [runningServers, setRunningServers] = useState<Record<string, RunningServerInfo>>({})
  const [runningElapsedByInstance, setRunningElapsedByInstance] = useState<Record<string, number>>({})
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('Ready')
  const [activityDetail, setActivityDetail] = useState('')
  const [launcherVersion, setLauncherVersion] = useState('')
  const [launcherUpdate, setLauncherUpdate] = useState<LauncherUpdateInfo | null>(null)
  const [dismissedLauncherUpdateVersion, setDismissedLauncherUpdateVersion] = useState('')
  const [launcherUpdateInstallState, setLauncherUpdateInstallState] = useState<'idle' | 'installing' | 'opened' | 'blocked' | 'failed'>('idle')
  const [launcherUpdateProgress, setLauncherUpdateProgress] = useState<LauncherUpdateProgress | null>(null)
  const [launcherUpdateBlockReason, setLauncherUpdateBlockReason] = useState<LauncherUpdateBlockReason | null>(null)
  const [startupAutoUpdating, setStartupAutoUpdating] = useState(true)
  const [launcherStats, setLauncherStats] = useState<LauncherStats | null>(null)
  const [bootReady, setBootReady] = useState(false)
  const [bootProgress, setBootProgress] = useState(8)
  const [bootText, setBootText] = useState('Starting NamLauncher')
  const [bootLog, setBootLog] = useState<SetupLogEntry[]>([])
  const bootLogSequenceRef = useRef(0)
  const [showFirstRunSetup, setShowFirstRunSetup] = useState(false)
  const [showLegalReview, setShowLegalReview] = useState(false)
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [offlineWarningAccepted, setOfflineWarningAccepted] = useState(false)
  const [windowHidden, setWindowHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const reduceMotion = useReducedMotion()

  const language = discordSettings.language || 'th'
  const t = (key: string) => uiText[language]?.[key] || uiText.en[key] || key
  const tf = (key: string, values: Record<string, string | number>) => {
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value)),
      t(key)
    )
  }

  useEffect(() => {
    if (modpackInstallActivity?.phase !== 'success') return

    const completedTaskId = modpackInstallActivity.taskId
    const timeoutId = window.setTimeout(() => {
      setModpackInstallActivity((current) => (
        current?.taskId === completedTaskId && current.phase === 'success' ? null : current
      ))
    }, 2800)

    return () => window.clearTimeout(timeoutId)
  }, [modpackInstallActivity?.phase, modpackInstallActivity?.taskId])

  const getAccountTypeLabel = (type: Account['type']) => (
    type === 'msa' ? t('account.type.microsoft') : t('account.type.offline')
  )
  const getAccountTypeDetail = (type: Account['type']) => (
    type === 'msa' ? t('account.detail.microsoft') : t('account.detail.offline')
  )
  const getContentTabLabel = (kind: InstanceContentKind) => t(`content.tab.${kind}`)
  const getContentFolderLabel = (kind: InstanceContentKind) => (
    kind === 'resourcepacks' ? 'resourcepacks'
      : kind === 'shaderpacks' ? 'shaderpacks'
        : kind === 'screenshots' ? 'screenshots'
          : 'mods'
  )
  const loadLauncherDataLocation = useCallback(async () => {
    const requestId = dataLocationRequestIdRef.current + 1
    dataLocationRequestIdRef.current = requestId
    setDataLocationStatus('loading')
    setDataLocationError('')

    let timeoutId: number | null = null
    try {
      const location = await new Promise<LauncherDataLocation>((resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error('Timed out while reading the launcher data folder'))
        }, DATA_LOCATION_TIMEOUT_MS)
        window.electron.getLauncherDataLocation().then(resolve, reject)
      })

      if (requestId !== dataLocationRequestIdRef.current) return null
      setDataLocation(location)
      setDataLocationStatus('ready')
      return location
    } catch (error) {
      if (requestId !== dataLocationRequestIdRef.current) return null
      console.error('[NamLauncher] Could not read the launcher data folder', error)
      setDataLocationError(error instanceof Error ? error.message : String(error || 'Unknown error'))
      setDataLocationStatus('error')
      return null
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [])
  const showMicrosoftSessionExpired = useCallback((payload: AccountSessionExpiredPayload) => {
    const accountId = String(payload.accountId || '')
    const accountName = String(payload.accountName || t('auth.microsoft.title'))

    if (Array.isArray(payload.accounts)) {
      setAccounts(payload.accounts)
    } else if (accountId) {
      setAccounts((prev) => prev.filter((account) => account.id !== accountId))
    }

    if (accountId) {
      setActiveAccountId((current) => current === accountId ? null : current)
    } else {
      setActiveAccountId(null)
    }

    setSessionExpiredNotice({
      accountId,
      accountName,
      message: typeof payload.message === 'string' ? payload.message : ''
    })
    setShowAccountMenu(false)
    setLoginStep('select')
    setShowLoginModal(true)
    setStatusText(t('auth.sessionExpired.status'))
  }, [language])
  const pageMotionProps = reduceMotion
    ? {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.1 }
    }
    : {
      initial: { opacity: 0, y: 12, scale: 0.992 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: -8, scale: 0.992 },
      transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
    }
  const settingsCardVariants = reduceMotion
    ? {
      hidden: { opacity: 1 },
      show: { opacity: 1 }
    }
    : {
      hidden: { opacity: 0, y: 14, scale: 0.992 },
      show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1] as [number, number, number, number]
        }
      }
    }
  const activeAccount = accounts.find((account) => account.id === activeAccountId) || null

  useEffect(() => {
    let cancelled = false
    const validAccountIds = new Set(accounts.map((account) => account.id))
    setAccountSkinTextures((current) => Object.fromEntries(
      Object.entries(current).filter(([accountId]) => validAccountIds.has(accountId))
    ))

    const updateTexture = (accountId: string, library: SkinLibraryData) => {
      if (cancelled) return
      const texture = library.effectiveSkin?.textureDataUrl || ''
      if (!texture) return
      setAccountSkinTextures((current) => (
        current[accountId] === texture ? current : { ...current, [accountId]: texture }
      ))
    }

    for (const account of accounts) {
      void window.electron.getSkinLibrary(account.id)
        .then((cached) => {
          updateTexture(account.id, cached)
          if (account.type !== 'msa' || cancelled) return null
          return window.electron.refreshSkinLibrary(account.id)
        })
        .then((refreshed) => {
          if (refreshed) updateTexture(account.id, refreshed)
        })
        .catch(() => {
          // Account avatars are best-effort and must never block launcher startup.
        })
    }

    return () => {
      cancelled = true
    }
  }, [accounts])

  useEffect(() => {
    if (!showAccountMenu) return
    let cancelled = false

    for (const account of accounts) {
      if (account.type !== 'msa') continue
      void window.electron.refreshSkinLibrary(account.id)
        .then((library) => {
          if (cancelled) return
          const texture = library.effectiveSkin?.textureDataUrl || ''
          if (!texture) return
          setAccountSkinTextures((current) => (
            current[account.id] === texture ? current : { ...current, [account.id]: texture }
          ))
        })
        .catch(() => {
          // Keep the last cached head when Mojang is temporarily unavailable.
        })
    }

    return () => {
      cancelled = true
    }
  }, [showAccountMenu, accounts])

  const resolvedSelectedInstanceId = resolveSelectedInstanceId(instances, selectedInstanceId)
  const selectedInstance = instances.find((instance) => instance.id === resolvedSelectedInstanceId) || null
  const currentTarget = selectedInstance
  const libraryCompatibilityAvailable = isLibraryInstanceCompatibilityAvailable(libraryType, currentTarget)
  const libraryLoaderFilterAvailable = isLibraryLoaderFilterAvailable(librarySource, libraryType)
  const effectiveLibraryFilters: LibrarySearchFilters = {
    ...libraryFilters,
    sort: librarySource === 'curseforge' && libraryFilters.sort === 'relevance'
      ? 'downloads'
      : libraryFilters.sort,
    loader: libraryLoaderFilterAvailable ? libraryFilters.loader : '',
    environment: librarySource === 'modrinth' && libraryType === 'mod'
      ? libraryFilters.environment
      : 'all',
    openSourceOnly: librarySource === 'modrinth' && libraryFilters.openSourceOnly,
    compatibleOnly: libraryCompatibilityAvailable && libraryFilters.compatibleOnly
  }
  const resolvedLibraryFilters = resolveLibrarySearchFilters(effectiveLibraryFilters, currentTarget)
  const activeLibraryFilterCount = countActiveLibraryFilters(effectiveLibraryFilters)
  const instanceSettingsTarget = instances.find((instance) => instance.id === instanceSettingsTargetId) || currentTarget
  currentContentTargetIdRef.current = currentTarget?.id || null
  currentContentTabRef.current = contentTab
  const targetPlaytime = currentTarget?.playtimeSeconds || 0
  const runningInstanceIds = Object.keys(runningInstances)
  const gameRunning = runningInstanceIds.length > 0
  const launching = launchingInstanceIds.length > 0
  const currentRunningThisTarget = Boolean(currentTarget && runningInstances[currentTarget.id])
  const currentLaunchingThisTarget = Boolean(currentTarget && launchingInstanceIds.includes(currentTarget.id))
  const currentBusyThisTarget = currentRunningThisTarget || currentLaunchingThisTarget
  const sidebarNarrow = sidebarWidth < 312
  const sidebarCompact = sidebarWidth < 284
  const getProjectKey = (project: any) => String(project?.project_id || project?.id || project?.slug || '')
  const isInstanceBusy = (instanceId?: string | null) => Boolean(
    instanceId && (runningInstances[instanceId] || launchingInstanceIds.includes(instanceId))
  )
  const isModContentType = (contentType?: string | null) => contentType === 'mod' || contentType === 'mods'
  const shouldBlockContentMutation = (instanceId?: string | null, contentType?: string | null) => {
    return isInstanceBusy(instanceId) && isModContentType(contentType)
  }
  const shouldBlockCurrentTargetContent = (contentType?: string | null) => {
    return shouldBlockContentMutation(currentTarget?.id, contentType)
  }

  useEffect(() => {
    localStorage.setItem(
      storage.loaderUpdateDismissals,
      JSON.stringify(dismissedLoaderUpdates.slice(-LOADER_UPDATE_DISMISSAL_LIMIT))
    )
  }, [dismissedLoaderUpdates])

  useEffect(() => {
    const requestKey = getLoaderUpdateRequestKey(currentTarget)
    const requestId = currentTargetLoaderVersionsRequestIdRef.current + 1
    currentTargetLoaderVersionsRequestIdRef.current = requestId

    if (
      !bootReady
      || activeView !== 'instances'
      || !currentTarget
      || currentTarget.loader === 'vanilla'
      || !currentTarget.version.trim()
      || !String(currentTarget.loaderVersion || '').trim()
    ) {
      setCurrentTargetLoaderVersions({ requestKey, versions: [], loading: false })
      return
    }

    setCurrentTargetLoaderVersions({ requestKey, versions: [], loading: true })
    window.electron.getLoaderVersions(currentTarget.loader, currentTarget.version)
      .then((versions) => {
        if (currentTargetLoaderVersionsRequestIdRef.current !== requestId) return
        setCurrentTargetLoaderVersions({ requestKey, versions, loading: false })
      })
      .catch(() => {
        if (currentTargetLoaderVersionsRequestIdRef.current !== requestId) return
        setCurrentTargetLoaderVersions({ requestKey, versions: [], loading: false })
      })
  }, [
    bootReady,
    activeView,
    currentTarget?.id,
    currentTarget?.loader,
    currentTarget?.version,
    currentTarget?.loaderVersion,
    currentTargetLoaderVersionsRefresh
  ])

  const refreshCurrentTargetLoaderUpdate = () => {
    setCurrentTargetLoaderVersionsRefresh((value) => value + 1)
  }

  useEffect(() => {
    if (libraryLoaderFilterAvailable) return
    setLibraryFilters((current) => current.loader ? { ...current, loader: '' } : current)
  }, [libraryLoaderFilterAvailable])

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    if (activeView !== 'settings') pendingDiscordAccountFocusRef.current = false
  }, [activeView])

  useEffect(() => {
    const target = activeView === 'instances' && pendingInstanceHeadingFocusRef.current
      ? { heading: instanceHeadingRef, pending: pendingInstanceHeadingFocusRef }
      : activeView === 'library' && pendingLibraryHeadingFocusRef.current
        ? { heading: libraryHeadingRef, pending: pendingLibraryHeadingFocusRef }
        : null
    if (!target) return

    let frame = 0
    let attempts = 0
    const focusHeading = () => {
      if (target.heading.current) {
        target.pending.current = false
        target.heading.current.focus({ preventScroll: true })
        return
      }

      attempts += 1
      if (attempts >= 40) {
        target.pending.current = false
        return
      }
      frame = window.requestAnimationFrame(focusHeading)
    }

    frame = window.requestAnimationFrame(focusHeading)
    return () => window.cancelAnimationFrame(frame)
  }, [activeView, currentTarget?.id])

  const focusLauncherInput = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('.fixed.inset-0 [data-launcher-autofocus="true"]')
        || document.querySelector<HTMLElement>('[data-launcher-autofocus="true"]')
      if (!target || target.matches(':disabled')) return
      if (document.activeElement === target) return

      const style = window.getComputedStyle(target)
      if (style.display === 'none' || style.visibility === 'hidden') return

      target.focus({ preventScroll: true })
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && typeof target.select === 'function') {
        target.select()
      }
    })
  }

  const clampSidebarWidth = (value: number) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)))

  const startSidebarResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    document.body.classList.add('nam-sidebar-resizing')

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX))
    }

    const stopResize = () => {
      document.body.classList.remove('nam-sidebar-resizing')
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', stopResize)
      document.removeEventListener('pointercancel', stopResize)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', stopResize)
    document.addEventListener('pointercancel', stopResize)
  }

  const handleSidebarResizeKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 32 : 12
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSidebarWidth((width) => clampSidebarWidth(width - step))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSidebarWidth((width) => clampSidebarWidth(width + step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setSidebarWidth(SIDEBAR_MIN_WIDTH)
    } else if (event.key === 'End') {
      event.preventDefault()
      setSidebarWidth(SIDEBAR_MAX_WIDTH)
    }
  }

  const ensureMinecraftVersionList = async () => {
    if (versions.length > 1 || minecraftVersionsLoading) return
    setMinecraftVersionsLoading(true)
    try {
      const items = await getAllVersions()
      setVersions(items)
      const firstVersion = getMinecraftVersionId(items[0])
      if (firstVersion) {
        setNewInstance((prev) => prev.version ? prev : { ...prev, version: firstVersion })
      }
    } catch {
      setStatusText(t('boot.versionListSkipped'))
    } finally {
      setMinecraftVersionsLoading(false)
    }
  }

  const resetInstanceSettingsDraft = (target: Instance) => {
    setInstanceSettingsDraft({
      name: target.name,
      version: target.version,
      loader: target.loader,
      loaderVersion: target.loaderVersion,
      iconUrl: target.iconUrl || ''
    })
  }

  const updateInstanceContentCache = (
    instanceId: string,
    kind: InstanceContentKind,
    items: InstanceContentItem[]
  ) => {
    if (kind === 'screenshots') return
    instanceContentCacheRef.current = {
      ...instanceContentCacheRef.current,
      [instanceId]: {
        ...instanceContentCacheRef.current[instanceId],
        [kind]: items
      }
    }
    setInstanceContentCache(instanceContentCacheRef.current)
  }

  const refreshInstanceContent = (
    kind: InstanceContentKind = contentTab,
    target: Instance | null = currentTarget,
    options: { silent?: boolean; force?: boolean } = {}
  ) => {
    if (!target) {
      setInstanceContent([])
      setContentLoading(false)
      return Promise.resolve([])
    }

    const cached = instanceContentCacheRef.current[target.id]?.[kind]
    const isVisibleTarget = () => (
      currentContentTargetIdRef.current === target.id
      && currentContentTabRef.current === kind
    )

    if (cached && !options.force && isVisibleTarget()) {
      setInstanceContent(cached)
      setContentLoading(false)
    } else if (!options.silent && !cached && isVisibleTarget()) {
      setInstanceContent([])
      setContentLoading(true)
    }

    return window.electron.getInstanceContent({ instance: target, kind })
      .then((items) => {
        updateInstanceContentCache(target.id, kind, items)
        if (isVisibleTarget()) {
          setInstanceContent(items)
        }
        return items
      })
      .catch(() => {
        if (isVisibleTarget() && !cached) setInstanceContent([])
        return cached || []
      })
      .finally(() => {
        if (isVisibleTarget()) setContentLoading(false)
      })
  }

  const openInstanceLogs = async (target: Instance | null = currentTarget) => {
    if (!target) return

    setInstancePanelView('logs')
    setGameLogLoading(true)

    try {
      const result = await window.electron.getInstanceRunLog(target)
      const lines = String(result.content || '')
        .split(/\r?\n/)
        .filter(Boolean)

      setGameLogPath(result.path || '')
      setGameLogLines([
        ...(result.truncated ? ['[NamLauncher] Showing the latest part of the game latest.log'] : []),
        ...lines.slice(-700)
      ])
    } catch {
      setGameLogLines(['[NamLauncher] Could not read the game latest.log'])
      setGameLogPath('')
    } finally {
      setGameLogLoading(false)
    }
  }

  const refreshUpdateSummaries = async (targets: Instance[] = instances) => {
    if (targets.length === 0) {
      setInstanceUpdateSummaries({})
      return
    }

    setCheckingUpdates(true)
    try {
      const entries = await Promise.all(targets.map(async (target) => {
        const summary = await window.electron.getInstanceUpdateSummary(target)
        return [target.id, summary] as const
      }))

      setInstanceUpdateSummaries((prev) => ({
        ...prev,
        ...Object.fromEntries(entries)
      }))
    } catch {
      setStatusText(t('status.updateCheckFailed'))
    } finally {
      setCheckingUpdates(false)
    }
  }

  const refreshDiscordStatus = async () => {
    try {
      setDiscordStatus(await window.electron.getDiscordStatus())
    } catch {
      setDiscordStatus(null)
    }
  }

  const applyGameState = (state: any) => {
    if (Array.isArray(state.running)) {
      setRunningInstances(Object.fromEntries(
        state.running
          .filter((game: any) => game?.instanceId)
          .map((game: any) => [String(game.instanceId), Number(game.startedAt) || Date.now()])
      ))
      const nextServers = Object.fromEntries(
        state.running
          .filter((game: any) => game?.instanceId && game?.server?.label)
          .map((game: any) => [String(game.instanceId), {
            label: String(game.server.label),
            kind: String(game.server.kind || 'domain')
          }])
      ) as Record<string, RunningServerInfo>
      setRunningServers(nextServers)
      const activeServer = Object.values(nextServers)[0]
      setActivityDetail(activeServer ? tf('status.playingServer', { server: activeServer.label }) : '')
    }
    if (Array.isArray(state.launching)) {
      setLaunchingInstanceIds(state.launching
        .map((launch: any) => String(launch?.instanceId || ''))
        .filter(Boolean))
    }

    if (state.status === 'running') {
      if (!Array.isArray(state.running) && state.instanceId) {
        setRunningInstances((prev) => ({
          ...prev,
          [state.instanceId]: Number(state.startedAt) || Date.now()
        }))
      }
      if (!Array.isArray(state.launching) && state.instanceId) {
        setLaunchingInstanceIds((prev) => prev.filter((id) => id !== state.instanceId))
      }
      setStatusText(t('status.gameRunning'))
      setProgress(100)
      return
    }

    if (state.status === 'launching') {
      if (!Array.isArray(state.launching) && state.instanceId) {
        setLaunchingInstanceIds((prev) => prev.includes(state.instanceId) ? prev : [...prev, state.instanceId])
      }
      setStatusText(t('status.launchStarting'))
      return
    }

    if (state.status === 'stopped') {
      if (!Array.isArray(state.running) && state.instanceId) {
        setRunningInstances((prev) => {
          const next = { ...prev }
          delete next[state.instanceId]
          return next
        })
      }
      if (!Array.isArray(state.launching) && state.instanceId) {
        setLaunchingInstanceIds((prev) => prev.filter((id) => id !== state.instanceId))
      }
      setRunningElapsedByInstance((prev) => {
        if (!state.instanceId) return prev
        const next = { ...prev }
        delete next[state.instanceId]
        return next
      })
      if (!Array.isArray(state.running) && state.instanceId) {
        setRunningServers((prev) => {
          const next = { ...prev }
          delete next[state.instanceId]
          return next
        })
      }
      const stillActive = (Array.isArray(state.running) && state.running.length > 0)
        || (Array.isArray(state.launching) && state.launching.length > 0)
      setStatusText(stillActive ? t('status.gameRunning') : t('status.ready'))
      if (!stillActive) setProgress(0)
    }
  }

  useEffect(() => {
    let cancelled = false
    const bootStartedAt = Date.now()
    const advanceBoot = (value: number, text: string) => {
      if (cancelled) return
      const eventId = `${bootStartedAt}-${++bootLogSequenceRef.current}`
      const eventTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setBootProgress((current) => Math.max(current, value))
      setBootText(text)
      setBootLog((current) => {
        const progressValue = Math.min(Math.max(Math.round(value), 0), 100)
        const previous = current[current.length - 1]
        if (previous?.text === text) return current
        return [
          ...current.slice(-8),
          {
            id: eventId,
            text,
            progress: progressValue,
            at: eventTime
          }
        ]
      })
    }
    const withBootTimeout = <T,>(task: Promise<T>, ms = 12000) => new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Boot task timed out')), ms)
      task.then(
        (value) => {
          window.clearTimeout(timeout)
          resolve(value)
        },
        (error) => {
          window.clearTimeout(timeout)
          reject(error)
        }
      )
    })

    const syncLegalDocument = async (legalLanguage: LauncherLanguage) => {
      const document = await withBootTimeout(window.electron.getLegalDocument(legalLanguage), 10000)
      if (cancelled) return

      let acceptedVersion = ''
      try {
        const savedAcceptance = JSON.parse(localStorage.getItem(storage.legalAcceptance) || '{}')
        acceptedVersion = typeof savedAcceptance?.version === 'string' ? savedAcceptance.version : ''
      } catch {
        acceptedVersion = ''
      }

      setLegalDocument(document)
      setLegalAccepted(false)
      setShowFirstRunSetup(acceptedVersion !== document.version)
    }

    advanceBoot(14, t('boot.loadingLocalData'))
    const dataLocationTask = loadLauncherDataLocation().then(() => {
      advanceBoot(96, t('boot.dataFolderReady'))
    })

    const savedInstances = localStorage.getItem(storage.instances)
    let loadedInstances: Instance[] = []
    if (savedInstances) {
      try {
        loadedInstances = normalizeStoredInstances(JSON.parse(savedInstances))
        setInstances(loadedInstances)
      } catch {
        setInstances([])
      }
    }

    const hydrateTask = loadedInstances.length > 0
      ? withBootTimeout(window.electron.hydrateInstances(loadedInstances))
        .then((hydratedInstances) => {
          setInstances((prev) => prev.map((instance) => {
            const hydrated = hydratedInstances.find((item) => item.id === instance.id)
            return hydrated ? { ...instance, iconUrl: hydrated.iconUrl || instance.iconUrl || null } : instance
          }))
          advanceBoot(34, t('boot.instancesReady'))
        })
        .catch(() => undefined)
      : Promise.resolve().then(() => advanceBoot(34, t('boot.instanceListReady')))

    setSelectedInstanceId(localStorage.getItem(storage.selectedInstance))
    setActiveAccountId(localStorage.getItem(storage.activeAccount))
    localStorage.removeItem('namlauncher_quick_server')
    localStorage.removeItem('namlauncher_quick_server_enabled')

    const savedMemory = Number(localStorage.getItem(storage.memoryGb))
    if (savedMemory) setMemoryGb(Math.min(Math.max(savedMemory, 1), 32))
    advanceBoot(24, t('boot.settings'))

    const accountsTask = withBootTimeout(window.electron.getAccounts()).then((loadedAccounts) => {
      setAccounts(loadedAccounts)
      const savedAccount = localStorage.getItem(storage.activeAccount)
      if (loadedAccounts.length > 0) {
        setActiveAccountId(
          savedAccount && loadedAccounts.some((account) => account.id === savedAccount)
            ? savedAccount
            : loadedAccounts[0].id
        )
      }
      advanceBoot(48, t('boot.accountsReady'))
    }).catch(() => {
      setStatusText(t('boot.accountsFailed'))
      advanceBoot(48, t('boot.accountsSkipped'))
    })

    const latestVersionTask = withBootTimeout(getLatestVersion()).then((version) => {
      setLatestVersion(version)
      setNewInstance((prev) => ({ ...prev, version }))
      advanceBoot(62, t('boot.minecraftVersionReady'))
    }).catch(() => advanceBoot(62, t('boot.savedMinecraftVersion')))
    const allVersionsTask = withBootTimeout(getAllVersions()).then((items) => {
      setVersions(items)
      advanceBoot(74, t('boot.versionListReady'))
    }).catch(() => advanceBoot(74, t('boot.versionListSkipped')))
    const gameStateTask = withBootTimeout(window.electron.getGameState()).then((state) => {
      applyGameState(state)
      advanceBoot(86, t('boot.gameStateSynced'))
    }).catch(() => advanceBoot(86, t('boot.gameStateReady')))
    const privacyTask = withBootTimeout(window.electron.getDiscordSettings()).then(async (settings) => {
      setDiscordSettings({ ...DEFAULT_LAUNCHER_SETTINGS, ...settings })
      refreshDiscordStatus().catch(() => undefined)
      window.electron.getLauncherDiscordAccount()
        .then(setLauncherDiscordAccount)
        .catch(() => setLauncherDiscordAccount({ connected: false, persistent: false, profile: null }))
      await syncLegalDocument(settings.language || 'th')
      advanceBoot(94, t('boot.privacyReady'))
    }).catch(async () => {
      await syncLegalDocument('th').catch(() => undefined)
      advanceBoot(94, t('boot.privacyReady'))
    })
    const launcherVersionTask = withBootTimeout(window.electron.getLauncherVersion(), 2000).then((version) => {
      setLauncherVersion(version)
    }).catch(() => undefined)
    // The main-process controller is single-flight and has bounded network
    // deadlines. Do not time out the UI while an installer is being prepared.
    const launcherUpdateTask = window.electron.runStartupLauncherUpdate().then((result) => {
      setLauncherUpdate(result.update)
      if (result.outcome === 'fallback' && result.update.updateAvailable) {
        setLauncherUpdateInstallState('failed')
        setLauncherUpdateProgress({ state: 'failed', percent: 0, detail: t(`update.auto.fallback.${result.reason || 'install-failed'}`) })
      }
      advanceBoot(98, result.update.updateAvailable ? t('boot.updateFound') : t('boot.versionReady'))
    }).catch(() => {
      advanceBoot(98, t('boot.versionReady'))
    }).finally(() => setStartupAutoUpdating(false))

    Promise.allSettled([
      hydrateTask,
      accountsTask,
      latestVersionTask,
      allVersionsTask,
      gameStateTask,
      privacyTask,
      launcherVersionTask,
      launcherUpdateTask
    ]).finally(() => {
      advanceBoot(100, t('status.ready'))
      const elapsed = Date.now() - bootStartedAt
      const readyDelay = Math.max(280, 1800 - elapsed)
      window.setTimeout(() => {
        if (!cancelled) setBootReady(true)
      }, readyDelay)
    })

    void dataLocationTask

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(storage.instances, JSON.stringify(instances))
  }, [instances])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const root = document.documentElement
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const themePreference = discordSettings.theme || 'system'
    let transitionTimer: number | undefined

    const applyTheme = () => {
      const resolvedTheme = themePreference === 'system'
        ? (colorScheme.matches ? 'dark' : 'light')
        : themePreference

      if (root.dataset.theme === resolvedTheme) return
      if (!reduceMotion) {
        root.classList.add('nam-theme-switching')
        // Ensure the transition is active before swapping the semantic palette.
        void root.offsetHeight
        window.clearTimeout(transitionTimer)
        transitionTimer = window.setTimeout(() => {
          root.classList.remove('nam-theme-switching')
        }, 340)
      }

      root.dataset.theme = resolvedTheme
      root.style.colorScheme = resolvedTheme
    }

    applyTheme()
    if (themePreference === 'system') colorScheme.addEventListener('change', applyTheme)

    return () => {
      colorScheme.removeEventListener('change', applyTheme)
      window.clearTimeout(transitionTimer)
      root.classList.remove('nam-theme-switching')
    }
  }, [discordSettings.theme, reduceMotion])

  useEffect(() => {
    localStorage.setItem(storage.sidebarWidth, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    if (!bootReady || windowHidden) return

    let cancelled = false
    const loadStats = async () => {
      try {
        const stats = await window.electron.getLauncherStats()
        if (!cancelled) setLauncherStats(stats)
      } catch {
        if (!cancelled) setLauncherStats(null)
      }
    }

    loadStats()
    const timer = window.setInterval(loadStats, 5 * 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [bootReady, windowHidden])

  useEffect(() => {
    const syncVisibility = () => setWindowHidden(document.hidden)
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  useEffect(() => {
    if (showLoginModal || showInstanceModal) {
      focusLauncherInput()
    }
  }, [showLoginModal, showInstanceModal, loginStep])

  useEffect(() => {
    const nextSelectedInstanceId = resolveSelectedInstanceId(instances, selectedInstanceId)
    if (nextSelectedInstanceId !== selectedInstanceId) {
      setSelectedInstanceId(nextSelectedInstanceId)
    }

    setInstanceUpdateSummaries((prev) => Object.fromEntries(
      Object.entries(prev).filter(([instanceId]) => instances.some((instance) => instance.id === instanceId))
    ))
    const validInstanceIds = new Set(instances.map((instance) => instance.id))
    const nextCache = Object.fromEntries(
      Object.entries(instanceContentCacheRef.current).filter(([instanceId]) => validInstanceIds.has(instanceId))
    ) as InstanceContentCache
    instanceContentCacheRef.current = nextCache
    setInstanceContentCache(nextCache)
  }, [instances, selectedInstanceId])

  useEffect(() => {
    if (!bootReady || activeView !== 'instances' || !currentTarget || gameRunning) return

    const timer = window.setTimeout(() => {
      refreshUpdateSummaries([currentTarget])
    }, 700)

    return () => window.clearTimeout(timer)
  }, [bootReady, activeView, currentTarget?.id, currentTarget?.version, currentTarget?.loader, currentTarget?.loaderVersion, gameRunning])

  useEffect(() => {
    if (selectedInstanceId) localStorage.setItem(storage.selectedInstance, selectedInstanceId)
    else localStorage.removeItem(storage.selectedInstance)
  }, [selectedInstanceId])

  useEffect(() => {
    if (activeAccountId) localStorage.setItem(storage.activeAccount, activeAccountId)
    else localStorage.removeItem(storage.activeAccount)
    window.electron.setActiveAccountContext(activeAccountId).catch(() => undefined)
  }, [activeAccountId])

  useEffect(() => {
    if (!showAccountMenu) return

    const closeAccountMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && accountMenuRef.current?.contains(target)) return
      setShowAccountMenu(false)
    }

    document.addEventListener('pointerdown', closeAccountMenu)
    return () => document.removeEventListener('pointerdown', closeAccountMenu)
  }, [showAccountMenu])

  useEffect(() => {
    if (!instanceActionMenuOpen) return

    const closeInstanceActionMenu = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && instanceActionMenuRef.current?.contains(target)) return
      setInstanceActionMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeInstanceActionMenu)
    return () => document.removeEventListener('pointerdown', closeInstanceActionMenu)
  }, [instanceActionMenuOpen])

  useEffect(() => {
    if (!showInstanceSettings) return
    if (instanceSettingsTab !== 'installation' && !instanceSettingsEditingInstallation) return
    void ensureMinecraftVersionList()
  }, [showInstanceSettings, instanceSettingsTab, instanceSettingsEditingInstallation])

  useEffect(() => {
    if (!showInstanceSettings) return
    if (instanceSettingsDraft.loader === 'vanilla') {
      setInstanceSettingsLoaderVersions([])
      setInstanceSettingsLoaderVersionsLoading(false)
      setInstanceSettingsDraft((prev) => prev.loaderVersion ? { ...prev, loaderVersion: '' } : prev)
      return
    }
    if (!instanceSettingsDraft.version.trim()) {
      setInstanceSettingsLoaderVersions([])
      setInstanceSettingsLoaderVersionsLoading(false)
      return
    }

    let cancelled = false
    setInstanceSettingsLoaderVersionsLoading(true)
    window.electron.getLoaderVersions(instanceSettingsDraft.loader, instanceSettingsDraft.version)
      .then((items) => {
        if (cancelled) return
        setInstanceSettingsLoaderVersions(items)
        setInstanceSettingsDraft((prev) => {
          if (prev.loader !== instanceSettingsDraft.loader || prev.version !== instanceSettingsDraft.version) return prev
          if (items.some((item) => item.id === prev.loaderVersion)) return prev
          return { ...prev, loaderVersion: items[0]?.id || '' }
        })
      })
      .catch(() => {
        if (!cancelled) {
          setInstanceSettingsLoaderVersions([])
          setStatusText(tf('status.loaderVersionsFailed', {
            loader: instanceSettingsDraft.loader,
            error: t('status.unknownError')
          }))
        }
      })
      .finally(() => {
        if (!cancelled) setInstanceSettingsLoaderVersionsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [showInstanceSettings, instanceSettingsDraft.loader, instanceSettingsDraft.version])

  useEffect(() => {
    if (!selectedScreenshot) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeScreenshotViewer()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedScreenshot?.id])

  useEffect(() => {
    if (!libraryProjectDetails) return
    const dialog = libraryProjectDialogRef.current
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>('[data-dialog-autofocus="true"]')?.focus()
    })

    const handleLibraryProjectDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeLibraryProjectDetails()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleLibraryProjectDialogKey)
    return () => document.removeEventListener('keydown', handleLibraryProjectDialogKey)
  }, [libraryProjectDetails])

  useEffect(() => {
    localStorage.setItem(storage.memoryGb, String(memoryGb))
  }, [memoryGb])

  useEffect(() => {
    if (windowHidden) return
    refreshDiscordStatus().catch(() => undefined)
    const intervalMs = gameRunning ? 60_000 : 30_000
    const timer = window.setInterval(() => {
      refreshDiscordStatus().catch(() => undefined)
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [discordSettings.discordRpcEnabled, gameRunning, windowHidden])

  useEffect(() => {
    let cancelled = false
    const requestedLoader = newInstance.loader
    const requestedVersion = newInstance.version.trim()

    if (requestedLoader === 'vanilla' || !requestedVersion) {
      setLoaderVersions([])
      setNewInstance((prev) => ({ ...prev, loaderVersion: '' }))
      return () => {
        cancelled = true
      }
    }

    setLoaderVersions([])
    setNewInstance((prev) => ({ ...prev, loaderVersion: '' }))

    const loadLoaderVersions = async () => {
      try {
        const compatibility = await window.electron.getLoaderCompatibility(requestedLoader, requestedVersion)
        if (cancelled) return
        if (!compatibility.supported) {
          const recommendedVersion = compatibility.recommendedGameVersion
          if (recommendedVersion) {
            setNewInstance((prev) => (
              prev.loader === requestedLoader && prev.version === requestedVersion
                ? { ...prev, version: recommendedVersion, loaderVersion: '' }
                : prev
            ))
            setStatusText(`Quilt is not available for Minecraft ${requestedVersion}; switched to ${recommendedVersion}`)
          } else {
            setStatusText(`Quilt is not available for Minecraft ${requestedVersion}`)
          }
          return
        }

        const items = await window.electron.getLoaderVersions(requestedLoader, requestedVersion)
        if (cancelled) return
        setLoaderVersions(items)
        setNewInstance((prev) => (
          prev.loader === requestedLoader && prev.version === requestedVersion
            ? { ...prev, loaderVersion: items[0]?.id || '' }
            : prev
        ))
      } catch {
        if (cancelled) return
        setLoaderVersions([])
        setNewInstance((prev) => ({ ...prev, loaderVersion: '' }))
        setStatusText(tf('status.loaderVersionsFailed', {
          loader: requestedLoader,
          error: t('status.unknownError')
        }))
      }
    }

    loadLoaderVersions().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [newInstance.loader, newInstance.version])

  useEffect(() => {
    if (!bootReady || activeView !== 'instances' || instancePanelView !== 'content') return
    if (!currentTarget) {
      setInstanceContent([])
      setContentLoading(false)
      return
    }

    const cached = instanceContentCacheRef.current[currentTarget.id]?.[contentTab]
    if (cached) {
      setInstanceContent(cached)
      setContentLoading(false)
      return
    }

    refreshInstanceContent(contentTab, currentTarget)
  }, [bootReady, activeView, instancePanelView, contentTab, currentTarget?.id, currentTarget?.version, currentTarget?.loader, currentTarget?.loaderVersion])

  useEffect(() => {
    if (contentTab !== 'screenshots') return
    if (activeView === 'instances' && instancePanelView === 'content') return
    setInstanceContent([])
    setSelectedScreenshot(null)
  }, [activeView, instancePanelView, contentTab])

  useEffect(() => {
    manualDownloadStatusesRef.current = manualDownloadStatuses
  }, [manualDownloadStatuses])

  useEffect(() => {
    if (!manualDownloadInstance || manualDownloadItems.length === 0) return

    let cancelled = false
    const checkDownloads = () => {
      manualDownloadItems.forEach((item) => {
        const currentStatus = manualDownloadStatusesRef.current[item.id]
        if (currentStatus === 'complete' || currentStatus === 'checking' || manualDownloadInFlightRef.current.has(item.id)) return

        manualDownloadInFlightRef.current.add(item.id)
        setManualDownloadStatuses((prev) => ({ ...prev, [item.id]: 'checking' }))
        window.electron.importCurseForgeManualDownload({ instance: manualDownloadInstance, item })
          .then((result) => {
            if (cancelled) return
            if (result.imported) {
              setManualDownloadStatuses((prev) => ({ ...prev, [item.id]: 'complete' }))
              setManualDownloadMessage(tf('manualDownload.imported', { file: result.filename || item.filename }))
              const targetTab: InstanceContentKind = item.projectType === 'resourcepack'
                ? 'resourcepacks'
                : item.projectType === 'shader'
                  ? 'shaderpacks'
                  : 'mods'
              refreshInstanceContent(targetTab, manualDownloadInstance).catch(() => undefined)
            } else {
              setManualDownloadStatuses((prev) => ({ ...prev, [item.id]: 'pending' }))
            }
          })
          .catch(() => {
            if (!cancelled) {
              setManualDownloadStatuses((prev) => ({ ...prev, [item.id]: 'failed' }))
              setManualDownloadMessage(tf('manualDownload.importFailed', { file: item.filename }))
            }
          })
          .finally(() => {
            manualDownloadInFlightRef.current.delete(item.id)
          })
      })
    }

    checkDownloads()
    const interval = window.setInterval(checkDownloads, 2500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [manualDownloadInstance?.id, manualDownloadItems])

  useEffect(() => {
    if (!manualDownloadInstance || manualDownloadItems.length === 0) {
      manualDownloadCompletionAnnouncedRef.current = false
      return
    }

    const complete = manualDownloadItems.every((item) => manualDownloadStatuses[item.id] === 'complete')
    if (!complete) {
      manualDownloadCompletionAnnouncedRef.current = false
      return
    }
    if (manualDownloadCompletionAnnouncedRef.current) return
    manualDownloadCompletionAnnouncedRef.current = true

    setProgress(100)
    setStatusText(tf('manualDownload.ready.status', { instance: manualDownloadInstance.name }))
    setActivityDetail(t('manualDownload.ready.detail'))
    setManualDownloadMessage(t('manualDownload.ready.message'))
    refreshInstanceContent('mods', manualDownloadInstance).catch(() => undefined)
    refreshInstanceContent('resourcepacks', manualDownloadInstance).catch(() => undefined)
    refreshInstanceContent('shaderpacks', manualDownloadInstance).catch(() => undefined)
    refreshUpdateSummaries([manualDownloadInstance]).catch(() => undefined)
  }, [manualDownloadInstance?.id, manualDownloadItems, manualDownloadStatuses])

  useEffect(() => {
    setInstancePanelView('content')
    setInstanceContentQuery('')
    setGameLogLines([])
    setGameLogPath('')
    setGameLogLoading(false)
  }, [currentTarget?.id])

  useEffect(() => {
    const cleanup = window.electron.onGameLog((entry) => {
      if (!entry?.line || !currentTarget) return
      if (instancePanelView !== 'logs' || windowHidden) return
      if (entry.instanceId && entry.instanceId !== currentTarget.id) return

      setGameLogLines((prev) => [...prev, entry.line].slice(-800))
    })

    return cleanup
  }, [currentTarget?.id, instancePanelView, windowHidden])

  useEffect(() => {
    if (instancePanelView !== 'logs') return
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [instancePanelView, gameLogLines.length])

  useEffect(() => {
    if (
      !bootReady
      || activeView !== 'home'
      || windowHidden
      || showFirstRunSetup
      || showLegalReview
    ) {
      homeServerStatusRequestIdRef.current += 1
      return
    }

    const seen = new Set<string>()
    const targets: Array<{ key: string; address: string; instance: Instance }> = []
    for (const { instance, quickPlay } of getRecentPlayablePlaces(recentPlaces, instances)) {
      if (quickPlay.type !== 'server') continue
      const key = getHomeServerStatusKey(instance.id, quickPlay.address)
      if (seen.has(key)) continue
      seen.add(key)
      targets.push({ key, address: quickPlay.address, instance })
      if (targets.length >= HOME_SERVER_STATUS_MAX_RECENT) break
    }

    if (targets.length === 0) {
      setHomeServerStatuses({})
      setHomeServerStatusesRefreshing(false)
      return
    }

    const requestId = homeServerStatusRequestIdRef.current + 1
    homeServerStatusRequestIdRef.current = requestId
    const cache = homeServerStatusCacheRef.current
    const now = Date.now()

    const initialStatuses: Record<string, HomeServerStatusEntry> = {}
    const pendingTargets = targets.filter((target) => {
      const cached = cache.get(target.key)
      initialStatuses[target.key] = cached?.status || { phase: 'loading' }
      return !cached || cached.expiresAt <= now
    })
    setHomeServerStatuses(initialStatuses)
    setHomeServerStatusesRefreshing(pendingTargets.length > 0)

    let cancelled = false
    let timer = 0
    const isCurrent = () => !cancelled && requestId === homeServerStatusRequestIdRef.current
    const storeCachedStatus = (key: string, status: HomeServerStatusEntry) => {
      cache.delete(key)
      cache.set(key, { status, expiresAt: Date.now() + HOME_SERVER_STATUS_CACHE_TTL_MS })
      while (cache.size > HOME_SERVER_STATUS_CACHE_LIMIT) {
        const oldestKey = cache.keys().next().value
        if (typeof oldestKey !== 'string') break
        cache.delete(oldestKey)
      }
    }

    if (pendingTargets.length > 0) {
      timer = window.setTimeout(() => {
        const grouped = new Map<string, { instance: Instance; targets: typeof pendingTargets }>()
        for (const target of pendingTargets) {
          const current = grouped.get(target.instance.id)
          if (current) current.targets.push(target)
          else grouped.set(target.instance.id, { instance: target.instance, targets: [target] })
        }
        const groups = [...grouped.values()]
        let nextGroupIndex = 0

        const pingNextGroup = async () => {
          while (nextGroupIndex < groups.length) {
            const groupIndex = nextGroupIndex
            nextGroupIndex += 1
            const group = groups[groupIndex]
            const addresses = group.targets.map((target) => target.address)
            const inFlightKey = `${group.instance.id}:${addresses.map(normalizeHomeServerAddress).sort().join(',')}`
            let pingRequest = homeServerPingInFlightRef.current.get(inFlightKey)
            if (!pingRequest) {
              const startedRequest = window.electron.pingInstanceServers(group.instance, addresses)
              pingRequest = startedRequest.finally(() => {
                if (homeServerPingInFlightRef.current.get(inFlightKey) === pingRequest) {
                  homeServerPingInFlightRef.current.delete(inFlightKey)
                }
              })
              homeServerPingInFlightRef.current.set(inFlightKey, pingRequest)
            }

            let pings: MinecraftServerPing[] = []
            try {
              pings = await pingRequest
            } catch {
              // A failed scoped request is represented as offline without exposing backend details.
            }
            const pingsByAddress = new Map<string, MinecraftServerPing>()
            for (const ping of pings) {
              pingsByAddress.set(normalizeHomeServerAddress(ping.address), ping)
              for (const requestedAddress of ping.requestedAddresses || []) {
                pingsByAddress.set(normalizeHomeServerAddress(requestedAddress), ping)
              }
            }
            const completedStatuses: Record<string, HomeServerStatusEntry> = {}
            for (const target of group.targets) {
              const ping = pingsByAddress.get(normalizeHomeServerAddress(target.address))
              const status: HomeServerStatusEntry = ping?.online
                ? { phase: 'online', ping }
                : { phase: 'offline', ...(ping ? { ping } : {}) }
              completedStatuses[target.key] = status
              storeCachedStatus(target.key, status)
            }
            if (isCurrent()) {
              setHomeServerStatuses((current) => ({ ...current, ...completedStatuses }))
            }
          }
        }

        void Promise.all(Array.from(
          { length: Math.min(HOME_SERVER_STATUS_CONCURRENCY, groups.length) },
          () => pingNextGroup()
        )).finally(() => {
          if (isCurrent()) setHomeServerStatusesRefreshing(false)
        })
      }, HOME_SERVER_STATUS_DELAY_MS)
    }

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      if (homeServerStatusRequestIdRef.current === requestId) {
        homeServerStatusRequestIdRef.current += 1
      }
    }
  }, [
    activeView,
    bootReady,
    homeServerStatusRefresh,
    instances,
    recentPlaces,
    showFirstRunSetup,
    showLegalReview,
    windowHidden
  ])

  useEffect(() => {
    // Author/creator: nattapat2871 (https://nattapat2871.me)
    if (!bootReady || activeView !== 'home' || homeModpacksLoaded) return

    let cancelled = false
    const requestId = homeModpackRequestIdRef.current + 1
    homeModpackRequestIdRef.current = requestId
    setHomeModpacksLoading(true)
    setHomeModpacksError(false)

    const timer = window.setTimeout(() => {
      window.electron.getHomeModpacks().then((result) => {
        if (cancelled || requestId !== homeModpackRequestIdRef.current) return
        setHomeModpacks(Array.isArray(result?.hits) ? result.hits : [])
        setHomeModpacksLoaded(true)
      }).catch(() => {
        if (cancelled || requestId !== homeModpackRequestIdRef.current) return
        setHomeModpacks([])
        setHomeModpacksError(true)
      }).finally(() => {
        if (!cancelled && requestId === homeModpackRequestIdRef.current) {
          setHomeModpacksLoading(false)
        }
      })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [bootReady, activeView, homeModpacksLoaded, homeModpacksRetry])

  useEffect(() => {
    if (activeView !== 'library') return
    window.electron.getCurseForgeConfig()
      .then((config) => setCurseForgeConfigured(config.configured))
      .catch(() => setCurseForgeConfigured(false))
  }, [activeView])

  useEffect(() => {
    if (!bootReady) return
    window.electron.rendererReady().catch(() => undefined)
  }, [bootReady])

  useEffect(() => {
    let cancelled = false
    if (activeView !== 'library') return () => {
      cancelled = true
    }

    const query = normalizeLibrarySearchQuery(modQuery)
    const instanceKey = librarySource === 'curseforge'
      ? [
        currentTarget?.id || 'no-instance',
        currentTarget?.version || '',
        currentTarget?.loader || '',
        currentTarget?.loaderVersion || ''
      ].join('|')
      : 'modrinth'
    const cacheKey = JSON.stringify({
      source: librarySource,
      type: libraryType,
      query,
      page: libraryPage,
      instance: instanceKey,
      filters: resolvedLibraryFilters
    })
    const cached = librarySearchCacheRef.current.get(cacheKey)
    const hasFreshCache = Boolean(cached && Date.now() - cached.storedAt < LIBRARY_SEARCH_CACHE_TTL_MS)

    if (hasFreshCache && cached) {
      setMods(cached.hits)
      setTotalHits(cached.total_hits)
      setLibraryError('')
      setLibraryLoading(false)
    }

    const delay = setTimeout(() => {
      if (activeView !== 'library' || cancelled) return
      if (librarySource === 'curseforge' && !curseForgeConfigured) {
        setMods([])
        setTotalHits(0)
        setLibraryLoading(false)
        return
      }

      setLibraryLoading(!hasFreshCache)
      setLibraryError('')
      const searchTask = librarySource === 'curseforge'
        ? window.electron.searchCurseForge({
          query,
          projectType: libraryType,
          offset: libraryPage * 10,
          limit: 10,
          instance: currentTarget,
          sort: resolvedLibraryFilters.sort === 'relevance' ? 'downloads' : resolvedLibraryFilters.sort,
          gameVersion: resolvedLibraryFilters.gameVersion,
          loader: resolvedLibraryFilters.loader
        })
        : window.electron.searchModrinth({
          query,
          projectType: libraryType,
          offset: libraryPage * 10,
          limit: 10,
          index: resolvedLibraryFilters.sort,
          gameVersion: resolvedLibraryFilters.gameVersion,
          loader: resolvedLibraryFilters.loader,
          environment: resolvedLibraryFilters.environment,
          openSourceOnly: resolvedLibraryFilters.openSourceOnly
        })

      searchTask.then((result) => {
        // Author/creator: nattapat2871 (https://nattapat2871.me)
        if (cancelled || result?.canceled) return
        const hits = Array.isArray(result?.hits) ? result.hits : []
        const total = normalizeLibraryTotalHits(result?.total_hits, hits.length)
        setMods(hits)
        setTotalHits(total)
        librarySearchCacheRef.current.set(cacheKey, { hits, total_hits: total, storedAt: Date.now() })
        while (librarySearchCacheRef.current.size > LIBRARY_SEARCH_CACHE_LIMIT) {
          const oldestKey = librarySearchCacheRef.current.keys().next().value
          if (!oldestKey) break
          librarySearchCacheRef.current.delete(oldestKey)
        }
      }).catch(() => {
        if (cancelled) return
        if (!hasFreshCache) {
          setMods([])
          setTotalHits(0)
          setLibraryError(tf('library.searchFailed', { source: librarySource === 'curseforge' ? 'CurseForge' : 'Modrinth' }))
        }
      }).finally(() => {
        if (!cancelled) setLibraryLoading(false)
      })
    }, hasFreshCache ? 0 : LIBRARY_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(delay)
    }
  }, [
    activeView,
    modQuery,
    libraryType,
    libraryPage,
    librarySource,
    curseForgeConfigured,
    currentTarget?.id,
    currentTarget?.version,
    currentTarget?.loader,
    currentTarget?.loaderVersion,
    resolvedLibraryFilters.sort,
    resolvedLibraryFilters.gameVersion,
    resolvedLibraryFilters.loader,
    resolvedLibraryFilters.environment,
    resolvedLibraryFilters.openSourceOnly
  ])

  useEffect(() => {
    if (activeView !== 'library' || libraryLoading || libraryError) return
    const boundedPage = clampLibraryPage(libraryPage, getLibraryTotalPages(totalHits))
    if (boundedPage !== libraryPage) {
      if (pendingLibraryPageFocusRef.current === libraryPage) {
        pendingLibraryPageFocusRef.current = boundedPage
      }
      setLibraryPage(boundedPage)
    }
  }, [activeView, libraryError, libraryLoading, libraryPage, totalHits])

  useEffect(() => {
    const pendingPage = pendingLibraryPageFocusRef.current
    if (pendingPage === null) return
    if (activeView !== 'library' || libraryError || pendingPage !== libraryPage) {
      pendingLibraryPageFocusRef.current = null
      return
    }
    if (libraryLoading) return

    const frame = window.requestAnimationFrame(() => {
      pendingLibraryPageFocusRef.current = null
      libraryHeadingRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeView, libraryError, libraryLoading, libraryPage])

  useEffect(() => {
    installedContentStatusOverridesRef.current = {}
  }, [currentTarget?.id, libraryType, librarySource])

  useEffect(() => {
    if (activeView !== 'library' || mods.length === 0 || (!currentTarget && libraryType !== 'modpack')) {
      setContentStatuses({})
      setContentStatusLoading(false)
      return
    }

    let cancelled = false
    setContentStatusLoading(true)

    const statusTask = librarySource === 'curseforge'
      ? window.electron.getCurseForgeContentStatus({ instance: currentTarget, projects: mods })
      : window.electron.getModrinthContentStatus({ instance: currentTarget, projects: mods })

    statusTask
      .then((statuses) => {
        if (!cancelled) {
          setContentStatuses({ ...statuses, ...installedContentStatusOverridesRef.current })
        }
      })
      .catch(() => {
        if (!cancelled) setContentStatuses({ ...installedContentStatusOverridesRef.current })
      })
      .finally(() => {
        if (!cancelled) setContentStatusLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeView, mods, libraryType, librarySource, currentTarget?.id, currentTarget?.version, currentTarget?.loader, currentTarget?.loaderVersion])

  useEffect(() => {
    const cleanupLauncherError = window.electron.onLauncherErrorReport((report) => {
      setLauncherErrorReport(report)
      setErrorCopyState('idle')
      setErrorSubmitState(submittedErrorReportsRef.current.has(report.id) ? 'sent' : 'idle')
      setErrorSubmitDetail('')
    })

    return cleanupLauncherError
  }, [])

  useEffect(() => {
    const cleanupProgress = window.electron.onLaunchProgress((p) => {
      const launchProgressTypes = new Set([
        'java-setup',
        'java-download',
        'java-extract',
        'auth-refresh',
        'loader-install',
        'loader-download',
        'assets',
        'server-connect',
        'multiplayer-auth-warning',
        'launch-cancelled'
      ])
      if (p.instanceId && p.instanceId !== currentTarget?.id && launchProgressTypes.has(p.type)) return

      setActivityDetail(typeof p.detail === 'string' ? p.detail : '')
      if (p.type === 'java-setup') {
        setStatusText(t('status.javaPreparing'))
        setProgress(4)
      } else if (p.type === 'java-download') {
        setStatusText(p.detail || t('status.javaDownloading'))
        setProgress(p.task)
      } else if (p.type === 'java-extract') {
        setStatusText(p.detail || t('status.javaExtracting'))
        setProgress(p.task)
      } else if (p.type === 'auth-refresh') {
        setStatusText(t('status.sessionRefreshing'))
        setProgress(p.task)
      } else if (p.type === 'loader-install') {
        setStatusText(tf('status.loaderInstalling', { loader: p.detail || t('instance.loader') }))
        setProgress(p.task)
      } else if (p.type === 'loader-download') {
        setStatusText(t('status.loaderDownloading'))
        setProgress(p.task)
      } else if (p.type === 'content-install') {
        const installProgress = Math.min(Math.max(Number(p.task) || 0, 0), 100)
        setModpackInstallActivity((current) => (
          current?.phase === 'installing'
            ? {
                ...current,
                progress: installProgress,
                detail: typeof p.detail === 'string' && p.detail.trim() ? p.detail : current.detail
              }
            : current
        ))
        setStatusText(p.task >= 100
          ? t('content.install.installed')
          : p.detail
            ? tf('content.install.installing', { file: p.detail })
            : t('content.install.generic'))
        setProgress(installProgress)
      } else if (p.type === 'content-cancelled') {
        setModpackInstallActivity((current) => current?.phase === 'installing' ? null : current)
        setStatusText(t('content.install.canceled'))
        setActivityDetail('')
        setProgress(0)
      } else if (p.type === 'content-export') {
        setStatusText(p.task >= 100 ? t('status.exportComplete') : p.detail ? tf('status.exportingDetail', { detail: p.detail }) : t('status.exportPreparing'))
        setProgress(p.task)
      } else if (p.type === 'content-download') {
        setStatusText(p.detail ? `${t('status.contentDownloading')}: ${p.detail}` : t('status.contentDownloading'))
        setProgress(p.task)
      } else if (p.type === 'assets') {
        setStatusText(t('status.assetsDownloading'))
        setProgress(Math.round((p.task / p.total) * 100))
      } else if (p.type === 'server-connect') {
        // ไม่แสดงข้อความ Connecting to server แล้ว
      } else if (p.type === 'multiplayer-auth-warning') {
        setStatusText(t('status.serverAuthWarning'))
      } else if (p.type === 'launch-cancelled') {
        setStatusText(t('status.stopRequested'))
        setActivityDetail(p.detail || '')
        setProgress(0)
      } else if (p.total) {
        setStatusText(t('status.filesPreparing'))
        setProgress(Math.round((p.task / p.total) * 100))
      }
    })

    const cleanupError = window.electron.onLaunchError((error) => {
      setStatusText(t('status.launchFailed'))
      setActivityDetail('')
      if (isMicrosoftSessionExpiredMessage(error) && activeAccount?.type === 'msa') {
        showMicrosoftSessionExpired({
          accountId: activeAccount.id,
          accountName: activeAccount.name,
          message: error
        })
      }
    })

    const cleanupMinecraftGameIssue = window.electron.onMinecraftGameIssue((issue) => {
      setMinecraftGameIssue(issue)
      setStatusText(t('status.launchFailed'))
      setActivityDetail('')
    })

    const cleanupLauncherUpdate = window.electron.onLauncherUpdate((update) => {
      setLauncherUpdate(update)
      if (!update.updateAvailable) {
        setDismissedLauncherUpdateVersion('')
        setLauncherUpdateInstallState('idle')
        setLauncherUpdateProgress(null)
        setLauncherUpdateBlockReason(null)
      }
    })

    const cleanupLauncherUpdateProgress = window.electron.onLauncherUpdateProgress((updateProgress) => {
      setLauncherUpdateProgress(updateProgress)
      if (updateProgress.state === 'downloading') {
        setLauncherUpdateBlockReason(null)
        setLauncherUpdateInstallState('installing')
        setStatusText(t('settings.update.prompt.downloading'))
        setProgress(Math.min(Math.max(Math.round(updateProgress.percent || 0), 0), 100))
        setActivityDetail(updateProgress.detail || '')
      } else if (updateProgress.state === 'opening-installer') {
        setLauncherUpdateInstallState('installing')
        setStatusText(t('settings.update.prompt.opening'))
        setProgress(100)
        setActivityDetail(updateProgress.detail || '')
      } else if (updateProgress.state === 'installer-opened') {
        setLauncherUpdateInstallState('opened')
        setStatusText(t('settings.update.prompt.opened'))
        setProgress(100)
        setActivityDetail(updateProgress.detail || '')
      }
    })

    const cleanupAccountSessionExpired = window.electron.onAccountSessionExpired((payload) => {
      showMicrosoftSessionExpired(payload)
    })

    const cleanupGameState = window.electron.onGameState((state) => {
      if (state.status === 'stopped') {
        if (state.instanceId && state.durationMs) {
          setInstances((prev) => prev.map((instance) => instance.id === state.instanceId
            ? {
                ...instance,
                playtimeSeconds: (instance.playtimeSeconds || 0) + Math.max(0, Math.round(state.durationMs / 1000)),
                lastPlayedAt: new Date().toISOString()
              }
            : instance
          ))
        }

        refreshInstanceContent(contentTab, currentTarget).catch(() => undefined)
      }

      applyGameState(state)
    })

    return () => {
      cleanupProgress()
      cleanupError()
      cleanupMinecraftGameIssue()
      cleanupLauncherUpdate()
      cleanupLauncherUpdateProgress()
      cleanupAccountSessionExpired()
      cleanupGameState()
    }
  }, [activeAccount?.id, activeAccount?.name, activeAccount?.type, contentTab, currentTarget, showMicrosoftSessionExpired])

  useEffect(() => {
    if (!gameRunning || windowHidden) return
    const updateElapsed = () => {
      setRunningElapsedByInstance(Object.fromEntries(
        Object.entries(runningInstances).map(([instanceId, startedAt]) => [
          instanceId,
          Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        ])
      ))
    }
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [gameRunning, runningInstances, windowHidden])

  const acceptLegalTerms = () => {
    if (!legalDocument || !legalAccepted) return
    localStorage.setItem(storage.legalAcceptance, JSON.stringify({
      version: legalDocument.version,
      acceptedAt: new Date().toISOString()
    }))
    setShowFirstRunSetup(false)
    setStatusText(t('status.ready'))
  }

  const openLegalReview = async () => {
    setShowLegalReview(true)
    try {
      const document = await window.electron.getLegalDocument(language)
      setLegalDocument(document)
    } catch {
      setStatusText(t('status.legalRefreshFailed'))
    }
  }

  const openOfflineLogin = () => {
    setOfflineWarningAccepted(false)
    setOfflineNameInputRejected(false)
    setShowLoginModal(true)
    setLoginStep('offline')
  }

  const handleOfflineNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextName = sanitizeOfflineUsernameInput(event.target.value)
    setOfflineName(nextName)
    setOfflineNameInputRejected(nextName !== event.target.value)
  }

  const handleLogin = async (type: 'microsoft' | 'offline') => {
    if (type === 'offline') {
      openOfflineLogin()
      return
    }

    if (microsoftLoginLoading) return
    setMicrosoftLoginLoading(true)
    setShowAccountMenu(false)
    setStatusText(t('auth.microsoft.loading'))

    try {
      const account = await window.electron.loginMicrosoft()
      setAccounts((prev) => {
        const index = prev.findIndex((item) => item.id === account.id)
        if (index < 0) return [...prev, account]
        const next = [...prev]
        next[index] = account
        return next
      })
      setActiveAccountId(account.id)
      setSessionExpiredNotice(null)
      setShowAccountMenu(false)
      setShowLoginModal(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      const xboxProfileRequired = /Xbox Live rejected this Microsoft account|has an Xbox profile|allowed to use Xbox services|finish profile or family-safety setup/i.test(message)
      setStatusText(t(xboxProfileRequired ? 'auth.microsoft.xboxProfileRequired' : 'auth.microsoft.failed'))
    } finally {
      setMicrosoftLoginLoading(false)
    }
  }

  const confirmOfflineLogin = async () => {
    const username = offlineName.trim()
    if (!isValidOfflineUsername(username)) {
      setOfflineNameInputRejected(true)
      return
    }
    if (!offlineWarningAccepted) {
      setStatusText(t('status.offlineConfirmFirst'))
      return
    }

    try {
      const account = await window.electron.loginOffline(username)
      setAccountSkinTextures((current) => ({
        ...current,
        [account.id]: DEFAULT_STEVE_TEXTURE_URL
      }))
      setAccounts((prev) => {
        const index = prev.findIndex((item) => item.id === account.id)
        if (index < 0) return [...prev, account]
        const next = [...prev]
        next[index] = account
        return next
      })
      setActiveAccountId(account.id)
      setSessionExpiredNotice(null)
      setShowAccountMenu(false)
      setOfflineName('')
      setOfflineNameInputRejected(false)
      setLoginStep('select')
      setShowLoginModal(false)
    } catch {
      setStatusText(t('status.offlineLoginFailed'))
    }
  }

  const removeAccountNow = async (accountId: string) => {
    const nextAccounts = await window.electron.removeAccount(accountId)
    setAccounts(nextAccounts)
    if (activeAccountId === accountId) setActiveAccountId(nextAccounts[0]?.id || null)
    if (nextAccounts.length === 0) setShowAccountMenu(false)
  }

  const removeAccount = (account: Account) => {
    setConfirmDialog({
      title: t('account.remove.title'),
      body: tf('account.remove.body', { name: account.name }),
      confirmLabel: t('account.remove.confirm'),
      cancelLabel: t('account.remove.cancel'),
      danger: true,
      onConfirm: () => removeAccountNow(account.id)
    })
  }

  const rememberRecentPlace = (target: Instance, quickPlay: InstancePlaceQuickPlay, placeLabel?: string) => {
    const recent: RecentInstancePlace = {
      instanceId: target.id,
      instanceName: target.name,
      type: quickPlay.type,
      label: placeLabel || (quickPlay.type === 'server' ? quickPlay.address : quickPlay.folderName),
      ...(quickPlay.type === 'server' ? { address: quickPlay.address } : { folderName: quickPlay.folderName }),
      playedAt: new Date().toISOString()
    }
    const recentTarget = recent.type === 'server' ? recent.address : recent.folderName
    const identity = `${recent.instanceId}:${recent.type}:${String(recentTarget || '').toLocaleLowerCase()}`
    setRecentPlaces((existing) => {
      const next = [recent, ...existing.filter((item) => (
        `${String(item?.instanceId || '')}:${String(item?.type || '')}:${String(item?.type === 'server' ? item.address : item.folderName).toLocaleLowerCase()}` !== identity
      ))].slice(0, 12)
      localStorage.setItem(storage.recentPlaces, JSON.stringify(next))
      return next
    })
  }

  const handleLaunchOrStop = async (
    target: Instance | null = currentTarget,
    quickPlay?: InstancePlaceQuickPlay,
    quickPlayLabel?: string
  ) => {
    if (target && isInstanceBusy(target.id)) {
      await window.electron.stopMinecraft(target)
      setStatusText(t('status.stopRequested'))
      return
    }

    if (launcherUpdate?.updateAvailable) {
      setDismissedLauncherUpdateVersion('')
      setStatusText(t('settings.update.prompt.title'))
      return
    }

    if (!target) {
      setShowInstanceModal(true)
      setStatusText(t('status.createInstanceFirst'))
      return
    }

    if (!activeAccount) {
      setShowLoginModal(true)
      return
    }

    setLaunchingInstanceIds((prev) => prev.includes(target.id) ? prev : [...prev, target.id])
    setProgress(0)
    setStatusText(t('status.launchStarting'))

    try {
      const result = await window.electron.launchMinecraft({
        accountId: activeAccount.id,
        instance: target,
        memoryGb,
        ...(quickPlay ? { quickPlay } : {})
      })
      if (result?.alreadyLaunching) {
        setStatusText(t('status.launchStarting'))
        return
      }
      if (result?.alreadyRunning) {
        setLaunchingInstanceIds((prev) => prev.filter((id) => id !== target.id))
        setProgress(100)
        setStatusText(t('status.ready'))
        return
      }
      if (result?.cancelled) {
        setLaunchingInstanceIds((prev) => prev.filter((id) => id !== target.id))
        setProgress(0)
        setStatusText(t('status.ready'))
        return
      }
      if (quickPlay) rememberRecentPlace(target, quickPlay, quickPlayLabel)
    } catch (error: any) {
      setLaunchingInstanceIds((prev) => prev.filter((id) => id !== target.id))
      setProgress(0)
      const message = error.message || t('status.launchFailed')
      setStatusText(t('status.launchFailed'))
      if (isMicrosoftSessionExpiredMessage(message) && activeAccount?.type === 'msa') {
        showMicrosoftSessionExpired({
          accountId: activeAccount.id,
          accountName: activeAccount.name,
          message
        })
      }
    }
  }

  const handleInstanceIconUpload = async (file?: File | null) => {
    if (!file) return

    try {
      const iconUrl = await readInstanceIconFile(file)
      setNewInstance((prev) => ({ ...prev, iconUrl }))
      setStatusText(t('status.iconAttached'))
    } catch {
      setStatusText(t('status.iconLoadFailed'))
    }
  }

  const openInstanceSettings = (instance: Instance, tab: InstanceSettingsTab = 'general') => {
    setInstanceSettingsTargetId(instance.id)
    setInstanceSettingsTab(tab)
    resetInstanceSettingsDraft(instance)
    setInstanceSettingsEditingInstallation(false)
    setInstanceActionMenuOpen(false)
    setShowInstanceSettings(true)
    void ensureMinecraftVersionList()
  }

  const handleInstanceSettingsIconUpload = async (file?: File | null) => {
    if (!file) return

    try {
      const iconUrl = await readInstanceIconFile(file)
      setInstanceSettingsDraft((prev) => ({ ...prev, iconUrl }))
      setStatusText(t('status.iconAttached'))
    } catch {
      setStatusText(t('status.iconLoadFailed'))
    }
  }

  const saveInstanceSettings = async () => {
    const target = instanceSettingsTarget
    if (!target) return
    if (checkingUpdates || updatingInstanceId === target.id) {
      setStatusText(t('instance.settings.updates.finishFirst'))
      return
    }
    const name = instanceSettingsDraft.name.trim()
    if (!name) {
      setStatusText(t('instance.settings.nameRequired'))
      return
    }
    if (isInstanceBusy(target.id)) {
      setStatusText(t('instance.delete.busy'))
      return
    }
    const version = instanceSettingsDraft.version.trim()
    const loaderVersion = instanceSettingsDraft.loaderVersion.trim()
    if (!version) {
      setStatusText(t('instance.settings.versionRequired'))
      return
    }
    if (instanceSettingsDraft.loader !== 'vanilla' && !loaderVersion) {
      setStatusText(t('instance.settings.loaderVersionRequired'))
      return
    }

    const updates = {
      name,
      version,
      loader: instanceSettingsDraft.loader,
      loaderVersion: instanceSettingsDraft.loader === 'vanilla' ? '' : loaderVersion,
      iconUrl: instanceSettingsDraft.iconUrl || null
    }

    setSavingInstanceSettings(true)
    try {
      const updated = await window.electron.updateInstance({ instance: target, updates })
      setInstances((prev) => prev.map((instance) => instance.id === target.id ? { ...instance, ...updated } : instance))
      setInstanceSettingsTargetId(updated.id)
      setSelectedInstanceId(updated.id)
      setStatusText(t('instance.settings.saved'))
      setInstanceSettingsEditingInstallation(false)
      refreshUpdateSummaries([{ ...target, ...updated }]).catch(() => undefined)
      refreshInstanceContent(contentTab, { ...target, ...updated }, { silent: true, force: true }).catch(() => undefined)
    } catch {
      setStatusText(t('instance.settings.saveFailed'))
    } finally {
      setSavingInstanceSettings(false)
    }
  }

  const createInstance = async () => {
    if (!newInstance.name.trim()) return
    if (!newInstance.version) return
    if (newInstance.loader !== 'vanilla' && !newInstance.loaderVersion) return

    const instance: Instance = {
      id: crypto.randomUUID?.() || String(Date.now()),
      name: newInstance.name.trim(),
      version: newInstance.version,
      loader: newInstance.loader,
      loaderVersion: newInstance.loaderVersion,
      createdAt: new Date().toISOString(),
      iconUrl: newInstance.iconUrl || null,
      playtimeSeconds: 0
    }

    try {
      await window.electron.provisionInstance(instance)
      setInstances((prev) => [...prev, instance])
      setSelectedInstanceId(instance.id)
      setShowInstanceModal(false)
      setNewInstance((prev) => ({ ...prev, name: 'New Instance', iconUrl: '' }))
      setStatusText(t('status.instancePrepared'))
    } catch {
      setStatusText(t('status.instancePrepareFailed'))
    }
  }

  const deleteInstanceFiles = async (
    instance: Instance,
    statusDeleting = t('instance.delete.deleting'),
    statusDeleted = t('instance.delete.deleted')
  ) => {
    if (isInstanceBusy(instance.id)) {
      setStatusText(t('instance.delete.busy'))
      return
    }

    setDeletingInstanceId(instance.id)
    setStatusText(statusDeleting)

    try {
      await window.electron.deleteInstance(instance)
      setInstances((prev) => prev.filter((item) => item.id !== instance.id))
      if (selectedInstanceId === instance.id) {
        setSelectedInstanceId(null)
        setInstanceContent([])
      }
      setStatusText(statusDeleted)
    } catch {
      setStatusText(t('status.instanceDeleteFailed'))
    } finally {
      setDeletingInstanceId(null)
    }
  }

  const deleteInstance = (instance: Instance) => {
    if (isInstanceBusy(instance.id)) {
      setStatusText(t('instance.delete.busy'))
      return
    }
    setConfirmDialog({
      title: t('instance.delete.title'),
      body: tf('instance.delete.body', { name: instance.name }),
      confirmLabel: t('instance.delete.confirm'),
      cancelLabel: t('instance.delete.cancel'),
      danger: true,
      onConfirm: () => deleteInstanceFiles(instance)
    })
  }

  const exportInstanceMrpack = async (instance: Instance) => {
    if (isInstanceBusy(instance.id)) {
      setStatusText(t('status.exportStopGame'))
      return
    }

    setExportingInstanceId(instance.id)
    setProgress(8)
    setStatusText(t('status.exportPreparing'))
    setActivityDetail(instance.name)

    try {
      const result = await window.electron.exportInstanceMrpack(instance)
      if (result.canceled) {
        setStatusText(t('status.exportCanceled'))
        return
      }

      const total = result.totalFiles ?? 0
      const modrinth = result.modrinthFiles ?? 0
      const overrides = result.overrideFiles ?? 0
      setStatusText(tf('status.exportDone', { name: instance.name }))
      setActivityDetail(`${total} files / ${modrinth} Modrinth / ${overrides} local`)
    } catch {
      setStatusText(t('status.exportFailed'))
      setActivityDetail('')
    } finally {
      setExportingInstanceId(null)
      setProgress(0)
    }
  }

  const canInstallLibraryType = (type: string) => {
    if (type === 'modpack') return true
    if (!currentTarget) return false
    if (type === 'mod') return currentTarget.loader !== 'vanilla'
    return true
  }

  const closeLibraryProjectDetails = () => {
    const trigger = libraryProjectTriggerRef.current
    setLibraryProjectDetails(null)
    setLibraryProjectVersions([])
    setSelectedLibraryVersionId('')
    setLibraryProjectVersionError('')
    setLibraryProjectVersionsLoading(false)
    libraryProjectTriggerRef.current = null
    window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }))
  }

  const openModpackInstaller = async (project: any) => {
    const projectId = getProjectKey(project)
    if (!projectId) return

    if (modpackInstallActivity?.phase === 'installing') {
      modpackInstallMinimizedRef.current = false
      setShowModpackModal(true)
      setModpackInstallActivity((current) => current ? { ...current, minimized: false } : current)
      setStatusText(t('modpack.install.alreadyRunning'))
      return
    }

    setModpackInstallActivity(null)
    setModpackProject(project)
    setShowModpackModal(true)
    setModpackVersions([])
    setSelectedModpackVersionId('')
    setModpackVersionsLoading(true)
    setStatusText(t('modpack.install.loadingVersionsStatus'))

    try {
      const loadedVersions = project.provider === 'curseforge'
        ? await window.electron.getCurseForgeModpackVersions({ project })
        : await window.electron.getModrinthProjectVersions({
          project,
          projectType: 'modpack'
        })
      setModpackVersions(loadedVersions)
      setSelectedModpackVersionId(loadedVersions[0]?.id || '')
      setStatusText(loadedVersions.length > 0 ? t('modpack.install.chooseVersion') : t('modpack.install.noVersions'))
    } catch {
      setStatusText(t('modpack.install.versionError'))
    } finally {
      setModpackVersionsLoading(false)
    }
  }

  const applyInstalledModpackResult = async (
    result: ModpackInstallResult,
    label = t('library.button.installed'),
    options: { shouldOpenInstance?: () => boolean } = {}
  ) => {
    if (!result.instance) throw new Error('Modpack installer did not return an instance.')

    setInstances((prev) => (
      prev.some((item) => item.id === result.instance!.id)
        ? prev.map((item) => item.id === result.instance!.id ? result.instance! : item)
        : [...prev, result.instance!]
    ))
    await refreshInstanceContent('mods', result.instance)
    if (options.shouldOpenInstance?.() ?? true) {
      setSelectedInstanceId(result.instance.id)
      setContentTab('mods')
      setActiveView('instances')
    }
    setProgress(100)
    const manualDownloads = result.manualDownloads || []
    if (manualDownloads.length > 0) {
      setManualDownloadInstance(result.instance)
      setManualDownloadItems(manualDownloads)
      setManualDownloadDirectory(result.manualDownloadDirectory || '')
      setManualDownloadStatuses(Object.fromEntries(manualDownloads.map((item) => [item.id, 'pending'])))
      setManualDownloadMessage('')
      manualDownloadCompletionAnnouncedRef.current = false
    }
    const incompatibleOptionalFiles = result.incompatibleOptionalFiles || []
    setActivityDetail(manualDownloads.length > 0
      ? tf('manualDownload.needBrowser', { count: manualDownloads.length })
      : incompatibleOptionalFiles.length > 0
        ? tf('modpack.install.skippedIncompatible', {
            count: incompatibleOptionalFiles.length,
            version: result.instance.version,
            files: incompatibleOptionalFiles.map((file) => file.split(/[\\/]/).pop() || file).join(', ')
          })
      : result.blockedFiles?.length
        ? `Skipped ${result.blockedFiles.length} CurseForge file${result.blockedFiles.length > 1 ? 's' : ''} blocked by author distribution settings`
      : '')
    setStatusText(`${label} ${result.instance.name}${result.version ? ` ${result.version}` : ''}`)
    refreshUpdateSummaries([result.instance])
  }

  const openManualDownload = (item: ManualCurseForgeDownloadItem) => {
    window.electron.openExternal(item.fileUrl || item.websiteUrl)
  }

  const copyManualDownloadLink = async (item: ManualCurseForgeDownloadItem) => {
    try {
      await window.electron.copyToClipboard(item.fileUrl || item.websiteUrl)
      setManualDownloadMessage(tf('manualDownload.copied', { title: item.title }))
    } catch {
      setManualDownloadMessage(t('manualDownload.copyFailed'))
    }
  }

  const openAllManualDownloads = () => {
    manualDownloadItems
      .filter((item) => manualDownloadStatuses[item.id] !== 'complete')
      .forEach((item) => window.electron.openExternal(item.fileUrl || item.websiteUrl))
  }

  const closeManualDownloads = () => {
    setManualDownloadItems([])
    setManualDownloadInstance(null)
    setManualDownloadStatuses({})
    setManualDownloadMessage('')
    manualDownloadCompletionAnnouncedRef.current = false
  }

  const cancelManualDownloadsAndDeleteInstance = () => {
    if (!manualDownloadInstance) {
      closeManualDownloads()
      return
    }
    const instance = manualDownloadInstance
    setConfirmDialog({
      title: t('manualDownload.cancel.title'),
      body: tf('manualDownload.cancel.body', { name: instance.name }),
      confirmLabel: t('manualDownload.cancel.confirm'),
      cancelLabel: t('manualDownload.cancel.keep'),
      danger: true,
      onConfirm: async () => {
        closeManualDownloads()
        await deleteInstanceFiles(
          instance,
          t('manualDownload.cancel.deleting'),
          t('manualDownload.cancel.deleted')
        )
      }
    })
  }

  const dismissConfirmDialog = () => {
    if (confirmDialogBusy) return
    setConfirmDialogError('')
    setConfirmDialog(null)
  }

  const confirmDialogConfirm = async () => {
    if (!confirmDialog || confirmDialogBusy) return
    setConfirmDialogBusy(true)
    setConfirmDialogError('')
    try {
      await confirmDialog.onConfirm()
      setConfirmDialog(null)
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : t('confirm.actionFailed')
      setConfirmDialogError(message)
      setStatusText(message)
    } finally {
      setConfirmDialogBusy(false)
    }
  }

  const createInstallTaskId = (prefix: string) => {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    return `${prefix}-${id}`
  }

  const isUserCancelledInstall = (taskId: string) => cancelledInstallTasksRef.current.has(taskId)

  const closeModpackInstaller = () => {
    modpackInstallMinimizedRef.current = false
    setShowModpackModal(false)
    setModpackProject(null)
    setModpackVersions([])
    setSelectedModpackVersionId('')
    setModpackInstallActivity((current) => current?.phase === 'installing' ? current : null)
  }

  const openLibraryProjectDetails = async (project: any, trigger: HTMLButtonElement) => {
    const projectType = project.project_type || libraryType
    if (projectType === 'modpack') {
      await openModpackInstaller(project)
      return
    }
    if (!currentTarget) {
      setStatusText(t('status.createOrSelectInstance'))
      return false
    }
    if (projectType === 'mod' && currentTarget.loader === 'vanilla') {
      setStatusText(t('library.install.needLoader'))
      return false
    }

    libraryProjectTriggerRef.current = trigger
    setLibraryProjectDetails(project)
    setLibraryProjectVersions([])
    setSelectedLibraryVersionId('')
    setLibraryProjectVersionError('')
    setLibraryProjectVersionsLoading(true)
    try {
      const versions = project.provider === 'curseforge'
        ? await window.electron.getCurseForgeProjectVersions({ instance: currentTarget, project })
        : await window.electron.getModrinthProjectVersions({
          instance: currentTarget,
          project,
          projectType
        })
      setLibraryProjectVersions(versions)
      setSelectedLibraryVersionId(versions[0]?.id || '')
    } catch (error) {
      setLibraryProjectVersionError(error instanceof Error ? error.message : t('library.detail.loadFailed'))
    } finally {
      setLibraryProjectVersionsLoading(false)
    }
  }

  const openInstalledModProjectDetails = async (item: InstanceContentItem, trigger: HTMLButtonElement) => {
    const projectId = String(item.projectId || '').trim()
    if (item.kind !== 'mods' || !projectId || (item.source !== 'modrinth' && item.source !== 'curseforge')) {
      return false
    }

    const title = getContentDisplayName(item)
    const websiteUrl = item.source === 'curseforge'
      ? `https://www.curseforge.com/minecraft/mc-mods?search=${encodeURIComponent(title)}`
      : `https://modrinth.com/mod/${encodeURIComponent(projectId)}`

    return openLibraryProjectDetails({
      id: projectId,
      project_id: projectId,
      title,
      name: title,
      description: t('content.versionPicker.description'),
      project_type: 'mod',
      icon_url: item.iconUrl || null,
      provider: item.source,
      website_url: websiteUrl,
      installedVersionId: item.versionId || '',
      installedVersionNumber: item.versionNumber || ''
    }, trigger)
  }

  const minimizeActiveModpackInstall = () => {
    if (modpackInstallActivity?.phase !== 'installing') return
    modpackInstallMinimizedRef.current = true
    setShowModpackModal(false)
    setModpackInstallActivity((current) => (
      current?.phase === 'installing' ? { ...current, minimized: true } : current
    ))
  }

  const restoreModpackInstall = () => {
    if (!modpackInstallActivity || modpackInstallActivity.phase === 'success' || !modpackProject) return
    modpackInstallMinimizedRef.current = false
    setModpackInstallActivity((current) => current ? { ...current, minimized: false } : current)
    setShowModpackModal(true)
  }

  const dismissModpackInstallActivity = () => {
    if (modpackInstallActivity?.phase === 'installing') return
    closeModpackInstaller()
  }

  const cancelActiveInstall = (taskId = activeInstallTaskId) => {
    if (!taskId) return
    modpackInstallMinimizedRef.current = false
    cancelledInstallTasksRef.current.add(taskId)
    setShowModpackModal(false)
    setShowInstanceModal(false)
    setModpackProject(null)
    setModpackVersions([])
    setSelectedModpackVersionId('')
    setModpackInstallActivity((current) => current?.taskId === taskId ? null : current)
    setInstallingProjectId(null)
    setActiveInstallTaskId(null)
    setProgress(0)
    setStatusText(t('content.install.canceled'))
    setActivityDetail('')
    window.electron.cancelInstallTask(taskId).catch(() => undefined)
  }

  const installSelectedModpack = async () => {
    if (!modpackProject || !selectedModpackVersionId) return

    const projectId = getProjectKey(modpackProject)
    if (activeInstallTaskId || (installingProjectId && installingProjectId !== projectId)) {
      setStatusText(t('content.install.anotherRunning'))
      return
    }
    const taskId = createInstallTaskId('modpack')
    const projectTitle = String(modpackProject.title || modpackProject.name || t('modpack.install.title'))
    const projectIconUrl = typeof modpackProject.icon_url === 'string' ? modpackProject.icon_url : undefined
    modpackInstallMinimizedRef.current = false
    cancelledInstallTasksRef.current.delete(taskId)
    setInstallingProjectId(projectId)
    setActiveInstallTaskId(taskId)
    setModpackInstallActivity({
      taskId,
      projectId,
      title: projectTitle,
      iconUrl: projectIconUrl,
      phase: 'installing',
      progress: 0,
      detail: selectedModpackVersion?.version_number || t('modpack.install.preparingSelected'),
      minimized: false
    })
    setProgress(0)
    setStatusText(t('modpack.install.status'))
    setActivityDetail(t('modpack.install.preparingSelected'))

    try {
      const result = modpackProject.provider === 'curseforge'
        ? await window.electron.installCurseForgeModpack({
          project: modpackProject,
          fileId: selectedModpackVersionId,
          taskId,
          playerName: activeAccount?.name,
          accountType: activeAccount?.type
        })
        : await window.electron.installModrinthModpack({
          project: modpackProject,
          projectType: 'modpack',
          versionId: selectedModpackVersionId,
          taskId,
          playerName: activeAccount?.name,
          accountType: activeAccount?.type
        })
      if (result.canceled || result.cancelled || isUserCancelledInstall(taskId)) {
        setStatusText(t('content.install.canceled'))
        setActivityDetail('')
        setProgress(0)
        return
      }

      await applyInstalledModpackResult(result, t('library.button.installed'), {
        shouldOpenInstance: () => !modpackInstallMinimizedRef.current
      })
      setModpackInstallActivity((current) => (
        current?.taskId === taskId
          ? {
              ...current,
              phase: 'success',
              progress: 100,
              detail: result.manualDownloads?.length
                ? tf('manualDownload.needBrowser', { count: result.manualDownloads.length })
                : tf('modpack.install.completedDetail', { name: result.instance?.name || projectTitle }),
              minimized: true
            }
          : current
      ))
      setShowModpackModal(false)
      setModpackProject(null)
      setModpackVersions([])
      setSelectedModpackVersionId('')
    } catch {
      if (isUserCancelledInstall(taskId)) {
        setModpackInstallActivity((current) => current?.taskId === taskId ? null : current)
        setStatusText(t('content.install.canceled'))
        setActivityDetail('')
      } else {
        setModpackInstallActivity((current) => (
          current?.taskId === taskId
            ? { ...current, phase: 'error', detail: t('modpack.install.failedDetail') }
            : current
        ))
        setStatusText(t('status.installFailed'))
        setActivityDetail('')
      }
      setProgress(0)
    } finally {
      setInstallingProjectId(null)
      setActiveInstallTaskId((current) => current === taskId ? null : current)
      cancelledInstallTasksRef.current.delete(taskId)
    }
  }

  const importLocalMrpack = async () => {
    if (importingMrpack) return
    if (activeInstallTaskId || installingProjectId) {
      setStatusText(t('content.install.anotherRunning'))
      return
    }

    const taskId = createInstallTaskId('mrpack')
    cancelledInstallTasksRef.current.delete(taskId)
    setImportingMrpack(true)
    setActiveInstallTaskId(taskId)
    setProgress(0)
      setStatusText(t('status.chooseMrpack'))
    setActivityDetail('Waiting for file selection')

    try {
      const result = await window.electron.installLocalMrpack({ taskId })
      if (result.canceled || result.cancelled || isUserCancelledInstall(taskId)) {
        setStatusText(t('status.importCanceled'))
        setActivityDetail('')
        return
      }

      setStatusText(t('status.localMrpackInstalling'))
      await applyInstalledModpackResult(result, t('status.imported'))
      setShowInstanceModal(false)
    } catch {
      if (isUserCancelledInstall(taskId)) {
        setStatusText(t('status.importCanceled'))
        setActivityDetail('')
      } else {
        setStatusText(t('status.importFailed'))
        setActivityDetail('')
      }
      setProgress(0)
    } finally {
      setImportingMrpack(false)
      setActiveInstallTaskId((current) => current === taskId ? null : current)
      cancelledInstallTasksRef.current.delete(taskId)
    }
  }

  const selectLibrarySource = (source: LibrarySource) => {
    setLibrarySource(source)
    if (source === 'curseforge') {
      setLibraryFilters((current) => ({
        ...current,
        sort: current.sort === 'relevance' ? 'downloads' : current.sort
      }))
    }
    setLibraryPage(0)
    setMods([])
    setTotalHits(0)
    setLibraryError('')
  }

  const updateLibraryFilters = (updates: Partial<LibrarySearchFilters>) => {
    setLibraryFilters((current) => ({ ...current, ...updates }))
    setLibraryPage(0)
    setLibraryError('')
  }

  const resetLibraryFilters = () => {
    setLibraryFilters({
      ...DEFAULT_LIBRARY_SEARCH_FILTERS,
      compatibleOnly: false
    })
    setLibraryPage(0)
    setLibraryError('')
  }

  const installLibraryProject = async (project: any, selectedVersionId = ''): Promise<boolean> => {
    const projectId = getProjectKey(project)
    const projectType = project.project_type || libraryType
    const status = contentStatuses[projectId]

    if (projectType === 'modpack') {
      openModpackInstaller(project)
      return false
    }

    if (modpackInstallActivity?.phase === 'installing') {
      setStatusText(t('modpack.install.alreadyRunning'))
      return false
    }

    if (!currentTarget) {
      setStatusText(t('status.createOrSelectInstance'))
      return false
    }

    if (shouldBlockCurrentTargetContent(projectType)) {
      setStatusText(t('content.toggle.busy'))
      return false
    }

    const installedVersionId = String(project.installedVersionId || status?.installedVersionId || '').trim()
    if ((status?.state === 'installed' && !selectedVersionId) || (installedVersionId && selectedVersionId === installedVersionId)) {
      setStatusText(t('status.contentAlreadyInstalled'))
      return false
    }

    if (!projectId || !canInstallLibraryType(projectType)) {
      setStatusText(projectType === 'mod'
        ? t('library.install.needLoader')
        : t('library.install.unsupported')
      )
      return false
    }

    setInstallingProjectId(projectId)
    setProgress(0)
    setStatusText(t('content.install.generic'))

    try {
      const result = project.provider === 'curseforge'
        ? await window.electron.installCurseForgeContent({
          instance: currentTarget,
          project,
          fileId: selectedVersionId || undefined,
          playerName: activeAccount?.name,
          accountType: activeAccount?.type
        })
        : await window.electron.installModrinthContent({
          instance: currentTarget,
          project,
          projectType,
          versionId: selectedVersionId || undefined,
          playerName: activeAccount?.name,
          accountType: activeAccount?.type
        })
      const installedCount = result.installed.filter((item) => !item.skipped).length
      const skippedCount = result.installed.length - installedCount
      setStatusText(skippedCount > 0 && installedCount === 0 ? t('status.contentAlreadyInstalled') : tf('library.status.installedVersion', { version: result.version }))
      setProgress(100)
      const installedVersion = result.version || status?.latestVersion || status?.installedVersion || null
      const installedVersionId = selectedVersionId || status?.latestVersionId || status?.installedVersionId || null
      const installedStatus: ContentStatus = {
        state: status?.latestVersionId && installedVersionId !== status.latestVersionId ? 'update' : 'installed',
        installedVersion,
        installedVersionId,
        latestVersion: status?.latestVersion || installedVersion,
        latestVersionId: status?.latestVersionId || status?.installedVersionId || null
      }
      installedContentStatusOverridesRef.current = {
        ...installedContentStatusOverridesRef.current,
        [projectId]: installedStatus
      }
      setContentStatuses((prev) => ({ ...prev, [projectId]: installedStatus }))

      const statusTask = project.provider === 'curseforge'
        ? window.electron.getCurseForgeContentStatus({ instance: currentTarget, projects: mods })
        : window.electron.getModrinthContentStatus({ instance: currentTarget, projects: mods })
      statusTask
        .then((statuses) => setContentStatuses({ ...statuses, ...installedContentStatusOverridesRef.current }))
        .catch(() => undefined)
      refreshUpdateSummaries([currentTarget])

      const installedContentTab = projectType === 'resourcepack'
        ? 'resourcepacks'
        : projectType === 'shader'
          ? 'shaderpacks'
          : 'mods'
      if (installedContentTab === contentTab) {
        refreshInstanceContent(installedContentTab, currentTarget)
      }
      return true
    } catch {
      setStatusText(t('status.installFailed'))
      setProgress(0)
      return false
    } finally {
      setInstallingProjectId(null)
    }
  }

  const setProjectUpdateBusy = (projectId: string, busy: boolean) => {
    const next = new Set(updatingProjectIdsRef.current)
    if (busy) next.add(projectId)
    else next.delete(projectId)
    updatingProjectIdsRef.current = next
    setUpdatingProjectIds([...next])
  }

  const beginContentUpdate = (target: Instance, projectId: string) => {
    activeContentUpdatesRef.current += 1
    setUpdatingInstanceId(target.id)
    setUpdatingProjectId(projectId)
    setInstallingProjectId(projectId)
    setProjectUpdateBusy(projectId, true)
  }

  const finishContentUpdate = (projectId: string) => {
    activeContentUpdatesRef.current = Math.max(0, activeContentUpdatesRef.current - 1)
    setProjectUpdateBusy(projectId, false)
    if (activeContentUpdatesRef.current === 0) {
      setUpdatingInstanceId(null)
      setUpdatingProjectId(null)
      setInstallingProjectId(null)
    }
  }

  const installContentUpdate = async (target: Instance, update: ContentUpdateItem) => {
    if (update.provider === 'curseforge') {
      return window.electron.installCurseForgeContent({
        instance: target,
        playerName: activeAccount?.name,
        accountType: activeAccount?.type,
        project: {
          id: update.projectId.replace(/^curseforge:/i, ''),
          project_id: update.projectId,
          title: update.title,
          icon_url: update.iconUrl || null,
          project_type: update.projectType,
          provider: 'curseforge'
        }
      })
    }

    return window.electron.installModrinthContent({
      instance: target,
      project: {
        project_id: update.projectId,
        title: update.title,
        project_type: update.projectType,
        icon_url: update.iconUrl || null
      },
      projectType: update.projectType,
      playerName: activeAccount?.name,
      accountType: activeAccount?.type
    })
  }

  const updateInstalledContent = async (target: Instance, update: ContentUpdateItem) => {
    if (updatingProjectIdsRef.current.has(update.projectId)) return
    if (installingProjectId || modpackInstallActivity?.phase === 'installing') {
      setStatusText(t('content.install.anotherRunning'))
      return false
    }
    if (shouldBlockContentMutation(target.id, update.projectType)) {
      setStatusText(t('content.update.busy'))
      return
    }

    beginContentUpdate(target, update.projectId)
    setProgress(0)
    setStatusText(tf('status.updatingContent', { title: update.title }))

    try {
      await installContentUpdate(target, update)
      setProgress(100)
      setInstanceUpdateSummaries((prev) => {
        const summary = prev[target.id]
        if (!summary) return prev
        return {
          ...prev,
          [target.id]: {
            ...summary,
            updates: summary.updates.filter((item) => item.projectId !== update.projectId)
          }
        }
      })
      if (currentTarget?.id === target.id) {
        await refreshInstanceContent(contentTab, target)
      }
      await refreshUpdateSummaries([target])
      setStatusText(tf('status.updatedContent', { title: update.title }))
    } catch {
      setStatusText(t('status.updateFailed'))
      setProgress(0)
    } finally {
      finishContentUpdate(update.projectId)
    }
  }

  const updateAllContent = async (target: Instance, requestedUpdates?: ContentUpdateItem[]) => {
    if (updatingInstanceId === target.id || activeContentUpdatesRef.current > 0) return
    if (requestedUpdates && isInstanceBusy(target.id)) {
      setStatusText(t('instance.settings.updates.locked'))
      return false
    }
    if (installingProjectId || modpackInstallActivity?.phase === 'installing') {
      setStatusText(t('content.install.anotherRunning'))
      return false
    }
    let updates = requestedUpdates ? [...requestedUpdates] : (instanceUpdateSummaries[target.id]?.updates || [])
    if (!requestedUpdates && updates.length === 0) {
      const summary = await window.electron.getInstanceUpdateSummary(target)
      updates = summary.updates
      setInstanceUpdateSummaries((prev) => ({ ...prev, [target.id]: summary }))
    }

    const blockedModUpdates = updates.filter((update) => shouldBlockContentMutation(target.id, update.projectType))
    if (blockedModUpdates.length > 0) {
      updates = updates.filter((update) => !shouldBlockContentMutation(target.id, update.projectType))
      if (updates.length === 0) {
        setStatusText(t('content.update.busy'))
        return
      }
    }

    if (updates.length === 0) {
      setStatusText(t('status.allContentUpToDate'))
      return
    }

    setUpdatingInstanceId(target.id)
    setProgress(0)

    try {
      const manualUpdates: ContentUpdateItem[] = []
      const failedUpdates: ContentUpdateItem[] = []
      let updatedCount = 0

      for (let index = 0; index < updates.length; index += 1) {
        const update = updates[index]
        setUpdatingProjectId(update.projectId)
        setInstallingProjectId(update.projectId)
        setProjectUpdateBusy(update.projectId, true)
        setStatusText(`${tf('status.updatingContent', { title: update.title })} (${index + 1}/${updates.length})`)
        try {
          await installContentUpdate(target, update)
          updatedCount += 1
        } catch (error) {
          if (update.provider === 'curseforge' && isCurseForgeManualDownloadRequired(error)) {
            manualUpdates.push(update)
          } else {
            failedUpdates.push(update)
          }
        } finally {
          setProjectUpdateBusy(update.projectId, false)
        }
        setProgress(Math.round(((index + 1) / updates.length) * 100))
      }

      setProgress(100)
      setInstanceUpdateSummaries((prev) => ({
        ...prev,
        [target.id]: {
          updates: [...blockedModUpdates, ...manualUpdates, ...failedUpdates],
          checkedAt: new Date().toISOString()
        }
      }))
      if (currentTarget?.id === target.id) {
        await refreshInstanceContent(contentTab, target)
      }
      await refreshUpdateSummaries([target])
      const failedCount = failedUpdates.length + blockedModUpdates.length
      setStatusText(manualUpdates.length > 0 || failedCount > 0
        ? tf('instance.settings.updates.partial', {
            updated: updatedCount,
            manual: manualUpdates.length,
            failed: failedCount
          })
        : tf('instance.settings.updates.updated', { count: updatedCount }))
    } catch {
      setStatusText(t('status.updateAllFailed'))
      setProgress(0)
    } finally {
      setUpdatingInstanceId(null)
      setUpdatingProjectId(null)
      setInstallingProjectId(null)
      updatingProjectIdsRef.current = new Set()
      setUpdatingProjectIds([])
      activeContentUpdatesRef.current = 0
    }
  }

  const installSelectedLibraryVersion = async () => {
    if (!libraryProjectDetails || !selectedLibraryVersionId) return
    const installed = await installLibraryProject(libraryProjectDetails, selectedLibraryVersionId)
    if (installed) closeLibraryProjectDetails()
  }

  const getLibraryButtonState = (project: any) => {
    const projectId = getProjectKey(project)
    const projectType = project.project_type || libraryType
    const status = contentStatuses[projectId]

    if (project.provider === 'curseforge' && project.allow_distribution === false) {
      return {
        kind: 'disabled',
        label: 'Website only',
        disabled: true,
        title: 'This author disabled third-party downloads. Open the CurseForge project page instead.'
      }
    }

    if (installingProjectId === projectId) {
      return {
        kind: 'installing',
        label: 'Installing',
        disabled: true,
        title: projectType === 'modpack' ? 'Installing modpack instance' : 'Installing to selected instance'
      }
    }

    if (installingProjectId || modpackInstallActivity?.phase === 'installing') {
      return {
        kind: 'disabled',
        label: t('content.install.busyLabel'),
        disabled: true,
        title: t('content.install.anotherRunning')
      }
    }

    if (shouldBlockCurrentTargetContent(projectType)) {
      return {
        kind: 'disabled',
        label: 'Game running',
        disabled: true,
        title: 'Stop the game before changing mods in this instance'
      }
    }

    if (projectType === 'modpack') {
      return { kind: 'install', label: t('library.button.install'), disabled: false, title: t('library.button.modpackTitle') }
    }

    if (!canInstallLibraryType(projectType)) {
      return {
        kind: 'disabled',
        label: projectType === 'mod' ? t('library.button.needLoader') : t('library.button.unsupported'),
        disabled: true,
        title: projectType === 'mod' ? t('library.install.needLoader') : t('library.install.unsupported')
      }
    }

    if (status?.state === 'installed') {
      return {
        kind: 'installed',
        label: t('library.button.installed'),
        disabled: true,
        title: status.installedVersion ? tf('library.button.installedVersion', { version: status.installedVersion }) : t('library.button.alreadyInstalled')
      }
    }

    if (status?.state === 'update') {
      return {
        kind: 'update',
        label: t('content.update'),
        disabled: false,
        title: status.latestVersion
          ? tf('library.button.updateTitle', { installed: status.installedVersion || t('library.button.installed'), latest: status.latestVersion })
          : t('library.button.updateInstalled')
      }
    }

    if (status?.state === 'unavailable' || status?.state === 'unsupported') {
      return {
        kind: 'disabled',
        label: 'No version',
        disabled: true,
        title: status.reason || 'No compatible version for this instance'
      }
    }

    return { kind: 'install', label: t('library.button.install'), disabled: false, title: t('library.button.installTitle') }
  }

  const openScreenshotViewer = (item: InstanceContentItem) => {
    if (!item.iconUrl) {
      revealContentFile(item).catch(() => undefined)
      return
    }
    cancelScreenshotPanFrame()
    setSelectedScreenshot(item)
    setScreenshotZoom(1)
    setScreenshotPan({ x: 0, y: 0 })
    setScreenshotDragging(false)
    screenshotDragRef.current = null
  }

  const closeScreenshotViewer = () => {
    cancelScreenshotPanFrame()
    setSelectedScreenshot(null)
    setScreenshotZoom(1)
    setScreenshotPan({ x: 0, y: 0 })
    setScreenshotDragging(false)
    screenshotDragRef.current = null
  }

  const cancelScreenshotPanFrame = () => {
    if (screenshotPanFrameRef.current !== null) {
      window.cancelAnimationFrame(screenshotPanFrameRef.current)
      screenshotPanFrameRef.current = null
    }
    screenshotPanPendingRef.current = null
  }

  const scheduleScreenshotPan = (nextPan: ScreenshotPan) => {
    screenshotPanPendingRef.current = nextPan
    if (screenshotPanFrameRef.current !== null) return

    screenshotPanFrameRef.current = window.requestAnimationFrame(() => {
      screenshotPanFrameRef.current = null
      const pendingPan = screenshotPanPendingRef.current
      screenshotPanPendingRef.current = null
      if (pendingPan) setScreenshotPan(pendingPan)
    })
  }

  const adjustScreenshotZoom = (delta: number) => {
    const next = Math.min(3, Math.max(0.5, Number((screenshotZoom + delta).toFixed(2))))
    setScreenshotZoom(next)
    if (next <= 1) {
      cancelScreenshotPanFrame()
      setScreenshotPan({ x: 0, y: 0 })
      setScreenshotDragging(false)
      screenshotDragRef.current = null
    }
  }

  const resetScreenshotZoom = () => {
    cancelScreenshotPanFrame()
    setScreenshotZoom(1)
    setScreenshotPan({ x: 0, y: 0 })
    setScreenshotDragging(false)
    screenshotDragRef.current = null
  }

  const startScreenshotPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (screenshotZoom <= 1) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setScreenshotDragging(true)
    screenshotDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: screenshotPan.x,
      originY: screenshotPan.y
    }
  }

  const moveScreenshotPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = screenshotDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    scheduleScreenshotPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    })
  }

  const stopScreenshotPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = screenshotDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const pendingPan = screenshotPanPendingRef.current
    cancelScreenshotPanFrame()
    if (pendingPan) setScreenshotPan(pendingPan)
    screenshotDragRef.current = null
    setScreenshotDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => () => cancelScreenshotPanFrame(), [])

  const toggleContent = async (item: InstanceContentItem) => {
    if (!currentTarget) return
    if (shouldBlockCurrentTargetContent(item.kind)) {
      setStatusText(t('content.toggle.busy'))
      return
    }

    const nextEnabled = !item.enabled
    const optimisticFileName = nextEnabled ? item.enabledFileName : `${item.enabledFileName}.disable`
    setBusyContentId(item.id)
    setStatusText(item.enabled ? t('content.disabling') : t('content.enabling'))
    setInstanceContent((prev) => prev.map((content) => content.id === item.id
      ? { ...content, enabled: nextEnabled, fileName: optimisticFileName }
      : content
    ))

    try {
      const result = await window.electron.toggleInstanceContent({
        instance: currentTarget,
        kind: item.kind,
        fileName: item.fileName,
        contentId: item.id,
        enabled: nextEnabled
      })
      setInstanceContent((prev) => prev.map((content) => content.id === item.id
        ? {
          ...content,
          enabled: result.enabled,
          filePath: result.filePath,
          fileName: result.fileName,
          enabledFileName: result.enabledFileName,
          updatedAt: result.updatedAt
        }
        : content
      ))
      refreshUpdateSummaries([currentTarget]).catch(() => undefined)
      refreshInstanceContent(item.kind, currentTarget, { silent: true, force: true }).catch(() => undefined)
      setStatusText(item.enabled ? t('content.disabled.done') : t('content.enabled.done'))
    } catch (error: any) {
      setInstanceContent((prev) => prev.map((content) => content.id === item.id ? item : content))
      const message = error instanceof Error ? error.message : String(error || '')
      setStatusText(
        /different file already uses the target enabled\/disabled name/i.test(message)
          ? t('status.contentToggleConflict')
          : t('status.contentToggleFailed')
      )
    } finally {
      setBusyContentId(null)
    }
  }

  const deleteContentFiles = async (item: InstanceContentItem, target: Instance) => {
    if (shouldBlockContentMutation(target.id, item.kind)) {
      setStatusText(t('content.delete.busy'))
      return
    }

    setBusyContentId(item.id)
    setStatusText(t('content.delete.deleting'))
    const previousIndex = instanceContent.findIndex((content) => content.id === item.id)
    setInstanceContent((prev) => prev.filter((content) => content.id !== item.id))

    try {
      await window.electron.deleteInstanceContent({
        instance: target,
        kind: item.kind,
        fileName: item.fileName,
        contentId: item.id
      })
      setSelectedScreenshot((current) => current?.id === item.id ? null : current)
      refreshUpdateSummaries([target]).catch(() => undefined)
      refreshInstanceContent(item.kind, target, { silent: true, force: true }).catch(() => undefined)
      setStatusText(t('content.delete.deleted'))
    } catch {
      setInstanceContent((prev) => {
        if (prev.some((content) => content.id === item.id)) return prev
        const next = [...prev]
        next.splice(Math.max(0, previousIndex), 0, item)
        return next
      })
      setStatusText(t('status.contentDeleteFailed'))
    } finally {
      setBusyContentId(null)
    }
  }

  const revealContentFile = async (item: InstanceContentItem) => {
    if (!currentTarget) return
    try {
      await window.electron.revealInstanceContentFile({
        instance: currentTarget,
        kind: item.kind,
        fileName: item.fileName,
        contentId: item.id
      })
    } catch {
      setStatusText(t('status.fileLocationFailed'))
    }
  }

  const importDroppedContentFiles = async (files: File[]) => {
    if (!currentTarget || files.length === 0 || contentImporting) return
    if (shouldBlockCurrentTargetContent(contentTab)) {
      setContentDropActive(false)
      setStatusText(t('content.toggle.busy'))
      return
    }

    const filePaths = window.electron.getDroppedFilePaths(files)
    if (filePaths.length === 0) {
      setContentDropActive(false)
      setStatusText(t('content.drop.unreadable'))
      return
    }

    setContentImporting(true)
    setContentDropActive(false)
    setStatusText(tf('content.import.status', { count: filePaths.length }))

    try {
      const result = await window.electron.importInstanceContentFiles({
        instance: currentTarget,
        kind: contentTab,
        filePaths
      })
      setInstanceContent(result.content)
      updateInstanceContentCache(currentTarget.id, contentTab, result.content)
      refreshUpdateSummaries([currentTarget]).catch(() => undefined)
      const importedCount = result.imported.length
      const rejectedCount = result.rejected.length
      const skippedCount = result.skipped.length
      if (importedCount > 0) {
        setStatusText(tf('content.import.done', { count: importedCount, skipped: rejectedCount + skippedCount }))
      } else {
        setStatusText(rejectedCount > 0 ? tf('content.import.noneCompatible', { label: currentContentTab.label }) : t('content.import.none'))
      }
    } catch {
      setStatusText(t('status.droppedImportFailed'))
    } finally {
      setContentImporting(false)
    }
  }

  const handleContentDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!currentTarget || instancePanelView !== 'content') return
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = shouldBlockCurrentTargetContent(contentTab) ? 'none' : 'copy'
    if (!contentDropActive) setContentDropActive(true)
  }

  const handleContentDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setContentDropActive(false)
  }

  const handleContentDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!currentTarget || instancePanelView !== 'content') return
    event.preventDefault()
    void importDroppedContentFiles(Array.from(event.dataTransfer.files || []))
  }

  const updateLauncherSettings = async (next: LauncherSettings) => {
    setDiscordSettings(next)
    try {
      const saved = await window.electron.setDiscordSettings(next)
      setDiscordSettings({ ...DEFAULT_LAUNCHER_SETTINGS, ...saved })
      await refreshDiscordStatus()
      setStatusText(t('status.settingsUpdated'))
    } catch {
      setStatusText(t('status.settingsUpdateFailed'))
    }
  }

  const focusDiscordAccountSection = () => {
    const section = discordAccountSectionRef.current
    if (!pendingDiscordAccountFocusRef.current || !section || activeView !== 'settings') return
    pendingDiscordAccountFocusRef.current = false
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    section.focus({ preventScroll: true })
  }

  const openDiscordAccountSettings = () => {
    pendingDiscordAccountFocusRef.current = true
    setActiveView('settings')
    // A mounted settings page can scroll immediately; a new one waits for its
    // entrance animation, including AnimatePresence's delayed mount.
    if (activeView === 'settings') focusDiscordAccountSection()
  }

  const connectLauncherDiscord = async () => {
    if (launcherDiscordAccountBusy) return
    setLauncherDiscordAccountBusy(true)
    setLauncherDiscordAccountError('')
    try {
      setLauncherDiscordAccount(await window.electron.connectLauncherDiscordAccount())
    } catch (error) {
      setLauncherDiscordAccountError(error instanceof Error ? error.message : t('settings.discordAccount.failed'))
    } finally {
      setLauncherDiscordAccountBusy(false)
    }
  }

  const checkForLauncherUpdateNow = async () => {
    if (checkingLauncherUpdate) return
    setCheckingLauncherUpdate(true)
    setStatusText(t('settings.update.checking'))
    setActivityDetail('')
    try {
      const update = await window.electron.checkLauncherUpdate()
      setLauncherUpdate(update)
      setDismissedLauncherUpdateVersion('')
      setLauncherUpdateInstallState('idle')
      setLauncherUpdateProgress(null)
      setLauncherUpdateBlockReason(null)
      setStatusText(update.error
        ? t('status.updateCheckFailed')
        : update.updateAvailable
          ? t('settings.update.available')
          : t('settings.update.upToDate'))
    } catch {
      setStatusText(t('status.updateCheckFailed'))
    } finally {
      setCheckingLauncherUpdate(false)
    }
  }

  const disconnectLauncherDiscord = async () => {
    setLauncherDiscordAccountBusy(true)
    setLauncherDiscordAccountError('')
    try {
      setLauncherDiscordAccount(await window.electron.disconnectLauncherDiscordAccount())
    } catch (error) {
      setLauncherDiscordAccountError(error instanceof Error ? error.message : t('settings.discordAccount.failed'))
    } finally {
      setLauncherDiscordAccountBusy(false)
    }
  }

  const requestDisconnectLauncherDiscord = () => {
    if (!launcherDiscordAccount?.connected || launcherDiscordAccountBusy) return
    setConfirmDialog({
      title: t('settings.discordAccount.logoutTitle'),
      body: t('settings.discordAccount.logoutBody'),
      confirmLabel: t('settings.discordAccount.logoutConfirm'),
      cancelLabel: t('settings.discordAccount.logoutCancel'),
      danger: true,
      onConfirm: disconnectLauncherDiscord
    })
  }

  const chooseDataLocation = async () => {
    if (gameRunning || launching) {
      setStatusText(t('status.storageStopGame'))
      return
    }

    setMovingDataLocation(true)
    try {
      const result = await window.electron.chooseLauncherDataLocation({ restartAfterMove: true })
      setDataLocation(result)
      setDataLocationStatus('ready')
      setDataLocationError('')
      if (result.changed) {
        setStatusText(t('status.storageMoved'))
      }
    } catch {
      setStatusText(t('status.storageMoveFailed'))
    } finally {
      setMovingDataLocation(false)
    }
  }

  const handleMemoryChange = (value: number) => {
    setMemoryGb(Math.min(Math.max(value || 1, 1), 32))
  }

  const openInstanceDetail = (instanceId: string) => {
    const navigation = getInstanceDetailNavigation(instanceId)
    if (!navigation) return

    pendingInstanceHeadingFocusRef.current = activeView !== navigation.activeView
      || currentTarget?.id !== navigation.instanceId
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    setSelectedInstanceId(navigation.instanceId)
    setInstancePanelView(navigation.panelView)
    setContentTab(navigation.contentTab)
    setActiveView(navigation.activeView)
    setShowAccountMenu(false)
  }

  const openInstanceModsLibrary = (instanceId: string) => {
    const navigation = getInstanceModsLibraryNavigation(instanceId)
    if (!navigation) return

    pendingLibraryHeadingFocusRef.current = true
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    setSelectedInstanceId(navigation.instanceId)
    setLibraryType(navigation.libraryType)
    setLibraryFilters((current) => ({ ...current, compatibleOnly: true }))
    setLibraryPage(0)
    setLibraryError('')
    setActiveView(navigation.activeView)
    setShowAccountMenu(false)
  }

  const goToLibraryPage = (page: number) => {
    const totalPages = getLibraryTotalPages(totalHits)
    const nextPage = clampLibraryPage(page, totalPages)
    if (nextPage === libraryPage) return
    pendingLibraryPageFocusRef.current = nextPage
    setLibraryLoading(true)
    setLibraryPage(nextPage)
    window.requestAnimationFrame(() => {
      librarySectionRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
  }

  const libraryTypes: Array<{ id: LibraryProjectType; label: string; Icon: typeof Wrench }> = [
    { id: 'mod', label: t('library.type.mod'), Icon: Wrench },
    { id: 'modpack', label: t('library.type.modpack'), Icon: Package },
    { id: 'resourcepack', label: t('library.type.resourcepack'), Icon: ImageIcon },
    { id: 'shader', label: t('library.type.shader'), Icon: Sparkles }
  ]

  const discordState = discordStatus?.state || (discordSettings.discordRpcEnabled ? 'connecting' : 'disabled')
  const discordStateLabel = discordState === 'connected'
    ? t('settings.discord.connected')
    : discordState === 'native'
      ? t('settings.discord.native')
      : discordState === 'error'
        ? t('settings.discord.error')
        : discordState === 'disabled'
          ? t('settings.discord.disabled')
          : discordState === 'suspended'
            ? t('settings.discord.suspended')
            : t('settings.discord.connecting')
  const discordStateClass = discordState === 'connected' || discordState === 'native'
    ? 'bg-blue-500/15 text-blue-200'
    : discordState === 'error'
      ? 'bg-red-500/15 text-red-200'
      : 'bg-slate-800 text-slate-400'

  const instanceContentTabs: Array<{ id: InstanceContentKind; label: string; folder: string }> = INSTANCE_CONTENT_KINDS.map((id) => ({
    id,
    label: getContentTabLabel(id),
    folder: getContentFolderLabel(id)
  }))
  const currentContentTab = instanceContentTabs.find((tab) => tab.id === contentTab) || instanceContentTabs[0]
  const currentContentCached = Boolean(currentTarget && instanceContentCache[currentTarget.id]?.[contentTab])
  const filteredInstanceContent = filterInstanceContent(instanceContent, instanceContentQuery)
  const showingScreenshots = currentContentTab.id === 'screenshots'
  const selectedModpackVersion = modpackVersions.find((version) => version.id === selectedModpackVersionId) || null
  const selectedLibraryVersion = libraryProjectVersions.find((version) => version.id === selectedLibraryVersionId) || null
  const manualDownloadCompleteCount = manualDownloadItems.filter((item) => manualDownloadStatuses[item.id] === 'complete').length
  const manualDownloadPendingCount = Math.max(0, manualDownloadItems.length - manualDownloadCompleteCount)
  const manualDownloadAllComplete = manualDownloadItems.length > 0 && manualDownloadPendingCount === 0
  const currentUpdateSummary = currentTarget ? instanceUpdateSummaries[currentTarget.id] : null
  const currentUpdates = currentUpdateSummary?.updates || []
  const currentUpdateCount = currentUpdates.length
  const currentNonModUpdateCount = currentUpdates.filter((update) => !isModContentType(update.projectType)).length
  const currentUpdateAllBlocked = currentBusyThisTarget && currentUpdateCount > 0 && currentNonModUpdateCount === 0
  const visibleBootProgress = Math.min(Math.max(Math.round(bootProgress), 0), 100)
  const installingCurrentModpack = Boolean(modpackProject && installingProjectId === getProjectKey(modpackProject))
  const welcomeName = activeAccount?.name || 'Player'
  const recentInstances = [...instances]
    .filter((instance) => instance.lastPlayedAt && Number.isFinite(new Date(instance.lastPlayedAt).getTime()))
    .sort((left, right) => new Date(right.lastPlayedAt!).getTime() - new Date(left.lastPlayedAt!).getTime())
    .slice(0, 4)
  const recentPlayablePlaces = getRecentPlayablePlaces(recentPlaces, instances)
  const onlinePlayers = Math.max(0, Number(launcherStats?.online_players || 0))
  const onlinePlayersText = new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'en-US').format(onlinePlayers)
  const currentLauncherVersion = launcherVersion || launcherUpdate?.currentVersion || '...'
  const currentLauncherChannel = launcherUpdate?.channel || 'stable'
  const launcherUpdatePromptVisible = Boolean(
    launcherUpdate?.updateAvailable
    && (launcherUpdate.mandatory || dismissedLauncherUpdateVersion !== launcherUpdate.latestVersion)
    && !showFirstRunSetup
    && !showLegalReview
    && !launcherErrorReport
  )
  const launcherUpdatePercent = Math.min(Math.max(Math.round(launcherUpdateProgress?.percent || 0), 0), 100)
  const launcherUpdateProgressLabel = launcherUpdateInstallState === 'blocked'
    ? t('settings.update.prompt.blocked')
    : launcherUpdateInstallState === 'failed'
    ? t('settings.update.prompt.failed')
    : launcherUpdateInstallState === 'opened' || launcherUpdateProgress?.state === 'installer-opened'
      ? t('settings.update.prompt.opened')
    : launcherUpdateProgress?.state === 'restarting'
      ? t('settings.update.prompt.restarting')
    : launcherUpdateProgress?.state === 'applying'
      ? t('settings.update.prompt.applying')
    : launcherUpdateProgress?.state === 'verifying'
      ? t('settings.update.prompt.verifying')
    : launcherUpdateProgress?.state === 'opening-installer'
      ? t('settings.update.prompt.opening')
    : launcherUpdateProgress?.state === 'downloading'
      ? t('settings.update.prompt.downloading')
      : t('settings.update.prompt.installing')
  const libraryTotalPages = getLibraryTotalPages(totalHits)
  const libraryResultsText = tf('library.results', { count: totalHits.toLocaleString() })
  const libraryPaginationStatusText = tf('library.pagination.status', {
    page: libraryPage + 1,
    pages: libraryTotalPages,
    results: libraryResultsText
  })
  const libraryPaginationLabels = {
    navigation: t('library.pagination.navigation'),
    top: t('library.pagination.top'),
    bottom: t('library.pagination.bottom'),
    previous: t('library.back'),
    next: t('library.next'),
    jumpToPage: t('library.pagination.jump'),
    go: t('library.pagination.go'),
    invalidPage: t('library.pagination.invalid'),
    loading: t('library.pagination.loading'),
    pageButton: (page: number) => tf('library.pagination.page', { page })
  }
  const bootMilestones = [
    { label: 'Data', done: visibleBootProgress >= 24 },
    { label: 'Accounts', done: visibleBootProgress >= 48 },
    { label: 'Versions', done: visibleBootProgress >= 74 },
    { label: 'Ready', done: visibleBootProgress >= 100 }
  ]
  const setupLogRows = bootLog.slice(-7)
  const minecraftVersionOptions = uniqueStrings([
    latestVersion,
    ...versions.map(getMinecraftVersionId)
  ])
  const libraryMinecraftVersionOptions = uniqueStrings([
    currentTarget?.version || '',
    resolvedLibraryFilters.gameVersion,
    ...minecraftVersionOptions.filter((version) => /^[A-Za-z0-9._+\-]{1,40}$/.test(version))
  ]).slice(0, 160)
  const newInstanceGameVersionOptions = uniqueStrings([
    newInstance.version,
    ...minecraftVersionOptions
  ])
  const instanceSettingsGameVersionOptions = uniqueStrings([
    instanceSettingsDraft.version,
    ...minecraftVersionOptions
  ])
  const instanceSettingsLoaderVersionOptions = uniqueStrings([
    instanceSettingsDraft.loaderVersion,
    ...instanceSettingsLoaderVersions.map((loader) => loader.id)
  ])
  const instanceSettingsLoaderUpdate = instanceSettingsTarget
    && !instanceSettingsEditingInstallation
    && instanceSettingsDraft.loader === instanceSettingsTarget.loader
    && instanceSettingsDraft.version === instanceSettingsTarget.version
    ? getLoaderUpdateCandidate({
        loader: instanceSettingsTarget.loader,
        minecraftVersion: instanceSettingsTarget.version,
        currentVersion: instanceSettingsTarget.loaderVersion,
        versions: instanceSettingsLoaderVersions
      })
    : null

  const currentTargetLoaderUpdateRequestKey = getLoaderUpdateRequestKey(currentTarget)
  const availableCurrentTargetLoaderUpdate = currentTarget
    && currentTargetLoaderVersions.requestKey === currentTargetLoaderUpdateRequestKey
    ? getLoaderUpdateCandidate({
        loader: currentTarget.loader,
        minecraftVersion: currentTarget.version,
        currentVersion: currentTarget.loaderVersion,
        versions: currentTargetLoaderVersions.versions
      })
    : null
  const currentTargetLoaderUpdateDismissalKey = currentTarget && availableCurrentTargetLoaderUpdate
    ? getLoaderUpdateDismissalKey(currentTarget, availableCurrentTargetLoaderUpdate)
    : ''
  const currentTargetLoaderUpdate = availableCurrentTargetLoaderUpdate
    && !dismissedLoaderUpdates.includes(currentTargetLoaderUpdateDismissalKey)
    ? availableCurrentTargetLoaderUpdate
    : null
  const currentTargetLoaderUpdateLoading = currentTargetLoaderVersions.loading
    && currentTargetLoaderVersions.requestKey === currentTargetLoaderUpdateRequestKey

  const dismissCurrentTargetLoaderUpdate = () => {
    if (!currentTargetLoaderUpdateDismissalKey) return
    setDismissedLoaderUpdates((current) => current.includes(currentTargetLoaderUpdateDismissalKey)
      ? current
      : [...current, currentTargetLoaderUpdateDismissalKey].slice(-LOADER_UPDATE_DISMISSAL_LIMIT))
    setStatusText(t('instance.settings.loaderUpdate.dismissed'))
  }

  const performInstanceLoaderUpdate = async (target: Instance | null, update: LoaderUpdateCandidate | null) => {
    if (!target || !update || updatingInstanceLoader) return
    if (isInstanceBusy(target.id)) {
      setStatusText(t('instance.settings.loaderUpdate.closeGame'))
      return
    }
    if (checkingUpdates || updatingInstanceId === target.id || activeContentUpdatesRef.current > 0) {
      setStatusText(t('instance.settings.updates.finishFirst'))
      return
    }

    setUpdatingInstanceLoader(true)
    setStatusText(t('instance.settings.loaderUpdate.updating'))
    try {
      const updated = await window.electron.updateInstance({
        instance: target,
        updates: { loaderVersion: update.latestVersion }
      })
      const merged = { ...target, ...updated }
      setInstances((prev) => prev.map((instance) => instance.id === target.id ? merged : instance))
      if (showInstanceSettings && instanceSettingsTarget?.id === target.id) {
        setInstanceSettingsDraft((prev) => ({ ...prev, loaderVersion: merged.loaderVersion }))
        setInstanceSettingsTargetId(merged.id)
      }
      setSelectedInstanceId(merged.id)
      setStatusText(t('instance.settings.loaderUpdate.updated'))
      await Promise.all([
        refreshUpdateSummaries([merged]),
        refreshInstanceContent(contentTab, merged, { silent: true, force: true })
      ])
    } catch {
      setStatusText(t('instance.settings.loaderUpdate.failed'))
    } finally {
      setUpdatingInstanceLoader(false)
    }
  }

  const updateInstanceLoaderNow = async () => {
    await performInstanceLoaderUpdate(instanceSettingsTarget, instanceSettingsLoaderUpdate)
  }

  const updateCurrentTargetLoaderNow = async () => {
    await performInstanceLoaderUpdate(currentTarget, currentTargetLoaderUpdate)
  }
  const launcherUpdateStepIndex = launcherUpdateInstallState === 'opened'
    ? 4
    : launcherUpdateProgress?.state === 'restarting' || launcherUpdateProgress?.state === 'installer-opened'
      ? 4
    : launcherUpdateProgress?.state === 'applying' || launcherUpdateProgress?.state === 'opening-installer'
      ? 3
    : launcherUpdateProgress?.state === 'verifying'
      ? 2
    : launcherUpdateInstallState === 'installing' && launcherUpdateProgress?.state === 'downloading'
      ? 1
      : 0
  const launcherUpdateSteps = [
    t('settings.update.prompt.step.prepare'),
    t('settings.update.prompt.step.download'),
    t('settings.update.prompt.step.verify'),
    t('settings.update.prompt.step.install'),
    t('settings.update.prompt.step.restart')
  ]
  const launcherUpdateStopped = launcherUpdateInstallState === 'blocked' || launcherUpdateInstallState === 'failed'

  const dismissLauncherUpdatePrompt = () => {
    if (!launcherUpdate?.latestVersion || launcherUpdate.mandatory || launcherUpdateInstallState === 'installing') return
    setDismissedLauncherUpdateVersion(launcherUpdate.latestVersion)
  }

  const openLauncherUpdatePrompt = () => {
    if (!launcherUpdate?.updateAvailable || launcherUpdateInstallState === 'installing') return
    setDismissedLauncherUpdateVersion('')
  }

  const openLauncherUpdateDownload = () => {
    if (!launcherUpdate?.downloadUrl) return
    window.electron.openExternal(launcherUpdate.downloadUrl)
  }

  const openPartnerServerWebsite = (server: PartnerServerDefinition) => {
    if (server.id === 'minisand') {
      window.electron.openExternal(MINISAND_PARTNER_URL)
      return
    }
    window.electron.openExternal(server.websiteUrl)
  }

  const getLauncherUpdateBlockMessage = (reason?: LauncherUpdateBlockReason) => {
    if (reason === 'minecraft-active') return t('settings.update.prompt.blocked.minecraft')
    if (reason === 'content-install-active') return t('settings.update.prompt.blocked.content')
    if (reason === 'update-in-progress') return t('settings.update.prompt.blocked.progress')
    if (reason === 'already-current') return t('settings.update.prompt.blocked.current')
    return t('settings.update.prompt.blocked.generic')
  }

  const installLauncherUpdateNow = async () => {
    if (!launcherUpdate?.updateAvailable || launcherUpdateInstallState === 'installing') return
    setLauncherUpdateBlockReason(null)
    setLauncherUpdateInstallState('installing')
    setLauncherUpdateProgress({ state: 'checking', percent: 0, detail: launcherUpdate.latestVersion })
    setStatusText(t('settings.update.prompt.installing'))
    setActivityDetail(`${launcherUpdate.currentVersion} -> ${launcherUpdate.latestVersion}`)

    try {
      const result = await window.electron.installLauncherUpdate()
      if (result.blocked) {
        const message = getLauncherUpdateBlockMessage(result.blockReason)
        setLauncherUpdateBlockReason(result.blockReason || null)
        setLauncherUpdateInstallState('blocked')
        setLauncherUpdateProgress({ state: 'blocked', percent: 0, detail: message })
        setProgress(0)
        setStatusText(message)
        setActivityDetail('')
        return
      }
      if (result.openedDownload) {
        setLauncherUpdateInstallState('idle')
        setStatusText(result.message || t('settings.update.download'))
        return
      }
      if (result.installerOpened) {
        setLauncherUpdateInstallState('opened')
        setLauncherUpdateProgress({
          state: 'installer-opened',
          percent: 100,
          detail: result.message || t('settings.update.prompt.readyNotice')
        })
        setStatusText(t('settings.update.prompt.opened'))
        setActivityDetail('')
        return
      }
      setStatusText(t('settings.update.prompt.opened'))
      setActivityDetail('')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || '')
      const failureReason = classifyLauncherUpdateFailureMessage(errorMessage)
      const message = failureReason === 'download-invalid'
        ? t('settings.update.prompt.failed.invalid')
        : failureReason === 'download-failed'
          ? t('settings.update.prompt.failed.download')
          : failureReason === 'installer-open-failed'
            ? t('settings.update.prompt.failed.open')
            : t('settings.update.prompt.failed.generic')
      setLauncherUpdateBlockReason(null)
      setLauncherUpdateInstallState('failed')
      setLauncherUpdateProgress({ state: 'failed', percent: launcherUpdatePercent, detail: message })
      setStatusText(message)
      setActivityDetail('')
    }
  }

  useEffect(() => {
    if (!bootReady || activeView !== 'settings' || dataLocationStatus !== 'error') return
    void loadLauncherDataLocation()
  }, [bootReady, activeView])

  const deleteContent = (item: InstanceContentItem) => {
    if (!currentTarget) return
    if (shouldBlockCurrentTargetContent(item.kind)) {
      setStatusText(t('content.delete.busy'))
      return
    }
    const target = currentTarget
    setConfirmDialog({
      title: t('content.delete.title'),
      body: tf('content.delete.body', { name: item.name }),
      confirmLabel: t('content.delete.confirm'),
      cancelLabel: t('content.delete.cancel'),
      danger: true,
      onConfirm: () => deleteContentFiles(item, target)
    })
  }

  const getLauncherErrorReportMetaLines = (report: LauncherErrorReport) => {
    const system = report.system || {}
    const gpu = Array.isArray(system.gpu) ? system.gpu.filter(Boolean).slice(0, 4).join(', ') : ''
    const storageSummary = Array.isArray(system.storage)
      ? system.storage
          .map((device) => [device.model, device.mediaType, device.size].filter(Boolean).join(' / '))
          .filter(Boolean)
          .slice(0, 4)
          .join('; ')
      : ''
    const cpu = [
      system.cpu || '',
      system.cpu_cores ? `${system.cpu_cores} cores` : ''
    ].filter(Boolean).join(' / ')

    return [
      `Player: ${report.playerName || activeAccount?.name || 'unknown'}`,
      `Account type: ${report.accountType || activeAccount?.type || 'unknown'}`,
      `OS: ${system.os || 'unknown'}`,
      `CPU: ${cpu || 'unknown'}`,
      `RAM: ${system.ram_gb ? `${system.ram_gb} GB` : 'unknown'}`,
      `GPU: ${gpu || 'unknown'}`,
      `Storage: ${storageSummary || 'unknown'}`
    ]
  }

  const copyLauncherErrorReport = async () => {
    if (!launcherErrorReport) return
    setErrorCopyState('copying')
    const reportText = [
      'NamLauncher Error Report',
      `Time: ${launcherErrorReport.occurredAt}`,
      `Launcher version: ${launcherErrorReport.launcherVersion || currentLauncherVersion}`,
      `Platform: ${launcherErrorReport.platform || 'unknown'}/${launcherErrorReport.arch || 'unknown'}`,
      `Electron: ${launcherErrorReport.electronVersion || 'unknown'}`,
      ...getLauncherErrorReportMetaLines(launcherErrorReport),
      `Context: ${launcherErrorReport.context}`,
      launcherErrorReport.diagnosis
        ? `Diagnosis: ${launcherErrorReport.diagnosis.code}${launcherErrorReport.diagnosis.culpritMod ? ` (${launcherErrorReport.diagnosis.culpritMod})` : ''}`
        : '',
      `Problem: ${launcherErrorReport.message}`,
      '',
      '--- Full sanitized launcher app.logs ---',
      launcherErrorReport.logs
    ].join('\n')
    try {
      await window.electron.copyErrorReport(reportText)
      setErrorCopyState('copied')
    } catch {
      setErrorCopyState('failed')
    }
  }

  const submitLauncherErrorReport = async () => {
    if (!launcherErrorReport || submittedErrorReportsRef.current.has(launcherErrorReport.id) || errorSubmitState === 'sending') return
    setErrorSubmitState('sending')
    setErrorSubmitDetail('')
    try {
      const result = await window.electron.submitErrorReport({
        reportId: launcherErrorReport.id,
        activeAccountId,
        playerName: activeAccount?.name || null
      })
      if (!result.confirmed) throw new Error(t('launcherError.submit.failedDefault'))
      if (!result.discordDispatched) {
        throw new Error(result.discordQueued
          ? t('launcherError.submit.pending')
          : t('launcherError.submit.failedDefault'))
      }
      submittedErrorReportsRef.current.add(launcherErrorReport.id)
      setErrorSubmitState('sent')
      setErrorSubmitDetail(t('launcherError.submit.sentDetail'))
    } catch (error: any) {
      setErrorSubmitState('failed')
      setErrorSubmitDetail(error?.message || t('launcherError.submit.failedDefault'))
    }
  }

  const launcherErrorIsMinecraft = Boolean(launcherErrorReport?.context?.startsWith('minecraft'))
  const launcherErrorTitle = launcherErrorReport?.title || (launcherErrorIsMinecraft
    ? t('launcherError.title.minecraft')
    : t('launcherError.title.launcher'))
  const launcherErrorBody = launcherErrorIsMinecraft
    ? t('launcherError.body.minecraft')
    : t('launcherError.body.launcher')
  const launcherErrorDiagnosis = launcherErrorReport?.diagnosis || null
  const getCrashDiagnosisText = (diagnosis: MinecraftCrashDiagnosis | null) => {
    if (diagnosis?.code === 'jvm-native-memory') return {
      title: t('launcherError.diagnosis.nativeMemory.title'),
      body: t('launcherError.diagnosis.nativeMemory.body')
    }
    const dependency = diagnosis?.dependencyId || 'unknown'
    const required = diagnosis?.requiredVersion || 'a compatible version'
    const installed = diagnosis?.installedVersion || 'unknown version'
    const dependentMods = diagnosis?.dependentMods?.length
      ? diagnosis.dependentMods.join(', ')
      : 'unknown mod'
    const title = diagnosis?.code === 'graphics-memory'
      ? t('launcherError.diagnosis.graphics.title')
      : diagnosis?.code === 'incompatible-mod-mixin'
        ? tf('launcherError.diagnosis.mixin.title', { mod: diagnosis.culpritMod || 'unknown' })
        : diagnosis?.code === 'missing-mod-dependency'
          ? tf('launcherError.diagnosis.dependencyMissing.title', { dependency })
          : diagnosis?.code === 'incompatible-mod-dependency'
            ? tf('launcherError.diagnosis.dependencyVersion.title', { dependency })
            : ''
    const body = diagnosis?.code === 'graphics-memory'
      ? t('launcherError.diagnosis.graphics.body')
      : diagnosis?.code === 'incompatible-mod-mixin'
        ? tf('launcherError.diagnosis.mixin.body', { mod: diagnosis.culpritMod || 'unknown' })
        : diagnosis?.code === 'missing-mod-dependency'
          ? tf('launcherError.diagnosis.dependencyMissing.body', { dependency, required, mods: dependentMods })
          : diagnosis?.code === 'incompatible-mod-dependency'
            ? tf('launcherError.diagnosis.dependencyVersion.body', { dependency, installed, required, mods: dependentMods })
            : ''
    return { title, body }
  }
  const launcherErrorDiagnosisText = getCrashDiagnosisText(launcherErrorDiagnosis)
  const launcherErrorSystem = launcherErrorReport?.system || {}
  const launcherErrorGpuSummary = Array.isArray(launcherErrorSystem.gpu)
    ? launcherErrorSystem.gpu.filter(Boolean).slice(0, 2).join(', ')
    : ''
  const launcherErrorStorageSummary = Array.isArray(launcherErrorSystem.storage)
    ? launcherErrorSystem.storage
        .map((device) => [device.model, device.mediaType, device.size].filter(Boolean).join(' / '))
        .filter(Boolean)
        .slice(0, 2)
        .join('; ')
    : ''

  return {
    acceptLegalTerms,
    accountMenuRef,
    accountSkinTextures,
    accounts,
    activeAccount,
    activeAccountId,
    activeContentUpdatesRef,
    activeInstallTaskId,
    activeLibraryFilterCount,
    activeView,
    activityDetail,
    adjustScreenshotZoom,
    applyGameState,
    applyInstalledModpackResult,
    beginContentUpdate,
    bootLog,
    bootLogSequenceRef,
    bootMilestones,
    bootProgress,
    bootReady,
    bootText,
    busyContentId,
    canInstallLibraryType,
    cancelActiveInstall,
    cancelManualDownloadsAndDeleteInstance,
    cancelScreenshotPanFrame,
    cancelledInstallTasksRef,
    checkForLauncherUpdateNow,
    checkingLauncherUpdate,
    checkingUpdates,
    chooseDataLocation,
    clampSidebarWidth,
    closeLibraryProjectDetails,
    closeManualDownloads,
    closeModpackInstaller,
    closeScreenshotViewer,
    confirmDialog,
    confirmDialogBusy,
    confirmDialogConfirm,
    confirmDialogError,
    confirmOfflineLogin,
    connectLauncherDiscord,
    contentDropActive,
    contentImporting,
    contentLoading,
    contentStatuses,
    contentTab,
    copyLauncherErrorReport,
    copyManualDownloadLink,
    createInstallTaskId,
    createInstance,
    currentBusyThisTarget,
    currentContentCached,
    currentContentTab,
    currentContentTabRef,
    currentContentTargetIdRef,
    currentLauncherChannel,
    currentLauncherVersion,
    currentLaunchingThisTarget,
    currentNonModUpdateCount,
    currentRunningThisTarget,
    currentTarget,
    currentTargetLoaderUpdate,
    currentTargetLoaderUpdateLoading,
    currentUpdateAllBlocked,
    currentUpdateCount,
    currentUpdateSummary,
    currentUpdates,
    curseForgeConfigured,
    dataLocation,
    dataLocationError,
    dataLocationRequestIdRef,
    dataLocationStatus,
    deleteContent,
    deleteContentFiles,
    deleteInstance,
    deleteInstanceFiles,
    deletingInstanceId,
    disconnectLauncherDiscord,
    discordAccountSectionRef,
    discordSettings,
    discordState,
    discordStateClass,
    discordStateLabel,
    discordStatus,
    dismissConfirmDialog,
    dismissCurrentTargetLoaderUpdate,
    dismissLauncherUpdatePrompt,
    dismissModpackInstallActivity,
    dismissedLauncherUpdateVersion,
    effectiveLibraryFilters,
    ensureMinecraftVersionList,
    errorCopyState,
    errorSubmitDetail,
    errorSubmitState,
    exportInstanceMrpack,
    exportingInstanceId,
    filteredInstanceContent,
    finishContentUpdate,
    focusDiscordAccountSection,
    focusLauncherInput,
    gameIssueCopyResult,
    gameLogLines,
    gameLogLoading,
    gameLogPath,
    gameRunning,
    getAccountTypeDetail,
    getAccountTypeLabel,
    getContentFolderLabel,
    getContentTabLabel,
    getCrashDiagnosisText,
    getLauncherErrorReportMetaLines,
    getLauncherUpdateBlockMessage,
    getLibraryButtonState,
    getProjectKey,
    goToLibraryPage,
    handleContentDragLeave,
    handleContentDragOver,
    handleContentDrop,
    handleInstanceIconUpload,
    handleInstanceSettingsIconUpload,
    handleLaunchOrStop,
    handleLogin,
    handleMemoryChange,
    handleOfflineNameChange,
    handleSidebarResizeKeyDown,
    homeModpackRequestIdRef,
    homeModpacks,
    homeModpacksError,
    homeModpacksLoaded,
    homeModpacksLoading,
    homeModpacksRetry,
    homeServerPingInFlightRef,
    homeServerStatusCacheRef,
    homeServerStatusRefresh,
    homeServerStatusRequestIdRef,
    homeServerStatuses,
    homeServerStatusesRefreshing,
    importDroppedContentFiles,
    importLocalMrpack,
    importingMrpack,
    installContentUpdate,
    installLauncherUpdateNow,
    installLibraryProject,
    installSelectedLibraryVersion,
    installSelectedModpack,
    installedContentStatusOverridesRef,
    installingCurrentModpack,
    installingProjectId,
    instanceActionMenuOpen,
    instanceActionMenuRef,
    instanceContent,
    instanceContentCache,
    instanceContentCacheRef,
    instanceContentQuery,
    instanceContentTabs,
    instanceHeadingRef,
    instancePanelView,
    instanceSettingsDraft,
    instanceSettingsEditingInstallation,
    instanceSettingsGameVersionOptions,
    instanceSettingsLoaderVersionOptions,
    instanceSettingsLoaderVersions,
    instanceSettingsLoaderVersionsLoading,
    instanceSettingsLoaderUpdate,
    instanceSettingsTab,
    instanceSettingsTarget,
    instanceSettingsTargetId,
    instanceUpdateSummaries,
    instances,
    isInstanceBusy,
    isModContentType,
    isUserCancelledInstall,
    language,
    latestVersion,
    launcherDiscordAccount,
    launcherDiscordAccountBusy,
    launcherDiscordAccountError,
    launcherErrorBody,
    launcherErrorDiagnosis,
    launcherErrorDiagnosisText,
    launcherErrorGpuSummary,
    launcherErrorIsMinecraft,
    launcherErrorReport,
    launcherErrorStorageSummary,
    launcherErrorSystem,
    launcherErrorTitle,
    launcherStats,
    launcherUpdate,
    launcherUpdateBlockReason,
    launcherUpdateInstallState,
    launcherUpdatePercent,
    launcherUpdateProgress,
    launcherUpdateProgressLabel,
    launcherUpdatePromptVisible,
    launcherUpdateStepIndex,
    launcherUpdateSteps,
    launcherUpdateStopped,
    launcherVersion,
    launching,
    launchingInstanceIds,
    legalAccepted,
    legalDocument,
    libraryCompatibilityAvailable,
    libraryError,
    libraryFilters,
    libraryHeadingRef,
    libraryLoaderFilterAvailable,
    libraryLoading,
    libraryMinecraftVersionOptions,
    libraryPage,
    libraryPaginationLabels,
    libraryPaginationStatusText,
    libraryProjectDetails,
    libraryProjectDialogRef,
    libraryProjectTriggerRef,
    libraryProjectVersionError,
    libraryProjectVersions,
    libraryProjectVersionsLoading,
    libraryResultsText,
    librarySearchCacheRef,
    librarySectionRef,
    librarySource,
    libraryTotalPages,
    libraryType,
    libraryTypes,
    loadLauncherDataLocation,
    loaderVersions,
    logEndRef,
    loginStep,
    mainScrollRef,
    manualDownloadAllComplete,
    manualDownloadCompleteCount,
    manualDownloadCompletionAnnouncedRef,
    manualDownloadDirectory,
    manualDownloadInFlightRef,
    manualDownloadInstance,
    manualDownloadItems,
    manualDownloadMessage,
    manualDownloadPendingCount,
    manualDownloadStatuses,
    manualDownloadStatusesRef,
    memoryGb,
    microsoftLoginLoading,
    minecraftGameIssue,
    minecraftVersionOptions,
    minecraftVersionsLoading,
    minimizeActiveModpackInstall,
    modQuery,
    modpackInstallActivity,
    modpackInstallMinimizedRef,
    modpackProject,
    modpackVersions,
    modpackVersionsLoading,
    mods,
    moveScreenshotPan,
    movingDataLocation,
    newInstance,
    newInstanceGameVersionOptions,
    offlineName,
    offlineNameInputRejected,
    offlineWarningAccepted,
    onlinePlayers,
    onlinePlayersText,
    openAllManualDownloads,
    openDiscordAccountSettings,
    openInstanceDetail,
    openInstanceLogs,
    openInstanceModsLibrary,
    openInstalledModProjectDetails,
    openInstanceSettings,
    openLauncherUpdateDownload,
    openLauncherUpdatePrompt,
    openLegalReview,
    openLibraryProjectDetails,
    openManualDownload,
    openModpackInstaller,
    openOfflineLogin,
    openPartnerServerWebsite,
    openScreenshotViewer,
    pageMotionProps,
    pendingDiscordAccountFocusRef,
    pendingInstanceHeadingFocusRef,
    pendingLibraryHeadingFocusRef,
    pendingLibraryPageFocusRef,
    progress,
    recentInstances,
    recentPlaces,
    recentPlayablePlaces,
    reduceMotion,
    refreshDiscordStatus,
    refreshInstanceContent,
    refreshCurrentTargetLoaderUpdate,
    refreshUpdateSummaries,
    rememberRecentPlace,
    removeAccount,
    removeAccountNow,
    requestDisconnectLauncherDiscord,
    resetInstanceSettingsDraft,
    resetLibraryFilters,
    resetScreenshotZoom,
    resolvedLibraryFilters,
    resolvedSelectedInstanceId,
    restoreModpackInstall,
    revealContentFile,
    runningElapsedByInstance,
    runningInstanceIds,
    runningInstances,
    runningServers,
    saveInstanceSettings,
    savingInstanceSettings,
    scheduleScreenshotPan,
    screenshotDragRef,
    screenshotDragging,
    screenshotPan,
    screenshotPanFrameRef,
    screenshotPanPendingRef,
    screenshotZoom,
    selectLibrarySource,
    selectedInstance,
    selectedInstanceId,
    selectedLibraryVersion,
    selectedLibraryVersionId,
    selectedModpackVersion,
    selectedModpackVersionId,
    selectedScreenshot,
    sessionExpiredNotice,
    setAccountSkinTextures,
    setAccounts,
    setActiveAccountId,
    setActiveInstallTaskId,
    setActiveView,
    setActivityDetail,
    setBootLog,
    setBootProgress,
    setBootReady,
    setBootText,
    setBusyContentId,
    setCheckingLauncherUpdate,
    setCheckingUpdates,
    setConfirmDialog,
    setConfirmDialogBusy,
    setConfirmDialogError,
    setContentDropActive,
    setContentImporting,
    setContentLoading,
    setContentStatusLoading,
    setContentStatuses,
    setContentTab,
    setCurseForgeConfigured,
    setDataLocation,
    setDataLocationError,
    setDataLocationStatus,
    setDeletingInstanceId,
    setDiscordSettings,
    setDiscordStatus,
    setDismissedLauncherUpdateVersion,
    setErrorCopyState,
    setErrorSubmitDetail,
    setErrorSubmitState,
    setExportingInstanceId,
    setGameIssueCopyResult,
    setGameLogLines,
    setGameLogLoading,
    setGameLogPath,
    setHomeModpacks,
    setHomeModpacksError,
    setHomeModpacksLoaded,
    setHomeModpacksLoading,
    setHomeModpacksRetry,
    setHomeServerStatusRefresh,
    setHomeServerStatuses,
    setHomeServerStatusesRefreshing,
    setImportingMrpack,
    setInstallingProjectId,
    setInstanceActionMenuOpen,
    setInstanceContent,
    setInstanceContentCache,
    setInstanceContentQuery,
    setInstancePanelView,
    setInstanceSettingsDraft,
    setInstanceSettingsEditingInstallation,
    setInstanceSettingsLoaderVersions,
    setInstanceSettingsLoaderVersionsLoading,
    setInstanceSettingsTab,
    setInstanceSettingsTargetId,
    setInstanceUpdateSummaries,
    setInstances,
    setLatestVersion,
    setLauncherDiscordAccount,
    setLauncherDiscordAccountBusy,
    setLauncherDiscordAccountError,
    setLauncherErrorReport,
    setLauncherStats,
    setLauncherUpdate,
    setLauncherUpdateBlockReason,
    setLauncherUpdateInstallState,
    setLauncherUpdateProgress,
    setLauncherVersion,
    setLaunchingInstanceIds,
    setLegalAccepted,
    setLegalDocument,
    setLibraryError,
    setLibraryFilters,
    setLibraryLoading,
    setLibraryPage,
    setLibraryProjectDetails,
    setLibraryProjectVersionError,
    setLibraryProjectVersions,
    setLibraryProjectVersionsLoading,
    setLibrarySource,
    setLibraryType,
    setLoaderVersions,
    setLoginStep,
    setManualDownloadDirectory,
    setManualDownloadInstance,
    setManualDownloadItems,
    setManualDownloadMessage,
    setManualDownloadStatuses,
    setMemoryGb,
    setMicrosoftLoginLoading,
    setMinecraftGameIssue,
    setMinecraftVersionsLoading,
    setModQuery,
    setModpackInstallActivity,
    setModpackProject,
    setModpackVersions,
    setModpackVersionsLoading,
    setMods,
    setMovingDataLocation,
    setNewInstance,
    setOfflineName,
    setOfflineNameInputRejected,
    setOfflineWarningAccepted,
    setProgress,
    setProjectUpdateBusy,
    setRecentPlaces,
    setRunningElapsedByInstance,
    setRunningInstances,
    setRunningServers,
    setSavingInstanceSettings,
    setScreenshotDragging,
    setScreenshotPan,
    setScreenshotZoom,
    setSelectedInstanceId,
    setSelectedLibraryVersionId,
    setSelectedModpackVersionId,
    setSelectedScreenshot,
    setSessionExpiredNotice,
    setShowAccountMenu,
    setShowFirstRunSetup,
    setShowInstanceModal,
    setShowInstanceSettings,
    setShowLegalReview,
    setShowLoginModal,
    setShowModpackModal,
    setSidebarWidth,
    setStartupAutoUpdating,
    setStatusText,
    setTotalHits,
    setUpdatingInstanceId,
    setUpdatingProjectId,
    setUpdatingProjectIds,
    setVersions,
    setWindowHidden,
    settingsCardVariants,
    setupLogRows,
    shouldBlockContentMutation,
    shouldBlockCurrentTargetContent,
    showAccountMenu,
    showFirstRunSetup,
    showInstanceModal,
    showInstanceSettings,
    showLegalReview,
    showLoginModal,
    showMicrosoftSessionExpired,
    showModpackModal,
    showingScreenshots,
    sidebarCompact,
    sidebarNarrow,
    sidebarWidth,
    startScreenshotPan,
    startSidebarResize,
    startupAutoUpdating,
    statusText,
    stopScreenshotPan,
    submitLauncherErrorReport,
    submittedErrorReportsRef,
    t,
    targetPlaytime,
    tf,
    toggleContent,
    totalHits,
    updateAllContent,
    updateInstanceLoaderNow,
    updateCurrentTargetLoaderNow,
    updateInstalledContent,
    updateInstanceContentCache,
    updateLauncherSettings,
    updateLibraryFilters,
    updatingInstanceId,
    updatingInstanceLoader,
    updatingProjectId,
    updatingProjectIds,
    updatingProjectIdsRef,
    versions,
    visibleBootProgress,
    welcomeName,
    windowHidden
  }
}
