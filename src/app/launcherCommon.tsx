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
  NameMcCatalogRequest,
  NameMcCatalogResponse,
  NameMcResolvedSkin,
  NameMcSkinItem
} from '../../shared/nameMcSkins'
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
export const loadSkinPageModule = () => import('../components/SkinPage')
export const SkinPage = lazy(loadSkinPageModule)
export const loadWorldsServersPanelModule = () => import('../components/WorldsServersPanel')
export const WorldsServersPanel = lazy(loadWorldsServersPanelModule)

export type Account = {
  id: string
  uuid: string
  name: string
  type: 'msa' | 'offline'
  createdAt: string
  updatedAt: string
}

export type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'quilt' | 'neoforge'
export type InstanceContentKind = 'mods' | 'resourcepacks' | 'shaderpacks' | 'screenshots'
export type LibrarySource = 'modrinth' | 'curseforge'
export type CurseForgeManualProjectType = 'mod' | 'resourcepack' | 'shader'
export type InstanceSettingsTab = 'general' | 'installation'
export type PerformanceProfile = 'automatic' | 'low-spec' | 'balanced' | 'max-fps'
export type RunningServerInfo = { label: string; kind: 'domain' | 'private_ip' | 'public_ip' | 'local' }

export type Instance = {
  id: string
  name: string
  version: string
  loader: LoaderType
  loaderVersion: string
  createdAt: string
  iconUrl?: string | null
  playtimeSeconds?: number
  lastPlayedAt?: string
}

export type InstanceContentItem = {
  id: string
  kind: InstanceContentKind
  name: string
  fileName: string
  enabledFileName: string
  filePath: string
  enabled: boolean
  size: number
  updatedAt: string
  iconUrl?: string | null
  projectId?: string | null
  versionId?: string | null
  versionNumber?: string | null
  source: 'modrinth' | 'curseforge' | 'local'
}

export type InstanceContentCache = Record<string, Partial<Record<InstanceContentKind, InstanceContentItem[]>>>

export type ContentImportProgress = {
  requestId: string
  phase: 'copying' | 'scanning' | 'complete' | 'error'
  completed: number
  total: number
  imported: number
  skipped: number
  rejected: number
}

export type LauncherTheme = 'system' | 'dark' | 'light'

export type LauncherSettings = {
  discordRpcEnabled: boolean
  anonymousStatsEnabled: boolean
  gameplayTelemetryEnabled: boolean
  playerBadgeEnabled: boolean
  restrictedModAuditEnabled: boolean
  customJavaArgsEnabled: boolean
  customJavaArgs: string
  autoMinimizeOnLaunch: boolean
  closeToTrayEnabled: boolean
  automaticMemory: boolean
  performanceProfile: PerformanceProfile
  language: LauncherLanguage
  theme: LauncherTheme
}

export const DEFAULT_LAUNCHER_SETTINGS: LauncherSettings = {
  discordRpcEnabled: true,
  anonymousStatsEnabled: true,
  gameplayTelemetryEnabled: true,
  playerBadgeEnabled: true,
  restrictedModAuditEnabled: true,
  customJavaArgsEnabled: false,
  customJavaArgs: '',
  autoMinimizeOnLaunch: false,
  closeToTrayEnabled: true,
  automaticMemory: false,
  performanceProfile: 'automatic',
  language: 'th',
  theme: 'system'
}

export type DiscordStatus = {
  enabled: boolean
  state: 'disabled' | 'suspended' | 'connecting' | 'connected' | 'error' | 'native'
  connected: boolean
  lastActivity?: string | null
  lastActivityAt?: string | null
  applicationId?: string | null
  lastError?: string | null
  reconnectAttempts?: number
}

export type LauncherDiscordAccountState = {
  connected: boolean
  persistent: boolean
  offline?: boolean
  profile: null | {
    id: string
    username: string
    displayName: string
    avatarUrl: string
    expiresAt?: string | null
  }
}

export type ContentStatus = {
  state: 'install' | 'installed' | 'update' | 'unavailable' | 'unsupported'
  reason?: string
  installedVersion?: string | null
  installedVersionId?: string | null
  latestVersion?: string | null
  latestVersionId?: string | null
}

export type ContentUpdateItem = {
  projectId: string
  title: string
  projectType: 'mod' | 'resourcepack' | 'shader'
  iconUrl?: string | null
  installedVersion: string
  installedVersionId: string
  latestVersion: string
  latestVersionId: string
  provider?: 'modrinth' | 'curseforge'
}

export type InstanceUpdateSummary = {
  updates: ContentUpdateItem[]
  checkedAt: string
}

export type GameLogEntry = {
  line: string
  at?: string
  instanceId?: string | null
  instanceName?: string | null
}

export type GameLogResult = {
  content: string
  path: string
  exists: boolean
  truncated?: boolean
}

export type ModrinthVersionOption = {
  id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  game_versions: string[]
  loaders: string[]
  date_published?: string | null
}

