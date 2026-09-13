// Author/creator: nattapat2871 (https://nattapat2871.me)
import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import type { OpenDialogOptions, SaveDialogOptions } from 'electron'
import path from 'path'
import fs from 'fs'
import type * as NodeFs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { spawn } from 'child_process'
import axios from 'axios'
import MCLC from 'minecraft-launcher-core'
import * as msmc from 'msmc'
import { ensureJavaExists, getMinecraftLaunchJavaPath } from '../javaManager.ts'
import { discordManager, minecraftDiscordManager, MINECRAFT_OFFICIAL_APPLICATION_ID } from '../discord.ts'
import { applyCustomJavaArgumentPolicy, normalizePerformanceProfile, resolvePerformancePolicy } from '../performancePolicy.ts'
import { assessLanReadiness, detectLanPortFromLogLine } from '../minecraft/lanReadiness.ts'
import { shouldPublishLanSessionPort } from '../minecraft/lanIpc.ts'
import { provisionBrandingBridge } from '../minecraft/brandingBridge.ts'
import { writePlayerBadgeConfig } from '../minecraft/playerBadgeConfig.ts'
import {
  addMinecraftServerDat,
  createMinecraftServerTelemetryState,
  normalizeMinecraftServerEndpoint,
  parseMinecraftServerLogEvent,
  readMinecraftServersDat,
  removeMinecraftServerDat
} from '../minecraft/index.ts'
import { selectHomeDiscoveryProjects, type HomeDiscoveryLane, type HomeDiscoveryLaneResult } from '../homeDiscovery.ts'
import { PARTNER_SERVERS } from '../../shared/partnerServers.ts'
import { OFFLINE_USERNAME_ERROR_MESSAGE, isValidOfflineUsername } from '../../shared/offlineUsername.ts'
import { getGameSessionEndReason } from '../../shared/gameSessionTelemetry.ts'
import { getMinecraftCrashDiagnosis } from '../../shared/minecraftCrashDiagnosis.ts'
import { classifyMinecraftProcessFailure, isLocalMinecraftLaunchFailure } from '../../shared/minecraftFailureClassification.ts'
import type { LegalLanguage } from '../legal.ts'
import type {
  CurseForgeContentStatusRequest,
  CurseForgeInstallRequest,
  CurseForgeManualDownloadRequest,
  CurseForgeSearchRequest,
  DataLocationMoveRequest,
  InstanceContentRequest,
  InstanceServerMutationRequest,
  InstanceServerPingRequest,
  InstanceUpdateRequest,
  LanReadinessRequest,
  LaunchRequest,
  LauncherErrorSubmitRequest,
  LauncherInstance,
  LauncherSettings,
  LaunchSession,
  ModrinthContentStatusRequest,
  ModrinthInstallRequest,
  ModrinthSearchRequest,
  RunningGame,
  SkinActionRequest,
  SkinDefaultRequest,
  SkinImportRequest,
  SkinSaveRequest,
  StoredAccount
} from '../main.ts'

const { Client } = MCLC

type IpcRegistrationDependencies = {
  [key: string]: any
  activeInstallTasks: Map<string, any>
  activeLaunches: Map<string, LaunchSession>
  cancelledInstallTaskIds: Set<string>
  readAccounts: () => StoredAccount[]
  readLauncherSettings: () => LauncherSettings
  runningGames: Map<string, RunningGame>
  trustedIpcHandle: (channel: string, listener: (event: any, ...args: any[]) => any) => void
  withInstallTask: <T>(request: any, label: string, operation: (signal: AbortSignal) => Promise<T>) => Promise<T>
}

