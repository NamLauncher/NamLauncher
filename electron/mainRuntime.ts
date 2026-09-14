// Author/creator: nattapat2871 (https://nattapat2871.me)
// NamLauncher Electron runtime composition.
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, safeStorage, shell, Tray } from 'electron'
import type { IpcMainInvokeEvent, MenuItemConstructorOptions, MessageBoxOptions, NativeImage, OpenDialogOptions, SaveDialogOptions } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import zlib from 'zlib'
import os from 'os'
import { spawn } from 'child_process'
import { pipeline } from 'node:stream/promises'
import { createServer, type Server } from 'http'
import https from 'https'
import { fileURLToPath, pathToFileURL } from 'url'
import tls from 'tls'
import axios from 'axios'
import { ProviderRequestGate, retryAfterMilliseconds } from './networkRetry.ts'
import { SharedProviderRequests } from './sharedProviderRequests.ts'
import { shouldInstallForgeProfileDirectly } from './minecraft/forgeProfile.ts'
import AdmZip from 'adm-zip'
import MCLC from 'minecraft-launcher-core'
import * as msmc from 'msmc'
import log from 'electron-log'
import { ensureJavaExists, getMinecraftLaunchJavaPath } from './javaManager'
import { discordManager, minecraftDiscordManager, MINECRAFT_OFFICIAL_APPLICATION_ID } from './discord'
import { normalizeLoader, parseNeoForgeMetadata, sortLoaderVersions, type LoaderType } from './loaderSupport'
import { fetchLegalDocument, type LegalLanguage } from './legal'
import {
  revokeLauncherDiscordSession,
  startLauncherDiscordLink,
  validateLauncherDiscordSession,
  waitForLauncherDiscordLink,
  type LauncherDiscordProfile
} from './launcherDiscordAuth.ts'
import { PROVIDER_USER_AGENT } from './appIdentity'
import {
  applyCustomJavaArgumentPolicy,
  normalizePerformanceProfile,
  resolvePerformancePolicy,
  type PerformanceProfile
} from './performancePolicy'
import { assertPathWithinRoot } from './pathSafety'
import { reconcileMatchingContentFileCollision } from './contentFileCollision.ts'
import {
  selectHomeDiscoveryProjects,
  type HomeDiscoveryLane,
  type HomeDiscoveryLaneResult
} from './homeDiscovery'
import { assessLanReadiness, detectLanPortFromLogLine } from './minecraft/lanReadiness'
import { discoverMinecraftLanServers } from './minecraft/lanDiscovery'
import {
  createLanDiscoveryCoordinator,
  isTrustedRendererSender,
  shouldPublishLanSessionPort
} from './minecraft/lanIpc'
import {
  isManagedBrandingBridgeFile,
  listManagedBrandingBridgeFiles,
  provisionBrandingBridge
} from './minecraft/brandingBridge'
import { normalizeMinecraftTextureId, verifyMinecraftTextureFile } from './minecraft/discordTexture.ts'
import { normalizePlayerBadgeUuid, writePlayerBadgeConfig } from './minecraft/playerBadgeConfig.ts'
import { scanRestrictedMods } from './minecraft/restrictedModAudit.ts'
import {
  addMinecraftServerDat,
  createServerQuickPlay,
  createWorldQuickPlay,
  mergePartnerServersDat,
  normalizeMinecraftServerEndpoint,
  pingMinecraftServer,
  readMinecraftServersDat,
  removeMinecraftServerDat,
  scanMinecraftWorlds,
  selectMinecraftServerPingTargets,
  createMinecraftServerTelemetryState,
  getForgeArtifactCoordinates,
  parseMinecraftServerLogEvent,
  type MinecraftServerTelemetryState
} from './minecraft/index.ts'
import { PARTNER_SERVERS, PARTNER_SERVER_REVISION } from '../shared/partnerServers.ts'
import {
  OFFLINE_USERNAME_ERROR_MESSAGE,
  isOfflineUsernameValidationError,
  isValidOfflineUsername
} from '../shared/offlineUsername.ts'
import { redactLabeledPlayerNames } from '../shared/privacyRedaction.ts'
import {
  buildLauncherInstallerTempPath,
  LauncherUpdateBlockedError,
  getLauncherUpdateBlockedResult
} from '../shared/launcherUpdate.ts'
import { getLauncherUpdateCleanupRetryDelay } from '../shared/launcherUpdateCleanup.ts'
import {
  createStartupUpdateController,
  selectStartupUpdateTarget,
  type StartupUpdateInfo
} from '../shared/startupUpdate.ts'
import { launchWindowsAutoInstaller } from './updates/windowsAutoInstaller.ts'
import { launchWindowsBundleUpdater } from './updates/windowsBundleUpdater.ts'
import { resolveWindowsInstallScope } from './updates/windowsInstallScope.ts'
import { shouldUseWindowsApplicationBundle } from '../shared/windowsBundleUpdate.ts'
import { installPlatformAutoUpdate } from './updates/platformAutoUpdate.ts'
import { recoverLegacyLauncherDataPath } from './dataLocationRecovery.ts'
import { WindowResponsivenessMonitor } from './windowResponsiveness.ts'
import { createAccountService } from './accounts/accountService.ts'
import { createSkinService } from './skins/skinService.ts'
import { createNameMcCatalogService } from './skins/nameMcCatalogService.ts'
import { createInstanceService } from './instances/instanceService.ts'
import { createContentService } from './content/contentService.ts'
import { createLoaderService } from './content/loaderService.ts'
import { registerIpcHandlers } from './ipc/registerIpcHandlers.ts'
import {
  assertFileSha256,
  normalizeLauncherInstallerSha256
} from '../shared/launcherUpdateIntegrity.ts'
import {
  GAME_SESSION_HEARTBEAT_INTERVAL_MS,
  getGameSessionEndReason,
  normalizeGameSessionLoader,
  type GameSessionEndReason,
  type GameSessionEventName
} from '../shared/gameSessionTelemetry.ts'
import {
  formatMinecraftCrashDiagnosisForReport,
  getMinecraftCrashDiagnosis,
  type MinecraftCrashDiagnosis
} from '../shared/minecraftCrashDiagnosis.ts'
import {
  classifyMinecraftProcessFailure,
  isLocalMinecraftLaunchFailure,
  type MinecraftFailureClassification,
  type MinecraftGameIssue
} from '../shared/minecraftFailureClassification.ts'
import {
  getModrinthPackFileIdentity,
  planModpackClientFiles
} from '../shared/modpackCompatibility.ts'
import {
  buildModrinthSearchFacets,
  isLibraryLoader,
  normalizeLibraryGameVersion,
  normalizeLibrarySearchFilters,
  normalizeLibrarySearchLimit,
  normalizeLibrarySearchOffset,
  normalizeLibrarySearchQuery,
  normalizeLibraryTotalHits,
  type LibraryEnvironment,
  type LibrarySort
} from '../shared/librarySearchFilters.ts'

const configureSystemCertificateStore = () => {
  const tlsWithSystemStore = tls as typeof tls & {
    getCACertificates?: (type?: 'default' | 'system' | 'bundled' | 'extra') => string[]
    setDefaultCACertificates?: (certificates: string[]) => void
  }

  if (typeof tlsWithSystemStore.getCACertificates !== 'function') return

  try {
    const defaultCertificates = tlsWithSystemStore.getCACertificates('default')
    const systemCertificates = tlsWithSystemStore.getCACertificates('system')
    if (!systemCertificates.length) return

    const trustedCertificates = Array.from(new Set([
      ...defaultCertificates,
      ...systemCertificates
    ]))

    tlsWithSystemStore.setDefaultCACertificates?.(trustedCertificates)
    https.globalAgent.options.ca = trustedCertificates
    axios.defaults.httpsAgent = https.globalAgent
    log.info(`Loaded ${systemCertificates.length} system CA certificates for HTTPS requests.`)
  } catch (err) {
    log.warn('Could not load system CA certificates for HTTPS requests.', err)
  }
}

configureSystemCertificateStore()

const { Client } = MCLC

export type ModrinthProjectType = 'mod' | 'modpack' | 'resourcepack' | 'shader'
export type InstanceContentKind = 'mods' | 'resourcepacks' | 'shaderpacks' | 'screenshots'
export type ContentProvider = 'modrinth' | 'curseforge'

type LauncherStorageDevice = {
  model: string
  size?: string | null
  mediaType?: string | null
}

type LauncherSystemReport = {
  os: string
  cpu: string
  cpu_cores?: number
  ram_gb: number
  gpu: string[]
  storage: LauncherStorageDevice[]
  platform: string
  arch: string
}

type LauncherErrorReport = {
  id: string
  title: string
  context: string
  message: string
  logs: string
  occurredAt: string
  launcherVersion: string
  platform: string
  arch: string
  electronVersion: string
  playerName?: string
  accountType?: string | null
  diagnosis?: MinecraftCrashDiagnosis | null
  system: LauncherSystemReport
}

export type LauncherErrorSubmitRequest = {
  reportId?: string
  activeAccountId?: string | null
  playerName?: string | null
}

type LauncherErrorSubmitResult = {
  success: boolean
  duplicate: boolean
  reportId: string
  occurrenceCount?: number
  discordDispatched?: boolean
  discordQueued?: boolean
}

export type StoredAccount = {
  id: string
  uuid: string
  name: string
  type: 'msa' | 'offline'
  auth: any
  createdAt: string
  updatedAt: string
}

export type AccountSummary = Omit<StoredAccount, 'auth'>

type LauncherReleaseArtifact = {
  version?: string
  updates_paused?: boolean
  id?: string
  platform?: string
  label?: string
  format?: string
  arch?: string
  url?: string | null
  available?: boolean
  recommended?: boolean
  sha256?: string | null
}

type LauncherReleaseResponse = {
  version?: string
  channel?: string
  download_url?: string
  mandatory?: boolean
  notes?: string[]
  artifacts?: LauncherReleaseArtifact[]
}

export type SkinModel = 'classic' | 'slim'

export type StoredSkinPreset = {
  id: string
  accountId: string
  name: string
  model: SkinModel
  fileName: string
  capeFileName?: string | null
  capeId?: string | null
  sourceProfileUuid?: string | null
  sourceProfileName?: string | null
  sourceTextureId?: string | null
  createdAt: string
  updatedAt: string
}

export type StoredMinecraftProfileCape = {
  id: string
  name: string
  fileName: string
  active: boolean
}

export type StoredMinecraftProfileCache = {
  id: string
  name: string
  model: SkinModel
  fileName: string
  textureId?: string | null
  capes: StoredMinecraftProfileCape[]
  activeCapeId?: string | null
  refreshedAt: string
}

export type StoredSkinAccount = {
  activeSkinId?: string | null
  activeDefaultSkinId?: string | null
  skins: StoredSkinPreset[]
  profileCache?: StoredMinecraftProfileCache | null
}

export type StoredSkinLibrary = {
  version: 1
  accounts: Record<string, StoredSkinAccount>
}

export type SkinSaveRequest = {
  accountId?: string
  skinId?: string
  name?: string
  model?: string
  textureDataUrl?: string
  capeId?: string | null
  activate?: boolean
}

export type SkinActionRequest = {
  accountId?: string
  skinId?: string
  capeId?: string | null
}

export type SkinImportRequest = {
  accountId?: string
  playerName?: string
}

export type SkinDefaultRequest = {
  accountId?: string
  defaultSkinId?: string
}

export type LauncherInstance = {
  id?: string | number
  name?: string
  version?: string
  loader?: string
  loaderVersion?: string
  iconUrl?: string | null
  createdAt?: string
  playtimeSeconds?: number
  lastPlayedAt?: string
}

export type LaunchRequest = {
  accountId?: string
  auth?: any
  instance?: LauncherInstance
  instanceName?: string
  version?: string
  loader?: string
  loaderVersion?: string
  memoryGb?: number
  quickPlay?:
    | { type: 'server'; address: string }
    | { type: 'world'; folderName: string }
}

export type InstanceServerMutationRequest = LaunchRequest & {
  name?: string
  address?: string
  index?: number
  expectedCanonicalKey?: string
}

export type InstanceServerPingRequest = LaunchRequest & {
  addresses?: unknown
}

export type ModrinthInstallRequest = {
  taskId?: string
  playerName?: string
  accountType?: string
  instance?: LauncherInstance
  project?: {
    project_id?: string
    id?: string
    slug?: string
    title?: string
    project_type?: string
    icon_url?: string | null
  }
  projectId?: string
  projectType?: string
  versionId?: string
}

export type CurseForgeProject = {
  id?: number | string
  project_id?: string
  title?: string
  name?: string
  slug?: string
  description?: string
  icon_url?: string | null
  website_url?: string | null
  allow_distribution?: boolean
  provider?: 'curseforge'
  project_type?: ModrinthProjectType
}

export type CurseForgeSearchRequest = {
  query?: string
  projectType?: string
  offset?: number
  limit?: number
  instance?: LauncherInstance | null
  sort?: LibrarySort
  gameVersion?: string
  loader?: string
}

export type CurseForgeInstallRequest = {
  taskId?: string
  playerName?: string
  accountType?: string
  instance?: LauncherInstance
  project?: CurseForgeProject
  fileId?: string | number
}

export type CurseForgeManualDownload = {
  id: string
  title: string
  filename: string
  displayName?: string
  projectId: number
  fileId: number
  projectType: Exclude<ModrinthProjectType, 'modpack'>
  websiteUrl: string
  fileUrl: string
  iconUrl?: string | null
  targetDirectory?: string
  hashes?: Record<string, string>
  fileLength?: number
}

export type CurseForgeManualDownloadRequest = {
  instance?: LauncherInstance
  item?: CurseForgeManualDownload
}

export type ModrinthSearchRequest = {
  query?: string
  projectType?: string
  offset?: number
  limit?: number
  index?: string
  gameVersion?: string
  loader?: string
  environment?: LibraryEnvironment
  openSourceOnly?: boolean
}

export type LanReadinessRequest = {
  instance?: LauncherInstance
}

const discoverLocalMinecraftServers = createLanDiscoveryCoordinator(
  () => discoverMinecraftLanServers({ timeoutMs: 2_500 })
)

export type CurseForgeContentStatusRequest = {
  instance?: LauncherInstance | null
  projects?: CurseForgeProject[]
}

export type InstanceContentRequest = {
  instance?: LauncherInstance
  kind?: string
  fileName?: string
  contentId?: string
  filePaths?: string[]
  requestId?: string
  enabled?: boolean
}

export type InstanceContentImportProgress = {
  requestId: string
  phase: 'copying' | 'scanning'
  completed: number
  total: number
  imported: number
  skipped: number
  rejected: number
}

export type InstanceUpdateRequest = {
  instance?: LauncherInstance
  updates?: LauncherInstance
}

export type DataLocationMoveRequest = {
  initialSetup?: boolean
  restartAfterMove?: boolean
}

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
  language: 'en' | 'th'
  theme: 'system' | 'dark' | 'light'
}

type DiscordRuntimeSettings = LauncherSettings & {
  discordClientId: string
  launcherVersion: string
}

export type ModrinthContentStatusRequest = {
  instance?: LauncherInstance
  projects?: ModrinthInstallRequest['project'][]
}

export type ContentUpdateItem = {
  projectId: string
  title: string
  projectType: Exclude<ModrinthProjectType, 'modpack'>
  iconUrl?: string | null
  installedVersion: string
  installedVersionId: string
  latestVersion: string
  latestVersionId: string
  provider?: ContentProvider
}

export type ModrinthVersionFile = {
  url: string
  filename: string
  primary?: boolean
  size?: number
  hashes?: Record<string, string>
  file_type?: string | null
}

export type ModrinthPackFile = {
  path: string
  hashes?: Record<string, string>
  env?: {
    client?: 'required' | 'optional' | 'unsupported'
    server?: 'required' | 'optional' | 'unsupported'
  }
  downloads?: string[]
  fileSize?: number
}

export type ModrinthPackIndex = {
  formatVersion: number
  game: string
  versionId: string
  name: string
  summary?: string
  files?: ModrinthPackFile[]
  dependencies?: Record<string, string>
}

export type ModrinthVersion = {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  game_versions: string[]
  loaders: string[]
  dependencies?: Array<{
    version_id?: string | null
    project_id?: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }>
  files: ModrinthVersionFile[]
}

export type CurseForgeFile = {
  id: number
  modId: number
  displayName: string
  fileName: string
  releaseType: number
  fileDate?: string
  fileLength?: number
  downloadUrl?: string | null
  gameVersions?: string[]
  isAvailable?: boolean
  hashes?: Array<{ value: string; algo: number }>
  dependencies?: Array<{ modId: number; relationType: number }>
}

export type CurseForgeMod = {
  id: number
  name: string
  slug: string
  summary?: string
  downloadCount?: number
  allowModDistribution?: boolean
  isAvailable?: boolean
  classId?: number
  links?: { websiteUrl?: string }
  authors?: Array<{ name?: string }>
  logo?: { thumbnailUrl?: string; url?: string }
  latestFiles?: CurseForgeFile[]
}

export type InstalledContentFile = {
  filename: string
  path: string
  hashes?: Record<string, string>
  dependency: boolean
}

export type InstalledModrinthItem = InstalledContentFile & {
  projectId: string
  projectType?: ModrinthProjectType
  versionId: string
  versionNumber: string
  versionName: string
  skipped: boolean
}

export type InstalledContentRecord = {
  projectId: string
  title: string
  projectType: ModrinthProjectType
  iconUrl?: string | null
  versionId: string
  versionNumber: string
  versionName: string
  gameVersion: string
  loader: string
  files: InstalledContentFile[]
  installedAt: string
  updatedAt: string
  provider?: ContentProvider
}

export type InstanceContentManifest = {
  version: 1
  projects: Record<string, InstalledContentRecord>
}

export type ExportInstanceMrpackResult = {
  success: boolean
  canceled?: boolean
  filePath?: string
  modrinthFiles?: number
  overrideFiles?: number
  totalFiles?: number
}

export type RunningGame = {
  process: any
  instanceId: string
  instanceName: string
  minecraftVersion: string
  playerName: string
  playerUuid: string
  gameDirectory: string
  playerTextureId: string | null
  gamePid: number
  startedAt: number
  loader: string
  accountType: 'msa' | 'offline' | 'unknown'
  telemetrySessionId: string
  telemetryActive: boolean
  telemetryStartAcknowledged: boolean
  telemetryQueue?: Promise<void>
  currentServer: MinecraftServerTelemetryState | null
  knownServers: Array<{ canonicalKey: string | null; name: string }>
  badgePresenceId: string
  badgePresenceActive: boolean
  badgePresenceStartAcknowledged: boolean
  badgePresenceQueue?: Promise<void>
  lanPort?: number
  logStream?: fs.WriteStream | null
  stopRequestedAt?: number
}

export type LaunchSession = {
  id: string
  launcher: InstanceType<typeof Client>
  abortController: AbortController
  cancelled: boolean
  startedAt: number
  lastProgressAt: number
  instanceId?: string
  instanceName?: string
  logStream?: fs.WriteStream | null
  childProcess?: any
}

type InstallTask = {
  id: string
  label: string
  abortController: AbortController
  cancelled: boolean
  startedAt: number
}

const HTTP_HEADERS = {
  'User-Agent': PROVIDER_USER_AGENT
}

type StatsApiRequestOptions = {
  method?: string
  timeout?: number
  headers?: Record<string, string>
  body?: unknown
}

class StatsApiRequestError extends Error {
  status?: number
  detail?: string

  constructor(message: string, status?: number, detail?: string) {
    super(message)
    this.name = 'StatsApiRequestError'
    this.status = status
    this.detail = detail
  }
}

const requestStatsApiJson = async <T>(
  endpoint: string,
  options: StatsApiRequestOptions = {}
): Promise<T> => {
  const controller = new AbortController()
  const timeoutMs = Math.max(1000, options.timeout || 15000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${STATS_API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  try {
    const response = await net.fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...HTTP_HEADERS,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    })
    const text = await response.text()
    let data: any = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { detail: text.slice(0, 300) }
      }
    }

    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : ''
      throw new StatsApiRequestError(
        detail || `NamLauncher website returned HTTP ${response.status}.`,
        response.status,
        detail
      )
    }

    return (data || {}) as T
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new StatsApiRequestError('NamLauncher website did not respond in time.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export type CurseForgePackManifest = {
  manifestType?: string
  manifestVersion?: number
  name?: string
  version?: string
  author?: string
  overrides?: string
  minecraft?: {
    version?: string
    modLoaders?: Array<{ id?: string; primary?: boolean }>
  }
  files?: Array<{ projectID?: number; fileID?: number; required?: boolean }>
}
const FABRIC_META_BASE = 'https://meta.fabricmc.net/v2'
const QUILT_META_BASE = 'https://meta.quiltmc.org/v3'
const QUILT_MAVEN_METADATA_URL = 'https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-loader/maven-metadata.xml'
const FORGE_PROMOTIONS_URL = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const FORGE_MAVEN_BASE = 'https://maven.minecraftforge.net'
const NEOFORGE_MAVEN_BASE = 'https://maven.neoforged.net/releases'
const NEOFORGE_METADATA_URL = `${NEOFORGE_MAVEN_BASE}/net/neoforged/neoforge/maven-metadata.xml`
const MOJANG_VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const MODRINTH_API_BASE = 'https://api.modrinth.com/v2'
const MODRINTH_MAX_CONCURRENT_REQUESTS = 4
const MODRINTH_MIN_REQUEST_GAP_MS = 200
const MODRINTH_DIRECT_TIMEOUT_MS = 6500
const MODRINTH_PROXY_TIMEOUT_MS = 8000
const MODRINTH_PROXY_MAX_ATTEMPTS = 2
const MODRINTH_RETRY_MAX_DELAY_MS = 5000
const MODRINTH_METADATA_MAX_BYTES = 16 * 1024 * 1024
const MODRINTH_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const MODRINTH_PROXY_FALLBACK_STATUSES = new Set([404, 408, 425, 500, 502, 503, 504])
const MODRINTH_RETRY_CODES = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_NETWORK',
  'ERR_SOCKET_CLOSED',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN'
])
const DOWNLOAD_INTEGRITY_ERROR_CODE = 'EINTEGRITY'
const DOWNLOAD_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const DOWNLOAD_RETRY_CODES = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_NETWORK',
  'ERR_SOCKET_CLOSED',
  'EPIPE',
  DOWNLOAD_INTEGRITY_ERROR_CODE
])
const PROJECT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const PROJECT_SEARCH_CACHE_STALE_TTL_MS = 24 * 60 * 60 * 1000
const PROJECT_SEARCH_CACHE_LIMIT = 80
const MODRINTH_VERSION_CACHE_TTL_MS = 2 * 60 * 1000
const MODRINTH_VERSION_CACHE_LIMIT = 256
let activeModrinthRequests = 0
let nextModrinthRequestAt = 0
type PendingModrinthRequest = {
  resolve: () => void
  reject: (error: Error) => void
  signal?: AbortSignal
  abort?: () => void
  timer?: ReturnType<typeof setTimeout>
}
const pendingModrinthRequests: PendingModrinthRequest[] = []
type ProjectSearchResult = { hits: any[]; total_hits: number; stale?: boolean }
type ProjectSearchCacheEntry = { result: ProjectSearchResult; storedAt: number }
const projectSearchCache = new Map<string, ProjectSearchCacheEntry>()
const projectSearchInFlight = new Map<string, Promise<ProjectSearchResult>>()
const modrinthVersionCache = new Map<string, { versions: ModrinthVersion[]; storedAt: number }>()
const modrinthVersionRequests = new Map<string, Promise<ModrinthVersion[]>>()
let activeModrinthSearchController: AbortController | null = null
let activeCurseForgeSearchController: AbortController | null = null
const fileDownloadLocks = new Map<string, Promise<void>>()