export type LauncherUpdateInfo = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  channel: string
  downloadUrl: string
  installerSha256?: string | null
  windowsBundleUrl?: string | null
  windowsBundleSha256?: string | null
  mandatory?: boolean
  notes?: string[]
  error?: string
}

export type LauncherUpdateProgress = {
  state: 'checking' | 'downloading' | 'verifying' | 'applying' | 'restarting' | 'opening-installer' | 'installer-opened' | 'blocked' | 'failed'
  percent?: number
  detail?: string
}

// Font Awesome Free Brands: Discord (CC BY 4.0, https://fontawesome.com/license/free).
export const DiscordLogo = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 576 512"
    aria-hidden="true"
    focusable="false"
    className={className}
    fill="currentColor"
  >
    <path d="M492.5 69.8c-.2-.3-.4-.6-.8-.7-38.1-17.5-78.4-30-119.7-37.1-.4-.1-.8 0-1.1 .1s-.6 .4-.8 .8c-5.5 9.9-10.5 20.2-14.9 30.6-44.6-6.8-89.9-6.8-134.4 0-4.5-10.5-9.5-20.7-15.1-30.6-.2-.3-.5-.6-.8-.8s-.7-.2-1.1-.2c-41.3 7.1-81.6 19.6-119.7 37.1-.3 .1-.6 .4-.8 .7-76.2 113.8-97.1 224.9-86.9 334.5 0 .3 .1 .5 .2 .8s.3 .4 .5 .6c44.4 32.9 94 58 146.8 74.2 .4 .1 .8 .1 1.1 0s.7-.4 .9-.7c11.3-15.4 21.4-31.8 30-48.8 .1-.2 .2-.5 .2-.8s0-.5-.1-.8-.2-.5-.4-.6-.4-.3-.7-.4c-15.8-6.1-31.2-13.4-45.9-21.9-.3-.2-.5-.4-.7-.6s-.3-.6-.3-.9 0-.6 .2-.9 .3-.5 .6-.7c3.1-2.3 6.2-4.7 9.1-7.1 .3-.2 .6-.4 .9-.4s.7 0 1 .1c96.2 43.9 200.4 43.9 295.5 0 .3-.1 .7-.2 1-.2s.7 .2 .9 .4c2.9 2.4 6 4.9 9.1 7.2 .2 .2 .4 .4 .6 .7s.2 .6 .2 .9-.1 .6-.3 .9-.4 .5-.6 .6c-14.7 8.6-30 15.9-45.9 21.8-.2 .1-.5 .2-.7 .4s-.3 .4-.4 .7-.1 .5-.1 .8 .1 .5 .2 .8c8.8 17 18.8 33.3 30 48.8 .2 .3 .6 .6 .9 .7s.8 .1 1.1 0c52.9-16.2 102.6-41.3 147.1-74.2 .2-.2 .4-.4 .5-.6s.2-.5 .2-.8c12.3-126.8-20.5-236.9-86.9-334.5zm-302 267.7c-29 0-52.8-26.6-52.8-59.2s23.4-59.2 52.8-59.2c29.7 0 53.3 26.8 52.8 59.2 0 32.7-23.4 59.2-52.8 59.2zm195.4 0c-29 0-52.8-26.6-52.8-59.2s23.4-59.2 52.8-59.2c29.7 0 53.3 26.8 52.8 59.2 0 32.7-23.2 59.2-52.8 59.2z" />
  </svg>
)

export type LauncherStats = {
  downloads: number
  online_players: number
  heartbeat_window_seconds?: number
  download_url?: string | null
  launcher_version?: string | null
  error?: string
}

export type LauncherErrorReport = {
  id: string
  title: string
  context: string
  message: string
  logs: string
  occurredAt: string
  launcherVersion?: string
  platform?: string
  arch?: string
  electronVersion?: string
  playerName?: string
  accountType?: string | null
  diagnosis?: MinecraftCrashDiagnosis | null
  system?: {
    os?: string | null
    cpu?: string | null
    cpu_cores?: number | null
    ram_gb?: number | null
    gpu?: string[]
    storage?: Array<{ model?: string | null; mediaType?: string | null; size?: string | null }>
    platform?: string | null
    arch?: string | null
  }
}

export type LauncherDataLocation = {
  currentPath: string
  currentRoot?: string
  defaultPath: string
  packagedPath: string
  configuredPath?: string | null
  configPath?: string
  folderName?: string
  rootFolderName?: string
  launcherFolderName?: string
  nextRoot?: string
  nextPath?: string
  canceled?: boolean
  changed?: boolean
  restartRequired?: boolean
  copiedEntries?: string[]
  skippedEntries?: string[]
  failedEntries?: string[]
}

export type DataLocationStatus = 'loading' | 'ready' | 'error'

export type LegalSection = {
  title: string
  body: string
}