export const registerIpcHandlers = (deps: IpcRegistrationDependencies) => {
  const {
    trustedIpcHandle, readAccounts, toAccountSummary, removeStoredAccount, getPublicSkinLibrary,
    saveSkinPreset, saveDefaultSkinPreset, importSkinByPlayerName, activateSkinPreset,
    searchNameMcSkins, resolveNameMcSkin, applyNameMcSkin,
    deleteSkinPreset, resetActiveSkin, listFabricLoaderVersions, listForgeVersions,
    listQuiltLoaderVersions, listNeoForgeVersions, log, getQuiltGameCompatibility, getGameState,
    hydrateLauncherInstances, updateInstanceMetadata, normalizeInstance, runningGames, activeLaunches,
    provisionInstanceDefaults, getInstancePlaces, assertMainRendererInvocation, getLatestRunningGame,
    discoverLocalMinecraftServers, pingInstanceServers, getInstancePlacesPaths, cacheRemoteImageUrl,
    isMainRendererInvocation, getInstanceUpdateSummary, checkLauncherUpdate, installLauncherUpdate,
    getLauncherWebsiteStats, fetchLegalDocument, STATS_API_BASE, readLauncherSettings,
    runStartupLauncherUpdate, getLauncherDiscordAccountState, connectLauncherDiscordAccount,
    disconnectLauncherDiscordAccount, getLauncherDataLocation, hasActiveMinecraft, saveLauncherSettings,
    getLauncherRootForSelectedPath, userDataPath, normalizeLauncherDataTarget, isSamePath,
    isPathInside, canWriteToDirectory, copyLauncherDataEntries, DATA_CLEANUP_FILE,
    writePendingDataCleanup, writeDataLocationConfig, refreshTrayMenu, configureOnlineHeartbeat,
    configureGameSessionTelemetry, configurePlayerBadgePresence, getDiscordRuntimeSettings,
    getMinecraftDiscordRuntimeSettings, listInstanceMods, getInstanceContent, getInstanceRunLog,
    toggleInstanceContent, deleteInstanceContent, importInstanceContentFiles,
    revealInstanceContentFile, ensureInstanceRoot, ensureDir, importCurseForgeManualDownload,
    getCurseForgeConfigStatus, searchCurseForgeProjects, searchModrinthProjects,
    getCompactErrorLog, HOME_DISCOVERY_SESSION_SEED, getModrinthFailureMessage,
    sanitizeBugReport, getCurseForgeModpackVersions, getCurseForgeFailureMessage,
    getCurseForgeProjectVersions, withInstallTask, installCurseForgeModpack, recordContentUsage,
    isInstallCancelledError, getCurseForgeModId, getCurseForgeContentStatus,
    installCurseForgeProject, getModrinthContentStatuses, getModrinthProjectVersions,
    installModrinthProject, installModrinthModpack, installLocalMrpack, cancelledInstallTaskIds,
    activeInstallTasks, sendProgress, INSTALL_CANCELLED_MESSAGE, sanitizeFolderName,
    exportInstanceMrpack, getInstancePaths, assertInstancePathIsSafe,
    removeInstanceDirectoryWithRetry, cleanupStaleLaunches, LAUNCH_CANCELLED_MESSAGE,
    writeRunLog, sendGameState, compactMinecraftDebugMessage, redactSensitiveText,
    queueGameSessionEvent, queuePlayerBadgePresence, sendOnlineHeartbeat, truncateRemoteText,
    buildDiagnosticExcerpt, buildInstanceCrashLog, publishLauncherError, sendMinecraftGameIssue,
    isExpectedLaunchUserFacingError, closeRunLog, getActiveMinecraftCount,
    restoreLauncherAfterGame, resolveAccountForLaunch, prepareOfflineSkinLaunch, getLaunchJavaArgs,
    provisionThaiResourcePack, disableManagedThaiResourcePacksInOptions, provisionPartnerServers,
    validateQuickPlayRequest, createInstanceRunLog, prepareLoader, notifiedLegacyCompanionVersions,
    FORGE_MAVEN_BASE, releaseChildProcessFromLauncher, getDiscordPlayerTextureIdForLaunch,
    startGameSessionTelemetry, startPlayerBadgePresence, reportRestrictedModSignals,
    minimizeLauncherForGame, getMicrosoftLoginFailureMessage, getMicrosoftRefreshToken,
    upsertAccount, createOfflineAuth, minimizeLauncherToTaskbar, requestAppQuit,
    closeLauncherWindow, logPath, openExternalUrl, confirmLauncherErrorReport,
    writeWindowsBundleHealthMarker
  } = deps

  trustedIpcHandle('get-accounts', async () => {
    return readAccounts().map(toAccountSummary)
  })

  trustedIpcHandle('set-active-account-context', async (_event, accountId: string | null) => {
    const requestedId = String(accountId || '').trim()
    if (!requestedId) {
      deps.activeErrorReportAccountId = null
      return { activeAccountId: null }
    }

    const account = readAccounts().find((item) => item.id === requestedId)
    if (!account) {
      deps.activeErrorReportAccountId = null
      return { activeAccountId: null }
    }
    deps.activeErrorReportAccountId = account.id
    return { activeAccountId: account.id }
  })

  trustedIpcHandle('remove-account', async (_event, accountId: string) => {
    return removeStoredAccount(accountId).accounts
  })

  trustedIpcHandle('get-skin-library', async (_event, accountId: string) => {
    return getPublicSkinLibrary(accountId, false)
  })

  trustedIpcHandle('refresh-skin-library', async (_event, accountId: string) => {
    return getPublicSkinLibrary(accountId, true)
  })

  trustedIpcHandle('save-skin-preset', async (_event, request: SkinSaveRequest) => {
    return saveSkinPreset(request || {})
  })

  trustedIpcHandle('save-default-skin-preset', async (_event, request: SkinDefaultRequest) => {
    return saveDefaultSkinPreset(request || {})
  })

  trustedIpcHandle('import-skin-by-name', async (_event, request: SkinImportRequest) => {
    return importSkinByPlayerName(request || {})
  })

  trustedIpcHandle('import-offline-skin-by-name', async (_event, request: SkinImportRequest) => {
    return importSkinByPlayerName(request || {})
  })

  trustedIpcHandle('search-namemc-skins', async (_event, request: any) => {
    return searchNameMcSkins(request || {})
  })

  trustedIpcHandle('resolve-namemc-skin', async (_event, request: any) => {
    return resolveNameMcSkin(request || {})
  })

  trustedIpcHandle('apply-namemc-skin', async (_event, request: any) => {
    return applyNameMcSkin(request || {})
  })

  trustedIpcHandle('activate-skin-preset', async (_event, request: SkinActionRequest) => {
    return activateSkinPreset(request || {})
  })

  trustedIpcHandle('delete-skin-preset', async (_event, request: SkinActionRequest) => {
    return deleteSkinPreset(request || {})
  })

  trustedIpcHandle('reset-active-skin', async (_event, request: SkinActionRequest) => {
    return resetActiveSkin(request || {})
  })

  trustedIpcHandle('get-loader-versions', async (_event, loader: string, mcVersion: string) => {
    const normalizedVersion = String(mcVersion || '').trim()
    try {
      if (loader === 'fabric') return normalizedVersion ? listFabricLoaderVersions(normalizedVersion) : []
      if (loader === 'forge') return normalizedVersion ? listForgeVersions(normalizedVersion) : []
      if (loader === 'quilt') return listQuiltLoaderVersions(normalizedVersion)
      if (loader === 'neoforge') return normalizedVersion ? listNeoForgeVersions(normalizedVersion) : []
      return []
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      log.error(`Could not list ${loader} versions for Minecraft ${normalizedVersion || '(empty)'}.`, detail)
      throw new Error(`Could not load ${loader} versions for Minecraft ${normalizedVersion || 'unknown'}: ${detail}`)
    }
  })

  trustedIpcHandle('get-loader-compatibility', async (_event, loader: string, mcVersion: string) => {
    const normalizedVersion = String(mcVersion || '').trim()
    if (loader === 'quilt' && normalizedVersion) return getQuiltGameCompatibility(normalizedVersion)
    return {
      supported: true,
      requestedGameVersion: normalizedVersion,
      recommendedGameVersion: null
    }
  })

  trustedIpcHandle('get-game-state', async () => {
    return getGameState()
  })

  trustedIpcHandle('hydrate-instances', async (_event, instances: LauncherInstance[]) => {
    return hydrateLauncherInstances(instances)
  })

  trustedIpcHandle('update-instance', async (_event, request: InstanceUpdateRequest) => {
    return updateInstanceMetadata(request || {})
  })

  // Author/creator: nattapat2871 (https://nattapat2871.me)
  const activeInstanceServerMutations = new Set<string>()

  const assertInstanceServerListMutable = (instance: ReturnType<typeof normalizeInstance>) => {
    if (runningGames.has(instance.id) || activeLaunches.has(instance.id)) {
      throw new Error('Stop Minecraft before changing servers in this instance.')
    }
    if (activeInstanceServerMutations.has(instance.id)) {
      throw new Error('Wait for the current server-list update to finish.')
    }
  }

  const withInstanceServerListMutation = async <Result>(
    instance: ReturnType<typeof normalizeInstance>,
    action: () => Promise<Result>
  ) => {
    assertInstanceServerListMutable(instance)
    activeInstanceServerMutations.add(instance.id)
    try {
      return await action()
    } finally {
      activeInstanceServerMutations.delete(instance.id)
    }
  }

  trustedIpcHandle('provision-instance', async (_event, request: LaunchRequest) => {
    const instance = normalizeInstance(request)
    const defaults = await withInstanceServerListMutation(instance, () => provisionInstanceDefaults(instance))
    return {
      success: true,
      ...(defaults as Record<string, unknown>)
    }
  })

  trustedIpcHandle('get-instance-places', async (_event, request: LaunchRequest) => {
    return getInstancePlaces(request || {})
  })

  trustedIpcHandle('get-lan-readiness', async (event, request: LanReadinessRequest = {}) => {
    assertMainRendererInvocation(event)
    const instance = request.instance ? normalizeInstance({ instance: request.instance }) : null
    const runningGame = instance ? runningGames.get(instance.id) || null : getLatestRunningGame()
    return assessLanReadiness({
      interfaces: os.networkInterfaces(),
      detectedPort: runningGame?.lanPort
    })
  })

  trustedIpcHandle('discover-lan-servers', async (event) => {
    assertMainRendererInvocation(event)
    return discoverLocalMinecraftServers()
  })

  trustedIpcHandle('ping-instance-servers', async (_event, request: InstanceServerPingRequest) => {
    return pingInstanceServers(request || {})
  })

  trustedIpcHandle('add-instance-server', async (_event, request: InstanceServerMutationRequest) => {
    const instance = normalizeInstance(request || {})
    const { serversPath } = getInstancePlacesPaths(instance)
    return withInstanceServerListMutation(
      instance,
      () => addMinecraftServerDat(
        serversPath,
        String(request?.name || ''),
        String(request?.address || '')
      )
    )
  })

  trustedIpcHandle('remove-instance-server', async (_event, request: InstanceServerMutationRequest) => {
    const instance = normalizeInstance(request || {})
    const { serversPath } = getInstancePlacesPaths(instance)
    return withInstanceServerListMutation(
      instance,
      () => removeMinecraftServerDat(
        serversPath,
        Number(request?.index),
        String(request?.expectedCanonicalKey || '')
      )
    )
  })

  trustedIpcHandle('cache-image-url', async (_event, url: string) => {
    return cacheRemoteImageUrl(url)
  })

  trustedIpcHandle('renderer-ready', async (event) => {
    if (!isMainRendererInvocation(event)) return false
    log.info('--- NamLauncher renderer ready ---')
    writeWindowsBundleHealthMarker()
    return true
  })

  trustedIpcHandle('get-instance-update-summary', async (_event, request: LaunchRequest) => {
    return getInstanceUpdateSummary(request)
  })

  trustedIpcHandle('get-launcher-version', async () => {
    return app.getVersion()
  })

  trustedIpcHandle('check-launcher-update', async () => {
    return checkLauncherUpdate()
  })

  trustedIpcHandle('install-launcher-update', async () => {
    return installLauncherUpdate()
  })

  trustedIpcHandle('get-launcher-stats', async () => {
    return getLauncherWebsiteStats()
  })

  trustedIpcHandle('get-legal-document', async (_event, language: LegalLanguage) => {
    return fetchLegalDocument(STATS_API_BASE, language === 'en' ? 'en' : 'th')
  })

  trustedIpcHandle('get-discord-settings', async () => {
    return readLauncherSettings()
  })

  trustedIpcHandle('run-startup-launcher-update', async () => runStartupLauncherUpdate())

  trustedIpcHandle('get-launcher-discord-account', async () => {
    return getLauncherDiscordAccountState()
  })

  trustedIpcHandle('connect-launcher-discord-account', async () => {
    return connectLauncherDiscordAccount()
  })

  trustedIpcHandle('disconnect-launcher-discord-account', async () => {
    return disconnectLauncherDiscordAccount()
  })

  trustedIpcHandle('get-launcher-data-location', async () => {
    return getLauncherDataLocation()
  })

  trustedIpcHandle('choose-launcher-data-location', async (_event, request: DataLocationMoveRequest = {}) => {
    if (hasActiveMinecraft()) {
      throw new Error('Stop Minecraft and wait for launch tasks to finish before moving the game data folder.')
    }

    const restartAfterMove = request.restartAfterMove !== false
    const dialogTitle = request.initialSetup
      ? 'Choose where NamLauncher should store Minecraft data'
      : 'Choose NamLauncher game data location'
    const result = deps.mainWindow && !deps.mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(deps.mainWindow, {
        title: dialogTitle,
        defaultPath: path.dirname(getLauncherRootForSelectedPath(userDataPath)),
        properties: ['openDirectory', 'createDirectory']
      })
      : await dialog.showOpenDialog({
        title: dialogTitle,
        defaultPath: path.dirname(getLauncherRootForSelectedPath(userDataPath)),
        properties: ['openDirectory', 'createDirectory']
      })

    if (result.canceled || !result.filePaths[0]) {
      return { ...getLauncherDataLocation(), canceled: true, changed: false }
    }

    const selectedPath = path.resolve(result.filePaths[0])
    const targetDataPath = normalizeLauncherDataTarget(selectedPath)
    const targetRootPath = getLauncherRootForSelectedPath(selectedPath)

    if (isSamePath(targetDataPath, userDataPath)) {
      return { ...getLauncherDataLocation(), canceled: false, changed: false }
    }

    if (isPathInside(targetDataPath, userDataPath)) {
      throw new Error('Choose a folder outside the current NamLauncher data folder.')
    }

    if (!canWriteToDirectory(targetDataPath)) {
      throw new Error('NamLauncher cannot write to the selected folder.')
    }

    if (!request.initialSetup) {
      const confirmation = deps.mainWindow && !deps.mainWindow.isDestroyed()
        ? await dialog.showMessageBox(deps.mainWindow, {
          type: 'question',
          buttons: ['Move and restart', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          title: 'Move NamLauncher game data',
          message: 'Move NamLauncher data to this folder?',
          detail: `Current:\n${userDataPath}\n\nNew root:\n${targetRootPath}\n\nNew data:\n${targetDataPath}\n\nInstances, runtimes, cache, accounts, settings, and UI data will be copied first. NamLauncher will restart after the move and then clean the old migrated files.`
        })
        : await dialog.showMessageBox({
          type: 'question',
          buttons: ['Move and restart', 'Cancel'],
          defaultId: 0,
          cancelId: 1,
          title: 'Move NamLauncher game data',
          message: 'Move NamLauncher data to this folder?',
          detail: `Current:\n${userDataPath}\n\nNew root:\n${targetRootPath}\n\nNew data:\n${targetDataPath}\n\nInstances, runtimes, cache, accounts, settings, and UI data will be copied first. NamLauncher will restart after the move and then clean the old migrated files.`
        })

      if (confirmation.response !== 0) {
        return { ...getLauncherDataLocation(), canceled: true, changed: false }
      }
    }

    const { copiedEntries } = copyLauncherDataEntries(targetDataPath)
    const cleanupPath = path.join(targetDataPath, DATA_CLEANUP_FILE)
    try {
      if (copiedEntries.length > 0) {
        writePendingDataCleanup(targetDataPath, userDataPath, copiedEntries)
      }
      writeDataLocationConfig(targetDataPath)
    } catch (err) {
      try {
        fs.rmSync(cleanupPath, { force: true })
      } catch (cleanupError) {
        log.warn('Failed to remove pending data cleanup marker after finalization error.', cleanupError)
      }
      for (const entryName of copiedEntries) {
        try {
          fs.rmSync(path.join(targetDataPath, entryName), {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 150
          })
        } catch (rollbackError) {
          log.warn(`Failed to roll back launcher data after finalization error: ${entryName}`, rollbackError)
        }
      }
      log.error('Failed to finalize launcher data move.', err)
      throw new Error('Could not finalize the data folder move. The current data folder remains active.')
    }

    const response = {
      ...getLauncherDataLocation(),
      currentRoot: getLauncherRootForSelectedPath(userDataPath),
      nextRoot: targetRootPath,
      nextPath: targetDataPath,
      configuredPath: targetDataPath,
      canceled: false,
      changed: true,
      restartRequired: restartAfterMove,
      copiedEntries,
      skippedEntries: [],
      failedEntries: []
    }

    if (restartAfterMove) {
      const restartMessage = request.initialSetup
        ? 'NamLauncher needs to restart to use your selected game folder.'
        : 'NamLauncher needs to restart to finish moving the game data folder.'
      const restartDetail = `New root:\n${targetRootPath}\n\nData folder:\n${targetDataPath}\n\nAfter restart, NamLauncher will use this folder and clean old migrated files.`

      if (deps.mainWindow && !deps.mainWindow.isDestroyed()) {
        await dialog.showMessageBox(deps.mainWindow, {
          type: 'info',
          buttons: ['Restart NamLauncher'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          title: 'Restart required',
          message: restartMessage,
          detail: restartDetail
        })
      } else {
        await dialog.showMessageBox({
          type: 'info',
          buttons: ['Restart NamLauncher'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          title: 'Restart required',
          message: restartMessage,
          detail: restartDetail
        })
      }

      app.relaunch()
      app.exit(0)
    }

    return response
  })

  trustedIpcHandle('get-discord-status', async () => {
    if (deps.launcherRestingInTray || deps.isAppQuitting) return discordManager.getStatus()
    const runningGame = getLatestRunningGame()
    if (!runningGame) return discordManager.getStatus()

    const settings = readLauncherSettings()
    if (settings.discordRpcEnabled) {
      const status = discordManager.getStatus()
      return {
        ...status,
        lastActivity: status.lastActivity || 'NamLauncher custom status',
        applicationId: status.applicationId || MINECRAFT_OFFICIAL_APPLICATION_ID
      }
    }

    return {
      enabled: false,
      state: 'native',
      connected: false,
      lastActivity: 'Minecraft native detection',
      lastActivityAt: runningGame.startedAt ? new Date(runningGame.startedAt).toISOString() : null,
      applicationId: MINECRAFT_OFFICIAL_APPLICATION_ID,
      lastError: null,
      reconnectAttempts: 0
    }
  })

  const configureDiscordForActiveGames = (settings = readLauncherSettings()) => {
    minecraftDiscordManager.shutdown()
    // Every caller (including game callbacks/settings changes) must respect tray sleep.
    // Online/gameplay heartbeat services have an independent lifecycle.
    if (deps.launcherRestingInTray || deps.isAppQuitting) {
      discordManager.shutdown()
      return
    }
    const runningGame = getLatestRunningGame()

    if (!runningGame) {
      discordManager.configure(getDiscordRuntimeSettings(settings))
      discordManager.setIdleStatus()
      return
    }

    if (settings.discordRpcEnabled) {
      discordManager.configure(getMinecraftDiscordRuntimeSettings(settings))
      discordManager.setLauncherGameStatus(
        runningGame.instanceName,
        runningGame.minecraftVersion,
        runningGame.playerName,
        runningGame.playerUuid,
        runningGame.gamePid,
        runningGame.playerTextureId
      )
      return
    }

    discordManager.shutdown()
  }

  trustedIpcHandle('set-discord-settings', async (_event, settings: Partial<LauncherSettings>) => {
    const current = readLauncherSettings()
    const next: LauncherSettings = {
      discordRpcEnabled: settings.discordRpcEnabled ?? current.discordRpcEnabled,
      anonymousStatsEnabled: true,
      gameplayTelemetryEnabled: true,
      playerBadgeEnabled: settings.playerBadgeEnabled ?? current.playerBadgeEnabled,
      restrictedModAuditEnabled: true,
      customJavaArgsEnabled: settings.customJavaArgsEnabled ?? current.customJavaArgsEnabled,
      customJavaArgs: typeof settings.customJavaArgs === 'string'
        ? settings.customJavaArgs
        : current.customJavaArgs,
      autoMinimizeOnLaunch: settings.autoMinimizeOnLaunch ?? current.autoMinimizeOnLaunch,
      closeToTrayEnabled: settings.closeToTrayEnabled ?? current.closeToTrayEnabled,
      automaticMemory: typeof settings.automaticMemory === 'boolean'
        ? settings.automaticMemory
        : current.automaticMemory,
      performanceProfile: normalizePerformanceProfile(
        settings.performanceProfile ?? current.performanceProfile
      ),
      language: settings.language === 'th' || settings.language === 'en'
        ? settings.language
        : current.language,
      theme: settings.theme === 'system' || settings.theme === 'dark' || settings.theme === 'light'
        ? settings.theme
        : current.theme
    }

    saveLauncherSettings(next)
    refreshTrayMenu()
    configureDiscordForActiveGames(next)
    log.info(deps.launcherRestingInTray
      ? 'NamLauncher Discord RPC remains paused in the system tray.'
      : runningGames.size > 0 && next.discordRpcEnabled
      ? 'NamLauncher custom Discord RPC is active for the most recently started instance.'
      : runningGames.size > 0
        ? 'NamLauncher Discord RPC is disabled while Minecraft instances are active.'
        : 'NamLauncher Discord RPC returned to launcher status.')
    configureOnlineHeartbeat(next)
    configureGameSessionTelemetry(next)
    configurePlayerBadgePresence(next)
    return next
  })

  trustedIpcHandle('get-instance-mods', async (_event, request: LaunchRequest) => {
    const instance = normalizeInstance(request)
    return listInstanceMods(instance)
  })

  trustedIpcHandle('get-instance-content', async (_event, request: InstanceContentRequest) => {
    return getInstanceContent(request)
  })

  trustedIpcHandle('get-instance-run-log', async (_event, request: LaunchRequest) => {
    return getInstanceRunLog(request)
  })

  trustedIpcHandle('toggle-instance-content', async (_event, request: InstanceContentRequest) => {
    return toggleInstanceContent(request)
  })

  trustedIpcHandle('delete-instance-content', async (_event, request: InstanceContentRequest) => {
    return deleteInstanceContent(request)
  })

  trustedIpcHandle('import-instance-content-files', async (_event, request: InstanceContentRequest) => {
    return importInstanceContentFiles(request)
  })

  trustedIpcHandle('reveal-instance-content-file', async (_event, request: InstanceContentRequest) => {
    return revealInstanceContentFile(request)
  })

  trustedIpcHandle('open-instance-folder', async (_event, request: LaunchRequest) => {
    const instance = normalizeInstance(request)
    const { gameDirectory } = ensureInstanceRoot(instance)
    ensureDir(gameDirectory)
    shell.openPath(gameDirectory)
    return { success: true }
  })

  trustedIpcHandle('open-manual-download-folder', async () => {
    const downloadsDirectory = app.getPath('downloads')
    ensureDir(downloadsDirectory)
    await shell.openPath(downloadsDirectory)
    return { success: true, path: downloadsDirectory }
  })

  trustedIpcHandle('copy-to-clipboard', async (_event, value: string) => {
    const text = String(value || '')
    if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) {
      throw new Error('The copied text is too large.')
    }
    clipboard.writeText(text)
    return { success: true }
  })

  trustedIpcHandle('import-curseforge-manual-download', async (_event, request: CurseForgeManualDownloadRequest) => {
    return importCurseForgeManualDownload(request || {})
  })

  trustedIpcHandle('get-curseforge-config', async () => {
    return getCurseForgeConfigStatus()
  })

  trustedIpcHandle('search-curseforge', async (_event, request: CurseForgeSearchRequest) => {
    deps.activeCurseForgeSearchController?.abort()
    const controller = new AbortController()
    deps.activeCurseForgeSearchController = controller
    try {
      return await searchCurseForgeProjects(request || {}, controller.signal)
    } catch (err) {
      if (controller.signal.aborted) {
        return { hits: [], total_hits: 0, canceled: true }
      }
      throw err
    } finally {
      if (deps.activeCurseForgeSearchController === controller) {
        deps.activeCurseForgeSearchController = null
      }
    }
  })

  trustedIpcHandle('get-home-modpacks', async () => {
    const lanes: Array<{ lane: HomeDiscoveryLane; index: 'downloads' | 'updated' | 'newest' }> = [
      { lane: 'popular', index: 'downloads' },
      { lane: 'updated', index: 'updated' },
      { lane: 'newest', index: 'newest' }
    ]
    const settled = await Promise.allSettled(lanes.map(async ({ lane, index }) => {
      const result = await searchModrinthProjects({
        query: '',
        projectType: 'modpack',
        offset: 0,
        limit: 18,
        index
      })
      return {
        lane,
        hits: result.hits,
        stale: Boolean((result as { stale?: boolean }).stale)
      }
    }))
    const healthyResults = settled
      .filter((result): result is PromiseFulfilledResult<HomeDiscoveryLaneResult & { stale: boolean }> => result.status === 'fulfilled')
      .map((result) => result.value)

    settled.forEach((result, index) => {
      if (result.status === 'rejected') {
        log.warn(`Home Modrinth ${lanes[index].lane} lane is unavailable; filling from healthy discovery lanes.`, getCompactErrorLog(result.reason))
      }
    })

    return {
      hits: selectHomeDiscoveryProjects(healthyResults, HOME_DISCOVERY_SESSION_SEED),
      total_hits: healthyResults.reduce((total, result) => total + result.hits.length, 0),
      stale: healthyResults.some((result) => result.stale),
      degraded: healthyResults.length < lanes.length
    }
  })

  trustedIpcHandle('search-modrinth', async (_event, request: ModrinthSearchRequest) => {
    deps.activeModrinthSearchController?.abort()
    const controller = new AbortController()
    deps.activeModrinthSearchController = controller
    try {
      return await searchModrinthProjects(request || {}, controller.signal)
    } catch (err) {
      // Author/creator: nattapat2871 (https://nattapat2871.me)
      if (controller.signal.aborted && axios.isCancel(err)) {
        return { hits: [], total_hits: 0, canceled: true }
      }
      log.warn('Modrinth search failed after all network fallbacks.', getCompactErrorLog(err))
      throw new Error(axios.isAxiosError(err)
        ? getModrinthFailureMessage(err, 'search')
        : sanitizeBugReport(err instanceof Error ? err.message : err))
    } finally {
      if (deps.activeModrinthSearchController === controller) {
        deps.activeModrinthSearchController = null
      }
    }
  })

  trustedIpcHandle('get-curseforge-modpack-versions', async (_event, request: CurseForgeInstallRequest) => {
    try {
      return await getCurseForgeModpackVersions(request || {})
    } catch (err) {
      throw new Error(axios.isAxiosError(err)
        ? getCurseForgeFailureMessage(err, 'search')
        : sanitizeBugReport(err instanceof Error ? err.message : err))
    }
  })

  trustedIpcHandle('get-curseforge-project-versions', async (_event, request: CurseForgeInstallRequest) => {
    try {
      return await getCurseForgeProjectVersions(request || {})
    } catch (err) {
      throw new Error(axios.isAxiosError(err)
        ? getCurseForgeFailureMessage(err, 'search')
        : sanitizeBugReport(err instanceof Error ? err.message : err))
    }
  })

  trustedIpcHandle('install-curseforge-modpack', async (_event, request: CurseForgeInstallRequest) => {
    const startedAt = Date.now()
    try {
      const result: any = await withInstallTask(request || {}, 'curseforge-modpack', (signal) => installCurseForgeModpack(request || {}, signal))
      recordContentUsage('curseforge', request || {}, startedAt, 'success', `version=${result?.version || 'unknown'}`)
      return result
    } catch (err) {
      if (isInstallCancelledError(err)) {
        recordContentUsage('curseforge', request || {}, startedAt, 'cancelled')
        return { success: false, canceled: true, cancelled: true }
      }
      const modId = getCurseForgeModId(request?.project)
      const message = axios.isAxiosError(err)
        ? getCurseForgeFailureMessage(err, 'download')
        : sanitizeBugReport(err instanceof Error ? err.message : err)
      recordContentUsage('curseforge', request || {}, startedAt, 'failed', message)
      log.error(`CurseForge modpack install failed${modId ? ` for project ${modId}` : ''}: ${message}`)
      throw new Error(message)
    }
  })

  trustedIpcHandle('get-curseforge-content-status', async (_event, request: CurseForgeContentStatusRequest) => {
    try {
      return await getCurseForgeContentStatus(request || {})
    } catch (err) {
      throw new Error(axios.isAxiosError(err)
        ? getCurseForgeFailureMessage(err, 'search')
        : sanitizeBugReport(err instanceof Error ? err.message : err))
    }
  })

  trustedIpcHandle('install-curseforge-content', async (_event, request: CurseForgeInstallRequest) => {
    const startedAt = Date.now()
    try {
      const result = await installCurseForgeProject(request || {})
      recordContentUsage('curseforge', request || {}, startedAt, 'success', `version=${result?.version || 'unknown'}`)
      return result
    } catch (err) {
      const modId = getCurseForgeModId(request?.project)
      const message = axios.isAxiosError(err)
        ? getCurseForgeFailureMessage(err, 'download')
        : sanitizeBugReport(err instanceof Error ? err.message : err)
      recordContentUsage('curseforge', request || {}, startedAt, 'failed', message)
      log.error(`CurseForge install failed${modId ? ` for project ${modId}` : ''}: ${message}`)
      throw new Error(message)
    }
  })

  trustedIpcHandle('get-modrinth-content-status', async (_event, request: ModrinthContentStatusRequest) => {
    try {
      return await getModrinthContentStatuses(request)
    } catch (err) {
      throw new Error(axios.isAxiosError(err)
        ? getModrinthFailureMessage(err, 'search')
        : sanitizeBugReport(err instanceof Error ? err.message : err))
    }
  })

  trustedIpcHandle('get-modrinth-project-versions', async (_event, request: ModrinthInstallRequest) => {
    try {
      return await getModrinthProjectVersions(request)
    } catch (err) {
      throw new Error(axios.isAxiosError(err)
        ? getModrinthFailureMessage(err, 'search')
        : sanitizeBugReport(err instanceof Error ? err.message : err))
    }
  })

  trustedIpcHandle('install-modrinth-content', async (_event, request: ModrinthInstallRequest) => {
    const startedAt = Date.now()
    try {
      const result = await installModrinthProject(request)
      recordContentUsage('modrinth', request || {}, startedAt, 'success', `version=${result?.version || 'unknown'}`)
      return result
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? getModrinthFailureMessage(err, 'download')
        : sanitizeBugReport(err instanceof Error ? err.message : err)
      recordContentUsage('modrinth', request || {}, startedAt, 'failed', message)
      throw new Error(message)
    }
  })

  trustedIpcHandle('install-modrinth-modpack', async (_event, request: ModrinthInstallRequest) => {
    const startedAt = Date.now()
    try {
      const result: any = await withInstallTask(request || {}, 'modrinth-modpack', (signal) => installModrinthModpack(request || {}, signal))
      recordContentUsage('modrinth', request || {}, startedAt, 'success', `version=${result?.version || 'unknown'}`)
      return result
    } catch (err) {
      if (isInstallCancelledError(err)) {
        recordContentUsage('modrinth', request || {}, startedAt, 'cancelled')
        return { success: false, canceled: true, cancelled: true }
      }
      const message = axios.isAxiosError(err)
        ? getModrinthFailureMessage(err, 'download')
        : sanitizeBugReport(err instanceof Error ? err.message : err)
      recordContentUsage('modrinth', request || {}, startedAt, 'failed', message)
      throw new Error(message)
    }
  })

  trustedIpcHandle('install-local-mrpack', async (_event, request: { taskId?: string } = {}) => {
    const options: OpenDialogOptions = {
      title: 'Install .mrpack',
      properties: ['openFile'],
      filters: [
        { name: 'Modrinth modpack (.mrpack)', extensions: ['mrpack'] }
      ]
    }
    const result = deps.mainWindow && !deps.mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(deps.mainWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    return withInstallTask(request || {}, 'local-mrpack', (signal) => installLocalMrpack(result.filePaths[0], signal))
  })

  trustedIpcHandle('cancel-install-task', async (_event, taskId: unknown) => {
    const normalizedTaskId = String(taskId || '').trim()
    if (normalizedTaskId) {
      cancelledInstallTaskIds.add(normalizedTaskId)
      setTimeout(() => cancelledInstallTaskIds.delete(normalizedTaskId), 5 * 60 * 1000).unref?.()
    }
    const task = activeInstallTasks.get(normalizedTaskId)
    if (task) {
      task.cancelled = true
      task.abortController.abort()
      activeInstallTasks.delete(normalizedTaskId)
    }
    sendProgress({
      type: 'content-cancelled',
      task: 0,
      total: 100,
      detail: INSTALL_CANCELLED_MESSAGE
    })
    return { success: true, canceled: true, cancelled: true }
  })

  trustedIpcHandle('export-instance-mrpack', async (_event, request: LaunchRequest) => {
    const instance = normalizeInstance(request)
    const defaultPath = path.join(app.getPath('downloads'), `${sanitizeFolderName(instance.name)}.mrpack`)
    const options: SaveDialogOptions = {
      title: 'Export instance as .mrpack',
      defaultPath,
      filters: [
        { name: 'Modrinth modpack (.mrpack)', extensions: ['mrpack'] }
      ]
    }
    const result = deps.mainWindow && !deps.mainWindow.isDestroyed()
      ? await dialog.showSaveDialog(deps.mainWindow, options)
      : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }

    return exportInstanceMrpack(instance, result.filePath)
  })

  trustedIpcHandle('delete-instance', async (_event, request: LaunchRequest) => {
    const instance = normalizeInstance(request)

    if (runningGames.has(instance.id) || activeLaunches.has(instance.id)) {
      throw new Error('Stop Minecraft before deleting this instance.')
    }

    const { instanceRoot } = getInstancePaths(instance)
    assertInstancePathIsSafe(instanceRoot)

    if (fs.existsSync(instanceRoot)) {
      log.info(`Deleting instance folder: ${instanceRoot}`)
      await removeInstanceDirectoryWithRetry(instanceRoot)
    }

    return { success: true, deleted: !fs.existsSync(instanceRoot), instanceRoot }
  })

  const waitForChildProcessClose = (childProcess: any, timeoutMs: number) => {
    if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (closed: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        childProcess.removeListener?.('close', onClose)
        childProcess.removeListener?.('exit', onClose)
        resolve(closed)
      }
      const onClose = () => finish(true)
      const timer = setTimeout(() => finish(false), timeoutMs)
      childProcess.once?.('close', onClose)
      childProcess.once?.('exit', onClose)
    })
  }

  const runWindowsTaskkill = (pid: number, force: boolean) => {
    return new Promise<void>((resolve) => {
      const args = ['/PID', String(pid), '/T']
      if (force) args.push('/F')
      const child = spawn('taskkill.exe', args, {
        windowsHide: true,
        stdio: 'ignore'
      })
      child.once('error', () => resolve())
      child.once('close', () => resolve())
    })
  }

  const requestMinecraftStop = async (game: RunningGame) => {
    if (game.stopRequestedAt) return
    game.stopRequestedAt = Date.now()
    const pid = Number(game.process?.pid || game.gamePid)

    if (process.platform === 'win32' && pid > 0) {
      await runWindowsTaskkill(pid, false)
    } else {
      try {
        game.process.kill('SIGTERM')
      } catch (err) {
        log.warn(`Failed to request Minecraft stop for ${game.instanceName}.`, err)
      }
    }

    const closedGracefully = await waitForChildProcessClose(game.process, 10_000)
    if (closedGracefully) return

    log.warn(`Minecraft did not close after the save window; forcing shutdown for ${game.instanceName}.`)
    if (process.platform === 'win32' && pid > 0) {
      await runWindowsTaskkill(pid, true)
    } else {
      try {
        game.process.kill('SIGKILL')
      } catch (err) {
        log.warn(`Failed to force Minecraft shutdown for ${game.instanceName}.`, err)
      }
    }
  }

  // Author/creator: nattapat2871 (https://nattapat2871.me)
  async function stopAllMinecraftFromTray() {
    cleanupStaleLaunches()
    for (const launch of activeLaunches.values()) {
      launch.cancelled = true
      launch.abortController.abort()
      try {
        if (launch.childProcess && !launch.childProcess.killed) launch.childProcess.kill()
      } catch (err) {
        log.warn(`Could not stop the partial Minecraft launch for ${launch.instanceName || 'an instance'}.`, getCompactErrorLog(err))
      }
      sendProgress({
        type: 'launch-cancelled',
        task: 0,
        total: 100,
        detail: LAUNCH_CANCELLED_MESSAGE,
        instanceId: launch.instanceId || null
      })
    }

    const stopResults = await Promise.allSettled(
      [...runningGames.values()].map((game) => requestMinecraftStop(game))
    )
    const failedCount = stopResults.filter((result) => result.status === 'rejected').length
    if (failedCount > 0) log.warn(`Tray could not stop ${failedCount} Minecraft process${failedCount === 1 ? '' : 'es'}.`)
    configureDiscordForActiveGames()
    refreshTrayMenu()
  }

  trustedIpcHandle('stop-minecraft', async (_event, request: LaunchRequest = {}) => {
    cleanupStaleLaunches()
    const requestedInstanceId = request.instance
      ? normalizeInstance(request).id
      : String((request as any).instanceId || '')
    const launch = requestedInstanceId
      ? activeLaunches.get(requestedInstanceId)
      : [...activeLaunches.values()][0]

    if (launch) {
      launch.cancelled = true
      launch.abortController.abort()
      const launchInstance = launch.instanceId && launch.instanceName
        ? normalizeInstance({ instance: {
            id: launch.instanceId,
            name: launch.instanceName,
            version: 'unknown',
            loader: 'vanilla',
            loaderVersion: ''
          } })
        : undefined
      writeRunLog(launch.logStream, LAUNCH_CANCELLED_MESSAGE, launchInstance)

      try {
        if (launch.childProcess && !launch.childProcess.killed) {
          launch.childProcess.kill()
        }
      } catch (err) {
        log.warn('Failed to stop partially launched Minecraft process:', err)
      }

      log.info(`Cancelling Minecraft launch${launch.instanceName ? ` for ${launch.instanceName}` : ''}`)
      sendProgress({
        type: 'launch-cancelled',
        task: 0,
        total: 100,
        detail: LAUNCH_CANCELLED_MESSAGE,
        instanceId: launch.instanceId || null
      })
      configureDiscordForActiveGames()
      return { success: true, stopped: true, phase: 'launch' }
    }

    const runningGame = requestedInstanceId
      ? runningGames.get(requestedInstanceId)
      : getLatestRunningGame()
    if (!runningGame) return { success: true, stopped: false }

    log.info(`Stopping Minecraft process for ${runningGame.instanceName}`)
    requestMinecraftStop(runningGame).catch((err) => log.error('Failed to stop Minecraft process:', err))
    return { success: true, stopped: true, instanceId: runningGame.instanceId }
  })

  trustedIpcHandle('launch-minecraft', async (_event, request: LaunchRequest) => {
    if (deps.startupUpdatePending || deps.requiredLauncherUpdateVersion) {
      throw new Error('Please update NamLauncher to the latest version before launching Minecraft.')
    }
    cleanupStaleLaunches()
    if (deps.launcherUpdateInstallInFlight) {
      throw new Error('Wait for the NamLauncher update installation to finish before launching Minecraft.')
    }
    const instance = normalizeInstance(request)
    const requestedAccount = readAccounts().find((account) => account.id === request.accountId)
    if (requestedAccount) deps.activeErrorReportAccountId = requestedAccount.id
    if (activeInstanceServerMutations.has(instance.id)) {
      throw new Error('Wait for the current server-list update to finish before launching Minecraft.')
    }
    if (runningGames.has(instance.id)) {
      const game = runningGames.get(instance.id)
      sendGameState({
        status: 'running',
        instanceId: instance.id,
        instanceName: instance.name,
        startedAt: game?.startedAt
      })
      return { success: true, alreadyRunning: true, instanceId: instance.id }
    }
    if (activeLaunches.has(instance.id)) {
      sendGameState({
        status: 'launching',
        instanceId: instance.id,
        instanceName: instance.name
      })
      return { success: false, alreadyLaunching: true, instanceId: instance.id }
    }

    const launcher = new Client()
    const launchSessionState: LaunchSession = {
      id: crypto.randomUUID(),
      launcher,
      abortController: new AbortController(),
      cancelled: false,
      startedAt: Date.now(),
      lastProgressAt: Date.now(),
      instanceId: instance.id,
      instanceName: instance.name
    }
    let launchSession: LaunchSession | null = launchSessionState
    activeLaunches.set(instance.id, launchSessionState)
    refreshTrayMenu()
    const launchSessionId = launchSessionState.id
    let lastKnownError = ''
    // Some bootstrap failures never create latest.log or a Minecraft crash report.
    // Keep only a bounded, already-redacted tail belonging to this launch.
    let launchProcessOutputTail = ''
    const launchedInstanceId = instance.id
    const launchedInstanceName = instance.name
    let runLogStream: NodeFs.WriteStream | null = null
    let runLogInstance: ReturnType<typeof normalizeInstance> | null = instance
    let pendingLaunchProgress: any = null
    let launchProgressTimer: ReturnType<typeof setTimeout> | null = null
    let lastLaunchProgressAt = 0
    let launchPlayerName = ''
    let launchAccountType: 'msa' | 'offline' | 'unknown' = 'unknown'
    let launchManagedComponentActive = false
    let launchLocalGameIssueSent = false
    let launchGameProcessStarted = false

    const isLaunchCancelled = () => {
      return launchSessionState.cancelled || launchSessionState.abortController.signal.aborted
    }

    const flushLaunchProgress = () => {
      if (launchProgressTimer) clearTimeout(launchProgressTimer)
      launchProgressTimer = null
      if (!pendingLaunchProgress || isLaunchCancelled()) return
      const progress = pendingLaunchProgress
      pendingLaunchProgress = null
      lastLaunchProgressAt = Date.now()
      sendProgress(progress)
    }

    const forwardLaunchProgress = (progress: any) => {
      if (isLaunchCancelled()) return
      launchSessionState.lastProgressAt = Date.now()
      pendingLaunchProgress = { ...progress, instanceId: launchedInstanceId }
      const isComplete = Number(progress?.total) > 0 && Number(progress?.task) >= Number(progress?.total)
      const elapsed = Date.now() - lastLaunchProgressAt
      if (isComplete || elapsed >= 100) {
        flushLaunchProgress()
        return
      }
      if (!launchProgressTimer) launchProgressTimer = setTimeout(flushLaunchProgress, Math.max(16, 100 - elapsed))
    }

    const assertLaunchActive = () => {
      if (isLaunchCancelled()) {
        throw new Error(LAUNCH_CANCELLED_MESSAGE)
      }
    }

    launcher.on('debug', (message) => {
      const text = compactMinecraftDebugMessage(message)
      writeRunLog(runLogStream, `[DEBUG] ${text}`, runLogInstance || undefined)
      if (/Error:|Exception|Failed to start due to|Couldn't start Minecraft due to/.test(text)) lastKnownError = text
    })

    launcher.on('data', (message) => {
      launchGameProcessStarted = true
      const serverEvent = parseMinecraftServerLogEvent(message)
      const text = redactSensitiveText(message)
      launchProcessOutputTail = `${launchProcessOutputTail}${text}`.slice(-64 * 1024)
      writeRunLog(runLogStream, text, runLogInstance || undefined)
      if (isLaunchCancelled()) return
      const detectedLanPort = detectLanPortFromLogLine(text)
      if (detectedLanPort) {
        const activeGame = runningGames.get(launchedInstanceId)
        if (activeGame && shouldPublishLanSessionPort(activeGame.lanPort, detectedLanPort)) {
          activeGame.lanPort = detectedLanPort
          if (deps.mainWindow && !deps.mainWindow.isDestroyed() && !deps.mainWindow.webContents.isDestroyed()) {
            deps.mainWindow.webContents.send('lan-session-detected', {
              instanceId: activeGame.instanceId,
              port: detectedLanPort
            })
          }
          log.info('Minecraft LAN session detected.')
          refreshTrayMenu()
        }
      }
      if (text.includes('Error:') || text.includes('Exception')) lastKnownError = text.split('\n')[0]
      if (text.includes('Connecting to')) {
        sendProgress({ type: 'server-connect', task: 0, total: 100, instanceId: launchedInstanceId })
      }
      if (serverEvent) {
        const activeGame = runningGames.get(launchedInstanceId)
        if (activeGame) {
          const nextServer = serverEvent.type === 'connected'
            ? createMinecraftServerTelemetryState(serverEvent.endpoint, activeGame.knownServers)
            : null
          if (nextServer?.key !== activeGame.currentServer?.key) {
            activeGame.currentServer = nextServer
            void queueGameSessionEvent(activeGame, 'heartbeat')
            sendGameState({
              status: 'running',
              instanceId: activeGame.instanceId,
              instanceName: activeGame.instanceName,
              startedAt: activeGame.startedAt,
              server: nextServer ? { label: nextServer.label, kind: nextServer.kind } : null
            })
            log.info(nextServer
              ? `Minecraft joined server telemetry label: ${nextServer.label}`
              : 'Minecraft left the active multiplayer server.')
            refreshTrayMenu()
          }
        }
      }
      if (text.includes('Failed to retrieve profile key pair') || text.includes('Status: 401')) {
        sendProgress({
          type: 'multiplayer-auth-warning',
          task: 0,
          total: 100,
          detail: 'Microsoft session may be expired, or offline profile is joining an online-mode server.',
          instanceId: launchedInstanceId
        })
      }
    })

    launcher.on('progress', (progress) => {
      forwardLaunchProgress(progress)
    })

    launcher.on('close', (code) => {
      flushLaunchProgress()
      const normalizedCode = typeof code === 'number' && code > 0x7fffffff
        ? code - 0x100000000
        : code
      log.info(`[MC-CLOSE] Game closed with code ${normalizedCode}`)
      const closedGame = runningGames.get(launchedInstanceId)
      const wasCancelledLaunch = isLaunchCancelled()
      if (wasCancelledLaunch && !closedGame) {
        log.info('[MC-CLOSE] Ignoring close event from cancelled launch.')
        return
      }
      const durationMs = closedGame?.startedAt ? Date.now() - closedGame.startedAt : 0
      const closedInstanceId = closedGame?.instanceId || launchedInstanceId
      const closedInstanceName = closedGame?.instanceName || launchedInstanceName
      const closedLogStream = closedGame?.logStream || runLogStream
      const wasUserStopRequested = Boolean(closedGame?.stopRequestedAt || wasCancelledLaunch)
      if (closedGame?.telemetryActive) {
        void queueGameSessionEvent(closedGame, 'end', {
          endReason: getGameSessionEndReason(wasUserStopRequested),
          exitCode: normalizedCode
        })
      }
      if (closedGame?.badgePresenceActive) {
        void queuePlayerBadgePresence(closedGame, 'end')
      }
      runningGames.delete(closedInstanceId)
      activeLaunches.delete(closedInstanceId)
      configureDiscordForActiveGames()
      sendOnlineHeartbeat().catch(() => undefined)
      sendGameState({
        status: 'stopped',
        instanceId: closedInstanceId,
        instanceName: closedInstanceName,
        durationMs,
        code: normalizedCode,
        cancelled: wasCancelledLaunch || undefined
      })
      if (normalizedCode !== 0 && !wasUserStopRequested) {
        let error = lastKnownError || `Minecraft exited with code ${normalizedCode}`
        if (launchProcessOutputTail) {
          error += `\n\n===== Current launch stdout/stderr =====\n${truncateRemoteText(buildDiagnosticExcerpt(launchProcessOutputTail, 12, 80), 12000)}`
        }
        let combinedLogPath: string | null = null
        try {
          if (runLogInstance && launchGameProcessStarted) {
            const combined = buildInstanceCrashLog(runLogInstance, launchSessionState.startedAt)
            combinedLogPath = combined.path
            error = `${error}\n\nCombined log file: ${combined.path}\n\n${combined.diagnosticExcerpt}`
          }
        } catch (err) {
          log.warn('Could not build combined instance crash log.', err)
        }
        const diagnosis = getMinecraftCrashDiagnosis(error)
        const failure = classifyMinecraftProcessFailure(error, diagnosis, {
          managedComponentActive: launchManagedComponentActive,
          managedJavaRuntimeActive: true
        })
        deps.mainWindow?.webContents.send('launch-error', error)
        if (failure.reportPolicy === 'automatic') {
          const reportTitle = failure.code === 'namlauncher-runtime-failure'
            ? 'NamLauncher selected an incompatible Java runtime'
            : 'NamLauncher game component failed'
          publishLauncherError(error, 'minecraft-exit', reportTitle, {
            playerName: closedGame?.playerName || null,
            accountType: closedGame?.accountType || null,
            diagnosis,
            failureClassification: failure
          }).catch(() => undefined)
        } else if (isLocalMinecraftLaunchFailure(failure, launchLocalGameIssueSent, launchGameProcessStarted)) {
          if (!launchLocalGameIssueSent) {
            sendMinecraftGameIssue({
              id: crypto.randomUUID(),
              instanceId: closedInstanceId,
              instanceName: closedInstanceName,
              exitCode: typeof normalizedCode === 'number' ? normalizedCode : null,
              occurredAt: new Date().toISOString(),
              logPath: combinedLogPath,
              logs: truncateRemoteText(error, 20000),
              classification: failure,
              diagnosis
            })
            launchLocalGameIssueSent = true
          }
          log.warn(`[MC-ISSUE] Kept ${failure.category}/${failure.code} local; no launcher error report was submitted.`)
        } else if (!isExpectedLaunchUserFacingError(error)) {
          publishLauncherError(error, 'launch-minecraft', 'Minecraft could not be launched', {
            playerName: launchPlayerName || null,
            accountType: launchAccountType
          }).catch(() => undefined)
        }
        log.warn(`Minecraft process exited with code ${normalizedCode}. See instance latest.log for game output.`)
      }
      closeRunLog(closedLogStream, `Minecraft closed with code ${normalizedCode}`, runLogInstance || undefined)
      deps.tray?.setToolTip(hasActiveMinecraft()
        ? `NamLauncher\n${getActiveMinecraftCount()} Minecraft instance${getActiveMinecraftCount() === 1 ? '' : 's'} active`
        : `NamLauncher\nVersion ${app.getVersion()}`)
      refreshTrayMenu()
      if (!hasActiveMinecraft()) restoreLauncherAfterGame()
    })

    launcher.on('error', (error) => {
      if (isLaunchCancelled()) return
      const text = truncateRemoteText(redactSensitiveText(error instanceof Error ? error.stack || error.message : error), 20000)
      writeRunLog(runLogStream, `[ERROR] ${text}`, runLogInstance || undefined)
      deps.mainWindow?.webContents.send('launch-error', text)
      const diagnosis = getMinecraftCrashDiagnosis(text)
      const failure = classifyMinecraftProcessFailure(text, diagnosis, {
        managedComponentActive: launchManagedComponentActive,
        managedJavaRuntimeActive: true
      })
      const expectedUserFacingError = isExpectedLaunchUserFacingError(text)
      if (!expectedUserFacingError && failure.reportPolicy === 'automatic') {
        const reportTitle = failure.code === 'namlauncher-runtime-failure'
          ? 'NamLauncher selected an incompatible Java runtime'
          : 'NamLauncher game component failed'
        publishLauncherError(text, 'minecraft-launcher-core', reportTitle, {
          playerName: launchPlayerName || null,
          accountType: launchAccountType,
          diagnosis,
          failureClassification: failure
        }).catch(() => undefined)
      } else if (!expectedUserFacingError && isLocalMinecraftLaunchFailure(failure, launchLocalGameIssueSent, launchGameProcessStarted)) {
        if (!launchLocalGameIssueSent) {
          sendMinecraftGameIssue({
            id: crypto.randomUUID(),
            instanceId: launchedInstanceId,
            instanceName: launchedInstanceName,
            exitCode: null,
            occurredAt: new Date().toISOString(),
            logPath: null,
            logs: text,
            classification: failure,
            diagnosis
          })
          launchLocalGameIssueSent = true
        }
        log.warn(`[MC-ISSUE] Kept ${failure.category}/${failure.code} local from launcher error event; no launcher report was submitted.`)
      } else if (!expectedUserFacingError) {
        publishLauncherError(text, 'launch-minecraft', 'Minecraft could not be launched', {
          playerName: launchPlayerName || null,
          accountType: launchAccountType
        }).catch(() => undefined)
      }
    })

    try {
      assertLaunchActive()
      let authorization = await resolveAccountForLaunch(request)
      const offlineSkinLaunch = await prepareOfflineSkinLaunch(authorization, request.accountId)
      authorization = offlineSkinLaunch.authorization
      launchPlayerName = String(authorization?.name || '')
      assertLaunchActive()
      sendGameState({
        status: 'launching',
        instanceId: instance.id,
        instanceName: instance.name
      })
      const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)
      const settings = readLauncherSettings()
      const selectedAccountType = readAccounts().find((account) => account.id === request.accountId)?.type || 'unknown'
      launchAccountType = selectedAccountType
      const baseJavaArgs = getLaunchJavaArgs(settings, instance.version)
      const performancePolicy = resolvePerformancePolicy({
        totalMemoryGb: os.totalmem() / (1024 ** 3),
        requestedMemoryGb: request.memoryGb,
        automaticMemory: settings.automaticMemory,
        profile: settings.performanceProfile,
        minecraftVersion: instance.version,
        loader: instance.loader
      })

      ensureDir(instanceRoot)
      ensureDir(gameDirectory)
      try {
        provisionThaiResourcePack(instance)
      } catch (error) {
        log.warn(`Could not refresh the managed Thai font resource pack for ${instance.name}.`, getCompactErrorLog(error))
        try {
          disableManagedThaiResourcePacksInOptions(gameDirectory)
        } catch (disableError) {
          log.warn(`Could not disable the unusable managed Thai font resource pack for ${instance.name}.`, getCompactErrorLog(disableError))
        }
      }
      try {
        await provisionPartnerServers(instance)
      } catch (error) {
        log.warn(`Could not provision partner servers for ${instance.name}.`, getCompactErrorLog(error))
      }
      const quickPlayOption = await validateQuickPlayRequest(request, instance)
      if (request.quickPlay && !quickPlayOption) {
        log.info(`Minecraft ${instance.version} does not support this quick play target; opening the instance normally.`)
      }
      runLogStream = createInstanceRunLog(instance, instanceRoot)
      launchSessionState.logStream = runLogStream
      log.info(`Minecraft game log will be read from: ${path.join(gameDirectory, 'logs', 'latest.log')}`)

      sendProgress({ type: 'java-setup', task: 0, total: 100, instanceId: instance.id })
      let javaPath = await ensureJavaExists(userDataPath, instance.version, (progress, detail, phase) => {
        if (isLaunchCancelled()) return
        const type = phase === 'extract' || phase === 'finalize' || phase === 'cleanup'
          ? 'java-extract'
          : 'java-download'
        sendProgress({ type, task: progress, total: 100, detail, instanceId: instance.id })
      }, launchSessionState.abortController.signal)

      assertLaunchActive()
      const loader = await prepareLoader(instanceRoot, instance, javaPath, launchSessionState.abortController.signal)
      assertLaunchActive()
      try {
        const bridgeResult = provisionBrandingBridge({
          instanceRoot,
          gameDirectory,
          target: {
            loader: instance.loader,
            minecraftVersion: instance.version,
            fabricLoaderVersion: loader.resolvedLoaderVersion || instance.loaderVersion || ''
          },
          bundleRoots: [
            path.join(process.resourcesPath, 'game-bridge'),
            path.join(app.getAppPath(), 'build', 'game-bridge')
          ]
        })
        if (bridgeResult.status === 'unavailable') {
          throw new Error('The required NamLauncher game companion is unavailable or failed its integrity check.')
        } else if (bridgeResult.status === 'collision') {
          throw new Error(`A different file is blocking the required NamLauncher game companion: ${bridgeResult.filename}`)
        } else if (bridgeResult.status === 'installed' || bridgeResult.status === 'removed') {
          log.info(`NamLauncher branding bridge ${bridgeResult.status} for the selected instance.`)
        }
        if (bridgeResult.supportStatus === 'legacy-frozen'
          && !notifiedLegacyCompanionVersions.has(instance.version)) {
          notifiedLegacyCompanionVersions.add(instance.version)
          log.info(`Minecraft ${instance.version} uses the frozen legacy NamLauncher game companion.`)
          const notice = {
            type: 'info' as const,
            title: 'ส่วนเสริม NamLauncher รุ่นเก่า',
            message: `Minecraft ${instance.version} จะใช้ส่วนเสริม NamLauncher รุ่นเดิม`,
            detail: 'ตั้งแต่ NamLauncher 1.1.17 เป็นต้นไป ตัวเสริมในเกมจะได้รับฟีเจอร์ใหม่เฉพาะ Minecraft 1.21.11 และ 26.2 รุ่นเก่ายังคงเปิดเล่นได้ตามปกติ แต่จะไม่ได้รับการอัปเดตตัวเสริมใหม่',
            buttons: ['เข้าใจแล้ว'],
            defaultId: 0,
            noLink: true
          }
          if (deps.mainWindow && !deps.mainWindow.isDestroyed()) await dialog.showMessageBox(deps.mainWindow, notice)
          else await dialog.showMessageBox(notice)
        }
        launchManagedComponentActive = bridgeResult.status === 'installed' || bridgeResult.status === 'current'
      } catch (error) {
        log.error('Could not restore the required NamLauncher game companion before launch.', getCompactErrorLog(error))
        throw new Error(
          'NamLauncher could not restore its required system mod. Repair or reinstall NamLauncher, then start the game again.'
        )
      }
      try {
        writePlayerBadgeConfig({
          gameDirectory,
          enabled: settings.playerBadgeEnabled,
          playerUuid: authorization?.uuid,
          lookupEndpoint: `${STATS_API_BASE}/api/player-badges/lookup`
        })
      } catch (error) {
        log.warn('Could not safely prepare the optional NamLauncher player badge configuration; continuing without badges.', getCompactErrorLog(error))
      }
      assertLaunchActive()
      const setupJavaPath = javaPath
      javaPath = getMinecraftLaunchJavaPath(javaPath)
      const requestedLoaderArgs = Array.isArray((loader as any).javaArgs) ? (loader as any).javaArgs : []
      const loaderArgumentPolicy = applyCustomJavaArgumentPolicy(requestedLoaderArgs, process.platform)
      const loaderJavaArgs = loaderArgumentPolicy.javaArgs
      if (loaderArgumentPolicy.removedArguments.length > 0) {
        log.warn(
          'Ignored instance Java arguments that could override the launcher memory budget or force non-adaptive client memory behavior: '
          + loaderArgumentPolicy.removedArguments.join(', ')
        )
      }
      const performanceJavaArgs = settings.customJavaArgsEnabled
        ? []
        : performancePolicy.javaArgs
      const javaArgs = [
        ...baseJavaArgs,
        ...performanceJavaArgs,
        ...loaderJavaArgs,
        ...offlineSkinLaunch.javaArgs
      ]
      const launchVersion: { number: string; type: string; custom?: string } = {
        number: instance.version,
        type: 'release'
      }

      if (loader.customVersionId) {
        launchVersion.custom = loader.customVersionId
      }

      const launchOptions: any = {
        clientPackage: null,
        authorization,
        root: instanceRoot,
        javaPath,
        version: launchVersion,
        memory: {
          max: performancePolicy.memoryMax,
          min: performancePolicy.memoryMin
        },
        forge: loader.forgePath || null,
        customArgs: javaArgs,
        ...(quickPlayOption ? { quickPlay: quickPlayOption } : {}),
        overrides: {
          gameDirectory,
          cwd: gameDirectory,
          detached: true,
          url: {
            mavenForge: `${FORGE_MAVEN_BASE}/`
          }
        }
      }

      log.info(
        `Launching Minecraft ${instance.version} ${instance.loader} ${loader.resolvedLoaderVersion || ''} at ${instanceRoot} using Java: ${javaPath}`
      )
      log.info(
        `Performance profile ${performancePolicy.profile}: ${performancePolicy.memoryGb}G play-session budget, `
        + `${performancePolicy.memoryMin}-${performancePolicy.memoryMax} heap, `
        + `${performancePolicy.nativeMemoryReserveMb}M native reserve, ${performancePolicy.launcherMemoryReserveMb}M launcher reserve `
        + `(recommended ${performancePolicy.recommendedMemoryGb}G, safe max ${performancePolicy.safeMaximumGb}G).`
      )
      if (settings.customJavaArgsEnabled && performancePolicy.javaArgs.length > 0) {
        log.info('Custom Java arguments are enabled; automatic profile JVM flags were skipped to avoid conflicting collectors or duplicate options.')
      }
      log.info('Playing game: Minecraft')
      log.info(`Executable: ${javaPath}`)
      writeRunLog(runLogStream, `Java: ${javaPath}`, instance)
      if (setupJavaPath !== javaPath) {
        writeRunLog(runLogStream, `Java setup executable: ${setupJavaPath}`, instance)
      }
      writeRunLog(
        runLogStream,
        `Java arguments prepared: ${javaArgs.length} (${settings.customJavaArgsEnabled ? 'includes custom arguments; values omitted' : 'managed launcher profile'})`,
        instance
      )

      assertLaunchActive()
      const childProcess = await launcher.launch(launchOptions)
      if (!childProcess) {
        assertLaunchActive()
        throw new Error(lastKnownError || 'Minecraft launch returned no process. Check the instance latest.log for details.')
      }
      releaseChildProcessFromLauncher(childProcess)
      launchSessionState.childProcess = childProcess
      launchGameProcessStarted = Boolean(childProcess.pid)
      if (isLaunchCancelled()) {
        try {
          childProcess.kill()
        } catch (err) {
          log.warn('Failed to kill cancelled Minecraft process:', err)
        }
        throw new Error(LAUNCH_CANCELLED_MESSAGE)
      }

      const knownServers = PARTNER_SERVERS.map((server) => ({
        canonicalKey: normalizeMinecraftServerEndpoint(server.address).canonicalKey,
        name: server.name
      }))
      const playerTextureId = getDiscordPlayerTextureIdForLaunch(request.accountId)
      const runningGame: RunningGame = {
        process: childProcess,
        instanceId: instance.id,
        instanceName: instance.name,
        minecraftVersion: instance.version,
        playerName: String(authorization?.name || 'Minecraft Player'),
        playerUuid: String(authorization?.uuid || ''),
        gameDirectory,
        playerTextureId,
        gamePid: Number(childProcess.pid) || process.pid,
        startedAt: Date.now(),
        loader: instance.loader,
        accountType: selectedAccountType,
        telemetrySessionId: crypto.randomUUID(),
        telemetryActive: false,
        telemetryStartAcknowledged: false,
        currentServer: null,
        knownServers,
        badgePresenceId: crypto.randomUUID(),
        badgePresenceActive: false,
        badgePresenceStartAcknowledged: false,
        logStream: runLogStream
      }
      runningGames.set(instance.id, runningGame)
      void readMinecraftServersDat(path.join(gameDirectory, 'servers.dat'))
        .then(({ servers }) => {
          runningGame.knownServers = servers.map((server) => ({
            canonicalKey: server.canonicalKey,
            name: server.name
          }))
        })
        .catch(() => undefined)
      void startGameSessionTelemetry(runningGame, settings)
      void startPlayerBadgePresence(runningGame, settings)
      void reportRestrictedModSignals(runningGame, settings)
      refreshTrayMenu()
      if (activeLaunches.get(instance.id)?.id === launchSessionId) activeLaunches.delete(instance.id)
      launchSession = null

      configureDiscordForActiveGames(settings)
      if (deps.launcherRestingInTray) {
        log.info('NamLauncher Discord RPC remains paused in the system tray while Minecraft runs.')
      } else if (settings.discordRpcEnabled) {
        log.info(`NamLauncher custom Discord RPC active with application id ${MINECRAFT_OFFICIAL_APPLICATION_ID} for pid ${runningGame.gamePid}`)
      } else {
        log.info(`NamLauncher Discord RPC disabled; using native Minecraft detection with application id ${MINECRAFT_OFFICIAL_APPLICATION_ID} for pid ${runningGame.gamePid}`)
      }
      sendOnlineHeartbeat().catch(() => undefined)

      sendGameState({
        status: 'running',
        instanceId: instance.id,
        instanceName: instance.name,
        startedAt: runningGame.startedAt
      })
      minimizeLauncherForGame(settings)

      return {
        success: true,
        instanceRoot,
        gameDirectory,
        javaPath,
        loaderVersion: loader.resolvedLoaderVersion || instance.loaderVersion
      }
    } catch (err) {
      const text = truncateRemoteText(redactSensitiveText(err instanceof Error ? err.stack || err.message : err), 20000)
      if (text.includes(LAUNCH_CANCELLED_MESSAGE)) {
        log.info(`Launch process cancelled${launchedInstanceName ? ` for ${launchedInstanceName}` : ''}.`)
        closeRunLog(runLogStream, LAUNCH_CANCELLED_MESSAGE, runLogInstance || undefined)
        runLogStream = null
        if (activeLaunches.get(launchedInstanceId)?.id === launchSessionId) {
          activeLaunches.delete(launchedInstanceId)
        }
        sendGameState({
          status: 'stopped',
          instanceId: launchedInstanceId || null,
          instanceName: launchedInstanceName || null,
          cancelled: true
        })
        return { success: false, cancelled: true }
      }

      closeRunLog(runLogStream, `Launch failed: ${text}`, runLogInstance || undefined)
      const diagnosis = getMinecraftCrashDiagnosis(text)
      const failure = classifyMinecraftProcessFailure(text, diagnosis, {
        managedComponentActive: launchManagedComponentActive,
        managedJavaRuntimeActive: true
      })
      // This catch also covers our post-spawn setup. A running game alone does
      // not turn an exception in launcher code into a local Minecraft issue.
      if (isLocalMinecraftLaunchFailure(failure, launchLocalGameIssueSent)) {
        if (!launchLocalGameIssueSent) {
          sendMinecraftGameIssue({
            id: crypto.randomUUID(),
            instanceId: launchedInstanceId,
            instanceName: launchedInstanceName,
            exitCode: null,
            occurredAt: new Date().toISOString(),
            logPath: null,
            logs: text,
            classification: failure,
            diagnosis
          })
          launchLocalGameIssueSent = true
        }
        log.warn(`[MC-ISSUE] Kept ${failure.category}/${failure.code} local from launch rejection; no launcher report was submitted.`)
      } else if (!isExpectedLaunchUserFacingError(text)) {
        log.error('Launch process failed:', text)
        publishLauncherError(text, 'launch-minecraft', 'Minecraft could not be launched', {
          playerName: launchPlayerName || null,
          accountType: launchAccountType,
          diagnosis,
          failureClassification: failure.reportPolicy === 'automatic' ? failure : undefined
        }).catch(() => undefined)
      } else {
        log.info('Minecraft launch was stopped by an expected user-facing condition.')
      }
      if (activeLaunches.get(launchedInstanceId)?.id === launchSessionId) {
        activeLaunches.delete(launchedInstanceId)
      }
      sendGameState({
        status: 'stopped',
        instanceId: launchedInstanceId,
        instanceName: launchedInstanceName,
        failed: true
      })
      throw err
    } finally {
      if (launchProgressTimer) clearTimeout(launchProgressTimer)
      launchProgressTimer = null
      pendingLaunchProgress = null
      if (activeLaunches.get(launchedInstanceId)?.id === launchSessionId) {
        activeLaunches.delete(launchedInstanceId)
      }
      refreshTrayMenu()
    }
  })

  trustedIpcHandle('login-microsoft', async () => {
    try {
      log.info('Starting Microsoft login...')
      const result = await msmc.fastLaunch(
        'electron',
        (update) => {
          log.info(`[MSMC-UPDATE] ${update.type}: ${redactSensitiveText(update.data || '')}`)
        },
        'select_account',
        {
          width: 520,
          height: 680,
          resizable: false,
          parent: deps.mainWindow || undefined,
          modal: Boolean(deps.mainWindow),
          title: 'Microsoft Login'
        }
      )

      if (msmc.errorCheck(result)) {
        throw new Error(getMicrosoftLoginFailureMessage(result))
      }

      const auth = msmc.getMCLC().getAuth(result)
      if (!getMicrosoftRefreshToken(auth)) {
        throw new Error('Microsoft login did not return a refresh token. Please try signing in again.')
      }
      const account = upsertAccount(auth, 'msa')
      log.info(`Microsoft login successful for user: ${account.name}`)
      return account
    } catch (err) {
      const detail = redactSensitiveText(err instanceof Error ? err.stack || err.message : err)
      log.error('Microsoft login failed:', detail)
      throw err
    }
  })

  trustedIpcHandle('login-offline', async (_event, username: string) => {
    const cleanName = String(username || '').trim()
    if (!isValidOfflineUsername(cleanName)) {
      throw new Error(OFFLINE_USERNAME_ERROR_MESSAGE)
    }

    log.info(`Offline login request for user: ${cleanName}`)
    const auth = createOfflineAuth(cleanName)
    return upsertAccount(auth, 'offline')
  })

  ipcMain.on('window-control', (_event, action) => {
    if (action === 'minimize') minimizeLauncherToTaskbar()
    if (action === 'maximize') {
      if (deps.mainWindow?.isMaximized()) deps.mainWindow.unmaximize()
      else deps.mainWindow?.maximize()
    }
    if (action === 'quit') requestAppQuit()
    if (action === 'close') closeLauncherWindow()
  })

  ipcMain.on('open-logs', () => {
    shell.showItemInFolder(logPath)
  })

  ipcMain.on('open-external', (_event, url: string) => {
    openExternalUrl(url).catch(() => undefined)
  })

  ipcMain.on('launcher-error-observed', (_event, payload: { context?: unknown; message?: unknown; stack?: unknown }) => {
    const context = String(payload?.context || 'renderer').slice(0, 120)
    const error = String(payload?.stack || payload?.message || 'Unknown renderer error').slice(0, 100_000)
    if (isExpectedLaunchUserFacingError(error)) return
    if (context === 'ipc:launch-minecraft') {
      log.warn('[LAUNCHER-ERROR] Refused duplicate renderer report for a centrally handled Minecraft launch failure.')
      return
    }
    publishLauncherError(error, context).catch(() => undefined)
  })

  trustedIpcHandle('copy-error-report', async (_event, report: unknown) => {
    const rawReport = String(report || '')
    if (Buffer.byteLength(rawReport, 'utf8') > 10 * 1024 * 1024) {
      throw new Error('The error report is too large to copy safely.')
    }
    const safeReport = sanitizeBugReport(rawReport)
    if (!safeReport.trim()) throw new Error('There is no error report to copy.')
    clipboard.writeText(safeReport)
    return { success: true }
  })

  trustedIpcHandle('submit-error-report', async (_event, request: LauncherErrorSubmitRequest = {}) => {
    return confirmLauncherErrorReport(request || {})
  })

  return {
    configureDiscordForActiveGames,
    requestMinecraftStop,
    stopAllMinecraftFromTray
  }
}