// Author/creator: nattapat2871 (https://nattapat2871.me)
const withFileDownloadLock = async <T>(filePath: string, operation: () => Promise<T>) => {
  const resolvedPath = path.resolve(filePath)
  const key = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
  const previous = fileDownloadLocks.get(key) || Promise.resolve()
  let releaseCurrent: () => void = () => undefined
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  fileDownloadLocks.set(key, current)

  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    releaseCurrent()
    if (fileDownloadLocks.get(key) === current) fileDownloadLocks.delete(key)
  }
}

const getCachedProjectSearchResult = (cacheKey: string, allowStale = false) => {
  const cached = projectSearchCache.get(cacheKey)
  if (!cached) return null
  const cacheAge = Date.now() - cached.storedAt
  if (cacheAge > PROJECT_SEARCH_CACHE_STALE_TTL_MS) {
    projectSearchCache.delete(cacheKey)
    return null
  }
  if (!allowStale && cacheAge > PROJECT_SEARCH_CACHE_TTL_MS) return null
  return cached.result
}

const setCachedProjectSearchResult = (cacheKey: string, result: ProjectSearchResult) => {
  projectSearchCache.set(cacheKey, { result, storedAt: Date.now() })
  while (projectSearchCache.size > PROJECT_SEARCH_CACHE_LIMIT) {
    const oldestKey = projectSearchCache.keys().next().value
    if (!oldestKey) break
    projectSearchCache.delete(oldestKey)
  }
}

const setCachedModrinthVersions = (cacheKey: string, versions: ModrinthVersion[]) => {
  const now = Date.now()
  for (const [key, entry] of modrinthVersionCache) {
    if (now - entry.storedAt >= MODRINTH_VERSION_CACHE_TTL_MS) {
      modrinthVersionCache.delete(key)
    }
  }

  modrinthVersionCache.delete(cacheKey)
  modrinthVersionCache.set(cacheKey, { versions, storedAt: now })
  while (modrinthVersionCache.size > MODRINTH_VERSION_CACHE_LIMIT) {
    const oldestKey = modrinthVersionCache.keys().next().value
    if (!oldestKey) break
    modrinthVersionCache.delete(oldestKey)
  }
}

const createModrinthCanceledError = () => new axios.CanceledError('Modrinth request canceled')

const cleanupPendingModrinthRequest = (request: PendingModrinthRequest) => {
  if (request.abort) request.signal?.removeEventListener('abort', request.abort)
  request.abort = undefined
}

const pumpModrinthRequests = () => {
  while (activeModrinthRequests < MODRINTH_MAX_CONCURRENT_REQUESTS && pendingModrinthRequests.length > 0) {
    const request = pendingModrinthRequests.shift()
    if (!request) break
    if (request.signal?.aborted) {
      cleanupPendingModrinthRequest(request)
      request.reject(createModrinthCanceledError())
      continue
    }

    activeModrinthRequests += 1
    const scheduledAt = Math.max(Date.now(), nextModrinthRequestAt)
    nextModrinthRequestAt = scheduledAt + MODRINTH_MIN_REQUEST_GAP_MS
    const start = () => {
      request.timer = undefined
      cleanupPendingModrinthRequest(request)
      request.resolve()
    }
    const delay = Math.max(0, scheduledAt - Date.now())
    if (delay === 0) start()
    else request.timer = setTimeout(start, delay)
  }
}

const acquireModrinthSlot = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(createModrinthCanceledError())
    return
  }

  const request: PendingModrinthRequest = { resolve, reject, signal }
  const abort = () => {
    const queuedIndex = pendingModrinthRequests.indexOf(request)
    if (queuedIndex >= 0) {
      pendingModrinthRequests.splice(queuedIndex, 1)
      cleanupPendingModrinthRequest(request)
      reject(createModrinthCanceledError())
      return
    }
    if (request.timer !== undefined) {
      clearTimeout(request.timer)
      request.timer = undefined
      activeModrinthRequests = Math.max(0, activeModrinthRequests - 1)
      cleanupPendingModrinthRequest(request)
      reject(createModrinthCanceledError())
      pumpModrinthRequests()
    }
  }
  request.abort = abort
  signal?.addEventListener('abort', abort, { once: true })
  pendingModrinthRequests.push(request)
  pumpModrinthRequests()
})

const releaseModrinthSlot = () => {
  activeModrinthRequests = Math.max(0, activeModrinthRequests - 1)
  pumpModrinthRequests()
}
type AppIcon = {
  path: string
  image: NativeImage
}

const getRetryAfterMs = (error: unknown, fallbackMs: number) => {
  if (!axios.isAxiosError(error)) return fallbackMs
  const raw = error.response?.headers?.['retry-after']
  const retryAfter = Array.isArray(raw) ? raw[0] : raw
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 15000)
  const retryAt = Date.parse(String(retryAfter || ''))
  if (Number.isFinite(retryAt)) return Math.min(Math.max(0, retryAt - Date.now()), 15000)
  return fallbackMs
}

const getGenericRetryAfterMs = (error: unknown, fallbackMs: number) => {
  if (axios.isAxiosError(error)) return getRetryAfterMs(error, fallbackMs)
  return fallbackMs
}

const getErrorCode = (error: unknown) => {
  if (axios.isAxiosError(error)) return error.code || ''
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' ? code : ''
}

const shouldRetryDownloadError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status && DOWNLOAD_RETRY_STATUSES.has(status)) return true
  }
  const code = getErrorCode(error)
  return Boolean(code && DOWNLOAD_RETRY_CODES.has(code))
}

const shouldRetryModrinthRequest = (error: unknown) => {
  if (!axios.isAxiosError(error)) return false
  if (error.code === 'ERR_CANCELED') return false
  const status = error.response?.status
  if (status && MODRINTH_RETRY_STATUSES.has(status)) return true
  return Boolean(error.code && MODRINTH_RETRY_CODES.has(error.code))
}

const getModrinthRetryDelay = (error: unknown, attempt: number) => {
  const backoffMs = Math.min(500 * (2 ** attempt), MODRINTH_RETRY_MAX_DELAY_MS)
  const jitterMs = Math.floor(Math.random() * Math.min(250, Math.max(1, backoffMs / 2)))
  const retryAfterMs = getRetryAfterMs(error, backoffMs + jitterMs)
  return Math.min(Math.max(retryAfterMs, 0), MODRINTH_RETRY_MAX_DELAY_MS)
}

const waitForModrinthRetry = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(createModrinthCanceledError())
    return
  }

  const finish = () => {
    signal?.removeEventListener('abort', abort)
    resolve()
  }
  const abort = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    reject(createModrinthCanceledError())
  }
  const timer = setTimeout(finish, milliseconds)
  signal?.addEventListener('abort', abort, { once: true })
})

const normalizeModrinthPathSegment = (segment: string) => encodeURIComponent(decodeURIComponent(segment))

const getModrinthProxyUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    const apiBase = new URL(MODRINTH_API_BASE)
    if (parsed.origin !== apiBase.origin) return null

    const apiPrefix = apiBase.pathname.replace(/\/+$/, '')
    if (!parsed.pathname.startsWith(`${apiPrefix}/`)) return null
    const segments = parsed.pathname.slice(apiPrefix.length).split('/').filter(Boolean)

    if (segments.length === 1 && segments[0] === 'search') {
      return `${MODRINTH_PROXY_BASE}/search`
    }
    if (segments.length === 2 && segments[0] === 'project') {
      return `${MODRINTH_PROXY_BASE}/projects/${normalizeModrinthPathSegment(segments[1])}`
    }
    if (segments.length === 3 && segments[0] === 'project' && segments[2] === 'version') {
      return `${MODRINTH_PROXY_BASE}/projects/${normalizeModrinthPathSegment(segments[1])}/versions`
    }
    if (segments.length === 2 && segments[0] === 'version') {
      return `${MODRINTH_PROXY_BASE}/versions/${normalizeModrinthPathSegment(segments[1])}`
    }
  } catch {
    return null
  }

  return null
}

const shouldFallbackToModrinthProxy = (error: unknown) => {
  if (!axios.isAxiosError(error)) return false
  if (error.code === 'ERR_CANCELED') return false
  const status = error.response?.status
  if (status && (MODRINTH_PROXY_FALLBACK_STATUSES.has(status) || status === 429)) return true
  return Boolean(!status && error.code && MODRINTH_RETRY_CODES.has(error.code))
}

const requestModrinthEndpoint = async <T>(
  url: string,
  config: Record<string, any>,
  source: 'proxy' | 'direct'
): Promise<T> => {
  await acquireModrinthSlot(config.signal)
  try {
    const response = await axios.get<T>(url, {
      ...config,
      timeout: Math.min(
        Number(config.timeout || 30000),
        source === 'proxy' ? MODRINTH_PROXY_TIMEOUT_MS : MODRINTH_DIRECT_TIMEOUT_MS
      ),
      maxContentLength: MODRINTH_METADATA_MAX_BYTES,
      maxBodyLength: MODRINTH_METADATA_MAX_BYTES,
      headers: {
        ...HTTP_HEADERS,
        ...(source === 'proxy' ? { 'X-NamLauncher-Client': getClientInstallId() } : {}),
        ...(config.headers || {})
      }
    })
    return response.data
  } finally {
    releaseModrinthSlot()
  }
}

const requestModrinthProxyWithRetry = async <T>(
  proxyUrl: string,
  config: Record<string, any>
): Promise<T> => {
  for (let attempt = 0; attempt < MODRINTH_PROXY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestModrinthEndpoint<T>(proxyUrl, config, 'proxy')
    } catch (err) {
      if (attempt + 1 >= MODRINTH_PROXY_MAX_ATTEMPTS || !shouldRetryModrinthRequest(err)) throw err

      const retryDelay = getModrinthRetryDelay(err, attempt)
      log.warn(`Modrinth proxy request failed; retrying in ${retryDelay}ms.`, getCompactErrorLog(err))
      await waitForModrinthRetry(retryDelay, config.signal)
    }
  }

  throw new Error('Modrinth proxy request failed.')
}

const requestModrinth = async <T>(url: string, config: Record<string, any> = {}): Promise<T> => {
  const proxyUrl = getModrinthProxyUrl(url)
  if (!proxyUrl) return requestModrinthEndpoint<T>(url, config, 'direct')

  try {
    return await requestModrinthEndpoint<T>(url, config, 'direct')
  } catch (err) {
    if (!shouldFallbackToModrinthProxy(err)) throw err
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    log.warn(`Direct Modrinth API unavailable${status ? ` (HTTP ${status})` : ''}; falling back to the NamLauncher proxy.`)
    return requestModrinthProxyWithRetry<T>(proxyUrl, config)
  }
}

const normalizePathForCompare = (value: string) => {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

const isSamePath = (left: string, right: string) => {
  return normalizePathForCompare(left) === normalizePathForCompare(right)
}

const isPathAtOrInside = (childPath: string, parentPath: string) => {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relativePath === '' || (Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

const canWriteToDirectory = (directory: string) => {
  try {
    fs.mkdirSync(directory, { recursive: true })
    const probePath = path.join(directory, `.namlauncher-write-test-${process.pid}-${Date.now()}`)
    fs.writeFileSync(probePath, 'ok', 'utf8')
    fs.rmSync(probePath, { force: true })
    return true
  } catch {
    return false
  }
}

const getPackagedInstallRoot = () => {
  return path.dirname(process.execPath)
}

const DATA_LOCATION_FILE = 'data-location.json'
const DATA_LOCATION_BACKUP_FILE = `${DATA_LOCATION_FILE}.backup`
const DATA_CLEANUP_FILE = 'pending-data-cleanup.json'
const UPDATE_CLEANUP_FILE = 'pending-launcher-update-cleanup.json'
const ROOT_FOLDER_NAME = 'NamLauncher'
const LAUNCHER_FOLDER_NAME = 'Launcher'
const DATA_FOLDER_NAME = 'NamLauncher-data'
const UPDATE_FOLDER_NAME = 'updates'

const getPackagedLauncherHomePath = () => {
  const installRoot = getPackagedInstallRoot()
  return path.basename(installRoot).toLowerCase() === LAUNCHER_FOLDER_NAME.toLowerCase()
    ? path.dirname(installRoot)
    : installRoot
}

const getLegacyPackagedInstallDataPaths = () => {
  const installRoot = getPackagedInstallRoot()
  const homeRoot = getPackagedLauncherHomePath()
  return Array.from(new Set([
    path.join(installRoot, 'data'),
    path.resolve(`${installRoot}-data`),
    path.join(homeRoot, 'data'),
    path.resolve(`${homeRoot}-data`)
  ]))
}

const getPackagedInstallDataPath = () => {
  return path.join(getPackagedLauncherHomePath(), DATA_FOLDER_NAME)
}

const getDataLocationConfigPath = (defaultUserDataPath: string) => {
  return path.join(defaultUserDataPath, DATA_LOCATION_FILE)
}

const getLauncherRootForSelectedPath = (selectedPath: string) => {
  const resolved = path.resolve(selectedPath)
  const basename = path.basename(resolved).toLowerCase()
  const parentBasename = path.basename(path.dirname(resolved)).toLowerCase()

  if (basename === DATA_FOLDER_NAME.toLowerCase()) return path.dirname(resolved)
  if (basename === LAUNCHER_FOLDER_NAME.toLowerCase() && parentBasename === ROOT_FOLDER_NAME.toLowerCase()) {
    return path.dirname(resolved)
  }
  if (basename === ROOT_FOLDER_NAME.toLowerCase()) return resolved
  return path.join(resolved, ROOT_FOLDER_NAME)
}

const normalizeLauncherDataTarget = (selectedPath: string) => {
  const resolved = path.resolve(selectedPath)
  return path.basename(resolved).toLowerCase() === DATA_FOLDER_NAME.toLowerCase()
    ? resolved
    : path.join(getLauncherRootForSelectedPath(resolved), DATA_FOLDER_NAME)
}

const readConfiguredDataPath = (defaultUserDataPath: string) => {
  const configPaths = [
    getDataLocationConfigPath(defaultUserDataPath),
    path.join(defaultUserDataPath, DATA_LOCATION_BACKUP_FILE)
  ]
  for (const configPath of configPaths) {
    try {
      if (!fs.existsSync(configPath)) continue
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { dataPath?: string }
      const dataPath = typeof config.dataPath === 'string' ? config.dataPath.trim() : ''
      if (dataPath) return dataPath
    } catch {
      // Try the recoverable backup written during an interrupted atomic replacement.
    }
  }
  return ''
}

let recoveredLegacyDataPath = ''

const resolveUserDataPath = (defaultUserDataPath: string) => {
  const configuredDataPath = String(process.env.NAMLAUNCHER_DATA_DIR || '').trim()
    || readConfiguredDataPath(defaultUserDataPath)
  const packagedDataPath = app.isPackaged ? getPackagedInstallDataPath() : ''
  const candidatePath = configuredDataPath
    ? path.resolve(configuredDataPath)
    : app.isPackaged
      ? packagedDataPath
      : defaultUserDataPath

  if (!configuredDataPath && app.isPackaged && process.platform === 'win32') {
    recoveredLegacyDataPath = recoverLegacyLauncherDataPath({
      defaultDataPath: defaultUserDataPath,
      packagedDataPath
    })
    if (recoveredLegacyDataPath && canWriteToDirectory(recoveredLegacyDataPath)) {
      return recoveredLegacyDataPath
    }
  }

  if (canWriteToDirectory(candidatePath)) return candidatePath
  return defaultUserDataPath
}

const defaultUserDataPath = app.getPath('userData')
const dataLocationConfigPath = getDataLocationConfigPath(defaultUserDataPath)
const selectedUserDataPath = resolveUserDataPath(defaultUserDataPath)

if (!isSamePath(selectedUserDataPath, defaultUserDataPath)) {
  app.setPath('userData', selectedUserDataPath)
}

const legacyUserDataPath = defaultUserDataPath
const userDataPath = app.getPath('userData')
const accountsPath = path.join(userDataPath, 'accounts.json')
const settingsPath = path.join(userDataPath, 'settings.json')
const launcherDiscordAccountPath = path.join(userDataPath, 'discord-account.json')
const clientIdentityPath = path.join(userDataPath, 'client.json')
const curseForgeConfigPath = path.join(userDataPath, 'curseforge.json')
const imageCacheDir = path.join(userDataPath, 'cache', 'images')
const skinsDirectory = path.join(userDataPath, 'skins')
const skinsLibraryPath = path.join(skinsDirectory, 'skins.json')
const DEFAULT_DISCORD_CLIENT_ID = '1515299686637109388'
const APP_ICON_FILE = 'NamLauncher-icon.png'
const STATS_API_BASE = !app.isPackaged && process.env.NAMLAUNCHER_API_BASE
  ? String(process.env.NAMLAUNCHER_API_BASE).replace(/\/+$/, '')
  : 'https://namlauncher.nattapat2871.me'
const MODRINTH_PROXY_BASE = `${STATS_API_BASE}/api/v1/modrinth`
const MAX_LAUNCHER_INSTALLER_BYTES = 512 * 1024 * 1024
const MAX_CONTENT_DOWNLOAD_BYTES = 1024 * 1024 * 1024
const MAX_CACHED_IMAGE_BYTES = 1024 * 1024
const SAFE_CACHED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_ZIP_METADATA_ENTRY_BYTES = 512 * 1024
const MAX_MODPACK_INDEX_BYTES = 8 * 1024 * 1024
const MAX_MODPACK_ICON_BYTES = 1_500_000
const MAX_MODPACK_OVERRIDE_TOTAL_BYTES = 1024 * 1024 * 1024
const MAX_MODPACK_OVERRIDE_ENTRY_BYTES = 256 * 1024 * 1024
const MAX_MODPACK_OVERRIDE_FILES = 20_000
declare const __NAMLAUNCHER_ERROR_REPORT_TOKEN__: string
const PUBLIC_ERROR_REPORT_TOKEN = 'namlauncher-error-report-public-v1-nattapat2871'
const INJECTED_ERROR_REPORT_TOKEN = (typeof __NAMLAUNCHER_ERROR_REPORT_TOKEN__ === 'string'
  ? __NAMLAUNCHER_ERROR_REPORT_TOKEN__
  : '').trim()
const ERROR_REPORT_TOKEN = (INJECTED_ERROR_REPORT_TOKEN || String(process.env.NAMLAUNCHER_ERROR_REPORT_TOKEN || '') || PUBLIC_ERROR_REPORT_TOKEN).trim()
const CURSEFORGE_PROXY_BASE = `${STATS_API_BASE}/api/v1/curseforge`
const CURSEFORGE_CLASS_IDS: Record<ModrinthProjectType, number> = {
  mod: 6,
  modpack: 4471,
  resourcepack: 12,
  shader: 6552
}
const DEFAULT_JAVA_ARGS = [
  '-Djava.net.preferIPv4Stack=true',
  '-Djava.net.preferIPv6Addresses=false',
  '-Dsun.net.inetaddr.ttl=30',
  '-Dsun.net.inetaddr.negative.ttl=0',
  '-Dnamlauncher.discord.detect=net.minecraft.client.main.Main'
]
const JAVA_MODULE_OPEN_ARGS = [
  '--add-opens=java.base/java.lang.invoke=ALL-UNNAMED'
]
const LAUNCH_CANCELLED_MESSAGE = 'Launch cancelled by user.'
const LAUNCH_STALE_TIMEOUT_MS = 20 * 60 * 1000
const ERROR_REPORT_TITLE_MAX_LENGTH = 180
const ERROR_REPORT_CONTEXT_MAX_LENGTH = 180
const ERROR_REPORT_MESSAGE_MAX_LENGTH = 12000
const ERROR_REPORT_LOGS_MAX_LENGTH = 220000
const ERROR_REPORT_INITIAL_LOG_WAIT_MS = 300
const ERROR_REPORT_HARDWARE_TIMEOUT_MS = 3000
const AUTHLIB_INJECTOR_VERSION = '1.2.7'
const AUTHLIB_INJECTOR_FILE = `authlib-injector-${AUTHLIB_INJECTOR_VERSION}.jar`
const AUTHLIB_INJECTOR_URL = `https://github.com/yushijinhun/authlib-injector/releases/download/v${AUTHLIB_INJECTOR_VERSION}/${AUTHLIB_INJECTOR_FILE}`
const AUTHLIB_INJECTOR_SHA256 = 'eaf14bc5acffc7d885bd5bd5942b99f36d6299302beae356b2fc5807fe42652b' // gitleaks:allow -- public release checksum

const getLocalDateStamp = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getNextDatedLogArchivePath = (logsDirectory: string) => {
  const stamp = getLocalDateStamp()
  let index = 1
  let archivePath = path.join(logsDirectory, `${stamp}-${index}.log.gz`)
  while (fs.existsSync(archivePath)) {
    index += 1
    archivePath = path.join(logsDirectory, `${stamp}-${index}.log.gz`)
  }
  return archivePath
}

const archiveLogFile = (sourcePath: string, logsDirectory: string) => {
  if (!fs.existsSync(sourcePath)) return

  const stat = fs.statSync(sourcePath)
  if (stat.size <= 0) {
    fs.rmSync(sourcePath, { force: true })
    return
  }

  fs.mkdirSync(logsDirectory, { recursive: true })
  const archivePath = getNextDatedLogArchivePath(logsDirectory)
  const compressed = zlib.gzipSync(fs.readFileSync(sourcePath))
  fs.writeFileSync(archivePath, compressed)
  fs.rmSync(sourcePath, { force: true })
}

const prepareLauncherLogPath = () => {
  const logsDirectory = path.join(userDataPath, 'logs')
  fs.mkdirSync(logsDirectory, { recursive: true })

  archiveLogFile(path.join(userDataPath, 'app.logs'), logsDirectory)
  archiveLogFile(path.join(userDataPath, 'app.old.logs'), logsDirectory)

  const currentLogPath = path.join(logsDirectory, 'app.logs')
  archiveLogFile(currentLogPath, logsDirectory)
  fs.writeFileSync(currentLogPath, '', { encoding: 'utf8', flag: 'w' })
  return currentLogPath
}

fs.mkdirSync(userDataPath, { recursive: true })
if (process.platform === 'win32') {
  app.setAppUserModelId('com.namlauncher.app')
}

// UI automation may run beside an installed launcher, but this escape hatch is
// deliberately impossible in packaged builds so production keeps one instance.
const allowIsolatedUiQaInstance = !app.isPackaged && process.env.NAMLAUNCHER_UI_QA === '1'
const hasSingleInstanceLock = allowIsolatedUiQaInstance || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
  process.exit(0)
}

const MIGRATABLE_USER_DATA_ENTRIES = [
  'accounts.json',
  'skins',
  'settings.json',
  'client.json',
  'curseforge.json',
  'instances',
  'cache',
  'runtime',
  'logs',
  'app.logs',
  'Local Storage',
  'Session Storage',
  'IndexedDB',
  'Preferences'
]

const migrateUserDataEntries = (sourceRoot: string, sourceLabel: string) => {
  if (isSamePath(sourceRoot, userDataPath) || !fs.existsSync(sourceRoot)) return

  for (const entryName of MIGRATABLE_USER_DATA_ENTRIES) {
    const sourcePath = path.join(sourceRoot, entryName)
    const targetPath = path.join(userDataPath, entryName)
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) continue

    try {
      fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: false,
        errorOnExist: false
      })
      log.info(`Migrated ${entryName} from ${sourceLabel}.`)
    } catch (err) {
      log.warn(`Failed to migrate ${entryName} from ${sourceLabel}.`, err)
    }
  }
}