export type LegalDocument = {
  version: string
  updatedAt: string
  language: LauncherLanguage
  title: string
  intro: string
  acceptance: string
  terms: LegalSection[]
  privacy: LegalSection[]
  references: Array<{ label: string; url: string }>
  source: 'remote' | 'bundled'
}

export type SetupLogEntry = {
  id: string
  text: string
  progress: number
  at: string
}

export type ModpackInstallResult = {
  success: boolean
  canceled?: boolean
  cancelled?: boolean
  instance?: Instance
  version?: string
  installedFiles?: number
  skippedFiles?: number
  overrideFiles?: number
  incompatibleOptionalFiles?: string[]
  blockedFiles?: string[]
  manualDownloads?: ManualCurseForgeDownloadItem[]
  manualDownloadDirectory?: string
}

export type ManualCurseForgeDownloadItem = {
  id: string
  title: string
  filename: string
  displayName?: string
  projectId: number
  fileId: number
  projectType: CurseForgeManualProjectType
  websiteUrl: string
  fileUrl: string
  iconUrl?: string | null
  targetDirectory?: string
  hashes?: Record<string, string>
  fileLength?: number
}

export type ConfirmDialogState = {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
}

export type AccountSessionExpiredNotice = {
  accountId?: string
  accountName: string
  message?: string
}

export type AccountSessionExpiredPayload = AccountSessionExpiredNotice & {
  accounts?: Account[]
}

export type RecentInstancePlace = {
  instanceId: string
  instanceName: string
  type: InstancePlaceQuickPlay['type']
  label: string
  address?: string
  folderName?: string
  playedAt: string
}

export type HomeServerStatusEntry = Readonly<{
  phase: 'loading' | 'online' | 'offline'
  ping?: MinecraftServerPing
}>

export type HomeServerStatusCacheEntry = Readonly<{
  status: HomeServerStatusEntry
  expiresAt: number
}>

export const readRecentInstancePlaces = (): RecentInstancePlace[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storage.recentPlaces) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 12).flatMap((item): RecentInstancePlace[] => {
      if (!item || typeof item !== 'object') return []
      const instanceId = String(item.instanceId || '').trim().slice(0, 256)
      const instanceName = String(item.instanceName || '').trim().slice(0, 256)
      const type = item.type === 'server' || item.type === 'world' ? item.type : null
      const label = String(item.label || '').trim().slice(0, 256)
      const playedAt = String(item.playedAt || '')
      if (!instanceId || !type || !label || !Number.isFinite(new Date(playedAt).getTime())) return []
      if (type === 'server') {
        const address = String(item.address || '').trim().slice(0, 512)
        return address ? [{ instanceId, instanceName, type, label, address, playedAt }] : []
      }
      const folderName = String(item.folderName || '').trim().slice(0, 255)
      return folderName && !/[\\/]/.test(folderName)
        ? [{ instanceId, instanceName, type, label, folderName, playedAt }]
        : []
    })
  } catch {
    return []
  }
}

export const INSTANCE_CONTENT_KINDS: InstanceContentKind[] = ['mods', 'resourcepacks', 'shaderpacks', 'screenshots']
export const MINISAND_PARTNER_URL = 'https://minisand.online/'
export const NAMLAUNCHER_DISCORD_URL = 'https://namlauncher.nattapat2871.me/discord'
export const HOME_SERVER_STATUS_DELAY_MS = 220
export const HOME_SERVER_STATUS_CACHE_TTL_MS = 60_000
export const HOME_SERVER_STATUS_CACHE_LIMIT = 24
export const HOME_SERVER_STATUS_MAX_RECENT = 4
export const HOME_SERVER_STATUS_CONCURRENCY = 2
export const SIDEBAR_MIN_WIDTH = 260
export const SIDEBAR_DEFAULT_WIDTH = 300
export const SIDEBAR_MAX_WIDTH = 380
export const DATA_LOCATION_TIMEOUT_MS = 12_000

export const getMinecraftVersionId = (version: any) => String(version?.id || version?.version || version || '').trim()

export const uniqueStrings = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))

export const normalizeHomeServerAddress = (address: string) => address.trim().toLocaleLowerCase('en-US')

export const getHomeServerStatusKey = (instanceId: string, address: string) => (
  `${instanceId}:${normalizeHomeServerAddress(address)}`
)

export const getRecentPlayablePlaces = (
  recentPlaces: readonly RecentInstancePlace[],
  instances: readonly Instance[]
) => recentPlaces.flatMap((place) => {
  const instance = instances.find((candidate) => candidate.id === place.instanceId)
  if (!instance) return []
  const quickPlay: InstancePlaceQuickPlay | null = place.type === 'server' && place.address
    ? { type: 'server', address: place.address }
    : place.type === 'world' && place.folderName
      ? { type: 'world', folderName: place.folderName }
      : null
  return quickPlay ? [{ place, instance, quickPlay }] : []
}).slice(0, HOME_SERVER_STATUS_MAX_RECENT)

export type ScreenshotPan = {
  x: number
  y: number
}

export type ScreenshotDragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
} | null

export type ExportInstanceMrpackResult = {
  success: boolean
  canceled?: boolean
  filePath?: string
  modrinthFiles?: number
  overrideFiles?: number
  totalFiles?: number
}

declare global {
  interface Window {
    electron: {
      getAccounts: () => Promise<Account[]>
      setActiveAccountContext: (accountId: string | null) => Promise<{ activeAccountId: string | null }>
      removeAccount: (accountId: string) => Promise<Account[]>
      getSkinLibrary: (accountId: string) => Promise<SkinLibraryData>
      refreshSkinLibrary: (accountId: string) => Promise<SkinLibraryData>
      saveSkinPreset: (request: any) => Promise<SkinLibraryData>
      saveDefaultSkinPreset: (request: { accountId: string; defaultSkinId: string }) => Promise<SkinLibraryData>
      importSkinByName: (request: { accountId: string; playerName: string }) => Promise<SkinLibraryData>
      importOfflineSkinByName: (request: { accountId: string; playerName: string }) => Promise<SkinLibraryData>
      searchNameMcSkins: (request: NameMcCatalogRequest) => Promise<NameMcCatalogResponse>
      resolveNameMcSkin: (request: NameMcSkinItem | { query: string }) => Promise<NameMcResolvedSkin>
      applyNameMcSkin: (request: { accountId: string; item: NameMcSkinItem }) => Promise<SkinLibraryData>
      activateSkinPreset: (request: { accountId: string; skinId: string }) => Promise<SkinLibraryData>
      deleteSkinPreset: (request: { accountId: string; skinId: string }) => Promise<SkinLibraryData>
      resetActiveSkin: (request: { accountId: string }) => Promise<SkinLibraryData>
      getLoaderVersions: (loader: string, mcVersion: string) => Promise<Array<{ id: string; type: string }>>
      getLoaderCompatibility: (loader: string, mcVersion: string) => Promise<{
        supported: boolean
        requestedGameVersion: string
        recommendedGameVersion: string | null
      }>
      getGameState: () => Promise<any>
      hydrateInstances: (instances: Instance[]) => Promise<Instance[]>
      updateInstance: (request: { instance: Instance; updates: Partial<Instance> }) => Promise<Instance>
      provisionInstance: (instance: Instance) => Promise<{
        success: boolean
        resourcePack: { filename: string; enabled: boolean; sha256: string }
      }>
      cacheImageUrl: (url: string) => Promise<string>
      rendererReady: () => Promise<boolean>
      getInstanceUpdateSummary: (instance: Instance) => Promise<InstanceUpdateSummary>
      getLauncherVersion: () => Promise<string>
      checkLauncherUpdate: () => Promise<LauncherUpdateInfo>
      runStartupLauncherUpdate: () => Promise<StartupUpdateResult>
      installLauncherUpdate: () => Promise<LauncherUpdateInstallResult>
      getLauncherStats: () => Promise<LauncherStats>
      getLegalDocument: (language: LauncherLanguage) => Promise<LegalDocument>
      getLauncherDataLocation: () => Promise<LauncherDataLocation>
      chooseLauncherDataLocation: (options?: { initialSetup?: boolean; restartAfterMove?: boolean }) => Promise<LauncherDataLocation>
      getDiscordSettings: () => Promise<LauncherSettings>
      getDiscordStatus: () => Promise<DiscordStatus>
      setDiscordSettings: (settings: LauncherSettings) => Promise<LauncherSettings>
      getLauncherDiscordAccount: () => Promise<LauncherDiscordAccountState>
      connectLauncherDiscordAccount: () => Promise<LauncherDiscordAccountState>
      disconnectLauncherDiscordAccount: () => Promise<LauncherDiscordAccountState>
      getInstanceContent: (options: { instance: Instance; kind: InstanceContentKind }) => Promise<InstanceContentItem[]>
      getInstancePlaces: InstancePlacesApi['getInstancePlaces']
      getLanReadiness: InstancePlacesApi['getLanReadiness']
      discoverLanServers: InstancePlacesApi['discoverLanServers']
      onLanSessionDetected?: InstancePlacesApi['onLanSessionDetected']
      pingInstanceServers: InstancePlacesApi['pingInstanceServers']
      addInstanceServer: InstancePlacesApi['addInstanceServer']
      removeInstanceServer: InstancePlacesApi['removeInstanceServer']
      getInstanceRunLog: (instance: Instance) => Promise<GameLogResult>
      toggleInstanceContent: (options: { instance: Instance; kind: InstanceContentKind; fileName: string; contentId: string; enabled: boolean }) => Promise<any>
      deleteInstanceContent: (options: { instance: Instance; kind: InstanceContentKind; fileName: string; contentId: string }) => Promise<any>
      importInstanceContentFiles: (options: { instance: Instance; kind: InstanceContentKind; filePaths: string[]; requestId: string }) => Promise<{
        success: boolean
        kind: InstanceContentKind
        imported: Array<{ sourcePath: string; filePath: string; fileName: string }>
        skipped: Array<{ sourcePath: string; reason: string }>
        rejected: Array<{ sourcePath: string; reason: string }>
        content: InstanceContentItem[]
      }>
      onInstanceContentImportProgress?: (callback: (progress: ContentImportProgress) => void) => () => void
      revealInstanceContentFile: (options: { instance: Instance; kind: InstanceContentKind; fileName: string; contentId: string }) => Promise<{ success: boolean }>
      getDroppedFilePaths: (files: File[]) => string[]
      openInstanceFolder: (instance: Instance) => Promise<{ success: boolean }>
      deleteInstance: (instance: Instance) => Promise<{ success: boolean; deleted: boolean; instanceRoot: string }>
      openManualDownloadFolder: () => Promise<{ success: boolean; path?: string }>
      copyToClipboard: (value: string) => Promise<{ success: boolean }>
      importCurseForgeManualDownload: (options: { instance: Instance; item: ManualCurseForgeDownloadItem }) => Promise<{
        success: boolean
        imported: boolean
        alreadyInstalled?: boolean
        path?: string
        filename?: string
        downloadDirectory?: string
      }>
      getModrinthContentStatus: (options: { instance?: Instance | null; projects: any[] }) => Promise<Record<string, ContentStatus>>
      getCurseForgeConfig: () => Promise<{ configured: boolean; source: string }>
      getHomeModpacks: () => Promise<{ hits: any[]; total_hits: number; stale?: boolean }>
      searchModrinth: (options: {
        query: string
        projectType: string
        offset: number
        limit: number
        index: LibrarySort
        gameVersion: string
        loader: string
        environment: LibraryEnvironment
        openSourceOnly: boolean
      }) => Promise<{ hits: any[]; total_hits: number; canceled?: boolean }>
      searchCurseForge: (options: {
        query: string
        projectType: string
        offset: number
        limit: number
        instance?: Instance | null
        sort: Exclude<LibrarySort, 'relevance'>
        gameVersion: string
        loader: string
      }) => Promise<{ hits: any[]; total_hits: number; canceled?: boolean }>
      getCurseForgeContentStatus: (options: { instance?: Instance | null; projects: any[] }) => Promise<Record<string, ContentStatus>>
      getCurseForgeModpackVersions: (options: { project: any }) => Promise<ModrinthVersionOption[]>
      getCurseForgeProjectVersions: (options: { instance: Instance; project: any }) => Promise<ModrinthVersionOption[]>
      installCurseForgeModpack: (options: { project: any; fileId?: string; taskId?: string; playerName?: string; accountType?: string }) => Promise<ModpackInstallResult>
      installCurseForgeContent: (options: { instance: Instance; project: any; fileId?: string; playerName?: string; accountType?: string }) => Promise<{
        success: boolean
        projectType: string
        version: string
        installDirectory: string
        installed: Array<{ filename: string; path: string; skipped: boolean; dependency: boolean; versionNumber?: string }>
      }>
      getModrinthProjectVersions: (options: { instance?: Instance; project: any; projectType: string }) => Promise<ModrinthVersionOption[]>
      installModrinthContent: (options: { instance: Instance; project: any; projectType: string; versionId?: string; playerName?: string; accountType?: string }) => Promise<{
        success: boolean
        projectType: string
        version: string
        installDirectory: string
        installed: Array<{ filename: string; path: string; skipped: boolean; dependency: boolean; versionNumber?: string }>
      }>
      installModrinthModpack: (options: { project: any; projectType: string; versionId?: string; taskId?: string; playerName?: string; accountType?: string }) => Promise<ModpackInstallResult>
      installLocalMrpack: (options?: { taskId?: string }) => Promise<ModpackInstallResult>
      cancelInstallTask: (taskId: string) => Promise<{ success: boolean; canceled?: boolean; cancelled?: boolean }>
      exportInstanceMrpack: (instance: Instance) => Promise<ExportInstanceMrpackResult>
      launchMinecraft: (options: any) => Promise<any>
      stopMinecraft: (instance?: Instance) => Promise<any>
      loginMicrosoft: () => Promise<Account>
      loginOffline: (username: string) => Promise<Account>
      onLaunchProgress: (callback: (progress: any) => void) => () => void
      onLaunchError: (callback: (error: string) => void) => () => void
      onLauncherErrorReport: (callback: (report: LauncherErrorReport) => void) => () => void
      onMinecraftGameIssue: (callback: (issue: MinecraftGameIssue) => void) => () => void
      onLauncherUpdate: (callback: (update: LauncherUpdateInfo) => void) => () => void
      onLauncherUpdateProgress: (callback: (progress: LauncherUpdateProgress) => void) => () => void
      onAccountSessionExpired: (callback: (payload: AccountSessionExpiredPayload) => void) => () => void
      copyErrorReport: (report: string) => Promise<{ success: boolean }>
      submitErrorReport: (request: { reportId: string; activeAccountId?: string | null; playerName?: string | null }) => Promise<{ success: boolean; duplicate?: boolean; reportId?: string; discordDispatched?: boolean; discordQueued?: boolean; confirmed?: boolean; confirmationDuplicate?: boolean; confirmationCount?: number }>
      onGameState: (callback: (state: any) => void) => () => void
      onGameLog: (callback: (entry: GameLogEntry) => void) => () => void
      windowControl: (action: string) => void
      openLogs: () => void
      openExternal: (url: string) => void
    }
  }
}