const isPathInside = (childPath: string, parentPath: string) => {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

const writeDataLocationConfig = (targetDataPath: string) => {
  fs.mkdirSync(defaultUserDataPath, { recursive: true })
  const temporaryPath = `${dataLocationConfigPath}.${crypto.randomUUID()}.tmp`
  const backupPath = path.join(defaultUserDataPath, DATA_LOCATION_BACKUP_FILE)
  let movedExistingConfig = false
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify({
      dataPath: path.resolve(targetDataPath),
      updatedAt: new Date().toISOString()
    }, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    if (fs.existsSync(dataLocationConfigPath)) {
      fs.rmSync(backupPath, { force: true })
      fs.renameSync(dataLocationConfigPath, backupPath)
      movedExistingConfig = true
    }
    fs.renameSync(temporaryPath, dataLocationConfigPath)
    fs.rmSync(backupPath, { force: true })
  } catch (error) {
    if (movedExistingConfig && !fs.existsSync(dataLocationConfigPath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, dataLocationConfigPath)
    }
    throw error
  } finally {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch (cleanupError) {
      log.warn('Could not remove a temporary launcher data-location file.', cleanupError)
    }
  }
}

const persistLauncherDataLocationForUpdate = () => {
  const configuredPath = readConfiguredDataPath(defaultUserDataPath)
  if (configuredPath && !isSamePath(configuredPath, userDataPath)) {
    throw new Error('The configured NamLauncher game data folder is unavailable. Reconnect that drive before updating.')
  }
  writeDataLocationConfig(userDataPath)
  const persistedPath = readConfiguredDataPath(defaultUserDataPath)
  if (!persistedPath || !isSamePath(persistedPath, userDataPath)) {
    throw new Error('NamLauncher could not preserve the current game data folder for the update.')
  }
  log.info(`Preserved launcher data location for update: ${userDataPath}`)
}

const persistImplicitPackagedDataLocation = () => {
  if (
    !app.isPackaged
    || String(process.env.NAMLAUNCHER_DATA_DIR || '').trim()
    || readConfiguredDataPath(defaultUserDataPath)
    || isSamePath(userDataPath, defaultUserDataPath)
  ) return

  writeDataLocationConfig(userDataPath)
}

const getLauncherDataLocation = () => {
  const configuredPath = readConfiguredDataPath(defaultUserDataPath)
  const currentRoot = getLauncherRootForSelectedPath(userDataPath)
  return {
    currentPath: userDataPath,
    currentRoot,
    launcherFolderName: LAUNCHER_FOLDER_NAME,
    defaultPath: defaultUserDataPath,
    packagedPath: app.isPackaged ? getPackagedInstallDataPath() : defaultUserDataPath,
    configuredPath: configuredPath ? path.resolve(configuredPath) : null,
    configPath: dataLocationConfigPath,
    folderName: DATA_FOLDER_NAME,
    rootFolderName: ROOT_FOLDER_NAME,
    restartRequired: false
  }
}

const copyLauncherDataEntries = (targetDataPath: string) => {
  fs.mkdirSync(targetDataPath, { recursive: true })
  const copiedEntries: string[] = []
  const conflictingEntries = MIGRATABLE_USER_DATA_ENTRIES.filter((entryName) => (
    fs.existsSync(path.join(userDataPath, entryName))
    && fs.existsSync(path.join(targetDataPath, entryName))
  ))

  if (conflictingEntries.length > 0) {
    throw new Error(
      `The selected data folder already contains NamLauncher data (${conflictingEntries.join(', ')}). `
      + 'Choose an empty parent folder so existing data is not mixed or replaced.'
    )
  }

  for (const entryName of MIGRATABLE_USER_DATA_ENTRIES) {
    const sourcePath = path.join(userDataPath, entryName)
    const targetPath = path.join(targetDataPath, entryName)
    if (!fs.existsSync(sourcePath)) continue

    try {
      fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
        filter: (source) => path.basename(source).toLowerCase() !== 'lock'
      })
      copiedEntries.push(entryName)
    } catch (err) {
      log.warn(`Failed to copy launcher data entry: ${entryName}`, err)
      for (const copiedEntry of [...copiedEntries, entryName]) {
        const copiedPath = path.join(targetDataPath, copiedEntry)
        try {
          fs.rmSync(copiedPath, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 150
          })
        } catch (rollbackError) {
          log.warn(`Failed to roll back copied launcher data entry: ${copiedEntry}`, rollbackError)
        }
      }
      throw new Error(
        `Could not copy NamLauncher data entry "${entryName}". `
        + 'The current data folder remains active and was not removed.'
      )
    }
  }

  return { copiedEntries }
}

const writePendingDataCleanup = (targetDataPath: string, sourcePath: string, entries: string[]) => {
  fs.mkdirSync(targetDataPath, { recursive: true })
  fs.writeFileSync(path.join(targetDataPath, DATA_CLEANUP_FILE), JSON.stringify({
    sourcePath: path.resolve(sourcePath),
    targetPath: path.resolve(targetDataPath),
    entries,
    createdAt: new Date().toISOString()
  }, null, 2), 'utf8')
}

const removeMigratedEntry = (sourceRoot: string, entryName: string) => {
  const sourcePath = path.join(sourceRoot, entryName)
  const targetPath = path.join(userDataPath, entryName)

  if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) return false
  if (isSamePath(sourcePath, targetPath)) return false
  if (!isSamePath(sourceRoot, path.dirname(sourcePath)) && !isPathInside(sourcePath, sourceRoot)) return false
  if (isSamePath(sourcePath, userDataPath) || isPathInside(userDataPath, sourcePath)) return false

  fs.rmSync(sourcePath, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 150
  })
  return true
}

const cleanupPendingMovedData = () => {
  const cleanupPath = path.join(userDataPath, DATA_CLEANUP_FILE)
  if (!fs.existsSync(cleanupPath)) return

  try {
    const cleanup = JSON.parse(fs.readFileSync(cleanupPath, 'utf8')) as {
      sourcePath?: string
      targetPath?: string
      entries?: string[]
    }
    const sourcePath = cleanup.sourcePath ? path.resolve(cleanup.sourcePath) : ''
    const targetPath = cleanup.targetPath ? path.resolve(cleanup.targetPath) : ''
    const entries = Array.isArray(cleanup.entries) && cleanup.entries.length > 0
      ? cleanup.entries
      : MIGRATABLE_USER_DATA_ENTRIES

    if (!sourcePath || !targetPath || !isSamePath(targetPath, userDataPath) || isSamePath(sourcePath, userDataPath)) {
      fs.rmSync(cleanupPath, { force: true })
      return
    }

    let removedEntries = 0
    for (const entryName of entries) {
      try {
        if (removeMigratedEntry(sourcePath, entryName)) removedEntries += 1
      } catch (err) {
        log.warn(`Could not remove old migrated data entry: ${entryName}`, err)
      }
    }

    if (!isSamePath(sourcePath, defaultUserDataPath)) {
      try {
        const remaining = fs.existsSync(sourcePath) ? fs.readdirSync(sourcePath) : []
        if (remaining.length === 0) fs.rmSync(sourcePath, { recursive: true, force: true })
      } catch (err) {
        log.warn('Could not remove old empty data folder.', err)
      }
    }

    fs.rmSync(cleanupPath, { force: true })
    log.info(`Cleaned ${removedEntries} migrated data entries from previous location: ${sourcePath}`)
  } catch (err) {
    log.warn('Failed to process pending data cleanup.', err)
  }
}

const migrateInstallLocalUserData = () => {
  migrateUserDataEntries(legacyUserDataPath, 'Electron default data directory')

  if (app.isPackaged) {
    for (const legacyPath of getLegacyPackagedInstallDataPaths()) {
      migrateUserDataEntries(legacyPath, 'legacy install-local data directory')
    }
  }
}

const migrateLegacyAccounts = () => {
  const legacyAccountsPath = path.join(app.getPath('appData'), 'namlauncher', 'accounts.json')
  if (fs.existsSync(accountsPath) || !fs.existsSync(legacyAccountsPath)) return

  try {
    fs.copyFileSync(legacyAccountsPath, accountsPath)
  } catch (err) {
    log.warn('Failed to migrate legacy accounts file.', err)
  }
}

const cleanupLauncherInstanceLogs = () => {
  const instancesRoot = path.join(userDataPath, 'instances')
  if (!fs.existsSync(instancesRoot)) return

  for (const entry of fs.readdirSync(instancesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const logsDirectory = path.resolve(instancesRoot, entry.name, 'logs')
    if (!isPathInside(logsDirectory, instancesRoot) || !fs.existsSync(logsDirectory)) continue

    try {
      fs.rmSync(logsDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
      log.info(`Removed legacy launcher instance logs: ${logsDirectory}`)
    } catch (err) {
      log.warn(`Failed to remove legacy launcher instance logs: ${logsDirectory}`, err)
    }
  }
}

const getLauncherUpdateDownloadDirectory = () => path.join(userDataPath, UPDATE_FOLDER_NAME)

const isLauncherUpdateDownloadPath = (filePath: string) => {
  const updateDirectory = getLauncherUpdateDownloadDirectory()
  return isPathInside(path.resolve(filePath), updateDirectory)
}

const isLauncherUpdateFileName = (fileName: string) => {
  return /^NamLauncher-[A-Za-z0-9._-]+-(?:Installer(?:-[A-Za-z0-9._-]+)?\.exe|Windows-x64(?:-[A-Za-z0-9._-]+)?\.zip)(?:\.download(?:-[A-Za-z0-9._-]+)?)?$/i.test(fileName)
}

const removeLauncherUpdateDownloadFile = (filePath: string) => {
  const resolvedPath = path.resolve(filePath)
  if (!isLauncherUpdateDownloadPath(resolvedPath) || !isLauncherUpdateFileName(path.basename(resolvedPath))) return false
  if (!fs.existsSync(resolvedPath)) return false
  fs.rmSync(resolvedPath, { force: true, maxRetries: 6, retryDelay: 300 })
  return true
}

const cleanupLauncherUpdateDownloadDirectory = (keepPath?: string) => {
  const updateDirectory = getLauncherUpdateDownloadDirectory()
  if (!fs.existsSync(updateDirectory)) return
  const keepResolvedPath = keepPath ? path.resolve(keepPath) : ''

  for (const entry of fs.readdirSync(updateDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !isLauncherUpdateFileName(entry.name)) continue
    const filePath = path.join(updateDirectory, entry.name)
    if (keepResolvedPath && isSamePath(filePath, keepResolvedPath)) continue
    try {
      removeLauncherUpdateDownloadFile(filePath)
    } catch (err) {
      log.warn(`Could not remove stale launcher update download: ${filePath}`, err)
    }
  }
}

const writePendingLauncherUpdateCleanup = (installerPath: string, latestVersion: string) => {
  const cleanupPath = path.join(userDataPath, UPDATE_CLEANUP_FILE)
  fs.writeFileSync(cleanupPath, JSON.stringify({
    installerPath: path.resolve(installerPath),
    latestVersion,
    createdAt: new Date().toISOString()
  }, null, 2), 'utf8')
}

const cleanupPendingLauncherUpdateInstaller = (attempt = 1) => {
  const cleanupPath = path.join(userDataPath, UPDATE_CLEANUP_FILE)
  if (!fs.existsSync(cleanupPath)) {
    cleanupLauncherUpdateDownloadDirectory()
    return
  }

  try {
    const cleanup = JSON.parse(fs.readFileSync(cleanupPath, 'utf8')) as {
      installerPath?: string
      latestVersion?: string
    }
    const installerPath = cleanup.installerPath ? path.resolve(cleanup.installerPath) : ''
    let removed = 0
    if (installerPath) {
      if (removeLauncherUpdateDownloadFile(installerPath)) removed += 1
      if (removeLauncherUpdateDownloadFile(`${installerPath}.download`)) removed += 1
    }
    cleanupLauncherUpdateDownloadDirectory()
    fs.rmSync(cleanupPath, { force: true })
    log.info(`Cleaned ${removed} launcher update installer file${removed === 1 ? '' : 's'} after update${cleanup.latestVersion ? ` to ${cleanup.latestVersion}` : ''}.`)
  } catch (err) {
    const retryDelay = getLauncherUpdateCleanupRetryDelay(err, attempt)
    if (retryDelay !== null) {
      log.warn(`Launcher update installer is still locked; cleanup attempt ${attempt} will retry in ${retryDelay}ms.`, err)
      const cleanupRetryTimer = setTimeout(() => cleanupPendingLauncherUpdateInstaller(attempt + 1), retryDelay)
      cleanupRetryTimer.unref?.()
      return
    }
    log.warn('Failed to clean pending launcher update installer.', err)
  }
}

const logPath = prepareLauncherLogPath()
log.transports.file.resolvePathFn = () => logPath
log.initialize({ spyRendererConsole: false })
log.info('--- NamLauncher starting ---')
try {
  persistImplicitPackagedDataLocation()
  if (recoveredLegacyDataPath && isSamePath(recoveredLegacyDataPath, userDataPath)) {
    log.info(`Recovered the existing launcher game-data location: ${userDataPath}`)
  }
  if (readConfiguredDataPath(defaultUserDataPath)) {
    log.info(`Launcher data-location pointer is ready: ${userDataPath}`)
  }
} catch (error) {
  log.warn('Could not preserve the packaged launcher data location for a future installer.', error)
}
log.info(`Launcher version: ${app.getVersion()} (${process.platform}/${process.arch}, Electron ${process.versions.electron || 'unknown'})`)
log.info(`Log file initialized at: ${logPath}`)
log.info(`Data directory: ${userDataPath}`)
if (!isSamePath(selectedUserDataPath, defaultUserDataPath)) {
  log.info(`Using launcher-managed data directory instead of Electron default: ${defaultUserDataPath}`)
}
if (allowIsolatedUiQaInstance) {
  log.info('Skipped legacy data migration for isolated UI QA.')
} else {
  migrateInstallLocalUserData()
  migrateLegacyAccounts()
}
cleanupPendingMovedData()
cleanupPendingLauncherUpdateInstaller()
cleanupLauncherInstanceLogs()

let mainWindow: BrowserWindow | null = null
let rendererResponsivenessMonitor: WindowResponsivenessMonitor | null = null

const isMainRendererInvocation = (event: IpcMainInvokeEvent) => isTrustedRendererSender(mainWindow, event.sender)

const assertMainRendererInvocation = (event: IpcMainInvokeEvent) => {
  if (!isMainRendererInvocation(event)) throw new Error('Unauthorized renderer request.')
}

const trustedIpcHandle = (
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: any[]) => any
) => {
  ipcMain.handle(channel, (event, ...args) => {
    assertMainRendererInvocation(event)
    return listener(event, ...args)
  })
}
let tray: Tray | null = null
const runningGames = new Map<string, RunningGame>()
const activeLaunches = new Map<string, LaunchSession>()
const activeInstallTasks = new Map<string, InstallTask>()
const cancelledInstallTaskIds = new Set<string>()
const notifiedLegacyCompanionVersions = new Set<string>()
const HOME_DISCOVERY_SESSION_SEED = crypto.randomBytes(16).toString('hex')
let onlineHeartbeatTimer: ReturnType<typeof setInterval> | null = null
const LAUNCHER_UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000
let onlineHeartbeatInFlight = false
let launcherMinimizedForGame = false
let launcherRestingInTray = false
let launcherUpdateInstallInFlight = false
let startupUpdatePending = app.isPackaged
let requiredLauncherUpdateVersion: string | null = null
let isAppQuitting = false
let rendererRecoveryAttempts: number[] = []
let lastPublishedError = { signature: '', at: 0 }
let lastGameSessionTelemetryFailureLogAt = 0
let lastPlayerBadgePresenceFailureLogAt = 0
let lastRestrictedModAuditFailureLogAt = 0
const ERROR_REPORT_DEDUP_WINDOW_MS = 30_000
const RENDERER_RECOVERY_WINDOW_MS = 60_000
const MAX_RENDERER_RECOVERIES_PER_WINDOW = 2
const launcherErrorReports = new Map<string, LauncherErrorReport>()
const submittedLauncherErrorReports = new Map<string, string>()
const automaticLauncherErrorSubmissions = new Map<string, Promise<LauncherErrorSubmitResult>>()
let activeErrorReportAccountId: string | null = null

const hasActiveMinecraft = () => runningGames.size > 0 || activeLaunches.size > 0
const getActiveMinecraftCount = () => runningGames.size + activeLaunches.size

const getLatestRunningGame = () => {
  return [...runningGames.values()].sort((left, right) => right.startedAt - left.startedAt)[0] || null
}

const syncDiscordForLauncherState = () => {
  configureDiscordForActiveGames()
}

const cleanupStaleLaunches = () => {
  const now = Date.now()
  for (const [instanceId, launch] of activeLaunches) {
    const lastActiveAt = launch.lastProgressAt || launch.startedAt
    if (now - lastActiveAt < LAUNCH_STALE_TIMEOUT_MS) continue

    launch.cancelled = true
    launch.abortController.abort()
    try {
      if (launch.childProcess && !launch.childProcess.killed) {
        launch.childProcess.kill()
      }
    } catch (err) {
      log.warn(`Failed to kill stale Minecraft launch for ${launch.instanceName || instanceId}.`, err)
    }
    closeRunLog(launch.logStream, 'Launch timed out before Minecraft reported a running process.', launch.instanceId && launch.instanceName
      ? normalizeInstance({ instance: {
          id: launch.instanceId,
          name: launch.instanceName,
          version: 'unknown',
          loader: 'vanilla',
          loaderVersion: ''
        } })
      : undefined)
    activeLaunches.delete(instanceId)
    log.warn(`Cleared stale Minecraft launch session for ${launch.instanceName || instanceId}.`)
  }
}

const isAsarPath = (candidate: string) => /[\\/]app\.asar(?:[\\/]|$)/.test(candidate)

const loadNativeIcon = (candidate: string): AppIcon | null => {
  if (!fs.existsSync(candidate)) return null
  if (app.isPackaged && isAsarPath(candidate)) return null

  try {
    const image = nativeImage.createFromPath(candidate)
    if (image.isEmpty()) return null
    return { path: candidate, image }
  } catch (err) {
    log.warn(`Could not load app icon from ${candidate}.`, err)
    return null
  }
}

const getAppIcon = () => {
  const packagedCandidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'build', 'namlauncher.ico'),
        path.join(process.resourcesPath, APP_ICON_FILE),
        path.join(process.resourcesPath, 'namlauncher-icon.png')
      ]
    : []
  const windowsCandidates = [
    ...packagedCandidates,
    path.join(process.cwd(), 'build', 'namlauncher.ico'),
    path.join(app.getAppPath(), 'build', 'namlauncher.ico'),
    path.join(__dirname, '..', 'build', 'namlauncher.ico')
  ]
  const pngCandidates = [
    ...packagedCandidates,
    path.join(process.cwd(), APP_ICON_FILE),
    path.join(app.getAppPath(), APP_ICON_FILE),
    path.join(app.getAppPath(), 'dist', 'namlauncher-icon.png'),
    path.join(app.getAppPath(), 'public', 'namlauncher-icon.png'),
    path.join(__dirname, '..', APP_ICON_FILE),
    path.join(__dirname, '..', 'namlauncher-icon.png')
  ]
  const candidates = Array.from(new Set(process.platform === 'win32'
    ? [...windowsCandidates, ...pngCandidates]
    : [...pngCandidates, ...windowsCandidates]))

  for (const candidate of candidates) {
    const icon = loadNativeIcon(candidate)
    if (icon) return icon
  }
  return null
}
const showMainWindow = () => {
  launcherRestingInTray = false
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createWindow()
    return
  }

  mainWindow.setSkipTaskbar(false)
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.moveTop()
  mainWindow.focus()
  mainWindow.webContents.focus()
  syncDiscordForLauncherState()
  tray?.setToolTip(
    hasActiveMinecraft()
      ? `NamLauncher\n${getActiveMinecraftCount()} Minecraft instance${getActiveMinecraftCount() === 1 ? '' : 's'} active`
      : `NamLauncher\nVersion ${app.getVersion()}`
  )
}

const minimizeLauncherToTaskbar = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  keepOnlineHeartbeatRunning()
  mainWindow.setSkipTaskbar(false)
  mainWindow.minimize()
  syncDiscordForLauncherState()
}

const requestAppQuit = () => {
  if (isAppQuitting) return

  isAppQuitting = true
  const telemetryFlush = releaseRunningGamesForLauncherExit()
  stopOnlineHeartbeat()
  stopLauncherUpdateChecks()
  discordManager.shutdown()
  minecraftDiscordManager.shutdown()
  tray?.destroy()
  tray = null
  const flushTimeout = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1500)
    timer.unref?.()
  })
  void Promise.race([telemetryFlush, flushTimeout]).finally(() => app.quit())
}

const getTrayLanguage = () => readLauncherSettings().language