export const navItems = [
  { id: 'home', label: 'Home', labelKey: 'nav.home', icon: Home },
  { id: 'instances', label: 'Instances', labelKey: 'nav.instances', icon: LayoutGrid },
  { id: 'skins', label: 'Skins', labelKey: 'nav.skins', icon: Shirt },
  { id: 'library', label: 'Library', labelKey: 'nav.library', icon: Library },
  { id: 'settings', label: 'Settings', labelKey: 'nav.settings', icon: Settings }
] as const

export type ViewId = typeof navItems[number]['id']

export const classNames = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')

export const isCurseForgeManualDownloadRequired = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  return /disabled third-party downloads|does not allow third-party downloads/i.test(message)
}

export const isDirectImageSource = (source: string) => (
  source.startsWith('data:') || source === './minisand-logo.png' || source.startsWith('/') || source.startsWith('file:')
)

export const CachedImage = ({
  src,
  alt = '',
  className,
  fallback = null,
  referrerPolicy = 'no-referrer',
  loading,
  decoding = 'async',
  onImageError
}: {
  src?: string | null
  alt?: string
  className?: string
  fallback?: React.ReactNode
  referrerPolicy?: React.HTMLAttributeReferrerPolicy
  loading?: React.ImgHTMLAttributes<HTMLImageElement>['loading']
  decoding?: React.ImgHTMLAttributes<HTMLImageElement>['decoding']
  onImageError?: () => void
}) => {
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    const source = src || ''
    return isDirectImageSource(source) ? source : ''
  })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const source = src || ''
    setFailed(false)

    if (!source) {
      setResolvedSrc('')
      return () => {
        cancelled = true
      }
    }

    if (isDirectImageSource(source)) {
      setResolvedSrc(source)
      return () => {
        cancelled = true
      }
    }

    // Remote images stay hidden until the sandboxed main process validates,
    // bounds, and converts them to a safe raster data URL.
    setResolvedSrc('')
    window.electron.cacheImageUrl(source)
      .then((cached) => {
        if (cancelled) return
        if (cached) setResolvedSrc(cached)
        else setFailed(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [src])

  if (!src || failed || !resolvedSrc) return <>{fallback}</>

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy={referrerPolicy}
      loading={loading}
      decoding={decoding}
      onError={() => {
        setFailed(true)
        onImageError?.()
      }}
      className={className}
    />
  )
}

export const formatPlaytime = (seconds = 0) => {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const DEFAULT_SKIN_ASSET_REVISION = '15b0c1e447cc2fff34ca54d735aaa596a0aab2b0'
export const DEFAULT_STEVE_TEXTURE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAdVBMVEUAAAAKvLwAzMwmGgokGAgrHg0zJBE/KhW3g2uzeV5SPYn///+qclmbY0mQWT8Af38AaGhVVVWUYD52SzOBUzmPXj5JJRBCHQp3QjVqQDA0JRIoKCg3Nzc/Pz9KSko6MYlBNZtGOqUDenoFiIgElZUApKQAr6/wvakZAAAAAXRSTlMAQObYZgAAAolJREFUeNrt1l1rHucZReFrj/whu5hSCCQtlOTE/f+/Jz4q9Cu0YIhLcFVpVg+FsOCVehi8jmZgWOzZz33DM4CXlum3gH95GgeAzQZVeL4gTm6Cbp4vqFkD8HwBazPY8wWbMq9utu3mNZ5fotVezbzOE3kBEFbaZuc8kb00NTMUbWJp678Xf2GV7RRtx1TDQQ6XBNvsmL2+2vHq1TftmMPIyAWujtN2cl274ua2jpVpZneXEjjo7XW1q53V9ds4ODO5xIuhvGHvfLI3aixauig415uuO2+vl9+cncfsFw25zL650fXn687jqnXuP68/X3+eV3zE7y6u9eB73MlfAcfbTf3yR8CfAX+if8S/H5/EAbAxj5LN48tULvEBOh8V1AageMTXe2YHAOwHbZxrzPkSR3+ffr8TR2JDzE/4Fj8CDgEwDsW+q+9GsR07hhg2CsALBgMo2v5wNxXnQXMeGQVW7gUAyKI2m6KDsJ8Au3++F5RZO+kKNQjQcLLWgjwUjBXLltFgWWMUUlviocBgNoxNGgMjSxiYAA7zgLFo2hgIENiDU8gQCzDOmViGFAsEuBcQSDCothhpJaDRA8E5fHqH2nTbYm5fHLo1V0u3B7DAuheoeScRYabjjjuzs17cHVaTrTXmK78m9swP34d9oK/dfeXSIH2PW/MXwPvxN/bJlxw8zlYAcEyeI6gNgA/O8P8neN8xe1IHP2gTzegjvhUDfuRygmwEs2GE4mkCDIAzm2R4yAuPsIdR9k8AvMc+3L9+2UEjo4WP0FpgP19O0MzCsqxIoMsdDBvYcQyGmO0ZJRoYCKjLJWY0BAhYwGUBCgkh8MRdOKt+ruqMwAB2OcEX94U1TPbYJP0PkyyAI1S6cSIAAAAASUVORK5CYII='

export const formatDate = (value?: string | null) => {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const formatRelativeDate = (value: string, language: LauncherLanguage) => {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return formatDate(value)

  const elapsedSeconds = Math.round((timestamp - Date.now()) / 1000)
  const absoluteSeconds = Math.abs(elapsedSeconds)
  const formatter = new Intl.RelativeTimeFormat(language === 'th' ? 'th-TH' : 'en-US', { numeric: 'auto' })

  if (absoluteSeconds < 60) return formatter.format(elapsedSeconds, 'second')
  if (absoluteSeconds < 60 * 60) return formatter.format(Math.round(elapsedSeconds / 60), 'minute')
  if (absoluteSeconds < 60 * 60 * 24) return formatter.format(Math.round(elapsedSeconds / (60 * 60)), 'hour')
  if (absoluteSeconds < 60 * 60 * 24 * 30) return formatter.format(Math.round(elapsedSeconds / (60 * 60 * 24)), 'day')
  return formatter.format(Math.round(elapsedSeconds / (60 * 60 * 24 * 30)), 'month')
}

export const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('Could not read image file.'))
  reader.readAsDataURL(file)
})