const refreshTrayMenu = () => {
  if (!tray || tray.isDestroyed()) return
  const thai = getTrayLanguage() === 'th'
  const runningItems: MenuItemConstructorOptions[] = [...runningGames.values()]
    .sort((left, right) => left.instanceName.localeCompare(right.instanceName))
    .map((game) => ({
      label: `${game.instanceName} — Minecraft ${game.minecraftVersion}${game.currentServer ? ` — ${game.currentServer.label}` : game.lanPort ? ` — LAN ${game.lanPort}` : ''}`,
      submenu: [
        {
          label: thai ? 'เปิดลันเชอร์' : 'Open launcher',
          click: showMainWindow
        },
        {
          label: thai ? 'ปิดเกมนี้' : 'Stop this game',
          click: () => {
            requestMinecraftStop(game).catch((err) => log.error('Tray failed to stop Minecraft.', getCompactErrorLog(err)))
          }
        }
      ]
    }))
  const activeItems: MenuItemConstructorOptions[] = runningItems.length > 0
    ? runningItems
    : [{ label: thai ? 'ไม่มีเกมที่กำลังทำงาน' : 'No running games', enabled: false }]
  const template: MenuItemConstructorOptions[] = [
    {
      label: thai ? 'เปิด NamLauncher' : 'Open NamLauncher',
      click: showMainWindow
    },
    {
      label: thai ? 'ตรวจสอบอัปเดต' : 'Check for updates',
      click: () => {
        checkLauncherUpdateFromTray().catch((err) => log.warn('Tray update check failed.', getCompactErrorLog(err)))
      }
    },
    { type: 'separator' },
    {
      label: thai ? `เกมที่กำลังทำงาน (${runningGames.size})` : `Running games (${runningGames.size})`,
      submenu: activeItems
    },
    {
      label: thai ? 'ปิด Minecraft ทั้งหมด' : 'Stop all Minecraft games',
      enabled: hasActiveMinecraft(),
      click: () => {
        stopAllMinecraftFromTray().catch((err) => log.error('Tray failed to stop Minecraft games.', getCompactErrorLog(err)))
      }
    },
    { type: 'separator' },
    {
      label: `NamLauncher ${app.getVersion()}`,
      enabled: false
    },
    {
      label: thai ? 'ออกจากโปรแกรม' : 'Exit NamLauncher',
      click: requestAppQuit
    }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

const ensureTray = () => {
  if (tray && !tray.isDestroyed()) {
    refreshTrayMenu()
    return tray
  }

  const icon = getAppIcon()
  if (!icon) {
    log.warn('Tray icon could not be created because no app icon was found.')
    return null
  }

  tray = new Tray(icon.image)
  tray.setToolTip(`NamLauncher\nVersion ${app.getVersion()}`)
  refreshTrayMenu()
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
  return tray
}

const hideLauncherToTray = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  keepOnlineHeartbeatRunning()
  if (!ensureTray()) {
    mainWindow.minimize()
    return
  }
  mainWindow.setSkipTaskbar(true)
  launcherRestingInTray = true
  mainWindow.hide()
  syncDiscordForLauncherState()
}

const closeLauncherWindow = () => {
  if (readLauncherSettings().closeToTrayEnabled) {
    log.info('Launcher window closed to the system tray; Discord RPC rests while the online heartbeat remains active.')
    hideLauncherToTray()
    tray?.setToolTip(hasActiveMinecraft()
      ? `NamLauncher\n${getActiveMinecraftCount()} Minecraft instance${getActiveMinecraftCount() === 1 ? '' : 's'} active`
      : `NamLauncher\nVersion ${app.getVersion()}`)
    return
  }

  requestAppQuit()
}

const openExternalUrl = async (rawUrl: string) => {
  try {
    const parsed = new URL(String(rawUrl || ''), STATS_API_BASE)
    const allowedHosts = new Set([
      'namlauncher.nattapat2871.me',
      'nattapat2871.me',
      'www.nattapat2871.me',
      'minisand.online',
      'www.minisand.online',
      'namcraft.nattapat2871.me',
      'tdblock.online',
      'www.tdblock.online',
      'modrinth.com',
      'www.modrinth.com',
      'curseforge.com',
      'www.curseforge.com',
      'console.curseforge.com',
      'discord.com',
      'discord.gg',
      'minecraft.net',
      'www.minecraft.net',
      'microsoft.com',
      'www.microsoft.com'
    ])

    if (
      parsed.protocol !== 'https:'
      || !allowedHosts.has(parsed.hostname.toLowerCase())
      || Boolean(parsed.username || parsed.password)
      || Boolean(parsed.port && parsed.port !== '443')
    ) {
      log.warn(`Blocked external URL: ${redactSensitiveText(rawUrl)}`)
      return
    }

    await shell.openExternal(parsed.href)
  } catch (err) {
    log.warn(`Blocked malformed external URL: ${redactSensitiveText(rawUrl)}`, err)
  }
}

const isAllowedRemoteImageHost = (hostname: string) => {
  const normalized = hostname.toLowerCase()
  const allowedHosts = [
    'cdn.modrinth.com',
    'cdn-raw.modrinth.com',
    'modrinth.com',
    'cdn.discordapp.com',
    'media.discordapp.net',
    'media.forgecdn.net',
    'mediafilez.forgecdn.net',
    'edge.forgecdn.net',
    'namlauncher.nattapat2871.me',
    'namcraft.nattapat2871.me',
    'tdblock.online',
    'nattapat2871.me',
    'www.nattapat2871.me'
  ]
  return allowedHosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))
}

const sendProgress = (progress: any) => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed() || mainWindow.isMinimized()) return
  mainWindow.webContents.send('launch-progress', progress)
}

const sendGameState = (state: Record<string, unknown>) => {
  cleanupStaleLaunches()
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send('game-state', {
    ...state,
    running: [...runningGames.values()].map((game) => ({
      instanceId: game.instanceId,
      instanceName: game.instanceName,
      startedAt: game.startedAt,
      server: game.currentServer ? {
        label: game.currentServer.label,
        kind: game.currentServer.kind
      } : null
    })),
    launching: [...activeLaunches.values()]
      .filter((launch) => !launch.cancelled)
      .map((launch) => ({
        instanceId: launch.instanceId || null,
        instanceName: launch.instanceName || null
      }))
  })
}

const redactSensitiveText = (value: unknown) => {
  return String(value)
    .replace(/(-Dauthlibinjector\.yggdrasil\.prefetched=)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[redacted]')
    .replace(/(--(?:accessToken|access_token|clientToken|client_token|refreshToken|refresh_token|idToken|id_token|authorizationCode|authorization_code|apiKey|api_key|clientSecret|client_secret|password|xuid)\s+)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[redacted]')
    .replace(/("(?:accessToken|access_token|clientToken|client_token|refreshToken|refresh_token|idToken|id_token|authorizationCode|authorization_code|apiKey|api_key|clientSecret|client_secret|password|cookie|set-cookie|xuid)"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3')
    .replace(/([?&](?:accessToken|access_token|clientToken|client_token|refreshToken|refresh_token|idToken|id_token|authorizationCode|authorization_code|apiKey|api_key|clientSecret|client_secret|password|xuid)=)([^&#\s]+)/gi, '$1[redacted]')
    .replace(/(\b(?:accessToken|access_token|clientToken|client_token|refreshToken|refresh_token|idToken|id_token|authorizationCode|authorization_code|apiKey|api_key|x-api-key|clientSecret|client_secret|password|authorization|proxy-authorization|cookie|set-cookie|xuid)\b\s*[=:]\s*)([^\s,;&]+)/gi, '$1[redacted]')
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted-jwt]')
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const sanitizeBugReport = (value: unknown) => {
  let text = redactSensitiveText(value)

  text = text
    .replace(/^.*\[MCLC\]: Launching with arguments.*$/gim, '[MCLC]: Launch command prepared (arguments removed for privacy)')
    .replace(/(-Dauthlibinjector\.yggdrasil\.prefetched=)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[redacted]')
    .replace(/(--username\s+)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[redacted-player]')
    .replace(/\b[A-F0-9]{2}(?::[A-F0-9]{2}){5}\b/gi, '[redacted-network-id]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(/\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}\b/gi, '[redacted-ip]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/\b[0-9a-f]{32}\b/gi, '[redacted-id]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b\d{15,21}\b/g, '[redacted-id]')
    .replace(/^(.*\[CHAT\]\s*).*$/gim, '$1[game chat removed for privacy]')
    .replace(/(Connecting to\s+)([^\s,]+)(?:,\s*\d+)?/gi, '$1[redacted-server]')
    .replace(/((?:server address|remote address|hostname|server host)\s*[:=]\s*)([^\s,;]+)/gi, '$1[redacted-server]')

  text = redactLabeledPlayerNames(text)
    .replace(/("(?:username|playerName|profileName|accountName|uuid|profileId)"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3')

  const knownPlayerNames = new Set<string>()
  try {
    const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8'))
    if (Array.isArray(accounts)) {
      accounts.forEach((account) => {
        if (typeof account?.name === 'string' && account.name.trim().length >= 3) knownPlayerNames.add(account.name.trim())
      })
    }
  } catch {
    // Missing or unreadable account storage should never prevent an error report.
  }
  try {
    const library = JSON.parse(fs.readFileSync(skinsLibraryPath, 'utf8'))
    Object.values<any>(library?.accounts || {}).forEach((account) => {
      if (!Array.isArray(account?.skins)) return
      account.skins.forEach((skin: any) => {
        if (typeof skin?.sourceProfileName === 'string' && skin.sourceProfileName.trim().length >= 3) {
          knownPlayerNames.add(skin.sourceProfileName.trim())
        }
      })
    })
  } catch {
    // Skin metadata is optional.
  }
  for (const name of knownPlayerNames) {
    text = text.replace(new RegExp(escapeRegExp(name), 'gi'), '[redacted-player]')
  }

  const privatePaths = [
    [userDataPath, '%NAMLAUNCHER_DATA%'],
    [app.getAppPath(), '%LAUNCHER_APP%'],
    [app.getPath('home'), '%USER_HOME%'],
    [app.getPath('temp'), '%TEMP%']
  ] as const
  for (const [privatePath, replacement] of privatePaths) {
    if (privatePath) text = text.replace(new RegExp(escapeRegExp(privatePath), 'gi'), replacement)
  }

  text = text.replace(/[A-Z]:\\Users\\[^\\\r\n]+/gi, '%USER_HOME%')
  text = text.replace(/[A-Z]:\\[^()\r\n]+(?=:\d+:\d+\)?)/gi, '%LOCAL_PATH%')
  return text
}

const compactMinecraftDebugMessage = (value: unknown) => {
  const text = redactSensitiveText(value)
  if (/\[MCLC\]: Launching with arguments/i.test(text)) {
    return '[MCLC]: Launch command prepared (arguments removed for privacy and performance)'
  }
  return text
}

const readSanitizedLauncherLogs = async () => {
  let handle: fs.promises.FileHandle | null = null
  try {
    handle = await fs.promises.open(logPath, 'r')
    const stats = await handle.stat()
    const length = Math.min(Math.max(0, stats.size), ERROR_REPORT_LOGS_MAX_LENGTH)
    const offset = Math.max(0, stats.size - length)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = length > 0
      ? await handle.read(buffer, 0, length, offset)
      : { bytesRead: 0 }
    const prefix = offset > 0
      ? `[older launcher log entries omitted; showing the latest ${bytesRead} bytes]\n`
      : ''
    return sanitizeBugReport(`${prefix}${buffer.subarray(0, bytesRead).toString('utf8')}`)
  } catch (err) {
    return `Launcher logs could not be read: ${sanitizeBugReport(err instanceof Error ? err.message : err)}`
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

const settleWithin = <T>(request: Promise<T>, timeoutMs: number, fallback: T) => new Promise<T>((resolve) => {
  let settled = false
  const finish = (value: T) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolve(value)
  }
  const timer = setTimeout(() => finish(fallback), timeoutMs)
  timer.unref?.()
  request.then(finish, () => finish(fallback))
})

const getRuntimeReportMetadata = () => ({
  launcherVersion: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron || 'unknown'
})

const runSystemInfoCommand = async (command: string, args: string[], timeoutMs = 2500) => {
  return new Promise<string>((resolve) => {
    let settled = false
    let stdout = ''
    const finish = (value = '') => {
      if (settled) return
      settled = true
      resolve(value.trim())
    }

    try {
      const child = spawn(command, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // Best-effort hardware metadata collection must not block reports.
        }
        finish('')
      }, timeoutMs)
      timer.unref?.()

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < 96 * 1024) stdout += chunk.toString('utf8')
      })
      child.once('error', () => {
        clearTimeout(timer)
        finish('')
      })
      child.once('exit', () => {
        clearTimeout(timer)
        finish(stdout)
      })
    } catch {
      finish('')
    }
  })
}

const normalizeHardwareText = (value: unknown, maxLength = 180) => {
  return trimRemoteText(sanitizeCompactLogText(value).replace(/\s+/g, ' '), maxLength)
}

const formatStorageBytes = (value: unknown) => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  const tib = bytes / (1024 ** 4)
  if (tib >= 1) return `${Math.round(tib * 10) / 10} TB`
  const gib = bytes / (1024 ** 3)
  return `${Math.round(gib)} GB`
}

const asArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const getWindowsStorageReportInfo = async (): Promise<LauncherStorageDevice[]> => {
  const output = await runSystemInfoCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Get-CimInstance Win32_DiskDrive | Select-Object -First 6 Model,Manufacturer,MediaType,Size | ConvertTo-Json -Compress'
  ])
  if (!output) return []

  try {
    return asArray<any>(JSON.parse(output))
      .map((device) => {
        const manufacturer = normalizeHardwareText(device?.Manufacturer, 80)
        const model = normalizeHardwareText(device?.Model)
        const combinedModel = normalizeHardwareText(`${manufacturer} ${model}`.trim()) || model || manufacturer
        return {
          model: combinedModel || 'unknown',
          mediaType: normalizeHardwareText(device?.MediaType, 80) || null,
          size: formatStorageBytes(device?.Size)
        }
      })
      .filter((device) => device.model !== 'unknown' || device.mediaType || device.size)
      .slice(0, 6)
  } catch {
    return []
  }
}

const getLinuxStorageReportInfo = async (): Promise<LauncherStorageDevice[]> => {
  const output = await runSystemInfoCommand('lsblk', ['-J', '-d', '-o', 'MODEL,VENDOR,SIZE,ROTA,TYPE'])
  if (!output) return []

  try {
    const devices = Array.isArray(JSON.parse(output)?.blockdevices)
      ? JSON.parse(output).blockdevices
      : []
    return devices
      .filter((device: any) => !device?.type || device.type === 'disk')
      .map((device: any) => {
        const vendor = normalizeHardwareText(device?.vendor, 80)
        const model = normalizeHardwareText(device?.model)
        const rota = device?.rota
        return {
          model: normalizeHardwareText(`${vendor} ${model}`.trim()) || model || vendor || 'unknown',
          mediaType: rota === false || rota === 0 ? 'SSD/NVMe' : rota === true || rota === 1 ? 'HDD' : null,
          size: normalizeHardwareText(device?.size, 40) || null
        }
      })
      .filter((device: LauncherStorageDevice) => device.model !== 'unknown' || device.mediaType || device.size)
      .slice(0, 6)
  } catch {
    return []
  }
}

const getStorageReportInfo = async (): Promise<LauncherStorageDevice[]> => {
  if (process.platform === 'win32') return getWindowsStorageReportInfo()
  if (process.platform === 'linux') return getLinuxStorageReportInfo()
  return []
}

const getBasicSystemReportInfo = (): LauncherSystemReport => {
  const cpus = os.cpus() || []
  return {
    os: `${os.type()} ${os.release()}`,
    cpu: cpus[0]?.model || 'unknown',
    cpu_cores: cpus.length || undefined,
    ram_gb: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
    gpu: [],
    storage: [],
    platform: process.platform,
    arch: process.arch
  }
}

let cachedSystemReportInfo: LauncherSystemReport | null = null
let systemReportInfoRequest: Promise<LauncherSystemReport> | null = null

const getSystemReportInfo = () => {
  if (cachedSystemReportInfo) return Promise.resolve(cachedSystemReportInfo)
  if (systemReportInfoRequest) return systemReportInfoRequest

  systemReportInfoRequest = (async () => {
    const basic = getBasicSystemReportInfo()
    const gpuRequest = Promise.resolve()
      .then(() => app.getGPUInfo('basic') as Promise<any>)
    const [gpuInfo, storage] = await Promise.all([
      settleWithin(gpuRequest, ERROR_REPORT_HARDWARE_TIMEOUT_MS, null),
      settleWithin(getStorageReportInfo(), ERROR_REPORT_HARDWARE_TIMEOUT_MS, [] as LauncherStorageDevice[])
    ])
    const devices = Array.isArray(gpuInfo?.gpuDevice) ? gpuInfo.gpuDevice : []
    const report = {
      ...basic,
      gpu: devices
        .map((device: any) => String(device?.deviceString || device?.vendorString || '').trim())
        .filter(Boolean)
        .slice(0, 8),
      storage
    }
    cachedSystemReportInfo = report
    return report
  })().finally(() => {
    systemReportInfoRequest = null
  })

  return systemReportInfoRequest
}

const truncateRemoteText = (value: unknown, maxLength: number, marker = true) => {
  const text = String(value || '')
  if (text.length <= maxLength) return text
  if (!marker) return text.slice(0, maxLength)

  const markerText = `\n\n[truncated by NamLauncher before upload; original length ${text.length} characters]\n\n`
  const available = Math.max(0, maxLength - markerText.length)
  const headLength = Math.ceil(available * 0.6)
  const tailLength = Math.max(0, available - headLength)
  return `${text.slice(0, headLength)}${markerText}${text.slice(-tailLength)}`.slice(0, maxLength)
}

const trimRemoteText = (value: unknown, maxLength: number) => {
  return truncateRemoteText(value, maxLength, false).trim()
}

const sanitizeCompactLogText = (value: unknown) => {
  return redactSensitiveText(value)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(/\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}\b/gi, '[redacted-ip]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/\b[0-9a-f]{32}\b/gi, '[redacted-id]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b\d{15,21}\b/g, '[redacted-id]')
    .replace(/[A-Z]:\\Users\\[^\\\r\n]+/gi, '%USER_HOME%')
    .replace(/[A-Z]:\\[^()\r\n]+(?=:\d+:\d+\)?)/gi, '%LOCAL_PATH%')
}

const getCompactErrorLog = (err: unknown) => {
  if (axios.isAxiosError(err)) {
    const method = String(err.config?.method || '').toUpperCase()
    const url = err.config?.url ? trimRemoteText(sanitizeCompactLogText(err.config.url), 240) : undefined
    return {
      message: sanitizeCompactLogText(err.message || 'Axios request failed'),
      name: err.name,
      code: err.code,
      status: err.response?.status,
      method: method || undefined,
      url
    }
  }

  if (err instanceof Error) {
    return {
      message: sanitizeCompactLogText(err.message),
      name: err.name
    }
  }

  return {
    message: sanitizeCompactLogText(err)
  }
}

const normalizeErrorReportPlayerName = (value: unknown) => {
  const playerName = sanitizeCompactLogText(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!playerName || /^\[redacted-player\]$/i.test(playerName)) return 'unknown'
  return trimRemoteText(playerName, 40) || 'unknown'
}

const normalizeRemoteSystemReport = (system: LauncherSystemReport) => ({
  os: trimRemoteText(system.os, 160) || null,
  cpu: trimRemoteText(system.cpu, 180) || null,
  cpu_cores: system.cpu_cores,
  ram_gb: system.ram_gb,
  gpu: system.gpu.map((name) => trimRemoteText(name, 180)).filter(Boolean).slice(0, 8),
  storage: (system.storage || []).map((device) => ({
    model: trimRemoteText(device.model, 180) || 'unknown',
    mediaType: trimRemoteText(device.mediaType || '', 80) || null,
    size: trimRemoteText(device.size || '', 40) || null
  })).filter((device) => device.model !== 'unknown' || device.mediaType || device.size).slice(0, 6),
  platform: trimRemoteText(system.platform, 32) || null,
  arch: trimRemoteText(system.arch, 32) || null
})

const resolveErrorReportAccount = (request: LauncherErrorSubmitRequest) => {
  const requestedId = String(request.activeAccountId || '').trim()
  const requestedPlayerName = String(request.playerName || '').trim().toLowerCase()
  const accounts = readAccounts()
  const account = requestedId
    ? accounts.find((item) => item.id === requestedId)
    : accounts.find((item) => requestedPlayerName && item.name.toLowerCase() === requestedPlayerName)
      || accounts[0]
  return account || null
}

const getDefaultErrorReportAccount = () => {
  const running = getLatestRunningGame()
  if (running) {
    return {
      id: null,
      name: running.playerName,
      type: running.accountType
    }
  }

  if (!activeErrorReportAccountId) return null
  const account = readAccounts().find((item) => item.id === activeErrorReportAccountId)
  return account
    ? { id: account.id, name: account.name, type: account.type }
    : null
}

const recordContentUsage = (
  provider: 'modrinth' | 'curseforge',
  request: ModrinthInstallRequest | CurseForgeInstallRequest,
  startedAt: number,
  status: 'success' | 'failed' | 'cancelled',
  detail?: string
) => {
  const project = request?.project || {}
  const projectId = provider === 'curseforge'
    ? String((project as CurseForgeProject).project_id || (project as CurseForgeProject).id || 'unknown')
    : String((project as ModrinthInstallRequest['project'])?.project_id || (project as ModrinthInstallRequest['project'])?.id || (request as ModrinthInstallRequest).projectId || 'unknown')
  const projectType = String(
    provider === 'curseforge'
      ? (project as CurseForgeProject).project_type || 'content'
      : (request as ModrinthInstallRequest).projectType || (project as ModrinthInstallRequest['project'])?.project_type || 'content'
  )
  const title = String(
    (project as CurseForgeProject).title
    || (project as CurseForgeProject).name
    || (project as ModrinthInstallRequest['project'])?.slug
    || projectId
  )
  const resource = trimRemoteText(`${provider}:${projectType}:${projectId}:${title}`, 300)
  const playerName = normalizeErrorReportPlayerName(request?.playerName || 'unknown')
  const accountType = trimRemoteText(request?.accountType || '', 24)

  void requestStatsApiJson<{ ok: boolean; event_id: number }>('/api/usage-events', {
    method: 'POST',
    timeout: 5000,
    headers: {
      Authorization: `Bearer ${ERROR_REPORT_TOKEN}`,
      'X-NamLauncher-Player': playerName,
      ...(accountType ? { 'X-NamLauncher-Account-Type': accountType } : {})
    },
    body: {
      action: 'content_install',
      resource,
      status,
      duration_ms: Math.max(0, Date.now() - startedAt),
      player_name: playerName,
      account_type: accountType || null,
      detail: trimRemoteText(detail || '', 500) || null
    }
  }).catch((err) => {
    log.warn(`Could not record ${provider} content usage: ${sanitizeCompactLogText(err instanceof Error ? err.message : err)}`)
  })
}

const getErrorReportSubmitFailureMessage = (err: unknown) => {
  if (err instanceof StatsApiRequestError) {
    if (err.status === 401 || err.status === 403) {
      return 'Error report authorization failed. Rebuild NamLauncher with the matching NAMLAUNCHER_ERROR_REPORT_TOKEN.'
    }
    if (err.status === 422) {
      return `Error report payload was rejected by the server${err.detail ? `: ${err.detail}` : '.'}`
    }
    if (err.status === 503) {
      return err.detail || 'Error reporting is not configured on the server.'
    }
    if (err.status) {
      return err.detail || `Error report server returned HTTP ${err.status}.`
    }
    return err.message || 'Could not reach the error report server.'
  }
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const detail = typeof err.response?.data?.detail === 'string'
      ? err.response.data.detail
      : ''
    const validationDetail = Array.isArray(err.response?.data?.detail)
      ? err.response.data.detail
          .map((item: any) => String(item?.msg || item?.type || '').trim())
          .filter(Boolean)
          .slice(0, 3)
          .join('; ')
      : ''
    if (status === 401 || status === 403) {
      return 'Error report authorization failed. Rebuild NamLauncher with the matching NAMLAUNCHER_ERROR_REPORT_TOKEN.'
    }
    if (status === 422) {
      return `Error report payload was rejected by the server${validationDetail ? `: ${validationDetail}` : '.'}`
    }
    if (status === 503) {
      return detail || 'Error reporting is not configured on the server.'
    }
    if (status) {
      return detail || `Error report server returned HTTP ${status}.`
    }
    if (err.code === 'ECONNABORTED') {
      return 'Error report server did not respond in time.'
    }
    return err.message || 'Could not reach the error report server.'
  }
  return err instanceof Error ? err.message : 'Could not submit the error report.'
}

const submitLauncherErrorReport = async (
  request: LauncherErrorSubmitRequest,
  submissionMode: 'automatic' | 'manual' = 'manual'
): Promise<LauncherErrorSubmitResult> => {
  const reportId = String(request.reportId || '').trim()
  const report = launcherErrorReports.get(reportId)
  if (!report) throw new Error('This error report is no longer available.')
  const submittedReportId = submittedLauncherErrorReports.get(report.id)
  if (submittedReportId) {
    return { success: true, duplicate: true, reportId: submittedReportId }
  }
  if (!ERROR_REPORT_TOKEN) {
    log.warn(`[LAUNCHER-ERROR] Report ${report.id} was not submitted because this launcher build has no error report token.`)
    throw new Error('Error report sending is not configured for this build. Rebuild NamLauncher with NAMLAUNCHER_ERROR_REPORT_TOKEN.')
  }

  const account = resolveErrorReportAccount(request)
  const playerName = normalizeErrorReportPlayerName(request.playerName || report.playerName || account?.name || 'unknown')
  const system = normalizeRemoteSystemReport(report.system || (await getSystemReportInfo()))
  const diagnosis = formatMinecraftCrashDiagnosisForReport(report.diagnosis || null)
  const reportMessage = diagnosis ? `${diagnosis}\n\n${report.message}` : report.message
  log.info(`[LAUNCHER-ERROR] Preparing report ${report.id} for player ${playerName} (${system.os}, ${system.cpu_cores || '?'} cores, ${system.ram_gb || '?'} GB RAM).`)

  let response: {
    discord_dispatched?: boolean
    discord_queued?: boolean
    duplicate?: boolean
    occurrence_count?: number
    report_id?: string
  }
  try {
    response = await requestStatsApiJson('/api/error-reports', {
      method: 'POST',
      timeout: 45000,
      headers: (() => {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${ERROR_REPORT_TOKEN}`
        }
        const identityHeader = getLauncherDiscordIdentityHeader()
        if (identityHeader['X-NamLauncher-Identity']) {
          headers['X-NamLauncher-Identity'] = identityHeader['X-NamLauncher-Identity']
        }
        return headers
      })(),
      body: {
        id: report.id,
        title: trimRemoteText(report.title, ERROR_REPORT_TITLE_MAX_LENGTH) || 'Launcher problem detected',
        context: trimRemoteText(report.context, ERROR_REPORT_CONTEXT_MAX_LENGTH) || 'launcher',
        message: truncateRemoteText(reportMessage, ERROR_REPORT_MESSAGE_MAX_LENGTH),
        logs: truncateRemoteText(report.logs, ERROR_REPORT_LOGS_MAX_LENGTH),
        occurred_at: trimRemoteText(report.occurredAt, 80),
        launcher_version: trimRemoteText(report.launcherVersion, 40) || null,
        platform: trimRemoteText(report.platform, 32) || null,
        arch: trimRemoteText(report.arch, 32) || null,
        electron_version: trimRemoteText(report.electronVersion, 40) || null,
        player_name: playerName,
        account_type: report.accountType || account?.type || null,
        submission_mode: submissionMode,
        system
      }
    })
  } catch (err) {
    const message = getErrorReportSubmitFailureMessage(err)
    log.warn(`[LAUNCHER-ERROR] Report ${report.id} submission failed: ${message}`)
    throw new Error(message)
  }

  const discordDispatched = Boolean(response.discord_dispatched)
  const discordQueued = Boolean(response.discord_queued)
  const duplicate = Boolean(response.duplicate)
  const occurrenceCount = Math.max(1, Number(response.occurrence_count) || 1)
  const canonicalReportId = trimRemoteText(response.report_id || report.id, 80) || report.id
  submittedLauncherErrorReports.set(report.id, canonicalReportId)
  if (!duplicate && !discordDispatched && !discordQueued) {
    log.warn(`[LAUNCHER-ERROR] Report ${report.id} reached the website, but Discord dispatch was not queued.`)
  }

  return {
    success: true,
    reportId: canonicalReportId,
    duplicate,
    occurrenceCount,
    discordDispatched,
    discordQueued
  }
}

const confirmLauncherErrorReport = async (request: LauncherErrorSubmitRequest) => {
  const observationId = String(request.reportId || '').trim()
  const pendingAutomaticSubmission = automaticLauncherErrorSubmissions.get(observationId)
  const submitted = pendingAutomaticSubmission
    ? await pendingAutomaticSubmission
    : await submitLauncherErrorReport(request, 'manual')
  const canonicalReportId = trimRemoteText(submitted.reportId || observationId, 80) || observationId
  let response: {
    confirmed?: boolean
    discord_dispatched?: boolean
    discord_queued?: boolean
    duplicate?: boolean
    confirmation_count?: number
  }
  try {
    response = await requestStatsApiJson(`/api/error-reports/${encodeURIComponent(canonicalReportId)}/confirm`, {
      method: 'POST',
      timeout: 15000,
      headers: { Authorization: `Bearer ${ERROR_REPORT_TOKEN}` },
      body: {
        confirmation: 'occurred',
        observation_id: observationId
      }
    })
  } catch (err) {
    const message = getErrorReportSubmitFailureMessage(err)
    log.warn(`[LAUNCHER-ERROR] Report ${observationId} confirmation failed: ${message}`)
    throw new Error(message)
  }
  return {
    ...submitted,
    reportId: canonicalReportId,
    confirmed: Boolean(response.confirmed),
    discordDispatched: Boolean(response.discord_dispatched),
    discordQueued: Boolean(response.discord_queued),
    confirmationDuplicate: Boolean(response.duplicate),
    confirmationCount: Math.max(1, Number(response.confirmation_count) || 1)
  }
}

const publishLauncherError = async (
  rawError: unknown,
  context = 'launcher',
  title = 'Launcher problem detected',
  metadata: {
    playerName?: string | null
    accountType?: string | null
    diagnosis?: MinecraftCrashDiagnosis | null
    failureClassification?: MinecraftFailureClassification | null
  } = {}
) => {
  if (metadata.failureClassification?.reportPolicy === 'local-only'
    || (['minecraft-exit', 'minecraft-launcher-core'].includes(context)
      && metadata.failureClassification?.reportPolicy !== 'automatic')) {
    log.warn('[LAUNCHER-ERROR] Refused to publish a local-only Minecraft process failure.')
    return
  }
  const rawMessage = rawError instanceof Error ? rawError.stack || rawError.message : rawError
  const message = sanitizeBugReport(String(rawMessage).slice(0, 100_000)).trim()
    || 'An unknown launcher error occurred.'
  const signature = `${context}:${message}`
  const now = Date.now()
  if (lastPublishedError.signature === signature && now - lastPublishedError.at < ERROR_REPORT_DEDUP_WINDOW_MS) return
  lastPublishedError = { signature, at: now }
  log.error(`[LAUNCHER-ERROR] [${sanitizeBugReport(context)}] ${message}`)

  const defaultAccount = getDefaultErrorReportAccount()
  const launcherLogs = readSanitizedLauncherLogs()
  const systemReport = getSystemReportInfo()
  const report: LauncherErrorReport = {
    id: crypto.randomUUID(),
    title,
    context: sanitizeBugReport(context),
    message,
    logs: await settleWithin(
      launcherLogs,
      ERROR_REPORT_INITIAL_LOG_WAIT_MS,
      'Launcher logs are still being collected and will be attached before submission.'
    ),
    occurredAt: new Date().toISOString(),
    playerName: normalizeErrorReportPlayerName(metadata.playerName || defaultAccount?.name || 'unknown'),
    accountType: trimRemoteText(metadata.accountType || defaultAccount?.type || '', 24) || null,
    diagnosis: metadata.diagnosis || null,
    system: getBasicSystemReportInfo(),
    ...getRuntimeReportMetadata()
  }
  launcherErrorReports.set(report.id, report)
  while (launcherErrorReports.size > 25) {
    const oldest = launcherErrorReports.keys().next().value
    if (!oldest) break
    launcherErrorReports.delete(oldest)
    submittedLauncherErrorReports.delete(oldest)
  }
  void Promise.all([launcherLogs, systemReport])
    .then(([logs, system]) => {
      const storedReport = launcherErrorReports.get(report.id)
      if (!storedReport) return
      storedReport.logs = logs
      storedReport.system = system
    })
    .catch((err) => {
      log.warn(`[LAUNCHER-ERROR] Could not enrich report ${report.id}: ${sanitizeCompactLogText(err instanceof Error ? err.message : err)}`)
    })
    .then(() => {
      const submission = submitLauncherErrorReport({
        reportId: report.id,
        playerName: report.playerName || null
      }, 'automatic')
      automaticLauncherErrorSubmissions.set(report.id, submission)
      return submission.finally(() => {
        if (automaticLauncherErrorSubmissions.get(report.id) === submission) {
          automaticLauncherErrorSubmissions.delete(report.id)
        }
      })
    })
    .then((result) => {
      log.info(`[LAUNCHER-ERROR] Report ${report.id} was submitted automatically as ${result.reportId}.`)
    })
    .catch((err) => {
      log.warn(`[LAUNCHER-ERROR] Automatic report ${report.id} submission failed: ${getErrorReportSubmitFailureMessage(err)}`)
    })
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send('launcher-error-report', report)
}

process.on('uncaughtExceptionMonitor', (error) => {
  publishLauncherError(error, 'main-process:uncaught-exception', 'Launcher encountered a fatal error').catch(() => undefined)
})

process.on('unhandledRejection', (reason) => {
  publishLauncherError(reason, 'main-process:unhandled-rejection').catch(() => undefined)
})

const sendGameLog = (entry: Record<string, unknown>) => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) return
  mainWindow.webContents.send('game-log', entry)
}

const sendMinecraftGameIssue = (issue: MinecraftGameIssue) => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  launcherMinimizedForGame = false
  showMainWindow()
  mainWindow.webContents.send('minecraft-game-issue', issue)
}

const minimizeLauncherForGame = (settings = readLauncherSettings()) => {
  if (!settings.autoMinimizeOnLaunch || !mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible()) {
    launcherMinimizedForGame = true
    hideLauncherToTray()
  }
}

const restoreLauncherAfterGame = () => {
  if (hasActiveMinecraft()) return
  if (!launcherMinimizedForGame || !mainWindow || mainWindow.isDestroyed()) return
  launcherMinimizedForGame = false
  showMainWindow()
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve))

const getGameState = () => {
  cleanupStaleLaunches()
  const running = [...runningGames.values()].map((game) => ({
    instanceId: game.instanceId,
    instanceName: game.instanceName,
    startedAt: game.startedAt,
    server: game.currentServer ? {
      label: game.currentServer.label,
      kind: game.currentServer.kind
    } : null
  }))
  const launching = [...activeLaunches.values()]
    .filter((launch) => !launch.cancelled)
    .map((launch) => ({
      instanceId: launch.instanceId || null,
      instanceName: launch.instanceName || null
    }))
  const primaryRunning = running[0]
  const primaryLaunching = launching[0]

  return {
    status: primaryRunning ? 'running' : primaryLaunching ? 'launching' : 'stopped',
    instanceId: primaryRunning?.instanceId || primaryLaunching?.instanceId || null,
    instanceName: primaryRunning?.instanceName || primaryLaunching?.instanceName || null,
    startedAt: primaryRunning?.startedAt || null,
    running,
    launching
  }
}

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true })
}

const readJsonFile = <T>(filePath: string, fallback: T): T => {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch (err) {
    log.warn(`Failed to read JSON file: ${filePath}`, err)
    return fallback
  }
}

const writeJsonFile = (filePath: string, data: unknown) => {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  if (process.platform !== 'win32') fs.chmodSync(filePath, 0o600)
}

const getImageMimeFromExtension = (filename: string) => {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

const normalizeMimeType = (mimeType: string) => String(mimeType || '').split(';', 1)[0].trim().toLowerCase()

const isSafeCachedImageMimeType = (mimeType: string) => SAFE_CACHED_IMAGE_MIME_TYPES.has(normalizeMimeType(mimeType))

const getImageExtensionFromMime = (mimeType: string) => {
  const normalized = normalizeMimeType(mimeType)
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  return '.png'
}

const readCachedImageDataUrl = (cacheKey: string) => {
  if (!fs.existsSync(imageCacheDir)) return null
  const fileName = fs.readdirSync(imageCacheDir).find((item) => item.startsWith(`${cacheKey}.`))
  if (!fileName) return null

  const filePath = path.join(imageCacheDir, fileName)
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size <= 0 || stat.size > 1024 * 1024) return null

  const data = fs.readFileSync(filePath)
  return `data:${getImageMimeFromExtension(fileName)};base64,${data.toString('base64')}`
}

const cacheRemoteImageUrl = async (rawUrl: string) => {
  const url = String(rawUrl || '').trim()
  if (!url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('file:')) return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }

  if (
    parsed.protocol !== 'https:'
    || !isAllowedRemoteImageHost(parsed.hostname)
    || Boolean(parsed.username || parsed.password)
    || Boolean(parsed.port && parsed.port !== '443')
  ) return ''

  const cacheKey = crypto.createHash('sha256').update(url).digest('hex')
  const cached = readCachedImageDataUrl(cacheKey)
  if (cached) return cached

  try {
    ensureDir(imageCacheDir)
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: HTTP_HEADERS,
      maxContentLength: MAX_CACHED_IMAGE_BYTES,
      maxBodyLength: MAX_CACHED_IMAGE_BYTES,
      maxRedirects: 0
    })
    const mimeType = normalizeMimeType(String(response.headers['content-type'] || ''))
    if (!isSafeCachedImageMimeType(mimeType)) return ''

    const data = Buffer.from(response.data)
    if (data.length <= 0 || data.length > MAX_CACHED_IMAGE_BYTES) return ''

    const filePath = path.join(imageCacheDir, `${cacheKey}${getImageExtensionFromMime(mimeType)}`)
    fs.writeFileSync(filePath, data)
    return `data:${mimeType};base64,${data.toString('base64')}`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.debug(`Could not cache image: ${url} (${message})`)
    return ''
  }
}

const readLauncherSettings = (): LauncherSettings => {
  const settings = readJsonFile<Partial<LauncherSettings>>(settingsPath, {})
  return {
    discordRpcEnabled: settings.discordRpcEnabled ?? true,
    anonymousStatsEnabled: true,
    gameplayTelemetryEnabled: true,
    playerBadgeEnabled: settings.playerBadgeEnabled ?? true,
    restrictedModAuditEnabled: true,
    customJavaArgsEnabled: settings.customJavaArgsEnabled ?? false,
    customJavaArgs: typeof settings.customJavaArgs === 'string' ? settings.customJavaArgs : '',
    autoMinimizeOnLaunch: settings.autoMinimizeOnLaunch ?? false,
    closeToTrayEnabled: settings.closeToTrayEnabled ?? true,
    // Preserve the explicit RAM amount used by existing installations until the
    // player opts in to automatic sizing from Settings.
    automaticMemory: settings.automaticMemory === true,
    performanceProfile: normalizePerformanceProfile(settings.performanceProfile),
    language: settings.language === 'en' ? 'en' : 'th',
    theme: settings.theme === 'dark' || settings.theme === 'light' ? settings.theme : 'system'
  }
}

const saveLauncherSettings = (settings: LauncherSettings) => {
  writeJsonFile(settingsPath, settings)
}

const parseJavaArguments = (rawArgs: string) => {
  const input = String(rawArgs || '').trim()
  if (!input) return []
  if (input.length > 4096) {
    throw new Error('Custom Java arguments are too long.')
  }

  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (quote) throw new Error('Custom Java arguments contain an unfinished quote.')
  if (current) args.push(current)
  if (args.length > 128) throw new Error('Too many custom Java arguments.')

  const blockedArgument = args.find((argument) => (
    argument.startsWith('@')
    || /^(?:-javaagent|-agentlib|-agentpath|-Xbootclasspath)(?::|=|$)/i.test(argument)
    || /^(?:--patch-module|--upgrade-module-path|--module-path)(?:=|$)/i.test(argument)
    || /^-D(?:java\.system\.class\.loader|sun\.boot\.class\.path)=/i.test(argument)
  ))
  if (blockedArgument) {
    throw new Error('Custom Java arguments cannot load executable agents, boot class paths, argument files, or replacement modules.')
  }

  return args
}

const shouldUseJavaModuleOpenArgs = (mcVersion: string) => {
  const match = String(mcVersion || '').match(/^1\.(\d+)/)
  if (!match) return Boolean(mcVersion)
  return Number(match[1]) >= 17
}

const getLaunchJavaArgs = (settings = readLauncherSettings(), mcVersion = '') => {
  const requestedCustomArgs = settings.customJavaArgsEnabled
    ? parseJavaArguments(settings.customJavaArgs)
    : []
  const customPolicy = applyCustomJavaArgumentPolicy(requestedCustomArgs, process.platform)
  if (customPolicy.removedArguments.length > 0) {
    log.warn(
      'Ignored custom Java arguments that could override the launcher memory budget or force non-adaptive client memory behavior: '
      + customPolicy.removedArguments.join(', ')
    )
  }
  const moduleOpenArgs = shouldUseJavaModuleOpenArgs(mcVersion)
    ? JAVA_MODULE_OPEN_ARGS
    : []
  return [...DEFAULT_JAVA_ARGS, ...moduleOpenArgs, ...customPolicy.javaArgs]
}

const getDiscordRuntimeSettings = (settings = readLauncherSettings()): DiscordRuntimeSettings => ({
  ...settings,
  discordClientId: DEFAULT_DISCORD_CLIENT_ID,
  launcherVersion: app.getVersion()
})

const getMinecraftDiscordRuntimeSettings = (settings = readLauncherSettings()): DiscordRuntimeSettings => ({
  ...settings,
  discordClientId: MINECRAFT_OFFICIAL_APPLICATION_ID,
  launcherVersion: app.getVersion()
})

const parseVersionParts = (value: string) => {
  const cleaned = String(value || '').trim().replace(/^v/i, '')
  const [core, prerelease = ''] = cleaned.split('-', 2)
  const numbers = core.split('.').map((part) => Number.parseInt(part, 10) || 0)
  return {
    major: numbers[0] || 0,
    minor: numbers[1] || 0,
    patch: numbers[2] || 0,
    prerelease
  }
}

const compareVersions = (left: string, right: string) => {
  const a = parseVersionParts(left)
  const b = parseVersionParts(right)
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1
  }
  if (a.prerelease === b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true, sensitivity: 'base' })
}

const getAbsoluteWebsiteUrl = (url: string | null | undefined) => {
  if (!url) return `${STATS_API_BASE}/download/`
  try {
    return new URL(url, STATS_API_BASE).toString()
  } catch {
    return `${STATS_API_BASE}/download/`
  }
}

const getLauncherPlatform = () => {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'macos'
  return 'linux'
}

const getPreferredLauncherArtifact = (release: LauncherReleaseResponse) => {
  const artifacts = Array.isArray(release.artifacts) ? release.artifacts : []
  const platform = getLauncherPlatform()
  const available = artifacts.filter((artifact) => artifact?.available && !artifact.updates_paused && artifact.platform === platform && artifact.url
    && (!artifact.arch || artifact.arch === process.arch || artifact.arch === 'universal'))

  if (platform === 'windows') {
    return available.find((artifact) => artifact.format === 'exe')
      || available.find((artifact) => artifact.recommended)
      || available[0]
      || null
  }

  if (platform === 'linux') {
    const target = getStartupUpdateTarget()
    const format = process.env.FLATPAK_ID ? 'flatpak'
      : target === 'linux-deb-x64' ? 'deb'
        : target === 'linux-rpm-x64' ? 'rpm'
          : target === 'linux-pacman-x64' ? 'pkg.tar.zst' : 'AppImage'
    return available.find((artifact) => artifact.format === format)
      || available.find((artifact) => artifact.recommended)
      || available[0]
      || null
  }

  return available.find((artifact) => artifact.recommended) || available[0] || null
}

const getWindowsBundleArtifact = (release: LauncherReleaseResponse) => {
  if (process.platform !== 'win32' || process.arch !== 'x64') return null
  const artifacts = Array.isArray(release.artifacts) ? release.artifacts : []
  return artifacts.find((artifact) => artifact?.id === 'windows-app-x64'
    && artifact.platform === 'windows'
    && artifact.format?.toLowerCase() === 'zip'
    && artifact.arch === 'x64'
    && artifact.available
    && !artifact.updates_paused
    && artifact.url)
    || null
}

const fetchLatestLauncherRelease = async () => {
  const response = await axios.get<LauncherReleaseResponse>(`${STATS_API_BASE}/api/releases/latest`, {
    timeout: 10000,
    headers: HTTP_HEADERS
  })
  return response.data || {}
}

const checkLauncherUpdate = async () => {
  const currentVersion = app.getVersion()
  try {
    const release = await fetchLatestLauncherRelease()

    const artifact = getPreferredLauncherArtifact(release)
    const windowsBundleArtifact = getWindowsBundleArtifact(release)
    const platform = getLauncherPlatform()
    const platformArtifact = artifact || (Array.isArray(release.artifacts) ? release.artifacts.find((item) => item?.platform === platform) : null)
    const latestVersion = String(platformArtifact?.version || (platform === 'windows' ? release.version : null) || currentVersion)
    const updateAvailable = !platformArtifact?.updates_paused && compareVersions(latestVersion, currentVersion) > 0
    requiredLauncherUpdateVersion = updateAvailable ? latestVersion : null
    return {
      currentVersion,
      latestVersion,
      updateAvailable,
      channel: release.channel || 'stable',
      downloadUrl: getAbsoluteWebsiteUrl(artifact?.url || (platform === 'windows' ? release.download_url : '/#download')),
      installerSha256: normalizeLauncherInstallerSha256(artifact?.sha256),
      windowsBundleUrl: windowsBundleArtifact ? getAbsoluteWebsiteUrl(windowsBundleArtifact.url) : null,
      windowsBundleSha256: normalizeLauncherInstallerSha256(windowsBundleArtifact?.sha256),
      mandatory: updateAvailable,
      notes: Array.isArray(release.notes) ? release.notes : []
    }
  } catch (err) {
    log.debug('Launcher update check failed', getCompactErrorLog(err))
    return {
      currentVersion,
      latestVersion: requiredLauncherUpdateVersion || currentVersion,
      updateAvailable: Boolean(requiredLauncherUpdateVersion),
      channel: 'stable',
      downloadUrl: `${STATS_API_BASE}/download/`,
      installerSha256: null,
      windowsBundleUrl: null,
      windowsBundleSha256: null,
      mandatory: Boolean(requiredLauncherUpdateVersion),
      notes: [],
      error: err instanceof Error ? err.message : 'Update check failed'
    }
  }
}

const sendLauncherUpdateProgress = (progress: {
  state: 'checking' | 'downloading' | 'verifying' | 'applying' | 'restarting' | 'opening-installer' | 'installer-opened' | 'failed'
  percent?: number
  detail?: string
}) => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send('launcher-update-progress', progress)
}

const assertTrustedLauncherUpdateUrl = (rawUrl: string) => {
  const parsed = new URL(rawUrl)
  const statsBase = new URL(STATS_API_BASE)
  const developmentHost = !app.isPackaged && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
  const trustedHost = parsed.hostname === statsBase.hostname || parsed.hostname === 'namlauncher.nattapat2871.me'
  if (parsed.username || parsed.password) throw new Error('The launcher update URL must not contain credentials.')
  if ((parsed.protocol === 'https:' && trustedHost && (!parsed.port || parsed.port === '443'))
    || (developmentHost && ['http:', 'https:'].includes(parsed.protocol))) return parsed.toString()
  throw new Error('The launcher update URL is not trusted.')
}

const getLauncherInstallerFileName = (downloadUrl: string, latestVersion: string) => {
  const parsed = new URL(downloadUrl)
  const fileName = path.basename(parsed.pathname)
  if (/^[A-Za-z0-9._-]+\.exe$/i.test(fileName)) return fileName
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(latestVersion)) throw new Error('Invalid launcher update version.')
  return `NamLauncher-${latestVersion}-Installer.exe`
}

const getLauncherBundleFileName = (downloadUrl: string, latestVersion: string) => {
  const parsed = new URL(downloadUrl)
  const fileName = path.basename(parsed.pathname)
  if (/^[A-Za-z0-9._-]+\.zip$/i.test(fileName)) return fileName
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(latestVersion)) throw new Error('Invalid launcher update version.')
  return `NamLauncher-${latestVersion}-Windows-x64.zip`
}

const getLauncherUpdateInstallerPath = (fileName: string) => {
  return path.join(getLauncherUpdateDownloadDirectory(), fileName)
}

const getLauncherInstallerTempPath = (installerPath: string) => {
  if (/\.zip$/i.test(installerPath)) {
    return `${installerPath.slice(0, -4)}-download-${process.pid}-${Date.now()}-${crypto.randomUUID()}.zip`
  }
  return buildLauncherInstallerTempPath(
    installerPath,
    `${process.pid}-${Date.now()}-${crypto.randomUUID()}`
  )
}

const getLauncherInstallerFallbackPath = (installerPath: string) => {
  const parsed = path.parse(installerPath)
  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`)
}

const removeFileIfExistsQuietly = (filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return false
    fs.rmSync(filePath, { force: true, maxRetries: 6, retryDelay: 300 })
    return true
  } catch (err) {
    log.warn(`Could not remove locked file: ${filePath}`, getCompactErrorLog(err))
    return false
  }
}

const downloadLauncherUpdateInstaller = async (
  downloadUrl: string,
  installerPath: string,
  expectedSha256: string,
  artifactType: 'installer' | 'bundle' = 'installer'
) => {
  ensureDir(path.dirname(installerPath))
  if (fs.existsSync(installerPath)) {
    try {
      assertDownloadedLauncherUpdate(installerPath, expectedSha256, artifactType)
      return installerPath
    } catch {
      removeFileIfExistsQuietly(installerPath)
    }
  }
  const tempPath = getLauncherInstallerTempPath(installerPath)

  const response = await axios({
    method: 'GET',
    url: downloadUrl,
    responseType: 'stream',
    headers: HTTP_HEADERS,
    timeout: 300000,
    signal: AbortSignal.timeout(300000),
    maxContentLength: MAX_LAUNCHER_INSTALLER_BYTES
  })

  const totalLength = Number(response.headers['content-length']) || 0
  if (totalLength > MAX_LAUNCHER_INSTALLER_BYTES) {
    response.data.destroy()
    throw new Error('The launcher installer is larger than expected.')
  }

  let downloadedLength = 0
  const downloadedDigest = crypto.createHash('sha256')
  let lastProgressAt = 0
  let lastProgressValue = -1
  const writer = fs.createWriteStream(tempPath, { flags: 'wx' })

  response.data.on('data', (chunk: Buffer) => {
    downloadedLength += chunk.length
    downloadedDigest.update(chunk)
    if (downloadedLength > MAX_LAUNCHER_INSTALLER_BYTES) {
      response.data.destroy(new Error('The launcher installer is larger than expected.'))
      return
    }
    if (totalLength > 0) {
      const progressValue = Math.round((downloadedLength / totalLength) * 100)
      const now = Date.now()
      if (progressValue !== lastProgressValue && (now - lastProgressAt > 250 || progressValue >= 100)) {
        lastProgressAt = now
        lastProgressValue = progressValue
        sendLauncherUpdateProgress({
          state: 'downloading',
          percent: Math.min(progressValue, 100),
          detail: path.basename(installerPath)
        })
      }
    }
  })

  try {
    // pipeline closes both ends before rejecting, including disk-full and
    // aborted downloads, so partial-file cleanup cannot race an open writer.
    await pipeline(response.data, writer)
    const actualSha256 = downloadedDigest.digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(actualSha256, 'hex'), Buffer.from(expectedSha256, 'hex'))) {
      throw new Error('The launcher installer failed SHA-256 integrity verification.')
    }
    assertDownloadedLauncherUpdate(tempPath, expectedSha256, artifactType)
    let finalInstallerPath = installerPath
    if (fs.existsSync(installerPath) && !removeFileIfExistsQuietly(installerPath)) {
      finalInstallerPath = getLauncherInstallerFallbackPath(installerPath)
    }
    fs.renameSync(tempPath, finalInstallerPath)
    assertDownloadedLauncherUpdate(finalInstallerPath, expectedSha256, artifactType)
    return finalInstallerPath
  } catch (err) {
    removeFileIfExistsQuietly(tempPath)
    throw err
  }
}

const assertDownloadedLauncherUpdate = (
  filePath: string,
  expectedSha256: string,
  artifactType: 'installer' | 'bundle'
) => {
  if (artifactType === 'installer') {
    assertDownloadedLauncherInstaller(filePath, expectedSha256)
    return
  }
  assertDownloadedLauncherBundle(filePath, expectedSha256)
}

const assertDownloadedLauncherInstaller = (installerPath: string, expectedSha256: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Opening the downloaded launcher installer is only available on Windows.')
  }
  if (!fs.existsSync(installerPath) || !/\.exe$/i.test(installerPath)) {
    throw new Error('The downloaded launcher installer is missing or invalid.')
  }

  const stat = fs.lstatSync(installerPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_LAUNCHER_INSTALLER_BYTES) {
    throw new Error('The downloaded launcher installer is not a valid size.')
  }

  const fd = fs.openSync(installerPath, 'r')
  try {
    const header = Buffer.alloc(2)
    fs.readSync(fd, header, 0, header.length, 0)
    if (header.toString('ascii') !== 'MZ') {
      throw new Error('The downloaded launcher installer is not a Windows executable.')
    }
  } finally {
    fs.closeSync(fd)
  }
  assertFileSha256(installerPath, expectedSha256)
}

const assertDownloadedLauncherBundle = (bundlePath: string, expectedSha256: string) => {
  if (process.platform !== 'win32') throw new Error('Windows application bundles can only be used on Windows.')
  if (!fs.existsSync(bundlePath) || !/\.zip$/i.test(bundlePath)) {
    throw new Error('The downloaded launcher application bundle is missing or invalid.')
  }
  const stat = fs.lstatSync(bundlePath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 22 || stat.size > MAX_LAUNCHER_INSTALLER_BYTES) {
    throw new Error('The downloaded launcher application bundle is not a valid size.')
  }
  const descriptor = fs.openSync(bundlePath, 'r')
  try {
    const header = Buffer.alloc(4)
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length
      || !header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new Error('The downloaded launcher application bundle is not a ZIP archive.')
    }
  } finally {
    fs.closeSync(descriptor)
  }
  assertFileSha256(bundlePath, expectedSha256)
}