export const resizeImageDataUrl = (dataUrl: string, maxSize = 512) => new Promise<string>((resolve) => {
  const image = new Image()
  image.onload = () => {
    const longestSide = Math.max(image.width, image.height)
    const scale = longestSide > maxSize ? maxSize / longestSide : 1
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      resolve(dataUrl)
      return
    }

    context.drawImage(image, 0, 0, width, height)
    resolve(canvas.toDataURL('image/webp', 0.86))
  }
  image.onerror = () => resolve(dataUrl)
  image.src = dataUrl
})

export const readInstanceIconFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }

  if (file.size > 4 * 1024 * 1024) {
    throw new Error('Instance icon image is too large.')
  }

  const dataUrl = await readFileAsDataUrl(file)
  return resizeImageDataUrl(dataUrl)
}

export const SwitchControl = ({
  checked,
  onChange,
  disabled = false,
  busy = false,
  title
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  busy?: boolean
  title?: string
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={title}
    disabled={disabled || busy}
    onClick={onChange}
    className={classNames(
      'relative grid h-10 w-16 shrink-0 place-items-center overflow-hidden rounded-full border p-1 outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-blue-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1526] disabled:cursor-wait disabled:opacity-60',
      checked
        ? 'border-blue-300/40 bg-blue-500 shadow-lg shadow-blue-950/30'
        : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
    )}
    data-tooltip={title}
  >
    <span className="relative h-7 w-full rounded-full">
      <span
        className={classNames(
          'absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-900 shadow-md transition-transform duration-150 ease-out',
          checked ? 'translate-x-7' : 'translate-x-0'
        )}
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <span className={classNames('h-2 w-2 rounded-full transition-colors duration-150', checked ? 'bg-blue-500' : 'bg-slate-400')} />
        )}
      </span>
    </span>
  </button>
)

export const getContentDisplayName = (item: InstanceContentItem) => {
  const version = item.versionNumber?.trim()
  const name = item.name.trim()
  if (!version || name.toLowerCase().includes(version.toLowerCase())) return name

  const withoutStaleVersion = name.replace(
    /\s+(?:v(?:ersion)?\s*)?\d+(?:\.\d+)+(?:[-+][0-9a-z.-]+)?$/i,
    ''
  ).trim()
  return `${withoutStaleVersion || name} ${version}`
}