// Author/creator: nattapat2871 (https://nattapat2871.me)
const spawnDownloadedLauncherInstaller = (
  installerPath: string,
  args: readonly string[] = []
) => new Promise<void>((resolve, reject) => {
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(installerPath, [...args], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false
    })
  } catch (error) {
    reject(error)
    return
  }

  const onError = (error: Error) => reject(error)
  child.once('error', onError)
  child.once('spawn', () => {
    child.removeListener('error', onError)
    child.unref()
    resolve()
  })
})

const openDownloadedLauncherInstaller = async (installerPath: string, expectedSha256: string) => {
  assertDownloadedLauncherInstaller(installerPath, expectedSha256)
  try {
    await spawnDownloadedLauncherInstaller(installerPath, ['--updated', '--choose-install-mode'])
  } catch (error) {
    const openError = await shell.openPath(installerPath)
    if (!openError) {
      log.warn('The launcher installer opened through the Windows fallback without the update mode selector arguments.')
      return
    }
    throw new Error(
      `Windows could not open the launcher installer: ${error instanceof Error ? error.message : String(error || openError)}`
    )
  }
}

const quitLauncherForUpdateInstaller = () => {
  const timer = setTimeout(() => {
    log.info('Quitting NamLauncher after opening the update installer. The installer will relaunch NamLauncher when setup finishes.')
    requestAppQuit()
  }, 1200)
  timer.unref?.()
}

const quitLauncherForApplicationBundle = () => {
  log.info('Quitting NamLauncher after the verified application bundle updater became ready.')
  requestAppQuit()
}

const installWindowsApplicationBundle = async (
  update: StartupUpdateInfo,
  installScope: ReturnType<typeof resolveWindowsInstallScope> | null
) => {
  const bundleUrl = update.windowsBundleUrl
  const advertisedBundleSha256 = update.windowsBundleSha256
  if (!shouldUseWindowsApplicationBundle(installScope, bundleUrl, advertisedBundleSha256)
    || !bundleUrl || !advertisedBundleSha256) return false
  const downloadUrl = assertTrustedLauncherUpdateUrl(bundleUrl)
  const bundleSha256 = normalizeLauncherInstallerSha256(advertisedBundleSha256)
  if (!bundleSha256) return false
  const fileName = getLauncherBundleFileName(downloadUrl, update.latestVersion)
  const bundlePath = getLauncherUpdateInstallerPath(fileName)
  sendLauncherUpdateProgress({ state: 'downloading', percent: 0, detail: fileName })
  cleanupLauncherUpdateDownloadDirectory(bundlePath)
  const downloadedBundlePath = await downloadLauncherUpdateInstaller(downloadUrl, bundlePath, bundleSha256, 'bundle')
  assertLauncherUpdateInstallIsSafe()
  sendLauncherUpdateProgress({ state: 'verifying', percent: 100, detail: `Verifying ${fileName}` })
  writePendingLauncherUpdateCleanup(downloadedBundlePath, update.latestVersion)
  try {
    const handoff = await launchWindowsBundleUpdater({
      bundlePath: downloadedBundlePath,
      expectedSha256: bundleSha256,
      expectedVersion: update.latestVersion,
      launcherPath: process.execPath,
      helperSource: app.isPackaged
        ? path.join(process.resourcesPath, 'updater', 'update-windows-bundle.ps1')
        : path.resolve(__dirname, '../packaging/update-windows-bundle.ps1'),
      workDirectory: getLauncherUpdateDownloadDirectory(),
      parentId: process.pid
    })
    log.info(`Automatic Windows application bundle handoff ${handoff.attemptId} is ready in helper ${handoff.helperPid}.`)
  } catch (error) {
    fs.rmSync(path.join(userDataPath, UPDATE_CLEANUP_FILE), { force: true })
    throw error
  }
  sendLauncherUpdateProgress({ state: 'applying', percent: 100, detail: 'Verified update is ready; restarting NamLauncher' })
  quitLauncherForApplicationBundle()
  return true
}

const tryResolveWindowsInstallScope = () => {
  try {
    return resolveWindowsInstallScope(process.execPath)
  } catch (error) {
    log.warn(
      'NamLauncher could not identify the registered Windows install scope; using the verified interactive installer fallback.',
      getCompactErrorLog(error)
    )
    return null
  }
}

const assertLauncherUpdateInstallIsSafe = () => {
  if (hasActiveMinecraft()) {
    throw new LauncherUpdateBlockedError('minecraft-active')
  }
  if (activeInstallTasks.size > 0) {
    throw new LauncherUpdateBlockedError('content-install-active')
  }
}

const installLauncherUpdateUnsafe = async () => {
  assertLauncherUpdateInstallIsSafe()
  sendLauncherUpdateProgress({ state: 'checking', percent: 0, detail: 'Checking latest launcher release' })
  const update = await checkLauncherUpdate()
  if (!update.updateAvailable) {
    throw new LauncherUpdateBlockedError('already-current')
  }

  persistLauncherDataLocationForUpdate()

  if (process.platform !== 'win32') {
    await openExternalUrl(update.downloadUrl)
    return {
      success: false,
      openedDownload: true,
      message: 'Automatic launcher installation is only available on Windows.'
    }
  }

  const installScope = tryResolveWindowsInstallScope()
  if (await installWindowsApplicationBundle(update, installScope)) {
    return {
      success: true,
      installerOpened: true,
      willRestart: true,
      message: `NamLauncher ${update.latestVersion} is verified and will restart automatically.`
    }
  }

  const downloadUrl = assertTrustedLauncherUpdateUrl(update.downloadUrl)
  const installerSha256 = normalizeLauncherInstallerSha256(update.installerSha256)
  if (!installerSha256) {
    throw new Error('This launcher release cannot be installed automatically because its SHA-256 checksum is unavailable.')
  }
  const fileName = getLauncherInstallerFileName(downloadUrl, update.latestVersion)
  const installerPath = getLauncherUpdateInstallerPath(fileName)

  sendLauncherUpdateProgress({ state: 'downloading', percent: 0, detail: fileName })
  cleanupLauncherUpdateDownloadDirectory(installerPath)
  const downloadedInstallerPath = await downloadLauncherUpdateInstaller(downloadUrl, installerPath, installerSha256)
  sendLauncherUpdateProgress({
    state: 'opening-installer',
    percent: 100,
    detail: `Opening ${fileName}`
  })
  assertLauncherUpdateInstallIsSafe()
  writePendingLauncherUpdateCleanup(downloadedInstallerPath, update.latestVersion)
  try {
    await openDownloadedLauncherInstaller(downloadedInstallerPath, installerSha256)
  } catch (err) {
    fs.rmSync(path.join(userDataPath, UPDATE_CLEANUP_FILE), { force: true })
    throw err
  }
  sendLauncherUpdateProgress({
    state: 'installer-opened',
    percent: 100,
    detail: `Installer opened: ${fileName}`
  })
  quitLauncherForUpdateInstaller()

  return {
    success: true,
    installerPath: downloadedInstallerPath,
    installerOpened: true,
    willRestart: true,
    message: `Installer opened for NamLauncher ${update.latestVersion}. NamLauncher will close now and reopen when setup finishes.`
  }
}

const installLauncherUpdate = async () => {
  if (launcherUpdateInstallInFlight) {
    return getLauncherUpdateBlockedResult(new LauncherUpdateBlockedError('update-in-progress'))!
  }
  launcherUpdateInstallInFlight = true
  try {
    return await installLauncherUpdateUnsafe()
  } catch (error) {
    const blocked = getLauncherUpdateBlockedResult(error)
    if (blocked) {
      log.info(`Launcher update deferred safely (${blocked.blockReason}).`)
      return blocked
    }
    throw error
  } finally {
    launcherUpdateInstallInFlight = false
  }
}

let lastLauncherStatsFailureLogAt = 0
let lastOnlineHeartbeatFailureLogAt = 0
const NETWORK_FAILURE_LOG_INTERVAL_MS = 5 * 60 * 1000

const getLauncherWebsiteStats = async () => {
  try {
    const response = await axios.get<{
      downloads?: number
      online_players?: number
      heartbeat_window_seconds?: number
      download_url?: string | null
      launcher_version?: string | null
    }>(`${STATS_API_BASE}/api/stats`, {
      timeout: 6000,
      headers: HTTP_HEADERS
    })

    return {
      downloads: Number(response.data.downloads || 0),
      online_players: Number(response.data.online_players || 0),
      heartbeat_window_seconds: Number(response.data.heartbeat_window_seconds || 0),
      download_url: response.data.download_url || null,
      launcher_version: response.data.launcher_version || app.getVersion()
    }
  } catch (err) {
    const now = Date.now()
    if (now - lastLauncherStatsFailureLogAt >= NETWORK_FAILURE_LOG_INTERVAL_MS) {
      lastLauncherStatsFailureLogAt = now
      log.debug('Launcher website stats check failed', getCompactErrorLog(err))
    }
    return {
      downloads: 0,
      online_players: 0,
      heartbeat_window_seconds: 0,
      download_url: null,
      launcher_version: app.getVersion(),
      error: err instanceof Error ? err.message : 'Stats check failed'
    }
  }
}

const getClientInstallId = () => {
  const stored = readJsonFile<{ clientId?: string }>(clientIdentityPath, {})
  if (stored.clientId && typeof stored.clientId === 'string') return stored.clientId

  const clientId = crypto.randomUUID()
  writeJsonFile(clientIdentityPath, { clientId, createdAt: new Date().toISOString() })
  return clientId
}

const sendOnlineHeartbeat = async () => {
  if (onlineHeartbeatInFlight) return

  onlineHeartbeatInFlight = true
  try {
    await axios.post(
      `${STATS_API_BASE}/api/heartbeat`,
      {
        client_id: getClientInstallId(),
        launcher_version: app.getVersion(),
        platform: process.platform,
        game_running: runningGames.size > 0
      },
      {
        timeout: 5000,
        headers: HTTP_HEADERS
      }
    )
  } catch (err) {
    const now = Date.now()
    if (now - lastOnlineHeartbeatFailureLogAt >= NETWORK_FAILURE_LOG_INTERVAL_MS) {
      lastOnlineHeartbeatFailureLogAt = now
      log.debug('Online heartbeat failed.', getCompactErrorLog(err))
    }
  } finally {
    onlineHeartbeatInFlight = false
  }
}

const stopOnlineHeartbeat = () => {
  if (!onlineHeartbeatTimer) return
  clearInterval(onlineHeartbeatTimer)
  onlineHeartbeatTimer = null
}

type GameSessionEventResponse = {
  ok: boolean
  state: 'active' | 'ended'
  duration_seconds: number
}

const postGameSessionEvent = async (
  game: RunningGame,
  event: GameSessionEventName,
  options: { endReason?: GameSessionEndReason; exitCode?: number } = {}
) => {
  const sessionHeaders: Record<string, string> = {
    Authorization: `Bearer ${ERROR_REPORT_TOKEN}`
  }
  Object.assign(sessionHeaders, getLauncherDiscordIdentityHeader())
  await requestStatsApiJson<GameSessionEventResponse>('/api/game-sessions/events', {
    method: 'POST',
    timeout: 5000,
    headers: sessionHeaders,
    body: {
      event,
      session_id: game.telemetrySessionId,
      client_id: getClientInstallId(),
      player_name: normalizeErrorReportPlayerName(game.playerName),
      account_type: game.accountType,
      launcher_version: app.getVersion(),
      platform: process.platform,
      minecraft_version: trimRemoteText(game.minecraftVersion, 40) || 'unknown',
      loader: normalizeGameSessionLoader(game.loader),
      player_badge_enabled: readLauncherSettings().playerBadgeEnabled,
      server_state: game.currentServer ? 'connected' : 'disconnected',
      ...(game.currentServer ? {
        server_key: game.currentServer.key,
        server_address: game.currentServer.address,
        server_label: game.currentServer.label,
        server_kind: game.currentServer.kind
      } : {}),
      ...(event === 'start' ? {} : {
        client_duration_ms: Math.max(0, Date.now() - game.startedAt)
      }),
      ...(event === 'end' ? {
        end_reason: options.endReason || 'unknown',
        exit_code: Number.isInteger(options.exitCode) ? options.exitCode : null
      } : {})
    }
  })
  if (event === 'start') game.telemetryStartAcknowledged = true
}

const queueGameSessionEvent = (
  game: RunningGame,
  event: GameSessionEventName,
  options: { endReason?: GameSessionEndReason; exitCode?: number } = {}
) => {
  if (event === 'end') {
    if (!game.telemetryActive) return game.telemetryQueue || Promise.resolve()
    game.telemetryActive = false
  } else if (!game.telemetryActive) {
    return game.telemetryQueue || Promise.resolve()
  }

  const previous = game.telemetryQueue || Promise.resolve()
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      if (event !== 'start' && !game.telemetryStartAcknowledged) {
        await postGameSessionEvent(game, 'start')
      }
      await postGameSessionEvent(game, event, options)
    })
    .catch((error) => {
      const now = Date.now()
      if (now - lastGameSessionTelemetryFailureLogAt >= NETWORK_FAILURE_LOG_INTERVAL_MS) {
        lastGameSessionTelemetryFailureLogAt = now
        log.debug('Gameplay session telemetry failed.', getCompactErrorLog(error))
      }
    })
  game.telemetryQueue = queued
  return queued
}

const startGameSessionTelemetry = (
  game: RunningGame,
  _settings = readLauncherSettings()
) => {
  if (game.telemetryActive) return Promise.resolve()
  game.telemetrySessionId = crypto.randomUUID()
  game.telemetryActive = true
  game.telemetryStartAcknowledged = false
  game.telemetryQueue = undefined
  return queueGameSessionEvent(game, 'start')
}

type PlayerBadgePresenceEvent = 'start' | 'heartbeat' | 'end'

const postPlayerBadgePresence = async (
  game: RunningGame,
  event: PlayerBadgePresenceEvent
) => {
  const playerUuid = normalizePlayerBadgeUuid(game.playerUuid)
  if (!playerUuid || !['msa', 'offline'].includes(game.accountType)) return
  const offlineUuid = normalizePlayerBadgeUuid(getOfflineUuid(game.playerName))
  const playerUuidAliases = offlineUuid && offlineUuid !== playerUuid ? [offlineUuid] : []
  await requestStatsApiJson<{
    ok: boolean
    active: boolean
    ttl_seconds: number
  }>('/api/player-badges/presence', {
    method: 'POST',
    timeout: 5000,
    headers: { Authorization: `Bearer ${ERROR_REPORT_TOKEN}` },
    body: {
      event,
      presence_id: game.badgePresenceId,
      client_id: getClientInstallId(),
      player_uuid: playerUuid,
      player_uuid_aliases: playerUuidAliases,
      account_type: game.accountType,
      launcher_version: app.getVersion()
    }
  })
  if (event === 'start') game.badgePresenceStartAcknowledged = true
}

const queuePlayerBadgePresence = (
  game: RunningGame,
  event: PlayerBadgePresenceEvent
) => {
  if (event === 'end') {
    if (!game.badgePresenceActive) return game.badgePresenceQueue || Promise.resolve()
    game.badgePresenceActive = false
  } else if (!game.badgePresenceActive) {
    return game.badgePresenceQueue || Promise.resolve()
  }

  const previous = game.badgePresenceQueue || Promise.resolve()
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      if (event !== 'start' && !game.badgePresenceStartAcknowledged) {
        await postPlayerBadgePresence(game, 'start')
      }
      await postPlayerBadgePresence(game, event)
    })
    .catch((error) => {
      const now = Date.now()
      if (now - lastPlayerBadgePresenceFailureLogAt >= NETWORK_FAILURE_LOG_INTERVAL_MS) {
        lastPlayerBadgePresenceFailureLogAt = now
        log.debug('Player badge presence update failed.', getCompactErrorLog(error))
      }
    })
  game.badgePresenceQueue = queued
  return queued
}

const startPlayerBadgePresence = (
  game: RunningGame,
  settings = readLauncherSettings()
) => {
  if (
    !settings.playerBadgeEnabled
    || game.badgePresenceActive
    || !['msa', 'offline'].includes(game.accountType)
    || !normalizePlayerBadgeUuid(game.playerUuid)
  ) return Promise.resolve()
  game.badgePresenceId = crypto.randomUUID()
  game.badgePresenceActive = true
  game.badgePresenceStartAcknowledged = false
  game.badgePresenceQueue = undefined
  return queuePlayerBadgePresence(game, 'start')
}

const configurePlayerBadgePresence = (settings = readLauncherSettings()) => {
  for (const game of runningGames.values()) {
    try {
      writePlayerBadgeConfig({
        gameDirectory: game.gameDirectory,
        enabled: settings.playerBadgeEnabled,
        playerUuid: game.playerUuid,
        lookupEndpoint: `${STATS_API_BASE}/api/player-badges/lookup`
      })
    } catch (error) {
      log.warn('Could not update the running game player badge configuration.', getCompactErrorLog(error))
    }
    if (settings.playerBadgeEnabled) {
      void startPlayerBadgePresence(game, settings)
    } else if (game.badgePresenceActive) {
      void queuePlayerBadgePresence(game, 'end')
    }
  }
}

const reportRestrictedModSignals = async (
  game: RunningGame,
  _settings = readLauncherSettings()
) => {
  try {
    // Yield until launch-state/UI updates are delivered before the bounded local scan.
    await new Promise<void>((resolve) => setImmediate(resolve))
    const scan = scanRestrictedMods(game.gameDirectory)
    if (scan.observations.length === 0) {
      log.info(`Restricted-mod signal scan completed for the active instance (${scan.scannedFiles} files, no signals).`)
      return
    }
    await requestStatsApiJson<{
      ok: boolean
      audit_id: string
      observation_count: number
      duplicate: boolean
    }>('/api/restricted-mod-audits', {
      method: 'POST',
      timeout: 7000,
      headers: { Authorization: `Bearer ${ERROR_REPORT_TOKEN}` },
      body: {
        audit_id: crypto.randomUUID(),
        client_id: getClientInstallId(),
        player_name: normalizeErrorReportPlayerName(game.playerName),
        account_type: game.accountType,
        launcher_version: app.getVersion(),
        minecraft_version: trimRemoteText(game.minecraftVersion, 40) || 'unknown',
        loader: normalizeGameSessionLoader(game.loader),
        scanned_files: scan.scannedFiles,
        truncated: scan.truncated,
        consent_version: '2026-08-24.1',
        observations: scan.observations.map((observation) => ({
          detector_id: observation.detectorId,
          category: observation.category,
          display_name: observation.displayName,
          mod_version: observation.modVersion,
          source: observation.source
        }))
      }
    })
    log.info(`Reported ${scan.observations.length} potentially policy-restricted mod signal(s) from the active instance.`)
  } catch (error) {
    const now = Date.now()
    if (now - lastRestrictedModAuditFailureLogAt >= NETWORK_FAILURE_LOG_INTERVAL_MS) {
      lastRestrictedModAuditFailureLogAt = now
      log.debug('Required restricted-mod signal audit failed.', getCompactErrorLog(error))
    }
  }
}

const sendGameSessionHeartbeats = async () => {
  const active = [...runningGames.values()].filter((game) => game.telemetryActive)
  const badgeActive = [...runningGames.values()].filter((game) => game.badgePresenceActive)
  await Promise.allSettled([
    ...active.map((game) => queueGameSessionEvent(game, 'heartbeat')),
    ...badgeActive.map((game) => queuePlayerBadgePresence(game, 'heartbeat'))
  ])
}

const configureGameSessionTelemetry = (settings = readLauncherSettings()) => {
  for (const game of runningGames.values()) {
    if (game.telemetryActive) {
      void queueGameSessionEvent(game, 'heartbeat')
    } else {
      void startGameSessionTelemetry(game, settings)
    }
  }
}

const keepOnlineHeartbeatRunning = (_settings = readLauncherSettings()) => {
  if (isAppQuitting) return
  if (onlineHeartbeatTimer) return

  sendOnlineHeartbeat().catch(() => undefined)
  sendGameSessionHeartbeats().catch(() => undefined)
  onlineHeartbeatTimer = setInterval(() => {
    sendOnlineHeartbeat().catch(() => undefined)
    sendGameSessionHeartbeats().catch(() => undefined)
  }, GAME_SESSION_HEARTBEAT_INTERVAL_MS)
}

const configureOnlineHeartbeat = (settings = readLauncherSettings()) => {
  stopOnlineHeartbeat()
  keepOnlineHeartbeatRunning(settings)
}

const canEncryptAccountAuth = () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
      log.warn('Microsoft account persistence is disabled because Electron safeStorage is using the insecure Linux basic_text backend.')
      return false
    }
    return true
  } catch {
    return false
  }
}

const getStartupUpdateTarget = () => {
  let packageType = ''
  try { packageType = fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim() } catch { /* Not a package-managed build. */ }
  return selectStartupUpdateTarget(process.platform, process.arch, packageType, process.env.APPIMAGE || '', Boolean(process.env.FLATPAK_ID))
}

const startupUpdateAttemptPath = path.join(userDataPath, 'startup-update-attempt.json')
const startupAutoUpdateFallback = process.argv.includes('--auto-update-fallback')
const getCommandLineValue = (name: string) => {
  const index = process.argv.indexOf(name)
  return index >= 0 && index + 1 < process.argv.length ? String(process.argv[index + 1] || '') : ''
}
const pendingWindowsBundleHealth = (() => {
  const healthPath = getCommandLineValue('--auto-update-health')
  const attemptId = getCommandLineValue('--auto-update-attempt')
  const nonce = getCommandLineValue('--auto-update-nonce')
  const version = getCommandLineValue('--auto-update-version')
  if (!healthPath && !attemptId && !nonce && !version) return null
  try {
    const updateDirectory = fs.realpathSync(getLauncherUpdateDownloadDirectory())
    const resolvedHealthPath = path.resolve(healthPath)
    const expectedName = `app-update-health-${attemptId}.json`
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
      || !/^[0-9a-f]{64}$/i.test(nonce)
      || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)
      || !isSamePath(path.dirname(resolvedHealthPath), updateDirectory)
      || path.basename(resolvedHealthPath) !== expectedName
      || version !== app.getVersion()) {
      throw new Error('Mismatched application update health arguments.')
    }
    return { healthPath: resolvedHealthPath, attemptId, nonce, version }
  } catch (error) {
    log.error('Ignoring unsafe application update health arguments.', getCompactErrorLog(error))
    return null
  }
})()

const writeWindowsBundleHealthMarker = () => {
  if (!pendingWindowsBundleHealth) return
  const marker = pendingWindowsBundleHealth
  const payload = JSON.stringify({
    schemaVersion: 1,
    attemptId: marker.attemptId,
    nonce: marker.nonce,
    version: marker.version,
    launcherPid: process.pid,
    at: new Date().toISOString()
  })
  const temporary = `${marker.healthPath}.${process.pid}-${crypto.randomUUID()}.tmp`
  try {
    if (fs.existsSync(marker.healthPath)) {
      const current = fs.lstatSync(marker.healthPath)
      if (!current.isFile() || current.isSymbolicLink()) throw new Error('Unsafe application update health marker.')
      fs.rmSync(marker.healthPath, { force: true })
    }
    fs.writeFileSync(temporary, payload, { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, marker.healthPath)
    log.info(`Confirmed application update ${marker.attemptId} after the renderer became ready.`)
  } finally {
    removeFileIfExistsQuietly(temporary)
  }
}
const runStartupLauncherUpdateOnce = createStartupUpdateController({
  check: checkLauncherUpdate,
  enabled: () => app.isPackaged && !startupAutoUpdateFallback,
  target: getStartupUpdateTarget,
  activeWork: () => hasActiveMinecraft() || activeInstallTasks.size > 0 || launcherUpdateInstallInFlight,
  previousAttempt: () => {
    try {
      const info = fs.lstatSync(startupUpdateAttemptPath)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2048) return null
      const attempt = JSON.parse(fs.readFileSync(startupUpdateAttemptPath, 'utf8'))
      return typeof attempt.version === 'string' && Number.isFinite(attempt.at) ? attempt : null
    } catch { return null }
  },
  recordAttempt: (version, at) => {
    const temporary = `${startupUpdateAttemptPath}.${crypto.randomUUID()}.tmp`
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version, at }), { flag: 'wx', mode: 0o600 })
      fs.renameSync(temporary, startupUpdateAttemptPath)
    } finally {
      removeFileIfExistsQuietly(temporary)
    }
  },
  logFailure: (error) => log.warn('Startup automatic update failed; keeping the manual updater available.', getCompactErrorLog(error)),
  install: async (update, target) => {
    launcherUpdateInstallInFlight = true
    try {
      assertLauncherUpdateInstallIsSafe()
      persistLauncherDataLocationForUpdate()
      if (target === 'windows-x64') {
        const installScope = tryResolveWindowsInstallScope()
        if (await installWindowsApplicationBundle(update, installScope)) return
        const downloadUrl = assertTrustedLauncherUpdateUrl(update.downloadUrl)
        const installerSha256 = normalizeLauncherInstallerSha256(update.installerSha256)
        if (!installerSha256) throw new Error('Automatic update requires a verified SHA-256 checksum.')
        const installerPath = getLauncherUpdateInstallerPath(getLauncherInstallerFileName(downloadUrl, update.latestVersion))
        sendLauncherUpdateProgress({ state: 'downloading', percent: 0 })
        const downloadedInstallerPath = await downloadLauncherUpdateInstaller(downloadUrl, installerPath, installerSha256)
        assertLauncherUpdateInstallIsSafe()
        sendLauncherUpdateProgress({ state: 'opening-installer', percent: 100 })
        writePendingLauncherUpdateCleanup(downloadedInstallerPath, update.latestVersion)
        const handoff = await launchWindowsAutoInstaller({
          installerPath: downloadedInstallerPath,
          expectedSha256: installerSha256,
          launcherPath: process.execPath,
          helperSource: app.isPackaged ? path.join(process.resourcesPath, 'updater', 'update-windows.ps1') : path.resolve(__dirname, '../packaging/update-windows.ps1'),
          workDirectory: getLauncherUpdateDownloadDirectory(),
          parentId: process.pid
        })
        log.info(`Automatic Windows updater handoff ${handoff.attemptId} is ready in detached helper process ${handoff.helperPid}.`)
        sendLauncherUpdateProgress({ state: 'opening-installer', percent: 100, detail: 'Verified updater helper is ready' })
        quitLauncherForUpdateInstaller()
      } else {
        await installPlatformAutoUpdate({
          target,
          version: update.latestVersion,
          feedBase: `${STATS_API_BASE}/api/releases/updater/${target}/`,
          assertSafe: assertLauncherUpdateInstallIsSafe,
          onProgress: (percent) => sendLauncherUpdateProgress({ state: 'downloading', percent }),
          onInstalling: () => sendLauncherUpdateProgress({ state: 'opening-installer', percent: 100 }),
          relaunch: (executable) => app.relaunch(executable ? { execPath: executable } : {}),
          quit: requestAppQuit,
          beforeNativeQuit: () => { isAppQuitting = true },
          logger: log
        })
      }
    } catch (error) {
      launcherUpdateInstallInFlight = false
      isAppQuitting = false
      sendLauncherUpdateProgress({ state: 'failed', percent: 0 })
      throw error
    }
    // Keep the interlock until exit; a second installer or game cannot race it.
  }
})

const runStartupLauncherUpdate = async () => {
  try {
    const result = await runStartupLauncherUpdateOnce()
    // The detached helper returns here after a post-exit installer failure.
    // Surface the existing Thai/manual fallback UI instead of presenting the
    // disabled automatic path as an idle update.
    if (startupAutoUpdateFallback && result.outcome === 'disabled' && result.update.updateAvailable) {
      return { ...result, outcome: 'fallback' as const, reason: 'install-failed' as const }
    }
    return result
  }
  finally { startupUpdatePending = false }
}

type LauncherDiscordAccount = {
  sessionToken: string
  profile: LauncherDiscordProfile
  persistent: boolean
}

let launcherDiscordAccountCache: LauncherDiscordAccount | null | undefined
let launcherDiscordLinkPromise: Promise<LauncherDiscordAccount> | null = null

const normalizeStoredLauncherDiscordProfile = (value: any): LauncherDiscordProfile | null => {
  const id = String(value?.id || '').trim()
  const username = String(value?.username || '').trim()
  const displayName = String(value?.displayName || username).trim()
  const avatarUrl = String(value?.avatarUrl || '').trim()
  const expiresAt = value?.expiresAt ? String(value.expiresAt) : null
  if (!/^[0-9]{17,20}$/.test(id) || !username || username.length > 80 || !displayName || displayName.length > 80) return null
  try {
    const parsed = new URL(avatarUrl)
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname !== 'cdn.discordapp.com'
      || parsed.username
      || parsed.password
      || (parsed.port && parsed.port !== '443')
    ) return null
    return { id, username, displayName, avatarUrl: parsed.toString(), expiresAt }
  } catch {
    return null
  }
}

const clearLauncherDiscordAccount = () => {
  launcherDiscordAccountCache = null
  fs.rmSync(launcherDiscordAccountPath, { force: true })
}

const readLauncherDiscordAccount = (): LauncherDiscordAccount | null => {
  if (launcherDiscordAccountCache !== undefined) return launcherDiscordAccountCache
  launcherDiscordAccountCache = null
  const stored = readJsonFile<any>(launcherDiscordAccountPath, null)
  if (!stored || typeof stored !== 'object' || !canEncryptAccountAuth()) return null
  const profile = normalizeStoredLauncherDiscordProfile(stored.profile)
  const encrypted = String(stored.sessionEncrypted || '').trim()
  if (!profile || !encrypted) {
    clearLauncherDiscordAccount()
    return null
  }
  try {
    const sessionToken = safeStorage.decryptString(Buffer.from(encrypted, 'base64')).trim()
    if (!/^[A-Za-z0-9_-]{48,256}$/.test(sessionToken)) throw new Error('Invalid stored session token.')
    launcherDiscordAccountCache = { sessionToken, profile, persistent: true }
  } catch (error) {
    log.warn('Could not decrypt the saved Discord account link.', getCompactErrorLog(error))
    clearLauncherDiscordAccount()
  }
  return launcherDiscordAccountCache
}

const saveLauncherDiscordAccount = (sessionToken: string, profile: LauncherDiscordProfile) => {
  const persistent = canEncryptAccountAuth()
  launcherDiscordAccountCache = { sessionToken, profile, persistent }
  if (!persistent) {
    fs.rmSync(launcherDiscordAccountPath, { force: true })
    return launcherDiscordAccountCache
  }
  const sessionEncrypted = safeStorage.encryptString(sessionToken).toString('base64')
  writeJsonFile(launcherDiscordAccountPath, {
    author: 'nattapat2871 (https://nattapat2871.me)',
    profile,
    sessionEncrypted,
    updatedAt: new Date().toISOString()
  })
  return launcherDiscordAccountCache
}

const getLauncherDiscordAccountState = async () => {
  const account = readLauncherDiscordAccount()
  if (!account) return { connected: false, persistent: canEncryptAccountAuth(), profile: null }
  try {
    const profile = await validateLauncherDiscordSession(STATS_API_BASE, ERROR_REPORT_TOKEN, account.sessionToken)
    const saved = saveLauncherDiscordAccount(account.sessionToken, profile)
    return { connected: true, persistent: saved.persistent, profile: saved.profile }
  } catch (error) {
    if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
      clearLauncherDiscordAccount()
      return { connected: false, persistent: canEncryptAccountAuth(), profile: null }
    }
    log.debug('Could not refresh the linked Discord profile; using the encrypted cached profile.', getCompactErrorLog(error))
    return { connected: true, persistent: account.persistent, profile: account.profile, offline: true }
  }
}

const connectLauncherDiscordAccount = async () => {
  if (launcherDiscordLinkPromise) return launcherDiscordLinkPromise
  launcherDiscordLinkPromise = (async () => {
    const transaction = await startLauncherDiscordLink(STATS_API_BASE, ERROR_REPORT_TOKEN)
    await shell.openExternal(transaction.authorizeUrl)
    const linked = await waitForLauncherDiscordLink(
      STATS_API_BASE,
      ERROR_REPORT_TOKEN,
      transaction.requestToken
    )
    const account = saveLauncherDiscordAccount(linked.sessionToken, linked.profile)
    log.info(`Discord account link saved for user id ending ${account.profile.id.slice(-4)}.`)
    return account
  })()
  try {
    const account = await launcherDiscordLinkPromise
    return { connected: true, persistent: account.persistent, profile: account.profile }
  } finally {
    launcherDiscordLinkPromise = null
  }
}

const disconnectLauncherDiscordAccount = async () => {
  const account = readLauncherDiscordAccount()
  if (account) {
    try {
      await revokeLauncherDiscordSession(STATS_API_BASE, ERROR_REPORT_TOKEN, account.sessionToken)
    } catch (error) {
      log.debug('Could not revoke the Discord link remotely; removing the local session.', getCompactErrorLog(error))
    }
  }
  clearLauncherDiscordAccount()
  return { connected: false, persistent: canEncryptAccountAuth(), profile: null }
}

const getLauncherDiscordIdentityHeader = () => {
  const token = readLauncherDiscordAccount()?.sessionToken
  return token ? { 'X-NamLauncher-Identity': token } : {}
}

const getCurseForgeProxyHeaders = () => ({
  ...HTTP_HEADERS,
  'X-NamLauncher-Client': getClientInstallId()
})

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const RETRIABLE_DIRECTORY_REMOVE_CODES = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM', 'EACCES'])

const removeInstanceDirectoryWithRetry = async (instanceRoot: string) => {
  const maxAttempts = process.platform === 'win32' ? 10 : 4
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.rmSync(instanceRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 })
      if (!fs.existsSync(instanceRoot)) return
      lastError = new Error(`Instance directory still exists after delete attempt: ${instanceRoot}`)
    } catch (err) {
      lastError = err
      const code = String((err as NodeJS.ErrnoException).code || '')
      if (!RETRIABLE_DIRECTORY_REMOVE_CODES.has(code) || attempt === maxAttempts) throw err
    }

    if (attempt < maxAttempts) {
      await wait(Math.min(250 * attempt, 1_500))
    }
  }

  if (fs.existsSync(instanceRoot)) {
    throw lastError instanceof Error ? lastError : new Error(`Could not delete instance folder: ${instanceRoot}`)
  }
}

const INSTALL_CANCELLED_MESSAGE = 'Install cancelled by user.'

const normalizeInstallTaskId = (value: unknown) => {
  const taskId = String(value || '').trim()
  return /^[a-z0-9_.:-]{8,120}$/i.test(taskId) ? taskId : crypto.randomUUID()
}

const throwIfInstallCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error(INSTALL_CANCELLED_MESSAGE)
}

const isInstallCancelledError = (_err: unknown, signal?: AbortSignal) => signal?.aborted === true

const createInstallTask = (taskId: string, label: string) => {
  const existing = activeInstallTasks.get(taskId)
  if (existing) {
    existing.cancelled = true
    existing.abortController.abort()
    activeInstallTasks.delete(taskId)
  }

  if (cancelledInstallTaskIds.has(taskId)) {
    const abortedTask: InstallTask = {
      id: taskId,
      label,
      abortController: new AbortController(),
      cancelled: true,
      startedAt: Date.now()
    }
    abortedTask.abortController.abort()
    return abortedTask
  }

  const task: InstallTask = {
    id: taskId,
    label,
    abortController: new AbortController(),
    cancelled: false,
    startedAt: Date.now()
  }
  activeInstallTasks.set(taskId, task)
  return task
}

const withInstallTask = async <T>(
  request: { taskId?: unknown } | undefined,
  label: string,
  operation: (signal: AbortSignal) => Promise<T>
) => {
  const taskId = normalizeInstallTaskId(request?.taskId)
  const task = createInstallTask(taskId, label)
  try {
    throwIfInstallCancelled(task.abortController.signal)
    return await operation(task.abortController.signal)
  } catch (err) {
    if (isInstallCancelledError(err, task.abortController.signal)) {
      log.info(`Cancelled install task ${task.label} (${task.id}).`)
      return { success: false, canceled: true, cancelled: true } as T
    }
    throw err
  } finally {
    activeInstallTasks.delete(task.id)
    cancelledInstallTaskIds.delete(task.id)
  }
}

const getCurseForgeRetryDelay = (err: unknown, attempt: number) => {
  if (axios.isAxiosError(err)) {
    return retryAfterMilliseconds(err.response?.headers?.['retry-after'], Math.min(4000, 500 * (2 ** attempt)))
  }
  return Math.min(4000, 500 * (2 ** attempt))
}

const shouldRetryCurseForgeRequest = (err: unknown) => {
  if (!axios.isAxiosError(err)) return false
  if (err.code === 'ERR_CANCELED') return false
  const status = err.response?.status
  return !status
    || status === 408
    || status === 425
    || status === 429
    || status === 502
    || status === 503
    || status === 504
}

const waitForCurseForgeRetry = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new axios.CanceledError('CurseForge request canceled'))
    return
  }

  const finish = () => {
    signal?.removeEventListener('abort', abort)
    resolve()
  }
  const abort = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    reject(new axios.CanceledError('CurseForge request canceled'))
  }
  const timer = setTimeout(finish, milliseconds)
  signal?.addEventListener('abort', abort, { once: true })
})

const curseForgeRequestGate = new ProviderRequestGate(3)
const curseForgeSharedRequests = new SharedProviderRequests()

const requestCurseForge = async <T>(
  endpoint: string,
  options: { params?: Record<string, unknown>; timeout?: number; signal?: AbortSignal } = {}
) => {
  const params = Object.fromEntries(Object.entries(options.params || {}).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))
  const key = JSON.stringify({ endpoint, params, timeout: options.timeout || 30000 })
  return curseForgeSharedRequests.run(key, signal => performCurseForgeRequest<T>(endpoint, { ...options, signal }), options.signal)
}

const performCurseForgeRequest = async <T>(
  endpoint: string,
  options: { params?: Record<string, unknown>; timeout?: number; signal?: AbortSignal }
) => {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    throwIfInstallCancelled(options.signal)
    try {
      return await curseForgeRequestGate.run(async () => {
        throwIfInstallCancelled(options.signal)
        try {
          return await axios.get<T>(`${CURSEFORGE_PROXY_BASE}${endpoint}`, {
            timeout: options.timeout || 30000,
            headers: getCurseForgeProxyHeaders(),
            params: options.params,
            signal: options.signal
          })
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 429) {
            curseForgeRequestGate.defer(getCurseForgeRetryDelay(error, attempt), error)
          }
          throw error
        }
      }, options.signal)
    } catch (err) {
      if (options.signal?.aborted || axios.isCancel(err)) throw err
      lastError = err
      if (attempt >= 2 || !shouldRetryCurseForgeRequest(err)) throw err
      const delay = getCurseForgeRetryDelay(err, attempt)
      // Return the normal provider dialog for a long cooldown, rather than retry early.
      if (delay > 60_000) throw err
      log.warn(`CurseForge proxy request failed; retrying in ${delay}ms (${endpoint}).`)
      await waitForCurseForgeRetry(delay, options.signal)
    }
  }
  throw lastError
}