export const InstanceIcon = ({
  instance,
  running = false,
  size = 'md'
}: {
  instance: Instance
  running?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
}) => {
  const sizeClass = size === 'xs'
    ? 'h-6 w-6 rounded-md'
    : size === 'sm'
      ? 'h-9 w-9 rounded-md'
      : size === 'lg'
      ? 'h-16 w-16 rounded-lg'
      : 'h-12 w-12 rounded-lg'
  const iconSize = size === 'xs' ? 13 : size === 'sm' ? 17 : size === 'lg' ? 24 : 21

  return (
    <div className={classNames(
      'relative flex shrink-0 items-center justify-center overflow-hidden border bg-slate-900 text-blue-300 transition-[border-color,box-shadow] duration-150',
      running ? 'border-blue-300/60 shadow-[0_0_18px_rgba(96,165,250,0.28)]' : 'border-slate-700',
      sizeClass
    )}>
      {instance.iconUrl ? (
        <CachedImage
          src={instance.iconUrl}
          alt=""
          className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
          fallback={<Package size={iconSize} />}
        />
      ) : (
        <Package size={iconSize} />
      )}
      {running && (
        <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-slate-950 bg-blue-300 shadow-[0_0_10px_rgba(96,165,250,0.9)]" />
      )}
    </div>
  )
}

export const AccountHead = ({
  account,
  skinTextureSrc,
  sizeClass
}: {
  account: Account
  skinTextureSrc?: string | null
  sizeClass: string
}) => {
  const offlineFallback = account.type === 'offline' ? DEFAULT_STEVE_TEXTURE_URL : ''
  const source = skinTextureSrc || offlineFallback
  const [resolvedSrc, setResolvedSrc] = useState(() => (isDirectImageSource(source) ? source : ''))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)

    if (!source) {
      setResolvedSrc('')
      return () => {
        cancelled = true
      }
    }

    if (isDirectImageSource(source)) {
      setResolvedSrc(source)
      return () => {
        cancelled = true
      }
    }

    setResolvedSrc('')
    window.electron.cacheImageUrl(source)
      .then((cached) => {
        if (cancelled) return
        if (cached) setResolvedSrc(cached)
        else if (offlineFallback) setResolvedSrc(offlineFallback)
        else setFailed(true)
      })
      .catch(() => {
        if (cancelled) return
        if (offlineFallback) setResolvedSrc(offlineFallback)
        else setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [offlineFallback, source])

  const handleTextureError = () => {
    if (offlineFallback && resolvedSrc !== offlineFallback) {
      setFailed(false)
      setResolvedSrc(offlineFallback)
      return
    }
    setFailed(true)
  }

  if (!resolvedSrc || failed) {
    return (
      <div className={classNames('flex items-center justify-center rounded-md bg-slate-800 text-slate-500', sizeClass)}>
        <User size={18} />
      </div>
    )
  }

  const skinLayerClass = 'pointer-events-none absolute left-0 top-0 max-w-none select-none'
  return (
    <div className={classNames('relative shrink-0 overflow-hidden rounded-md bg-slate-800 outline outline-1 -outline-offset-1 outline-white/10', sizeClass)}>
      <img
        src={resolvedSrc}
        alt=""
        draggable={false}
        onError={handleTextureError}
        className={skinLayerClass}
        style={{ width: '800%', left: '-100%', top: '-100%', imageRendering: 'pixelated' }}
      />
      <img
        src={resolvedSrc}
        alt=""
        draggable={false}
        onError={handleTextureError}
        className={skinLayerClass}
        style={{ width: '800%', left: '-500%', top: '-100%', imageRendering: 'pixelated' }}
      />
    </div>
  )
}

export const normalizeStoredInstances = (items: any[]): Instance[] => {
  return items
    .filter(Boolean)
    .map((item) => ({
      id: String(item.id || crypto.randomUUID?.() || Date.now()),
      name: String(item.name || 'Minecraft Instance'),
      version: String(item.version || '1.20.1'),
      loader: item.loader === 'fabric' || item.loader === 'forge' || item.loader === 'quilt' || item.loader === 'neoforge'
        ? item.loader
        : 'vanilla',
      loaderVersion: String(item.loaderVersion || ''),
      createdAt: String(item.createdAt || new Date().toISOString()),
      iconUrl: typeof item.iconUrl === 'string' ? item.iconUrl : null,
      playtimeSeconds: Number(item.playtimeSeconds || 0),
      lastPlayedAt: item.lastPlayedAt
    }))
}

export const MicrosoftMark = ({ className = '' }: { className?: string }) => (
  <span className={classNames('grid grid-cols-2 gap-0.5', className)} aria-hidden="true">
    <span className="bg-[#f25022]" />
    <span className="bg-[#7fba00]" />
    <span className="bg-[#00a4ef]" />
    <span className="bg-[#ffb900]" />
  </span>
)

export const isMicrosoftSessionExpiredMessage = (value: unknown) => /Microsoft session .*?(expired|missing its refresh token|invalid|incomplete)|Your Microsoft session expired/i.test(String(value || ''))

export const LIBRARY_SEARCH_DEBOUNCE_MS = 150
export const LIBRARY_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
export const LIBRARY_SEARCH_CACHE_LIMIT = 40