const removeLegacyCurseForgeApiKey = () => {
  if (!fs.existsSync(curseForgeConfigPath)) return
  try {
    fs.rmSync(curseForgeConfigPath, { force: true })
    log.info('Removed the legacy device-stored CurseForge API key; requests now use the NamLauncher server proxy.')
  } catch (err) {
    log.warn('Could not remove the legacy CurseForge API key file.', err)
  }
}

const getCurseForgeConfigStatus = async () => {
  try {
    const response = await requestCurseForge<{ data?: { configured?: boolean } }>('/status', { timeout: 15000 })
    const configured = response.data.data?.configured === true
    if (configured) removeLegacyCurseForgeApiKey()
    return { configured, source: 'proxy' }
  } catch (err) {
    log.debug('CurseForge proxy status check failed.', getCompactErrorLog(err))
    return { configured: false, source: 'proxy' }
  }
}

const getCurseForgeFailureMessage = (err: unknown, operation: 'search' | 'download') => {
  if (!axios.isAxiosError(err)) return 'CurseForge request failed unexpectedly.'
  const status = err.response?.status
  if (status === 429) return 'The NamLauncher CurseForge service is busy. Please wait a moment and try again.'
  if ((status === 403 || status === 451) && operation === 'download') return CURSEFORGE_DISTRIBUTION_DISABLED_MESSAGE
  if (status === 503) return 'The NamLauncher CurseForge service is temporarily unavailable.'
  if (status === 404 && operation === 'download') return 'The requested CurseForge file is no longer available.'
  if (err.code === 'ECONNABORTED') return 'CurseForge did not respond before the request timed out.'
  return `CurseForge request failed${status ? ` (HTTP ${status})` : ''}. Check the network and try again.`
}

const {
  readAccounts,
  getOfflineUuid,
  refreshAccountIfNeeded,
  migrateStoredAccountsEncryption,
  toAccountSummary,
  removeStoredAccount,
  isExpectedLaunchUserFacingError,
  resolveAccountForLaunch,
  getMicrosoftLoginFailureMessage,
  getMicrosoftRefreshToken,
  upsertAccount,
  createOfflineAuth
} = createAccountService({
  canEncryptAccountAuth,
  safeStorage,
  log,
  readJsonFile,
  accountsPath,
  writeJsonFile,
  crypto,
  isOfflineUsernameValidationError,
  msmc,
  sendProgress,
  redactSensitiveText,
  get mainWindow() { return mainWindow }
})

const {
  getPublicSkinLibrary,
  saveSkinPreset,
  saveDefaultSkinPreset,
  importSkinByPlayerName,
  activateSkinPreset,
  deleteSkinPreset,
  resetActiveSkin,
  prepareOfflineSkinLaunch,
  getDiscordPlayerTextureIdForLaunch,
  getFileSha256,
  closeOfflineSkinServer
} = createSkinService({
  path,
  readJsonFile,
  skinsLibraryPath,
  normalizeMinecraftTextureId,
  ensureDir,
  skinsDirectory,
  writeJsonFile,
  fs,
  crypto,
  log,
  axios,
  HTTP_HEADERS,
  readAccounts,
  refreshAccountIfNeeded,
  userDataPath,
  app,
  createServer,
  verifyMinecraftTextureFile,
  AUTHLIB_INJECTOR_FILE,
  AUTHLIB_INJECTOR_SHA256,
  AUTHLIB_INJECTOR_URL,
  get downloadFile() { return downloadFile }
})

const {
  searchNameMcSkins,
  resolveNameMcSkin,
  applyNameMcSkin
} = createNameMcCatalogService({
  axios,
  fs,
  path,
  crypto,
  ensureDir,
  userDataPath,
  HTTP_HEADERS,
  log,
  saveSkinPreset,
  importSkinByPlayerName
})

const {
  normalizeInstance,
  hydrateLauncherInstances,
  updateInstanceMetadata,
  getInstancePaths,
  ensureInstanceRoot,
  provisionInstanceDefaults,
  getInstancePlaces,
  pingInstanceServers,
  getInstancePlacesPaths,
  getInstanceRunLog,
  sanitizeFolderName,
  writeRunLog,
  closeRunLog,
  buildDiagnosticExcerpt,
  buildInstanceCrashLog,
  provisionThaiResourcePack,
  disableManagedThaiResourcePacksInOptions,
  provisionPartnerServers,
  validateQuickPlayRequest,
  createInstanceRunLog,
  releaseChildProcessFromLauncher,
  releaseRunningGamesForLauncherExit,
  checkLauncherUpdateFromTray,
  configureLauncherUpdateChecks,
  stopLauncherUpdateChecks,
  assertChildPathIsSafe,
  assertInstancePathIsSafe
} = createInstanceService({
  normalizeLoader,
  path,
  fs,
  readJsonFile,
  requestModrinth,
  MODRINTH_API_BASE,
  writeJsonFile,
  log,
  userDataPath,
  ensureDir,
  runningGames,
  activeLaunches,
  app,
  getFileSha256,
  crypto,
  isPathInside,
  getCompactErrorLog,
  readMinecraftServersDat,
  PARTNER_SERVERS,
  normalizeMinecraftServerEndpoint,
  PARTNER_SERVER_REVISION,
  mergePartnerServersDat,
  redactSensitiveText,
  sendGameLog,
  queueGameSessionEvent,
  queuePlayerBadgePresence,
  checkLauncherUpdate,
  showMainWindow,
  getTrayLanguage,
  dialog,
  logPath,
  sanitizeBugReport,
  truncateRemoteText,
  assertPathWithinRoot,
  scanMinecraftWorlds,
  selectMinecraftServerPingTargets,
  pingMinecraftServer,
  createServerQuickPlay,
  createWorldQuickPlay,
  LAUNCHER_UPDATE_CHECK_INTERVAL_MS,
  get mainWindow() { return mainWindow }
})

const {
  downloadFile,
  getCurseForgeModId,
  normalizeCurseForgeProjectType,
  getCurseForgeModpackVersions,
  getCurseForgeCompatibleFiles,
  hashFile,
  getZipEntryDataWithLimit,
  getInstanceUpdateSummary,
  listInstanceMods,
  getInstanceContent,
  toggleInstanceContent,
  deleteInstanceContent,
  importInstanceContentFiles,
  revealInstanceContentFile,
  importCurseForgeManualDownload,
  searchCurseForgeProjects,
  searchModrinthProjects,
  getModrinthFailureMessage,
  installCurseForgeModpack,
  getCurseForgeContentStatus,
  installCurseForgeProject,
  getModrinthContentStatuses,
  getModrinthProjectVersions,
  installModrinthProject,
  installModrinthModpack,
  installLocalMrpack,
  exportInstanceMrpack,
  CURSEFORGE_DISTRIBUTION_DISABLED_MESSAGE
} = createContentService({
  normalizeInstance,
  getInstancePaths,
  readJsonFile,
  writeJsonFile,
  hasActiveMinecraft,
  assertChildPathIsSafe,
  runningGames,
  activeLaunches,
  requestModrinth,
  modrinthVersionCache,
  MODRINTH_VERSION_CACHE_TTL_MS,
  modrinthVersionRequests,
  MODRINTH_API_BASE,
  setCachedModrinthVersions,
  throwIfInstallCancelled,
  DOWNLOAD_INTEGRITY_ERROR_CODE,
  HTTP_HEADERS,
  ensureInstanceRoot,
  assertInstancePathIsSafe,
  sendProgress,
  yieldToEventLoop,
  sanitizeBugReport,
  MAX_CONTENT_DOWNLOAD_BYTES,
  withFileDownloadLock,
  INSTALL_CANCELLED_MESSAGE,
  isInstallCancelledError,
  shouldRetryDownloadError,
  getGenericRetryAfterMs,
  getCompactErrorLog,
  waitForModrinthRetry,
  userDataPath,
  MAX_MODPACK_ICON_BYTES,
  MAX_MODPACK_INDEX_BYTES,
  MAX_ZIP_METADATA_ENTRY_BYTES,
  MAX_MODPACK_OVERRIDE_FILES,
  MAX_MODPACK_OVERRIDE_ENTRY_BYTES,
  MAX_MODPACK_OVERRIDE_TOTAL_BYTES,
  provisionInstanceDefaults,
  isPathInside,
  CURSEFORGE_CLASS_IDS,
  getCachedProjectSearchResult,
  projectSearchInFlight,
  setCachedProjectSearchResult,
  shouldRetryModrinthRequest,
  shouldFallbackToModrinthProxy,
  requestCurseForge,
  getCurseForgeFailureMessage,
  ensureDir,
  log
})

const {
  listFabricLoaderVersions,
  listForgeVersions,
  listQuiltLoaderVersions,
  listNeoForgeVersions,
  getQuiltGameCompatibility,
  getCurseForgeProjectVersions,
  prepareLoader
} = createLoaderService({
  ensureDir,
  log,
  getCompactErrorLog,
  downloadFile,
  getCurseForgeModId,
  normalizeCurseForgeProjectType,
  getCurseForgeModpackVersions,
  normalizeInstance,
  getCurseForgeCompatibleFiles,
  throwIfInstallCancelled,
  hashFile,
  sendProgress,
  writeJsonFile,
  readJsonFile,
  getZipEntryDataWithLimit,
  FABRIC_META_BASE,
  QUILT_META_BASE,
  QUILT_MAVEN_METADATA_URL,
  FORGE_PROMOTIONS_URL,
  FORGE_MAVEN_BASE,
  NEOFORGE_METADATA_URL,
  NEOFORGE_MAVEN_BASE,
  MOJANG_VERSION_MANIFEST_URL,
  HTTP_HEADERS,
  MAX_ZIP_METADATA_ENTRY_BYTES,
  LAUNCH_CANCELLED_MESSAGE
})

function createLauncherStartupSplashHtml(iconPath?: string) {
  const iconUrl = iconPath ? pathToFileURL(iconPath).toString() : ''
  const iconMarkup = iconUrl
    ? `<img src="${iconUrl}" alt="" />`
    : '<div class="logo-fallback">NL</div>'

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>NamLauncher</title>
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #07111f;
        color: #e5eefc;
        font-family: "Noto Sans Thai", "Leelawadee UI", "Segoe UI", sans-serif;
      }
      body {
        display: grid;
        place-items: center;
        background:
          linear-gradient(135deg, rgba(37, 99, 235, 0.12), transparent 34%),
          linear-gradient(180deg, #09101f, #07111f);
      }
      main {
        width: min(440px, calc(100vw - 48px));
        text-align: center;
      }
      img, .logo-fallback {
        width: 96px;
        height: 96px;
        margin: 0 auto;
        border-radius: 18px;
        object-fit: contain;
        filter: drop-shadow(0 22px 40px rgba(59, 130, 246, 0.36));
      }
      .logo-fallback {
        display: grid;
        place-items: center;
        border: 1px solid rgba(96, 165, 250, 0.34);
        background: rgba(37, 99, 235, 0.14);
        color: #bfdbfe;
        font-size: 28px;
        font-weight: 900;
      }
      h1 {
        margin: 26px 0 8px;
        color: #fff;
        font-size: 34px;
        font-weight: 900;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: #9fb0c9;
        font-size: 13px;
        font-weight: 800;
      }
      .bar {
        position: relative;
        height: 8px;
        margin-top: 30px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.94);
        box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.1);
      }
      .bar::after {
        position: absolute;
        inset: 0;
        width: 44%;
        border-radius: inherit;
        background: linear-gradient(90deg, #2563eb, #60a5fa);
        animation: load 1.1s ease-in-out infinite;
        content: "";
      }
      @keyframes load {
        from { transform: translateX(-120%); }
        to { transform: translateX(240%); }
      }
    </style>
  </head>
  <body>
    <main role="status" aria-live="polite">
      ${iconMarkup}
      <h1>NamLauncher</h1>
      <p>กำลังเปิดลันเชอร์และโหลดข้อมูล...</p>
      <div class="bar" aria-hidden="true"></div>
    </main>
  </body>
</html>`
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow()
    return
  }

  const icon = getAppIcon()
  const iconPath = icon?.path
  const rendererRoot = path.resolve(__dirname, '../dist')
  const rendererIndexPath = path.join(rendererRoot, 'index.html')
  const devServerUrl = !app.isPackaged ? String(process.env.VITE_DEV_SERVER_URL || '').trim() : ''

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 800,
    minWidth: 1280,
    minHeight: 720,
    ...(icon ? { icon: icon.image } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: true
    },
    frame: false,
    show: false,
    backgroundColor: '#07111f'
  })
  rendererResponsivenessMonitor?.dispose()
  const monitoredWindow = mainWindow
  rendererResponsivenessMonitor = new WindowResponsivenessMonitor({
    onPersistent: async (durationMs) => {
      if (isAppQuitting || monitoredWindow.isDestroyed()) return
      log.warn('Launcher renderer remained unresponsive.', {
        durationMs,
        visible: monitoredWindow.isVisible(),
        minimized: monitoredWindow.isMinimized(),
        restingInTray: launcherRestingInTray
      })
      await publishLauncherError(
        'The launcher window remained unresponsive for at least 12 seconds.',
        'electron-window',
        'Launcher remained unresponsive'
      )
    },
    onRecovered: (durationMs, reported) => {
      log.info(`Launcher renderer recovered after ${durationMs}ms${reported ? ' (incident reported).' : '.'}`)
    },
    onReportError: (error) => {
      log.warn('Could not publish a sustained renderer unresponsive incident.', getCompactErrorLog(error))
    }
  })

  mainWindow.on('show', () => {
    launcherRestingInTray = false
    mainWindow?.setSkipTaskbar(false)
    syncDiscordForLauncherState()
  })

  mainWindow.on('restore', () => {
    launcherRestingInTray = false
    syncDiscordForLauncherState()
  })
  mainWindow.on('minimize', syncDiscordForLauncherState)
  mainWindow.on('hide', () => {
    launcherRestingInTray = true
    syncDiscordForLauncherState()
  })

  mainWindow.on('close', (event) => {
    if (isAppQuitting) return
    event.preventDefault()
    closeLauncherWindow()
  })

  mainWindow.on('unresponsive', () => rendererResponsivenessMonitor?.markUnresponsive())
  mainWindow.on('responsive', () => rendererResponsivenessMonitor?.markResponsive())

  mainWindow.on('closed', () => {
    rendererResponsivenessMonitor?.dispose()
    rendererResponsivenessMonitor = null
    mainWindow = null
    if (!isAppQuitting) syncDiscordForLauncherState()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url).catch(() => undefined)
    return { action: 'deny' }
  })

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  const windowForRenderer = mainWindow
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (isAppQuitting || details.reason === 'clean-exit') return
    publishLauncherError(`Renderer process ended: ${details.reason} (exit code ${details.exitCode})`, 'renderer-process', 'Launcher renderer stopped')
      .catch(() => undefined)

    const now = Date.now()
    rendererRecoveryAttempts = rendererRecoveryAttempts.filter((attemptedAt) => (
      now - attemptedAt < RENDERER_RECOVERY_WINDOW_MS
    ))
    if (rendererRecoveryAttempts.length >= MAX_RENDERER_RECOVERIES_PER_WINDOW) {
      log.error('Launcher renderer recovery stopped after repeated failures.')
      return
    }
    rendererRecoveryAttempts.push(now)

    const recoveryTimer = setTimeout(() => {
      if (
        isAppQuitting
        || !windowForRenderer
        || windowForRenderer.isDestroyed()
        || mainWindow !== windowForRenderer
        || windowForRenderer.webContents.isDestroyed()
      ) return
      log.warn(`Reloading the launcher interface after renderer ${details.reason}.`)
      windowForRenderer.webContents.reload()
    }, 250)
    recoveryTimer.unref?.()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return
    publishLauncherError(`${errorDescription} (error ${errorCode})`, 'renderer-load', 'Launcher interface failed to load')
      .catch(() => undefined)
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (devServerUrl && url.startsWith(devServerUrl)) return
    if (!devServerUrl) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'file:') {
          const targetPath = fileURLToPath(parsed)
          if (isSamePath(targetPath, rendererIndexPath) || isPathInside(targetPath, rendererRoot)) return
        }
      } catch {
        // Fall through and block malformed or external navigation targets.
      }
    }

    event.preventDefault()
    openExternalUrl(url).catch(() => undefined)
  })

  const loadLauncherRenderer = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (devServerUrl) {
      mainWindow.loadURL(devServerUrl)
    } else {
      mainWindow.loadFile(rendererIndexPath)
    }
  }

  mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(createLauncherStartupSplashHtml(iconPath))}`)
    .then(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) showMainWindow()
      setTimeout(loadLauncherRenderer, 120)
    })
    .catch(() => {
      loadLauncherRenderer()
    })
}

app.on('second-instance', () => {
  showMainWindow()
})

app.whenReady().then(() => {
  migrateStoredAccountsEncryption()
  createWindow()
  const settings = readLauncherSettings()
  configureDiscordForActiveGames(settings)
  configureOnlineHeartbeat(settings)
  configureLauncherUpdateChecks()
})

app.on('activate', () => {
  showMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') requestAppQuit()
})

app.on('before-quit', () => {
  isAppQuitting = true
  rendererResponsivenessMonitor?.dispose()
  releaseRunningGamesForLauncherExit()
  stopOnlineHeartbeat()
  stopLauncherUpdateChecks()
  closeOfflineSkinServer()
  discordManager.shutdown()
  minecraftDiscordManager.shutdown()
  tray?.destroy()
  tray = null
})

const {
  configureDiscordForActiveGames,
  requestMinecraftStop,
  stopAllMinecraftFromTray
} = registerIpcHandlers({
  trustedIpcHandle,
  readAccounts,
  toAccountSummary,
  removeStoredAccount,
  getPublicSkinLibrary,
  saveSkinPreset,
  saveDefaultSkinPreset,
  importSkinByPlayerName,
  searchNameMcSkins,
  resolveNameMcSkin,
  applyNameMcSkin,
  activateSkinPreset,
  deleteSkinPreset,
  resetActiveSkin,
  listFabricLoaderVersions,
  listForgeVersions,
  listQuiltLoaderVersions,
  listNeoForgeVersions,
  log,
  getQuiltGameCompatibility,
  getGameState,
  hydrateLauncherInstances,
  updateInstanceMetadata,
  normalizeInstance,
  runningGames,
  activeLaunches,
  provisionInstanceDefaults,
  getInstancePlaces,
  assertMainRendererInvocation,
  getLatestRunningGame,
  discoverLocalMinecraftServers,
  pingInstanceServers,
  getInstancePlacesPaths,
  cacheRemoteImageUrl,
  isMainRendererInvocation,
  getInstanceUpdateSummary,
  checkLauncherUpdate,
  installLauncherUpdate,
  getLauncherWebsiteStats,
  fetchLegalDocument,
  STATS_API_BASE,
  readLauncherSettings,
  saveLauncherSettings,
  runStartupLauncherUpdate,
  getLauncherDiscordAccountState,
  connectLauncherDiscordAccount,
  disconnectLauncherDiscordAccount,
  getLauncherDataLocation,
  hasActiveMinecraft,
  getLauncherRootForSelectedPath,
  userDataPath,
  normalizeLauncherDataTarget,
  isSamePath,
  isPathInside,
  canWriteToDirectory,
  copyLauncherDataEntries,
  DATA_CLEANUP_FILE,
  writePendingDataCleanup,
  writeDataLocationConfig,
  refreshTrayMenu,
  configureOnlineHeartbeat,
  configureGameSessionTelemetry,
  configurePlayerBadgePresence,
  getDiscordRuntimeSettings,
  getMinecraftDiscordRuntimeSettings,
  listInstanceMods,
  getInstanceContent,
  getInstanceRunLog,
  toggleInstanceContent,
  deleteInstanceContent,
  importInstanceContentFiles,
  revealInstanceContentFile,
  ensureInstanceRoot,
  ensureDir,
  importCurseForgeManualDownload,
  getCurseForgeConfigStatus,
  searchCurseForgeProjects,
  searchModrinthProjects,
  getCompactErrorLog,
  HOME_DISCOVERY_SESSION_SEED,
  getModrinthFailureMessage,
  sanitizeBugReport,
  getCurseForgeModpackVersions,
  getCurseForgeFailureMessage,
  getCurseForgeProjectVersions,
  withInstallTask,
  installCurseForgeModpack,
  recordContentUsage,
  isInstallCancelledError,
  getCurseForgeModId,
  getCurseForgeContentStatus,
  installCurseForgeProject,
  getModrinthContentStatuses,
  getModrinthProjectVersions,
  installModrinthProject,
  installModrinthModpack,
  installLocalMrpack,
  cancelledInstallTaskIds,
  activeInstallTasks,
  sendProgress,
  INSTALL_CANCELLED_MESSAGE,
  sanitizeFolderName,
  exportInstanceMrpack,
  getInstancePaths,
  assertInstancePathIsSafe,
  removeInstanceDirectoryWithRetry,
  cleanupStaleLaunches,
  LAUNCH_CANCELLED_MESSAGE,
  writeRunLog,
  sendGameState,
  compactMinecraftDebugMessage,
  redactSensitiveText,
  queueGameSessionEvent,
  queuePlayerBadgePresence,
  sendOnlineHeartbeat,
  truncateRemoteText,
  buildDiagnosticExcerpt,
  buildInstanceCrashLog,
  publishLauncherError,
  sendMinecraftGameIssue,
  isExpectedLaunchUserFacingError,
  closeRunLog,
  getActiveMinecraftCount,
  restoreLauncherAfterGame,
  resolveAccountForLaunch,
  prepareOfflineSkinLaunch,
  getLaunchJavaArgs,
  provisionThaiResourcePack,
  disableManagedThaiResourcePacksInOptions,
  provisionPartnerServers,
  validateQuickPlayRequest,
  createInstanceRunLog,
  prepareLoader,
  notifiedLegacyCompanionVersions,
  FORGE_MAVEN_BASE,
  releaseChildProcessFromLauncher,
  getDiscordPlayerTextureIdForLaunch,
  startGameSessionTelemetry,
  startPlayerBadgePresence,
  reportRestrictedModSignals,
  minimizeLauncherForGame,
  getMicrosoftLoginFailureMessage,
  getMicrosoftRefreshToken,
  upsertAccount,
  createOfflineAuth,
  minimizeLauncherToTaskbar,
  requestAppQuit,
  closeLauncherWindow,
  logPath,
  openExternalUrl,
  confirmLauncherErrorReport,
  writeWindowsBundleHealthMarker,
  get activeErrorReportAccountId() { return activeErrorReportAccountId },
  set activeErrorReportAccountId(value: any) { activeErrorReportAccountId = value },
  get mainWindow() { return mainWindow },
  get launcherRestingInTray() { return launcherRestingInTray },
  get isAppQuitting() { return isAppQuitting },
  get activeCurseForgeSearchController() { return activeCurseForgeSearchController },
  set activeCurseForgeSearchController(value: any) { activeCurseForgeSearchController = value },
  get activeModrinthSearchController() { return activeModrinthSearchController },
  set activeModrinthSearchController(value: any) { activeModrinthSearchController = value },
  get startupUpdatePending() { return startupUpdatePending },
  get requiredLauncherUpdateVersion() { return requiredLauncherUpdateVersion },
  get launcherUpdateInstallInFlight() { return launcherUpdateInstallInFlight },
  get tray() { return tray }
})
