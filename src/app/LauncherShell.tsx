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
  Monitor,
  MonitorDown,
  MoreVertical,
  Moon,
  Package,
  Palette,
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
  Sun,
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
import type { useLauncherController } from './useLauncherController'

const getLoaderReleaseTone = (releaseType?: string) => {
  const normalized = String(releaseType || '').trim().toLowerCase()
  if (normalized === 'stable' || normalized === 'recommended') return 'stable'
  if (normalized === 'unstable' || normalized === 'beta' || normalized === 'snapshot') return 'unstable'
  return 'latest'
}

type LauncherShellProps = {
  model: ReturnType<typeof useLauncherController>
}

export const LauncherShell = ({ model }: LauncherShellProps) => {
  const {
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
    refreshCurrentTargetLoaderUpdate,
    refreshInstanceContent,
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
    updateCurrentTargetLoaderNow,
    updateInstanceLoaderNow,
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
  } = model


  const launcherErrorModal = launcherErrorReport ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-labelledby="launcher-error-title">
      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="flex h-[calc(100vh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-red-400/35 bg-[#0d1526] shadow-2xl shadow-red-950/30"
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-red-400/20 bg-red-500/[0.07] p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-red-400/30 bg-red-500/15 text-red-200">
            <AlertTriangle size={23} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-300">{t('launcherError.eyebrow')}</p>
            <h2 id="launcher-error-title" className="mt-1 text-xl font-black text-white">
              {launcherErrorTitle}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
              {launcherErrorBody}
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
          {launcherErrorDiagnosis && (
            <div className="flex shrink-0 items-start gap-3 rounded-lg border border-amber-300/25 bg-amber-400/[0.08] p-3 text-amber-50">
              <Wrench size={17} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="text-sm font-black">{launcherErrorDiagnosisText.title}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-amber-100/75">{launcherErrorDiagnosisText.body}</p>
              </div>
            </div>
          )}
          <div className="grid shrink-0 gap-2 rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-xs font-semibold text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            <span className="flex min-w-0 items-center gap-2">
              <User size={14} className="shrink-0 text-blue-300" />
              <span className="truncate">{launcherErrorReport.playerName || activeAccount?.name || 'unknown'}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Cpu size={14} className="shrink-0 text-blue-300" />
              <span className="truncate">{launcherErrorSystem.cpu || 'unknown'}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <HardDrive size={14} className="shrink-0 text-blue-300" />
              <span className="truncate">{launcherErrorStorageSummary || `${launcherErrorSystem.ram_gb || '?'} GB RAM`}</span>
            </span>
            <span className="min-w-0 truncate font-mono text-slate-400">{launcherErrorGpuSummary || `${launcherErrorReport.platform || 'unknown'}/${launcherErrorReport.arch || 'unknown'}`}</span>
          </div>
          <div className="grid max-h-36 shrink-0 gap-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-xs font-semibold sm:grid-cols-[180px_1fr]">
            <span className="font-mono text-slate-500">{launcherErrorReport.context}</span>
            <span className="break-words text-red-100">{launcherErrorReport.message}</span>
          </div>
          <textarea
            readOnly
            spellCheck={false}
            aria-label={t('launcherError.logsAria')}
            value={launcherErrorReport.logs}
            wrap="off"
            className="min-h-[220px] flex-1 cursor-text resize-none overflow-auto rounded-lg border border-slate-700 bg-[#060b14] p-4 font-mono text-[11px] leading-5 text-slate-300 outline-none selection:bg-blue-500/35"
          />
        </div>

        {errorSubmitDetail && (
          <div className={classNames(
            'mx-5 mb-4 max-h-24 overflow-y-auto rounded-lg border px-4 py-3 text-sm font-semibold leading-6',
            errorSubmitState === 'failed'
              ? 'border-red-400/30 bg-red-500/10 text-red-100'
              : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
          )}>
            {errorSubmitDetail}
          </div>
        )}

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setLauncherErrorReport(null)
              setErrorCopyState('idle')
              setErrorSubmitState('idle')
              setErrorSubmitDetail('')
            }}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-red-500 px-5 text-sm font-black text-white transition-colors hover:bg-red-400"
          >
            <X size={17} />
            {t('launcherError.close')}
          </button>
          <button
            type="button"
            onClick={copyLauncherErrorReport}
            disabled={errorCopyState === 'copying'}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 text-sm font-black text-white transition-colors hover:bg-blue-400 disabled:cursor-wait disabled:opacity-60"
          >
            {errorCopyState === 'copying' ? <Loader2 size={17} className="animate-spin" /> : <ClipboardCopy size={17} />}
            {errorCopyState === 'copied'
              ? t('launcherError.copy.copied')
              : errorCopyState === 'failed'
                ? t('launcherError.copy.failed')
                : t('launcherError.copy.all')}
          </button>
          <button
            type="button"
            onClick={submitLauncherErrorReport}
            disabled={errorSubmitState === 'sending' || errorSubmitState === 'sent' || submittedErrorReportsRef.current.has(launcherErrorReport.id)}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-400/40 bg-blue-500/10 px-4 text-sm font-black text-blue-100 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900/40 disabled:text-slate-500"
          >
            {errorSubmitState === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <MessageCircle size={17} />}
            {errorSubmitState === 'sent' || submittedErrorReportsRef.current.has(launcherErrorReport.id)
              ? t('launcherError.submit.sent')
              : errorSubmitState === 'failed'
                ? t('launcherError.submit.failed')
                : t('launcherError.submit.send')}
          </button>
        </footer>
      </motion.section>
    </div>
  ) : null

  const gameIssueInstance = minecraftGameIssue
    ? instances.find((instance) => instance.id === minecraftGameIssue.instanceId) || null
    : null
  const gameIssueCategory = minecraftGameIssue?.classification.category === 'user-content'
    ? 'user-content'
    : minecraftGameIssue?.classification.category === 'game-environment'
      ? 'game-environment'
      : 'unknown-game'
  const gameIssueMessageKey = minecraftGameIssue?.classification.code === 'resource-pack-invalid'
    ? 'resource-pack-invalid'
    : minecraftGameIssue?.classification.code === 'client-shutdown-hang'
      ? 'client-shutdown-hang'
      : gameIssueCategory
  const gameIssueContentTab: InstanceContentKind = minecraftGameIssue?.classification.code === 'resource-pack-invalid'
    ? 'resourcepacks'
    : 'mods'
  const gameIssueDiagnosisText = getCrashDiagnosisText(minecraftGameIssue?.diagnosis || null)
  const gameIssueLogs = minecraftGameIssue?.logs?.trim() || ''
  const gameIssueCopyState = gameIssueCopyResult?.id === minecraftGameIssue?.id
    ? gameIssueCopyResult?.state
    : undefined
  const copyMinecraftGameIssueLogs = async () => {
    if (!minecraftGameIssue || !gameIssueLogs || gameIssueCopyState === 'copying') return
    const id = minecraftGameIssue.id
    setGameIssueCopyResult({ id, state: 'copying' })
    try {
      // Local clipboard only; game-content diagnostics are never submitted.
      const result = await window.electron.copyErrorReport(gameIssueLogs)
      setGameIssueCopyResult({ id, state: result.success ? 'copied' : 'failed' })
    } catch {
      setGameIssueCopyResult({ id, state: 'failed' })
    }
  }
  const openMinecraftGameIssueView = (view: 'content' | 'logs') => {
    if (!gameIssueInstance) return
    setSelectedInstanceId(gameIssueInstance.id)
    setActiveView('instances')
    setInstancePanelView(view)
    if (view === 'content') setContentTab(gameIssueContentTab)
    setMinecraftGameIssue(null)
  }
  const minecraftGameIssueModal = minecraftGameIssue ? (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-3 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-labelledby="minecraft-game-issue-title">
      <motion.section
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-amber-300/30 bg-[#0d1526] shadow-2xl shadow-amber-950/25"
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-amber-300/20 bg-amber-400/[0.07] p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/15 text-amber-200">
            <Wrench size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">{t('gameIssue.eyebrow')}</p>
            <h2 id="minecraft-game-issue-title" className="mt-1 text-xl font-black text-white">
              {t(`gameIssue.title.${gameIssueMessageKey}`)}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
              {t(`gameIssue.body.${gameIssueMessageKey}`)}
            </p>
          </div>
        </header>

        <div className="min-h-0 space-y-3 overflow-y-auto p-5">
          {minecraftGameIssue.diagnosis && gameIssueDiagnosisText.title && (
            <div className="rounded-lg border border-amber-300/25 bg-amber-400/[0.08] p-4">
              <p className="text-sm font-black text-amber-50">{gameIssueDiagnosisText.title}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-amber-100/75">{gameIssueDiagnosisText.body}</p>
            </div>
          )}

          <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/30 p-4 text-xs font-semibold text-slate-300 sm:grid-cols-2">
            <span className="min-w-0 truncate">{minecraftGameIssue.instanceName}</span>
            <span className="font-mono text-slate-500 sm:text-right">
              {minecraftGameIssue.exitCode === null
                ? minecraftGameIssue.classification.code
                : tf('gameIssue.exitCode', { code: minecraftGameIssue.exitCode })}
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] px-4 py-3 text-sm font-bold text-emerald-100">
            <ShieldCheck size={18} className="shrink-0 text-emerald-300" />
            <span>{t('gameIssue.localOnly')}</span>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="minecraft-game-issue-logs" className="text-xs font-black text-slate-300">
                {t('gameIssue.logs')}
              </label>
              <button
                type="button"
                onClick={copyMinecraftGameIssueLogs}
                disabled={!gameIssueLogs || gameIssueCopyState === 'copying'}
                className="flex min-h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {gameIssueCopyState === 'copying' ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCopy size={14} />}
                <span role="status" aria-live="polite">
                  {gameIssueCopyState === 'copied'
                    ? t('launcherError.copy.copied')
                    : gameIssueCopyState === 'failed'
                      ? t('launcherError.copy.failed')
                      : t('gameIssue.copyLogs')}
                </span>
              </button>
            </div>
            <textarea
              id="minecraft-game-issue-logs"
              readOnly
              spellCheck={false}
              value={gameIssueLogs || t('gameIssue.logsUnavailable')}
              className="h-48 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/80 p-3 font-mono text-xs leading-5 text-slate-300 outline-none selection:bg-blue-500/40 focus:border-blue-400"
            />
            <p className="text-xs leading-5 text-slate-500">{t('gameIssue.logsHint')}</p>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-800 p-4">
          <button
            type="button"
            onClick={() => setMinecraftGameIssue(null)}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-800 px-5 text-sm font-black text-white transition-colors hover:bg-slate-700"
          >
            <X size={17} />
            {t('gameIssue.close')}
          </button>
          {gameIssueInstance && (
            <>
              <button
                type="button"
                onClick={() => window.electron.openInstanceFolder(gameIssueInstance).catch(() => undefined)}
                className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-4 text-sm font-black text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
              >
                <FolderOpen size={17} />
                {t('gameIssue.openFolder')}
              </button>
              <button
                type="button"
                onClick={() => openMinecraftGameIssueView('logs')}
                className="flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 text-sm font-black text-blue-100 transition-colors hover:bg-blue-500/20"
              >
                <FileText size={17} />
                {t('gameIssue.openLogs')}
              </button>
              <button
                type="button"
                onClick={() => openMinecraftGameIssueView('content')}
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 text-sm font-black text-slate-950 transition-colors hover:bg-amber-300"
              >
                <Package size={17} />
                {minecraftGameIssue.classification.code === 'resource-pack-invalid'
                  ? t('gameIssue.openResourcePacks')
                  : t('gameIssue.openMods')}
              </button>
            </>
          )}
        </footer>
      </motion.section>
    </div>
  ) : null

  const mrpackImportProgressModal = importingMrpack ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="mrpack-import-title">
      <motion.section
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: 'easeOut' }}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-blue-300/25 bg-[#0d1526] shadow-2xl shadow-black/45"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-500/12 text-blue-100">
              <FileArchive size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">{t('mrpack.progress.eyebrow')}</p>
              <h2 id="mrpack-import-title" className="mt-1 text-xl font-black text-white">{t('mrpack.progress.title')}</h2>
              <p className="mt-1 truncate text-sm font-semibold text-slate-400">
                {activityDetail || statusText || t('mrpack.progress.preparing')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => cancelActiveInstall()}
            aria-label={t('mrpack.progress.cancel')}
            data-tooltip={t('mrpack.progress.cancelTooltip')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-100"
          >
            <X size={17} />
          </button>
        </header>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <span>{statusText || t('mrpack.progress.working')}</span>
            <span className="font-mono tabular-nums text-blue-200">{Math.min(Math.max(Math.round(progress), 0), 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-400 transition-[width] duration-200"
              style={{ width: `${Math.min(Math.max(Math.round(progress), 0), 100)}%` }}
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-blue-400/15 bg-blue-500/[0.06] p-3 text-sm font-bold text-blue-100/80">
            <Loader2 size={17} className="shrink-0 animate-spin" />
            <span className="min-w-0 truncate">{activityDetail || t('mrpack.progress.reading')}</span>
          </div>
        </div>
      </motion.section>
    </div>
  ) : null

  if (!bootReady) {
    return (
      <div className="app-shell nam-backdrop-grid h-screen w-screen overflow-hidden bg-[#09101f] text-slate-100 antialiased">
        {launcherErrorModal}
        {minecraftGameIssueModal}
        <header className="titlebar flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-[#0a1120]/90 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-blue-400/30 bg-blue-500/15">
              <img src="./namlauncher-icon.png" alt="" className="h-7 w-7 object-contain outline-0" />
            </div>
            <p className="text-sm font-black text-white">NamLauncher</p>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-black uppercase text-emerald-200">
              {t('brand.beta')}
            </span>
          </div>
          <div className="no-drag flex items-center gap-1">
            <button onClick={() => window.electron.windowControl('minimize')} aria-label={t('window.minimize')} data-tooltip={t('window.minimize')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100">
              <Minus size={15} />
            </button>
            <button onClick={() => window.electron.windowControl('maximize')} aria-label={t('window.maximize')} data-tooltip={t('window.maximize')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100">
              <Square size={13} />
            </button>
            <button onClick={() => window.electron.windowControl('close')} aria-label={t('window.close')} data-tooltip={t('window.close')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-300">
              <X size={15} />
            </button>
          </div>
        </header>

        <main className="flex h-[calc(100vh-48px)] items-center justify-center px-8">
          {startupAutoUpdating ? (
            <section
              data-testid="startup-update-card"
              className="nam-motion-card w-full max-w-[440px] overflow-hidden rounded-2xl border border-blue-300/25 bg-[#0d1526]/95 p-5 shadow-2xl shadow-black/40"
            >
              <div className="flex items-center gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-400/30 bg-blue-500/15">
                  <img src="./namlauncher-icon.png" alt="" className="h-14 w-14 object-contain outline-0" />
                  <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-slate-950/60">
                    <span className="nam-progress-bar block h-full w-1/2 rounded-full bg-blue-300" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">NamLauncher Update</p>
                  <h1 className="mt-1 text-xl font-black text-white">
                    {t(launcherUpdateProgress?.state === 'downloading'
                      ? 'update.auto.downloading'
                      : launcherUpdateProgress?.state === 'verifying'
                        ? 'update.auto.verifying'
                      : launcherUpdateProgress?.state === 'applying'
                        ? 'update.auto.applying'
                      : launcherUpdateProgress?.state === 'restarting'
                        ? 'update.auto.restarting'
                      : launcherUpdateProgress?.state === 'opening-installer' || launcherUpdateProgress?.state === 'installer-opened'
                        ? 'update.auto.installing'
                        : 'update.auto.checking')}
                  </h1>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-400" role="status" aria-live="polite">
                    {launcherUpdateProgress?.detail || t('update.auto.notice')}
                  </p>
                </div>
                <span className="font-mono text-sm font-black tabular-nums text-blue-200">{launcherUpdatePercent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={t('update.auto.progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={launcherUpdatePercent}
                className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800"
              >
                <div
                  className="nam-progress-bar h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-300 to-cyan-300 transition-[width] duration-300"
                  style={{ width: `${Math.max(4, launcherUpdatePercent)}%` }}
                />
              </div>
              <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-500">{t('update.auto.notice')}</p>
            </section>
          ) : (
            <section className="nam-motion-card flex w-full max-w-xl flex-col items-center rounded-xl border border-slate-800/80 bg-[#0d1526]/92 p-7 text-center shadow-2xl shadow-black/30">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-blue-400/30 bg-blue-500/15 shadow-2xl shadow-blue-950/35">
                <img src="./namlauncher-icon.png" alt="" className="h-20 w-20 object-contain outline-0 drop-shadow-[0_16px_30px_rgba(59,130,246,0.28)]" />
              </div>
              <p className="mt-8 text-xs font-black uppercase text-blue-300">{t('boot.eyebrow')}</p>
              <h1 className="mt-3 text-4xl font-black text-white">NamLauncher</h1>
              <p className="mt-3 min-h-[24px] text-sm font-bold text-slate-400" role="status" aria-live="polite">{bootText}</p>
              <div className="mt-7 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="nam-progress-bar h-full rounded-full bg-blue-400 transition-[width] duration-300" style={{ width: `${visibleBootProgress}%` }} />
              </div>
              <div className="mt-3 flex w-full items-center justify-between text-xs font-black text-slate-500">
                <span>{t('boot.preparing')}</span>
                <span className="font-mono tabular-nums text-blue-200">{visibleBootProgress}%</span>
              </div>
              <div className="mt-6 grid w-full grid-cols-4 gap-2">
                {bootMilestones.map((step) => (
                  <div key={step.label} className={classNames('rounded-lg border px-2 py-2 text-[11px] font-black uppercase', step.done ? 'border-blue-400/30 bg-blue-500/12 text-blue-100' : 'border-slate-800 bg-slate-950/25 text-slate-600')}>{step.label}</div>
                ))}
              </div>
              <div className="mt-5 w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950/30 text-left">
                <div className="flex h-9 items-center justify-between border-b border-slate-800 px-3">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t('setup.log.title')}</span>
                  <span className="font-mono text-[11px] font-black tabular-nums text-blue-200">{setupLogRows.length}</span>
                </div>
                <div className="max-h-28 overflow-hidden p-3">
                  {setupLogRows.length > 0 ? setupLogRows.slice(-4).map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 py-1 text-xs font-semibold text-slate-400">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-300" />
                      <span className="font-mono text-[10px] tabular-nums text-slate-600">{entry.at}</span>
                      <span className="min-w-0 truncate">{entry.text}</span>
                    </div>
                  )) : <p className="py-2 text-xs font-semibold text-slate-600">{t('setup.log.empty')}</p>}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell nam-backdrop-grid h-screen w-screen overflow-hidden bg-[#09101f] text-slate-100 antialiased">
      {launcherErrorModal}
      {minecraftGameIssueModal}
      {mrpackImportProgressModal}
      <div className="pointer-events-none fixed right-3 top-14 z-[35] flex flex-col items-end">
        <AnimatePresence initial={false} mode="popLayout">
          {modpackInstallActivity?.minimized && (
            <ModpackInstallActivityCard
              key={modpackInstallActivity.taskId}
              activity={modpackInstallActivity}
              icon={modpackInstallActivity.iconUrl ? (
                <CachedImage
                  src={modpackInstallActivity.iconUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  fallback={<Package size={18} aria-hidden="true" />}
                />
              ) : undefined}
              reduceMotion={Boolean(reduceMotion)}
              labels={{
                installing: t('modpack.install.installing'),
                completed: t('modpack.install.completed'),
                failed: t('modpack.install.failed'),
                restore: t('modpack.install.restore'),
                dismiss: t('modpack.install.dismiss')
              }}
              onRestore={restoreModpackInstall}
              onDismiss={dismissModpackInstallActivity}
            />
          )}
        </AnimatePresence>
      </div>
      <div className="flex h-full">
        <aside
          className="relative grid h-full shrink-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden border-r border-slate-800 bg-[#0d1526]"
          style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        >
          <div
            role="separator"
            tabIndex={0}
            onPointerDown={startSidebarResize}
            onKeyDown={handleSidebarResizeKeyDown}
            className="nam-sidebar-resize-hit no-drag group absolute -right-[6px] top-0 z-40 h-full w-3 cursor-ew-resize outline-none"
            aria-label={t('sidebar.resize')}
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            data-tooltip={t('sidebar.resize')}
          >
            <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-800 transition-colors duration-150 group-hover:bg-blue-300/50 group-focus-visible:bg-blue-300/70" />
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-300/0 transition-colors duration-150 group-hover:bg-blue-300/60 group-focus-visible:bg-blue-300/75" />
          </div>
          <div className={classNames('titlebar min-h-[72px] py-4', sidebarNarrow ? 'px-3' : 'px-5')}>
            <div className={classNames('flex min-w-0 items-center', sidebarNarrow ? 'gap-2' : 'gap-3')}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-400/30 bg-blue-500/15">
                <img src="./namlauncher-icon.png" alt="" className="h-8 w-8 object-contain outline-0" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-black tracking-tight text-white">NamLauncher</h1>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">Minecraft</p>
              </div>
            </div>
          </div>

          <nav className={classNames('space-y-1 pb-3', sidebarNarrow ? 'px-2' : 'px-3')}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onPointerEnter={() => {
                  if (item.id === 'skins') void loadSkinPageModule()
                }}
                onFocus={() => {
                  if (item.id === 'skins') void loadSkinPageModule()
                }}
                onClick={() => {
                  setActiveView(item.id)
                  setShowAccountMenu(false)
                }}
                aria-current={activeView === item.id ? 'page' : undefined}
                className={classNames(
                  'relative flex h-11 w-full min-w-0 items-center rounded-lg text-sm font-bold transition-colors duration-150',
                  sidebarNarrow ? 'gap-2 px-2.5' : 'gap-3 px-3',
                  activeView === item.id
                    ? 'text-blue-100'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                )}
              >
                {activeView === item.id && (
                  <motion.span
                    layoutId="active-navigation"
                    className="absolute inset-0 rounded-lg border border-blue-400/25 bg-blue-500/15 shadow-[0_10px_28px_rgba(37,99,235,0.14),inset_0_1px_0_rgba(255,255,255,0.05)]"
                    transition={reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
                  />
                )}
                <item.icon size={18} className="relative z-10 shrink-0" />
                <span className="relative z-10 min-w-0 truncate">{t(item.labelKey)}</span>
              </button>
            ))}
          </nav>

          <div className={classNames('flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden border-t border-slate-800/70 py-3', sidebarNarrow ? 'px-2' : 'px-3')}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{t('sidebar.instances')}</span>
              <button
                onClick={() => setShowInstanceModal(true)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-blue-200"
                data-tooltip={t('sidebar.newInstance')}
                aria-label={t('sidebar.newInstance')}
              >
                <Plus size={17} />
              </button>
            </div>

            <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden">
              <div className="h-full min-w-0 max-w-full space-y-1.5 overflow-y-auto overflow-x-hidden px-1 py-1">
                {instances.length > 0 ? (
                  instances.map((instance) => {
                    const updateCount = instanceUpdateSummaries[instance.id]?.updates.length || 0
                    const running = isInstanceBusy(instance.id)
                    const updating = updatingInstanceId === instance.id

                    return (
                      <div
                        key={instance.id}
                        className={classNames(
                          'nam-interactive-surface group flex min-h-[58px] w-full min-w-0 max-w-full items-center overflow-hidden rounded-lg border text-left transition-colors duration-150 focus-within:border-blue-300/55 focus-within:bg-blue-500/[0.07]',
                          sidebarNarrow ? 'gap-1 pl-2 pr-1' : 'gap-2 pl-3 pr-2',
                          selectedInstanceId === instance.id
                            ? 'nam-selected-glow border-blue-400/30 bg-blue-500/10'
                            : 'border-transparent hover:border-slate-700 hover:bg-slate-800/60'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openInstanceDetail(instance.id)}
                          aria-current={activeView === 'instances' && selectedInstanceId === instance.id ? 'page' : undefined}
                          aria-label={tf('sidebar.openInstance', { name: instance.name })}
                          className={classNames(
                            'nam-sidebar-instance-button flex min-h-[56px] min-w-0 flex-1 items-center text-left outline-none',
                            sidebarNarrow ? 'gap-2' : 'gap-3'
                          )}
                        >
                          <InstanceIcon instance={instance} running={running} size={sidebarCompact ? 'xs' : 'sm'} />
                          <span className="min-w-0 flex-1 overflow-hidden">
                            <span className={classNames('block truncate font-black text-slate-100', sidebarNarrow ? 'text-xs' : 'text-sm')}>
                              {instance.name}
                            </span>
                            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="min-w-0 truncate text-[11px] font-semibold capitalize text-slate-500">
                                {instance.loader}{sidebarNarrow ? '' : ` / ${instance.version}`}
                              </span>
                            </span>
                          </span>
                          {!sidebarNarrow && <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-slate-600" />}
                        </button>
                        {updateCount > 0 && (
                          <button
                            type="button"
                            disabled={updating || running}
                            onClick={() => updateAllContent(instance)}
                            aria-label={running ? t('content.update.busy') : tf('home.updatesAvailable', { count: updateCount })}
                            className={classNames(
                              'flex shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-[11px] font-black text-sky-100 transition-colors duration-150 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50',
                              sidebarNarrow ? 'h-7 w-7 min-w-0 px-0' : 'h-8 min-w-8 gap-1 px-2'
                            )}
                            data-tooltip={running ? t('content.update.busy') : tf('home.updatesAvailable', { count: updateCount })}
                          >
                            {updating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                            {!sidebarNarrow && updateCount}
                          </button>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-700/80 px-3 py-5 text-center">
                    <Package size={22} className="mx-auto text-slate-600" />
                    <p className="mt-2 text-xs font-black text-slate-400">{t('sidebar.noInstances.title')}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-600">{t('sidebar.noInstances.body')}</p>
                    <button
                      onClick={() => setShowInstanceModal(true)}
                      className="mt-3 h-8 rounded-md bg-blue-500 px-3 text-xs font-black text-white transition-colors duration-150 hover:bg-blue-400"
                    >
                      {t('sidebar.newInstance')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div ref={accountMenuRef} className={classNames('relative min-w-0 border-t border-slate-800 bg-[#0b1322]/70', sidebarNarrow ? 'p-2' : 'p-3')}>
            {showAccountMenu && accounts.length > 0 && (
              <div className={classNames(
                'absolute bottom-[calc(100%+8px)] z-30 overflow-hidden rounded-lg border border-slate-700 bg-[#101a2e] shadow-2xl shadow-black/45',
                sidebarNarrow ? 'left-2 right-2' : 'left-3 right-3'
              )}>
                <div className="border-b border-slate-800 px-3 py-2">
                  <p className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{t('account.menu.title')}</p>
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="nam-account-menu-item group flex min-w-0 items-center gap-2 rounded-md p-2"
                      data-selected={activeAccountId === account.id}
                    >
                      <button
                        onClick={() => {
                          setActiveAccountId(account.id)
                          setShowAccountMenu(false)
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        aria-current={activeAccountId === account.id ? 'true' : undefined}
                      >
                        <AccountHead account={account} skinTextureSrc={accountSkinTextures[account.id]} sizeClass="h-9 w-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-100">{account.name}</p>
                          <p className="truncate text-[11px] font-bold text-slate-500">
                            {getAccountTypeLabel(account.type)} · {getAccountTypeDetail(account.type)}
                          </p>
                        </div>
                        {activeAccountId === account.id && <CheckCircle2 size={15} className="text-blue-300" />}
                      </button>
                      <button
                        onClick={() => removeAccount(account)}
                        data-testid="remove-account-button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-400/35 bg-red-500/12 text-red-300 shadow-sm shadow-red-950/20 transition-[background-color,border-color,color,box-shadow] duration-150 hover:border-red-300/65 hover:bg-red-500/25 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
                        data-tooltip={t('account.remove.tooltip')}
                        aria-label={t('account.remove.tooltip')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className={classNames(
                  'grid gap-2 border-t border-slate-800 p-2',
                  sidebarNarrow ? 'grid-cols-1' : 'grid-cols-2'
                )}>
                  <button
                    onClick={() => {
                      setShowAccountMenu(false)
                      handleLogin('microsoft')
                    }}
                    className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-md bg-blue-500 px-2 text-xs font-black text-white transition-colors duration-150 hover:bg-blue-400"
                  >
                    <MicrosoftMark className="h-4 w-4" />
                    <span className="min-w-0 truncate">{t('auth.microsoft.title')}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowAccountMenu(false)
                      openOfflineLogin()
                    }}
                    className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-slate-700 px-2 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                  >
                    <FileText size={15} />
                    <span className="min-w-0 truncate">{t('auth.offline.title')}</span>
                  </button>
                </div>
              </div>
            )}

            {activeAccount ? (
              <button
                onClick={() => setShowAccountMenu((value) => !value)}
                className={classNames(
                  'flex w-full min-w-0 items-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950/30 text-left transition-colors duration-150 hover:border-blue-400/30 hover:bg-slate-900/80',
                  sidebarNarrow ? 'gap-2 p-2' : 'gap-3 p-3'
                )}
                data-tooltip={t('account.switch')}
              >
                <AccountHead account={activeAccount} skinTextureSrc={accountSkinTextures[activeAccount.id]} sizeClass={sidebarCompact ? 'h-8 w-8' : 'h-10 w-10'} />
                <div className="min-w-0 flex-1">
                  <p className={classNames('truncate font-black', sidebarNarrow ? 'text-xs' : 'text-sm')}>
                    {activeAccount.name}
                  </p>
                  <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-blue-300">
                    {getAccountTypeLabel(activeAccount.type)}
                  </p>
                </div>
                {!sidebarCompact && <ChevronRight size={16} className={classNames('shrink-0 text-slate-500 transition-transform duration-150', showAccountMenu && '-rotate-90')} />}
              </button>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition-colors duration-150 hover:bg-blue-400"
              >
                <User size={17} />
                {t('auth.title')}
              </button>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="titlebar flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-[#0a1120]/90 px-5">
            <div className="flex items-center gap-3">
              <motion.div
                animate={gameRunning && !reduceMotion
                  ? { scale: [1, 1.28, 1], opacity: [1, 0.72, 1] }
                  : { scale: 1, opacity: 1 }}
                transition={gameRunning && !reduceMotion
                  ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.15 }}
                className={classNames(
                 'h-2.5 w-2.5 rounded-full',
                 gameRunning ? 'bg-blue-300 shadow-[0_0_16px_rgba(96,165,250,0.9)]' : 'bg-slate-600'
                )}
              />
              <p className="max-w-[560px] truncate text-xs font-black uppercase tracking-[0.18em] text-slate-400" data-tooltip={activityDetail || statusText}>
                {statusText}
              </p>
            </div>
            <div className="no-drag flex items-center gap-1">
              <div
                className="mr-2 flex h-8 items-center gap-2 rounded-md border border-blue-400/20 bg-blue-500/10 px-2.5 text-blue-100 shadow-sm shadow-blue-950/15"
                data-tooltip={t('topbar.playersTooltip')}
              >
                <Users size={14} className="text-blue-200" />
                <span className="font-mono text-xs font-black tabular-nums">{onlinePlayersText}</span>
                <span className="hidden text-[11px] font-black uppercase tracking-[0.12em] text-blue-200/65 xl:inline">{t('topbar.players')}</span>
              </div>
              <button
                type="button"
                onClick={openDiscordAccountSettings}
                className="mr-1 flex h-8 max-w-[190px] items-center gap-2 rounded-md border border-indigo-300/20 bg-indigo-500/10 px-2.5 text-indigo-100 shadow-sm shadow-indigo-950/15 transition-colors hover:border-indigo-300/45 hover:bg-indigo-500/18"
                data-tooltip={launcherDiscordAccount?.connected && launcherDiscordAccount.profile
                  ? launcherDiscordAccount.profile.displayName
                  : t('settings.discordAccount.login')}
                aria-label={launcherDiscordAccount?.connected && launcherDiscordAccount.profile
                  ? launcherDiscordAccount.profile.displayName
                  : t('settings.discordAccount.login')}
              >
                {launcherDiscordAccount?.connected && launcherDiscordAccount.profile ? (
                  <img
                    src={launcherDiscordAccount.profile.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 shrink-0 rounded-full bg-slate-900 object-cover ring-1 ring-indigo-200/30"
                  />
                ) : (
                  <DiscordLogo className="h-[15px] w-[15px] shrink-0 text-indigo-200" />
                )}
                <span className="hidden truncate text-[11px] font-black xl:inline">
                  {launcherDiscordAccount?.connected && launcherDiscordAccount.profile
                    ? launcherDiscordAccount.profile.displayName
                    : t('settings.discordAccount.login')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => window.electron.openExternal(NAMLAUNCHER_DISCORD_URL)}
                className="mr-1 flex h-8 shrink-0 items-center gap-2 rounded-md border border-indigo-300/20 bg-indigo-500/10 px-2.5 text-indigo-100 transition-colors hover:border-indigo-300/45 hover:bg-indigo-500/18"
                data-tooltip={t('topbar.discord')}
                aria-label={t('topbar.discord')}
              >
                <DiscordLogo className="h-[15px] w-[15px] shrink-0 text-indigo-200" />
                <span className="hidden text-[11px] font-black xl:inline">{t('topbar.discord')}</span>
              </button>
              <button onClick={() => window.electron.windowControl('minimize')} aria-label={t('window.minimize')} data-tooltip={t('window.minimize')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100">
                <Minus size={15} />
              </button>
              <button onClick={() => window.electron.windowControl('maximize')} aria-label={t('window.maximize')} data-tooltip={t('window.maximize')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100">
                <Square size={13} />
              </button>
              <button onClick={() => window.electron.windowControl('close')} aria-label={t('window.close')} data-tooltip={t('window.close')} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-300">
                <X size={15} />
              </button>
            </div>
          </header>

          <AnimatePresence mode="wait" initial={false}>
            {launcherUpdate?.updateAvailable && (
              <motion.div
                key={`launcher-update-${launcherUpdate.latestVersion}`}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="no-drag flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-sky-400/20 bg-sky-500/10 px-5 py-3 shadow-[inset_0_-1px_0_rgba(125,211,252,0.08)]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-black text-sky-100">{t('settings.update.available')}</p>
                  <p className="mt-0.5 text-xs font-semibold text-sky-200/70">
                    {t('settings.update.current')} {launcherUpdate.currentVersion} / {t('settings.update.latest')} {launcherUpdate.latestVersion}
                  </p>
                </div>
                <button
                  onClick={openLauncherUpdatePrompt}
                  disabled={launcherUpdateInstallState === 'installing'}
                  className="flex h-9 items-center gap-2 rounded-md bg-sky-500 px-3 text-xs font-black text-white transition-colors duration-150 hover:bg-sky-400 disabled:cursor-wait disabled:opacity-65"
                >
                  {launcherUpdateInstallState === 'installing' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  {t('settings.update.download')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <main ref={mainScrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait" initial={false}>
            {activeView === 'home' && <HomeView model={{
              AccountHead,
              AlertTriangle,
              CachedImage,
              CheckCircle2,
              ChevronRight,
              Clock3,
              Download,
              InstanceIcon,
              Loader2,
              MinecraftServerMotd,
              PARTNER_SERVERS,
              Package,
              Play,
              RefreshCw,
              Server,
              Square,
              User,
              Users,
              WifiOff,
              accountSkinTextures,
              activeAccount,
              classNames,
              formatPlaytime,
              formatRelativeDate,
              getHomeServerStatusKey,
              getProjectKey,
              handleLaunchOrStop,
              homeModpacks,
              homeModpacksError,
              homeModpacksLoading,
              homeServerStatusCacheRef,
              homeServerStatuses,
              homeServerStatusesRefreshing,
              isInstanceBusy,
              language,
              motion,
              normalizeHomeServerAddress,
              openInstanceDetail,
              openModpackInstaller,
              pageMotionProps,
              recentInstances,
              recentPlayablePlaces,
              resolveHomeModpackArtwork,
              runningElapsedByInstance,
              setActiveView,
              setHomeModpacksError,
              setHomeModpacksLoaded,
              setHomeModpacksRetry,
              setHomeServerStatusRefresh,
              setInstancePanelView,
              setLibraryPage,
              setLibrarySource,
              setLibraryType,
              setModQuery,
              setSelectedInstanceId,
              t,
              tf,
              welcomeName
            }} />}

            {activeView === 'instances' && <InstancesView model={{
              CachedImage,
              Clock3,
              Download,
              FileArchive,
              FileText,
              FolderOpen,
              HardDrive,
              ImageIcon,
              InstanceIcon,
              Loader2,
              LoaderIcon,
              MoreVertical,
              Package,
              Play,
              Plus,
              RefreshCw,
              Search,
              Server,
              Settings,
              Square,
              Suspense,
              SwitchControl,
              Trash2,
              Upload,
              WorldsServersPanel,
              X,
              ZoomIn,
              busyContentId,
              checkingUpdates,
              classNames,
              contentDropActive,
              contentImporting,
              contentLoading,
              contentTab,
              currentBusyThisTarget,
              currentContentCached,
              currentContentTab,
              currentRunningThisTarget,
              currentTarget,
              currentTargetLoaderUpdate,
              currentTargetLoaderUpdateLoading,
              currentUpdateAllBlocked,
              currentUpdateCount,
              currentUpdates,
              deleteContent,
              dismissCurrentTargetLoaderUpdate,
              exportInstanceMrpack,
              exportingInstanceId,
              filteredInstanceContent,
              formatBytes,
              formatDate,
              formatPlaytime,
              gameLogLines,
              gameLogLoading,
              gameLogPath,
              getContentDisplayName,
              handleContentDragLeave,
              handleContentDragOver,
              handleContentDrop,
              handleLaunchOrStop,
              instanceActionMenuOpen,
              instanceActionMenuRef,
              instanceContent,
              instanceContentQuery,
              instanceContentTabs,
              instanceHeadingRef,
              instancePanelView,
              language,
              launching,
              logEndRef,
              memoryGb,
              motion,
              openInstanceLogs,
              openInstanceModsLibrary,
              openInstalledModProjectDetails,
              openInstanceSettings,
              openScreenshotViewer,
              pageMotionProps,
              progress,
              refreshInstanceContent,
              refreshCurrentTargetLoaderUpdate,
              refreshUpdateSummaries,
              revealContentFile,
              runningElapsedByInstance,
              runningServers,
              setConfirmDialog,
              setContentTab,
              setInstanceActionMenuOpen,
              setInstanceContentQuery,
              setInstancePanelView,
              setShowInstanceModal,
              setStatusText,
              shouldBlockCurrentTargetContent,
              showingScreenshots,
              t,
              targetPlaytime,
              tf,
              toggleContent,
              updateAllContent,
              updateCurrentTargetLoaderNow,
              updateInstalledContent,
              updatingInstanceId,
              updatingInstanceLoader,
              updatingProjectIds
            }} />}

            {activeView === 'skins' && <SkinsView model={{
              Loader2,
              SkinPage,
              Suspense,
              accounts,
              activeAccountId,
              language,
              motion,
              pageMotionProps,
              setAccountSkinTextures,
              setLoginStep,
              setShowLoginModal,
              setStatusText,
              t
            }} />}

            {activeView === 'library' && <LibraryView model={{
              CachedImage,
              CheckCircle2,
              Download,
              ExternalLink,
              FileText,
              LIBRARY_LOADERS,
              LIBRARY_SEARCH_QUERY_MAX_LENGTH,
              LibraryPagination,
              LibrarySourceSelect,
              Loader2,
              Package,
              RefreshCw,
              RotateCcw,
              Search,
              Shirt,
              Wrench,
              activeLibraryFilterCount,
              classNames,
              contentStatuses,
              currentTarget,
              curseForgeConfigured,
              effectiveLibraryFilters,
              getLibraryButtonState,
              getProjectKey,
              goToLibraryPage,
              installLibraryProject,
              libraryCompatibilityAvailable,
              libraryError,
              libraryHeadingRef,
              libraryLoaderFilterAvailable,
              libraryLoading,
              libraryMinecraftVersionOptions,
              libraryPage,
              libraryPaginationLabels,
              libraryPaginationStatusText,
              libraryResultsText,
              librarySectionRef,
              librarySource,
              libraryType,
              libraryTypes,
              loadSkinPageModule,
              modQuery,
              mods,
              motion,
              openLibraryProjectDetails,
              pageMotionProps,
              resetLibraryFilters,
              resolvedLibraryFilters,
              selectLibrarySource,
              setLibraryPage,
              setLibraryType,
              setModQuery,
              setActiveView,
              t,
              tf,
              totalHits,
              updateLibraryFilters
            }} />}

            {activeView === 'settings' && <SettingsView model={{
              AnimatePresence,
              Cpu,
              DiscordLogo,
              Download,
              ExternalLink,
              FileText,
              FolderOpen,
              Languages,
              Loader2,
              LogOut,
              MessageCircle,
              Monitor,
              MonitorDown,
              Moon,
              NAMLAUNCHER_DISCORD_URL,
              PARTNER_SERVERS,
              Package,
              Palette,
              RefreshCw,
              Server,
              ShieldCheck,
              SwitchControl,
              Sun,
              checkForLauncherUpdateNow,
              checkingLauncherUpdate,
              chooseDataLocation,
              classNames,
              connectLauncherDiscord,
              currentLauncherChannel,
              currentLauncherVersion,
              dataLocation,
              dataLocationError,
              dataLocationStatus,
              discordAccountSectionRef,
              discordSettings,
              discordStateClass,
              discordStateLabel,
              discordStatus,
              focusDiscordAccountSection,
              gameRunning,
              handleMemoryChange,
              language,
              launcherDiscordAccount,
              launcherDiscordAccountBusy,
              launcherDiscordAccountError,
              launcherUpdate,
              launcherUpdateInstallState,
              launching,
              loadLauncherDataLocation,
              memoryGb,
              motion,
              movingDataLocation,
              openLauncherUpdatePrompt,
              openLegalReview,
              openPartnerServerWebsite,
              pageMotionProps,
              reduceMotion,
              requestDisconnectLauncherDiscord,
              setDiscordSettings,
              settingsCardVariants,
              t,
              tf,
              updateLauncherSettings
            }} />}
            </AnimatePresence>
          </main>
        </section>
      </div>

      <AnimatePresence mode="wait">
        {launcherUpdatePromptVisible && launcherUpdate && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/74 p-3 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-labelledby="launcher-update-title">
            <motion.section
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: 'easeOut' }}
              className="flex max-h-[calc(100vh-32px)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-blue-300/25 bg-[#0d1526] shadow-2xl shadow-black/45"
            >
              <header className="shrink-0 border-b border-slate-800 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-500/12 text-blue-100 shadow-[0_12px_28px_rgba(37,99,235,0.18)]">
                    <Download size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">{t('settings.update.prompt.eyebrow')}</p>
                    <h2 id="launcher-update-title" className="mt-1 text-xl font-black leading-tight text-white">
                      {t('settings.update.prompt.title')}
                    </h2>
                    <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-400">
                      {t('settings.update.prompt.body')}
                    </p>
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('settings.update.current')}</p>
                    <p className="mt-1 font-mono text-sm font-black text-slate-100">v{launcherUpdate.currentVersion}</p>
                  </div>
                  <div className="rounded-lg border border-blue-300/25 bg-blue-500/10 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">{t('settings.update.latest')}</p>
                    <p className="mt-1 font-mono text-sm font-black text-blue-100">v{launcherUpdate.latestVersion}</p>
                  </div>
                </div>

                {launcherUpdate.notes && launcherUpdate.notes.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                    <ul className="space-y-1.5 text-xs font-semibold leading-5 text-slate-400">
                      {launcherUpdate.notes.slice(0, 3).map((note, index) => (
                        <li key={`${launcherUpdate.latestVersion}-${index}`} className="flex gap-2">
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-blue-300" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {launcherUpdateStopped && (
                  <motion.div
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    aria-live="assertive"
                    className={classNames(
                      'flex items-start gap-3 rounded-lg border p-3',
                      launcherUpdateInstallState === 'blocked'
                        ? 'border-amber-300/35 bg-amber-400/10 text-amber-50'
                        : 'border-red-300/35 bg-red-400/10 text-red-50'
                    )}
                  >
                    <AlertTriangle size={19} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-balance text-sm font-black">
                        {launcherUpdateInstallState === 'blocked'
                          ? t('settings.update.prompt.blocked.title')
                          : t('settings.update.prompt.failed.title')}
                      </p>
                      <p className="mt-1 text-pretty text-xs font-semibold leading-5 opacity-85">
                        {launcherUpdateProgress?.detail || t('settings.update.prompt.failed.generic')}
                      </p>
                    </div>
                  </motion.div>
                )}

                <div className="rounded-lg border border-sky-300/18 bg-sky-500/[0.07] p-3">
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {launcherUpdateSteps.map((label, index) => {
                      const updateStopped = launcherUpdateInstallState === 'failed' || launcherUpdateInstallState === 'blocked'
                      const done = !updateStopped && index < launcherUpdateStepIndex
                      const active = !updateStopped && index === launcherUpdateStepIndex
                      return (
                        <div
                          key={label}
                          className={classNames(
                            'flex min-h-[34px] items-center gap-2 rounded-md border px-2.5 text-xs font-black transition-colors',
                            done
                              ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
                              : active
                                ? 'border-sky-300/35 bg-sky-400/12 text-sky-100'
                                : 'border-slate-800 bg-slate-950/20 text-slate-500'
                          )}
                        >
                          {done ? (
                            <CheckCircle2 size={14} className="shrink-0" />
                          ) : active && launcherUpdateInstallState === 'installing' ? (
                            <Loader2 size={14} className="shrink-0 animate-spin" />
                          ) : (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-current opacity-70" />
                          )}
                          <span className="min-w-0 truncate">{label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black text-sky-100">{launcherUpdateProgressLabel}</p>
                    {(launcherUpdateInstallState === 'installing' || launcherUpdateInstallState === 'opened') && (
                      <span className="font-mono text-xs font-black tabular-nums text-sky-200">{launcherUpdatePercent}%</span>
                    )}
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/65">
                    <div
                      className={classNames(
                        'h-full rounded-full bg-sky-400 transition-[width] duration-200',
                        launcherUpdateInstallState === 'installing' || launcherUpdateInstallState === 'opened' ? '' : 'opacity-55'
                      )}
                      style={{ width: `${launcherUpdateInstallState === 'installing' || launcherUpdateInstallState === 'opened' ? Math.max(launcherUpdatePercent, 4) : 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
                    {launcherUpdateInstallState === 'opened'
                        ? t('settings.update.prompt.readyNotice')
                      : t('settings.update.prompt.keepNotice')}
                  </p>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold leading-5 text-slate-400">
                    {t('settings.update.prompt.manualText')}
                  </p>
                  <button
                    type="button"
                    onClick={openLauncherUpdateDownload}
                    className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-blue-300/30 bg-blue-500/10 px-3 text-xs font-black text-blue-100 transition-colors duration-150 hover:border-blue-300/55 hover:bg-blue-500/18"
                  >
                    <ExternalLink size={14} />
                    {t('settings.update.prompt.manualLink')}
                  </button>
                </div>
              </div>

              <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-800 bg-[#0b1322] p-4 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={launcherUpdate.mandatory ? () => window.electron.windowControl('quit') : dismissLauncherUpdatePrompt}
                  disabled={launcherUpdateInstallState === 'installing'}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-slate-200 transition-[border-color,background-color,color,opacity] duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200 disabled:cursor-wait disabled:opacity-55"
                >
                  <X size={17} />
                  {t(launcherUpdate.mandatory ? 'update.auto.quit' : 'settings.update.prompt.notNow')}
                </button>
                <button
                  type="button"
                  onClick={installLauncherUpdateNow}
                  disabled={launcherUpdateInstallState === 'installing'}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition-[background-color,opacity,transform] duration-150 hover:bg-blue-400 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65"
                >
                  {launcherUpdateInstallState === 'installing'
                    ? <Loader2 size={17} className="animate-spin" />
                    : launcherUpdateInstallState === 'opened'
                      ? <ExternalLink size={17} />
                      : launcherUpdateStopped
                        ? <RefreshCw size={17} />
                      : <Download size={17} />}
                  {launcherUpdateInstallState === 'installing'
                    ? t('settings.update.prompt.installing')
                    : launcherUpdateInstallState === 'opened'
                      ? t('settings.update.prompt.openAgain')
                      : launcherUpdateInstallState === 'blocked' && launcherUpdateBlockReason === 'minecraft-active'
                        ? t('settings.update.prompt.retry.minecraft')
                        : launcherUpdateStopped
                          ? t('settings.update.prompt.retry')
                          : t('settings.update.prompt.install')}
                </button>
              </footer>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {(showFirstRunSetup || showLegalReview) && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/74 p-3 backdrop-blur-md"
            onMouseDown={(event) => {
              if (!showFirstRunSetup && event.target === event.currentTarget) setShowLegalReview(false)
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex max-h-[calc(100vh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0d1526] shadow-2xl shadow-black/45"
            >
              <div className="relative border-b border-slate-800 p-6">
                {!showFirstRunSetup && (
                  <button
                    type="button"
                    onClick={() => setShowLegalReview(false)}
                    aria-label={t('setup.close')}
                    className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-100"
                  >
                    <X size={17} />
                  </button>
                )}
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-400/30 bg-blue-500/15">
                    <img src="./namlauncher-icon.png" alt="" className="h-14 w-14 object-contain outline-0" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">
                      {showFirstRunSetup ? t('setup.eyebrow') : t('settings.legal.title')}
                    </p>
                    <h2 className="mt-2 pr-8 text-2xl font-black text-white">
                      {showFirstRunSetup ? t('setup.title') : (legalDocument?.title || t('settings.legal.title'))}
                    </h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                      {showFirstRunSetup ? t('setup.body') : t('settings.legal.subtitle')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {legalDocument ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                      <span>{t('setup.updated')} {formatDate(legalDocument.updatedAt)}</span>
                      <span aria-hidden="true">/</span>
                      <span>{legalDocument.source === 'remote' ? t('setup.source.remote') : t('setup.source.bundled')}</span>
                      <span className="rounded bg-blue-500/10 px-2 py-1 font-mono text-blue-200">v{legalDocument.version}</span>
                    </div>
                    <p className="mb-5 rounded-lg border border-blue-400/20 bg-blue-500/[0.07] p-4 text-sm font-semibold leading-6 text-slate-300">
                      {legalDocument.intro}
                    </p>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {([
                        { key: 'terms', title: t('setup.terms'), icon: ShieldCheck, sections: legalDocument.terms },
                        { key: 'privacy', title: t('setup.privacy'), icon: FileText, sections: legalDocument.privacy }
                      ] as const).map((group) => {
                        const GroupIcon = group.icon
                        return (
                          <section key={group.key} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/30">
                            <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
                              <GroupIcon size={17} className="text-blue-300" />
                              <h3 className="text-sm font-black text-white">{group.title}</h3>
                            </div>
                            <div className="divide-y divide-slate-800/80">
                              {group.sections.map((section, index) => (
                                <article key={`${group.key}-${index}`} className="p-4">
                                  <h4 className="text-xs font-black text-slate-100">{section.title}</h4>
                                  <p className="mt-2 whitespace-pre-line text-xs font-semibold leading-5 text-slate-400">{section.body}</p>
                                </article>
                              ))}
                            </div>
                          </section>
                        )
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {legalDocument.references.map((reference) => (
                        <button
                          key={reference.url}
                          type="button"
                          onClick={() => window.electron.openExternal(reference.url)}
                          className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/30 px-3 py-2 text-[11px] font-bold text-slate-400 transition-colors hover:border-blue-400/40 hover:text-blue-200"
                        >
                          <ExternalLink size={12} />
                          {reference.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-bold text-slate-400">
                    <Loader2 size={20} className="animate-spin text-blue-300" />
                    Loading legal document...
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 bg-[#0b1322] p-5">
                {showFirstRunSetup && (
                  <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3 transition-colors hover:border-blue-400/30">
                    <input
                      type="checkbox"
                      checked={legalAccepted}
                      onChange={(event) => setLegalAccepted(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
                    />
                    <span className="text-xs font-bold leading-5 text-slate-300">
                      {legalDocument?.acceptance || t('setup.accept')}
                    </span>
                  </label>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => window.electron.openExternal('https://namlauncher.nattapat2871.me/legal')}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-slate-200 transition-[border-color,background-color,color] duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                  >
                    <ExternalLink size={16} />
                    {t('setup.openLegal')}
                  </button>
                  {showFirstRunSetup ? (
                    <button
                      type="button"
                      disabled={!legalDocument || !legalAccepted}
                      onClick={acceptLegalTerms}
                      className="flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition-[background-color,opacity,transform] duration-150 hover:bg-blue-400 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                    >
                      <CheckCircle2 size={17} />
                      {t('setup.continue')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLegalReview(false)}
                      className="flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition-colors hover:bg-blue-400"
                    >
                      <X size={17} />
                      {t('setup.close')}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}


        {showLoginModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !microsoftLoginLoading) setShowLoginModal(false)
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="login-modal-title"
              className="max-h-[calc(100vh-24px)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0d1526] shadow-2xl shadow-black/40"
            >
              {loginStep === 'select' ? (
                <>
                  <div className="flex items-center justify-between border-b border-slate-800 p-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/12 text-blue-200">
                        <User size={19} />
                      </div>
                      <div className="min-w-0">
                        <h2 id="login-modal-title" className="text-xl font-black">{t('auth.title')}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{t('auth.subtitle')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowLoginModal(false)}
                      disabled={microsoftLoginLoading}
                      aria-label={t('setup.close')}
                      data-tooltip={t('setup.close')}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100"
                    >
                      <X size={17} />
                    </button>
                  </div>
                  {sessionExpiredNotice && (
                    <div className="mx-5 mt-5 rounded-lg border border-red-400/30 bg-red-500/10 p-4" role="alert">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-300/25 bg-red-500/10 text-red-100">
                          <AlertTriangle size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-red-50">{t('auth.sessionExpired.title')}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-red-100/75">
                            {tf('auth.sessionExpired.body', { account: sessionExpiredNotice.accountName })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    <button
                      onClick={() => handleLogin('microsoft')}
                      disabled={microsoftLoginLoading}
                      data-launcher-autofocus="true"
                      className="group min-h-[148px] rounded-lg border border-blue-400/25 bg-blue-500/12 p-4 text-left transition-[border-color,background-color,transform] duration-150 hover:border-blue-300/50 hover:bg-blue-500/18 active:scale-[0.99]"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500 text-white shadow-lg shadow-blue-950/25">
                        {microsoftLoginLoading ? <Loader2 size={18} className="animate-spin" /> : <MicrosoftMark className="h-5 w-5" />}
                      </div>
                      <h3 className="mt-4 text-base font-black text-white">{t('auth.microsoft.title')}</h3>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{t('auth.microsoft.body')}</p>
                    </button>
                    <button
                      onClick={openOfflineLogin}
                      className="group min-h-[148px] rounded-lg border border-slate-700 bg-slate-950/25 p-4 text-left transition-[border-color,background-color,transform] duration-150 hover:border-amber-300/35 hover:bg-amber-300/[0.06] active:scale-[0.99]"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-200">
                        <FileText size={18} />
                      </div>
                      <h3 className="mt-4 text-base font-black text-white">{t('auth.offline.title')}</h3>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{t('auth.offline.body')}</p>
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-5">
                  <button
                    onClick={() => {
                      setOfflineNameInputRejected(false)
                      setLoginStep('select')
                    }}
                    className="mb-5 flex h-9 items-center gap-2 rounded-md px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500 transition-colors duration-150 hover:text-blue-200"
                  >
                    <ArrowLeft size={15} />
                    {t('auth.back')}
                  </button>
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-200">
                      <FileText size={18} />
                    </div>
                    <div>
                      <h2 id="login-modal-title" className="text-xl font-black">{t('auth.offlineProfile.title')}</h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{t('auth.offlineProfile.subtitle')}</p>
                    </div>
                  </div>
                  <div className="mt-5 rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-200">
                        <ShieldCheck size={17} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-amber-100">{t('auth.warning.title')}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-amber-100/70">
                          {t('auth.warning.body')}
                        </p>
                      </div>
                    </div>
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-amber-300/15 bg-black/15 p-3 transition-[border-color,background-color] duration-150 hover:border-amber-300/30 hover:bg-black/20">
                      <input
                        type="checkbox"
                        checked={offlineWarningAccepted}
                        onChange={(event) => setOfflineWarningAccepted(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-amber-400"
                      />
                      <span className="text-xs font-black leading-5 text-amber-50">
                        {t('auth.warning.accept')}
                      </span>
                    </label>
                  </div>
                  <label
                    htmlFor="offline-username"
                    className="mt-5 block text-xs font-black uppercase tracking-[0.14em] text-slate-400"
                  >
                    {t('auth.offline.label')}
                  </label>
                  <input
                    id="offline-username"
                    type="text"
                    value={offlineName}
                    onChange={handleOfflineNameChange}
                    placeholder={t('auth.offline.placeholder')}
                    minLength={OFFLINE_USERNAME_MIN_LENGTH}
                    maxLength={OFFLINE_USERNAME_MAX_LENGTH}
                    pattern={OFFLINE_USERNAME_HTML_PATTERN}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-describedby="offline-username-requirements"
                    aria-invalid={offlineNameInputRejected}
                    data-launcher-autofocus="true"
                    className={classNames(
                      'mt-2 h-12 w-full rounded-lg border bg-slate-950/40 px-4 text-sm font-black outline-none transition-colors duration-150',
                      offlineNameInputRejected
                        ? 'border-red-400/65 focus:border-red-300'
                        : 'border-slate-700 focus:border-blue-400/60'
                    )}
                    autoFocus
                  />
                  <p
                    id="offline-username-requirements"
                    aria-live="polite"
                    aria-atomic="true"
                    className={classNames(
                      'mt-2 text-xs font-semibold leading-5',
                      offlineNameInputRejected ? 'text-red-300' : 'text-slate-500'
                    )}
                  >
                    {t(offlineNameInputRejected
                      ? 'auth.offline.invalidCharacters'
                      : 'auth.offline.requirements')}
                  </p>
                  <button
                    disabled={!isValidOfflineUsername(offlineName) || !offlineWarningAccepted}
                    onClick={confirmOfflineLogin}
                    className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-blue-500 text-sm font-black text-white transition-[background-color,opacity,transform] duration-150 hover:bg-blue-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {t('auth.createProfile')}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {microsoftLoginLoading && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/78 p-4 backdrop-blur-md" role="status" aria-live="polite">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="w-full max-w-sm rounded-xl border border-blue-300/25 bg-[#0d1526] p-6 text-center shadow-2xl shadow-black/45"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-blue-300/25 bg-blue-500/12">
                <Loader2 size={24} className="animate-spin text-blue-200" />
              </div>
              <h2 className="mt-5 text-lg font-black text-white">{t('auth.microsoft.loading')}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{t('auth.microsoft.loading.body')}</p>
            </motion.div>
          </div>
        )}

        {selectedScreenshot && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/88 p-4 backdrop-blur-md"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeScreenshotViewer()
            }}
            onWheel={(event) => {
              event.preventDefault()
              adjustScreenshotZoom(event.deltaY > 0 ? -0.1 : 0.1)
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              role="dialog"
              aria-modal="true"
              aria-label={selectedScreenshot.fileName}
              className="flex h-full max-h-[calc(100vh-32px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#07101f] shadow-2xl shadow-black/60"
            >
              <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/75 px-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-100" data-tooltip={selectedScreenshot.fileName}>
                    {selectedScreenshot.fileName}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    {formatBytes(selectedScreenshot.size)} · {formatDate(selectedScreenshot.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustScreenshotZoom(-0.2)}
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition-colors hover:border-blue-300/45 hover:bg-blue-500/10 hover:text-blue-100"
                    data-tooltip={t('screenshot.zoomOut')}
                    aria-label={t('screenshot.zoomOut')}
                  >
                    <ZoomOut size={15} />
                  </button>
                  <span className="w-14 text-center font-mono text-xs font-black tabular-nums text-slate-300">
                    {Math.round(screenshotZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustScreenshotZoom(0.2)}
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition-colors hover:border-blue-300/45 hover:bg-blue-500/10 hover:text-blue-100"
                    data-tooltip={t('screenshot.zoomIn')}
                    aria-label={t('screenshot.zoomIn')}
                  >
                    <ZoomIn size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={resetScreenshotZoom}
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition-colors hover:border-blue-300/45 hover:bg-blue-500/10 hover:text-blue-100"
                    data-tooltip={t('screenshot.resetZoom')}
                    aria-label={t('screenshot.resetZoom')}
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={closeScreenshotViewer}
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                    data-tooltip={t('setup.close')}
                    aria-label={t('setup.close')}
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
              <div
                className={classNames(
                  'flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/45 p-4 touch-none',
                  screenshotZoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                )}
                onPointerDown={startScreenshotPan}
                onPointerMove={moveScreenshotPan}
                onPointerUp={stopScreenshotPan}
                onPointerCancel={stopScreenshotPan}
              >
                {selectedScreenshot.iconUrl ? (
                  <img
                    src={selectedScreenshot.iconUrl}
                    alt=""
                    draggable={false}
                    className={classNames(
                      'max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl shadow-black/50',
                      screenshotDragging ? '' : 'transition-transform duration-100'
                    )}
                    style={{
                      transform: `translate3d(${screenshotPan.x}px, ${screenshotPan.y}px, 0) scale(${screenshotZoom})`,
                      transformOrigin: 'center center',
                      willChange: screenshotZoom > 1 ? 'transform' : undefined
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <ImageIcon size={32} />
                    <p className="text-sm font-bold">{t('screenshot.previewUnavailable')}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {confirmDialog && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) dismissConfirmDialog()
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              className="w-full max-w-md overflow-hidden rounded-lg border border-slate-700 bg-[#0d1526] shadow-2xl shadow-black/50"
            >
              <header className="flex items-start gap-4 border-b border-slate-800 p-5">
                <div className={classNames(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border',
                  confirmDialog.danger
                    ? 'border-red-400/30 bg-red-500/12 text-red-100'
                    : 'border-blue-400/30 bg-blue-500/12 text-blue-100'
                )}>
                  {confirmDialog.danger ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="confirm-dialog-title" className="text-lg font-black text-white">{confirmDialog.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{confirmDialog.body}</p>
                </div>
                <button
                  type="button"
                  onClick={dismissConfirmDialog}
                  disabled={confirmDialogBusy}
                  aria-label={confirmDialog.cancelLabel}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100 disabled:cursor-wait disabled:opacity-45"
                >
                  <X size={17} />
                </button>
              </header>
              {confirmDialogError && (
                <div className="mx-5 mt-4 flex items-start gap-2 rounded-md border border-red-400/25 bg-red-500/[0.08] px-3 py-2 text-xs font-semibold leading-5 text-red-100" role="alert">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-300" />
                  <span className="min-w-0 break-words">{confirmDialogError}</span>
                </div>
              )}
              <footer className="flex flex-col-reverse gap-2 p-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={dismissConfirmDialog}
                  disabled={confirmDialogBusy}
                  className="flex h-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-black text-slate-200 transition-colors duration-150 hover:border-slate-500 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-45"
                >
                  {confirmDialog.cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={confirmDialogConfirm}
                  disabled={confirmDialogBusy}
                  className={classNames(
                    'flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-black text-white transition-colors duration-150 disabled:cursor-wait disabled:opacity-60',
                    confirmDialog.danger
                      ? 'bg-red-500 hover:bg-red-400'
                      : 'bg-blue-500 hover:bg-blue-400'
                  )}
                >
                  {confirmDialogBusy && <Loader2 size={16} className="animate-spin" />}
                  {confirmDialog.confirmLabel}
                </button>
              </footer>
            </motion.div>
          </div>
        )}

        {libraryProjectDetails && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && installingProjectId !== getProjectKey(libraryProjectDetails)) {
                closeLibraryProjectDetails()
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-project-detail-title"
          >
            <motion.div
              ref={libraryProjectDialogRef}
              tabIndex={-1}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-700 bg-[#0d1526] shadow-2xl shadow-black/45 outline-none"
            >
              <header className="flex items-start gap-4 border-b border-slate-800 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-slate-600">
                  <CachedImage
                    src={libraryProjectDetails.icon_url}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={<Package size={20} aria-hidden="true" />}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">{t('library.detail.eyebrow')}</p>
                  <h2 id="library-project-detail-title" className="mt-1 truncate text-xl font-black text-white">
                    {libraryProjectDetails.title || libraryProjectDetails.name}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-500">{libraryProjectDetails.description}</p>
                </div>
                <button
                  type="button"
                  data-dialog-autofocus="true"
                  onClick={closeLibraryProjectDetails}
                  disabled={installingProjectId === getProjectKey(libraryProjectDetails)}
                  aria-label={t('library.detail.close')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </header>

              <div className="p-5">
                {libraryProjectVersionsLoading ? (
                  <div className="flex h-64 items-center justify-center gap-2 text-sm font-bold text-slate-400" role="status" aria-live="polite">
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    {t('library.detail.loading')}
                  </div>
                ) : libraryProjectVersionError ? (
                  <div className="flex h-64 flex-col items-center justify-center text-center" role="alert">
                    <AlertTriangle size={30} className="text-amber-300" aria-hidden="true" />
                    <p className="mt-3 text-sm font-black text-white">{t('library.detail.loadFailed')}</p>
                    <p className="mt-1 max-w-md text-xs font-semibold leading-5 text-slate-500">{libraryProjectVersionError}</p>
                  </div>
                ) : libraryProjectVersions.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_270px]">
                    <div className="max-h-[390px] overflow-y-auto rounded-lg border border-slate-800" aria-label={t('library.detail.versionList')}>
                      {libraryProjectVersions.map((version) => {
                        const selected = selectedLibraryVersionId === version.id
                        const installed = libraryProjectDetails.installedVersionId === version.id
                        return (
                          <button
                            key={version.id}
                            type="button"
                            onClick={() => setSelectedLibraryVersionId(version.id)}
                            aria-pressed={selected}
                            className={classNames(
                              'flex min-h-16 w-full items-center gap-3 border-b border-slate-800 px-4 py-3 text-left transition-colors last:border-b-0 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300/70',
                              selected ? 'bg-blue-500/12' : 'hover:bg-slate-800/45'
                            )}
                          >
                            <div className={classNames(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                              selected ? 'border-blue-400/40 bg-blue-500/20 text-blue-200' : 'border-slate-700 bg-slate-900 text-slate-500'
                            )}>
                              {selected ? <CheckCircle2 size={16} aria-hidden="true" /> : <Package size={16} aria-hidden="true" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-sm font-black text-slate-100">{version.name}</p>
                                {installed && (
                                  <span className="shrink-0 rounded border border-blue-300/40 bg-blue-400/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-blue-100">
                                    {t('library.button.alreadyInstalled')}
                                  </span>
                                )}
                                <span className={classNames(
                                  'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-black uppercase',
                                  version.version_type === 'beta'
                                    ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
                                    : version.version_type === 'alpha'
                                      ? 'border-rose-300/40 bg-rose-400/15 text-rose-200'
                                      : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                                )}>{version.version_type}</span>
                              </div>
                              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                {version.version_number} · Minecraft {version.game_versions.slice(0, 3).join(', ') || '-'}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    <aside className="rounded-lg border border-slate-800 bg-slate-950/25 p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{t('library.detail.selected')}</p>
                      <h3 className="mt-2 break-words text-lg font-black text-white">{selectedLibraryVersion?.version_number || '-'}</h3>
                      <dl className="mt-4 space-y-3 text-xs font-bold">
                        <div>
                          <dt className="uppercase tracking-[0.14em] text-slate-600">Minecraft</dt>
                          <dd className="mt-1 text-slate-200">{selectedLibraryVersion?.game_versions.join(', ') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="uppercase tracking-[0.14em] text-slate-600">Loader</dt>
                          <dd className="mt-1 flex flex-wrap gap-1.5 text-slate-200">
                            {(selectedLibraryVersion?.loaders || []).length > 0
                              ? selectedLibraryVersion?.loaders.map((loader) => (
                                  <span key={loader} className="inline-flex items-center gap-1 capitalize">
                                    <LoaderIcon loader={loader} className="h-5 w-5" /> {loader}
                                  </span>
                                ))
                              : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="uppercase tracking-[0.14em] text-slate-600">{t('library.detail.published')}</dt>
                          <dd className="mt-1 text-slate-200">{formatDate(selectedLibraryVersion?.date_published)}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        onClick={installSelectedLibraryVersion}
                        disabled={!selectedLibraryVersionId || Boolean(installingProjectId) || libraryProjectDetails.allow_distribution === false || selectedLibraryVersionId === libraryProjectDetails.installedVersionId}
                        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition-colors hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {installingProjectId === getProjectKey(libraryProjectDetails)
                          ? <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                          : <Download size={17} aria-hidden="true" />}
                        {selectedLibraryVersionId === libraryProjectDetails.installedVersionId
                          ? t('library.button.alreadyInstalled')
                          : t('library.detail.installSelected')}
                      </button>
                      <button
                        type="button"
                        onClick={() => window.electron.openExternal(
                          libraryProjectDetails.website_url || `https://modrinth.com/${libraryProjectDetails.project_type || libraryType}/${libraryProjectDetails.slug}`
                        )}
                        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 text-xs font-black text-slate-300 transition-colors hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                      >
                        <ExternalLink size={15} aria-hidden="true" />
                        {t('library.detail.openWebsite')}
                      </button>
                    </aside>
                  </div>
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center text-center">
                    <Package size={30} className="text-slate-700" aria-hidden="true" />
                    <p className="mt-3 text-sm font-black text-slate-300">{t('library.detail.empty')}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{t('library.detail.emptyHint')}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showModpackModal && modpackProject && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (installingCurrentModpack) {
                minimizeActiveModpackInstall()
                return
              }
              closeModpackInstaller()
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modpack-install-title"
          >
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-3xl overflow-hidden rounded-lg border border-slate-700 bg-[#0d1526] shadow-2xl shadow-black/40"
            >
              <div className="flex items-center gap-4 border-b border-slate-800 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-slate-600">
                  <CachedImage
                    src={modpackProject.icon_url}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={<Package size={20} />}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">{t('modpack.install.title')}</p>
                  <h2 id="modpack-install-title" className="mt-1 truncate text-xl font-black text-white">{modpackProject.title}</h2>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-500">{modpackProject.description}</p>
                </div>
                <button
                  onClick={() => {
                    if (installingCurrentModpack) {
                      minimizeActiveModpackInstall()
                      return
                    }
                    closeModpackInstaller()
                  }}
                  aria-label={installingCurrentModpack ? t('modpack.install.minimize') : t('modpack.install.close')}
                  data-tooltip={installingCurrentModpack ? t('modpack.install.minimizeTooltip') : t('modpack.install.closeTooltip')}
                  className={classNames(
                    'flex h-10 w-10 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70',
                    installingCurrentModpack
                      ? 'hover:bg-blue-500/15 hover:text-blue-100'
                      : 'hover:bg-red-500/15 hover:text-red-100'
                  )}
                >
                  {installingCurrentModpack ? <Minus size={17} /> : <X size={17} />}
                </button>
              </div>

              <div className="p-5">
                {installingCurrentModpack ? (
                  <div className="rounded-lg border border-blue-400/20 bg-blue-500/[0.06] p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-400/30 bg-blue-500/15 text-blue-200">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">{t('modpack.install.installing')}</p>
                        <h3 className="mt-1 truncate text-lg font-black text-white">{statusText}</h3>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500" data-tooltip={activityDetail || undefined}>
                          {activityDetail || selectedModpackVersion?.version_number || t('modpack.install.preparing')}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-black tabular-nums text-blue-200">{Math.min(Math.max(progress, 0), 100)}%</span>
                    </div>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-900">
                      <div
                        className="h-full rounded-full bg-blue-400 transition-[width] duration-200"
                        style={{ width: `${Math.min(Math.max(progress, 4), 100)}%` }}
                      />
                    </div>
                    <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/35 p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t('modpack.install.currentTask')}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-300">
                        {activityDetail || t('modpack.install.downloading')}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 border-t border-blue-400/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold leading-5 text-slate-500">{t('modpack.install.backgroundHint')}</p>
                      <button
                        type="button"
                        onClick={() => cancelActiveInstall()}
                        className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-rose-400/25 bg-rose-500/[0.08] px-3 text-xs font-black text-rose-100 transition-colors duration-150 hover:border-rose-300/45 hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                      >
                        <X size={15} aria-hidden="true" />
                        {t('modpack.install.cancel')}
                      </button>
                    </div>
                  </div>
                ) : modpackVersionsLoading ? (
                  <div className="flex h-56 items-center justify-center gap-2 text-sm font-bold text-slate-500">
                    <Loader2 size={17} className="animate-spin" />
                    {t('modpack.install.loadingVersions')}
                  </div>
                ) : modpackVersions.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-[1fr_260px]">
                    <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-800">
                      {modpackVersions.map((version) => {
                        const selected = selectedModpackVersionId === version.id
                        return (
                          <button
                            key={version.id}
                            onClick={() => setSelectedModpackVersionId(version.id)}
                            className={classNames(
                              'flex w-full items-center gap-3 border-b border-slate-800 px-4 py-3 text-left transition-colors duration-150 last:border-b-0',
                              selected ? 'bg-blue-500/12' : 'hover:bg-slate-800/45'
                            )}
                          >
                            <div className={classNames(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                              selected ? 'border-blue-400/40 bg-blue-500/20 text-blue-200' : 'border-slate-700 bg-slate-900 text-slate-500'
                            )}>
                              {selected ? <CheckCircle2 size={16} /> : <Package size={16} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-sm font-black text-slate-100">{version.name}</p>
                                <span className={classNames(
                                  'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-black uppercase',
                                  version.version_type === 'beta'
                                    ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
                                    : version.version_type === 'alpha'
                                      ? 'border-rose-300/40 bg-rose-400/15 text-rose-200'
                                      : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                                )}>
                                  {version.version_type}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                {version.version_number} / Minecraft {version.game_versions.slice(0, 3).join(', ')}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/25 p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{t('modpack.version.selected')}</p>
                      <h3 className="mt-2 text-lg font-black text-white">{selectedModpackVersion?.version_number || t('modpack.install.noVersion')}</h3>
                      <div className="mt-4 space-y-3 text-xs font-bold text-slate-500">
                        <div>
                          <p className="mb-1 uppercase tracking-[0.14em] text-slate-600">{t('modpack.version.minecraft')}</p>
                          <p className="text-slate-200">{selectedModpackVersion?.game_versions.join(', ') || '-'}</p>
                        </div>
                        <div>
                          <p className="mb-1 uppercase tracking-[0.14em] text-slate-600">{t('modpack.version.loaders')}</p>
                          <p className="capitalize text-slate-200">{selectedModpackVersion?.loaders.join(', ') || '-'}</p>
                        </div>
                        <div>
                          <p className="mb-1 uppercase tracking-[0.14em] text-slate-600">{t('modpack.version.published')}</p>
                          <p className="text-slate-200">{formatDate(selectedModpackVersion?.date_published)}</p>
                        </div>
                      </div>
                      <button
                        disabled={!selectedModpackVersionId || Boolean(installingProjectId) || Boolean(activeInstallTaskId)}
                        onClick={installSelectedModpack}
                        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition-colors duration-150 hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {installingProjectId === getProjectKey(modpackProject) ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                        {t('modpack.install.instance')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-56 flex-col items-center justify-center text-center">
                    <Package size={30} className="text-slate-700" />
                    <p className="mt-3 text-sm font-black text-slate-400">{t('modpack.version.empty.title')}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{t('modpack.version.empty.body')}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {manualDownloadItems.length > 0 && manualDownloadInstance && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (manualDownloadPendingCount === 0) closeManualDownloads()
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="manual-download-title"
              className="flex max-h-[calc(100vh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-[#101827] shadow-2xl shadow-black/50"
            >
              <header className={classNames(
                'flex items-start justify-between gap-4 border-b px-5 py-4',
                manualDownloadAllComplete ? 'border-emerald-400/35' : 'border-red-500/45'
              )}>
                <div className="min-w-0">
                  <p className={classNames(
                    'text-[11px] font-black uppercase tracking-[0.18em]',
                    manualDownloadAllComplete ? 'text-emerald-300' : 'text-red-300'
                  )}>
                    {manualDownloadAllComplete ? t('manualDownload.ready.eyebrow') : t('manualDownload.eyebrow')}
                  </p>
                  <h2 id="manual-download-title" className="mt-1 text-xl font-black text-white">
                    {manualDownloadAllComplete ? t('manualDownload.ready.title') : t('manualDownload.title')}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                    {manualDownloadAllComplete
                      ? tf('manualDownload.ready.body', { instance: manualDownloadInstance.name })
                      : tf('manualDownload.body', {
                        folder: manualDownloadDirectory || t('manualDownload.folderFallback'),
                        instance: manualDownloadInstance.name
                      })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeManualDownloads}
                  aria-label={t('manualDownload.close')}
                  data-tooltip={t('modpack.install.closeTooltip')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-100"
                >
                  <X size={17} />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {manualDownloadAllComplete && (
                  <div className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-emerald-200">
                        <CheckCircle2 size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-emerald-100">{t('manualDownload.ready.title')}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-emerald-100/75">
                          {tf('manualDownload.ready.body', { instance: manualDownloadInstance.name })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="hidden grid-cols-[minmax(220px,1.3fr)_minmax(180px,1fr)_150px_184px] gap-3 border-b border-slate-800 px-3 pb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 md:grid">
                  <span>{t('manualDownload.columns.mod')}</span>
                  <span>{t('manualDownload.columns.filename')}</span>
                  <span>{t('manualDownload.columns.status')}</span>
                  <span>{t('manualDownload.columns.actions')}</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {manualDownloadItems.map((item) => {
                    const status = manualDownloadStatuses[item.id] || 'pending'
                    const complete = status === 'complete'
                    return (
                      <div
                        key={item.id}
                        className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(220px,1.3fr)_minmax(180px,1fr)_150px_184px] md:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-500">
                            <CachedImage
                              src={item.iconUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              fallback={<Package size={18} />}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-100" data-tooltip={item.title}>{item.title}</p>
                            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                              {item.projectType === 'resourcepack'
                                ? t('manualDownload.type.resourcepack')
                                : item.projectType === 'shader'
                                  ? t('manualDownload.type.shader')
                                  : t('manualDownload.type.mod')}
                            </p>
                          </div>
                        </div>
                        <p className="min-w-0 truncate font-mono text-xs font-bold text-slate-300" data-tooltip={item.filename}>
                          {item.filename}
                        </p>
                        <div>
                          <span className={classNames(
                            'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-black',
                            complete
                              ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200'
                              : status === 'checking'
                                ? 'border-blue-400/25 bg-blue-500/12 text-blue-200'
                                : status === 'failed'
                                  ? 'border-red-400/25 bg-red-500/12 text-red-200'
                                  : 'border-slate-700 bg-slate-900 text-slate-400'
                          )}>
                            {complete
                              ? <CheckCircle2 size={14} />
                              : status === 'checking'
                                ? <Loader2 size={14} className="animate-spin" />
                                : status === 'failed'
                                  ? <AlertTriangle size={14} />
                                  : <Clock3 size={14} />}
                            {complete
                              ? t('manualDownload.status.complete')
                              : status === 'checking'
                                ? t('manualDownload.status.checking')
                                : status === 'failed'
                                  ? t('manualDownload.status.failed')
                                  : t('manualDownload.status.waiting')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {!complete && (
                            <>
                              <button
                                type="button"
                                onClick={() => openManualDownload(item)}
                                className="flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-black text-slate-100 transition-colors duration-150 hover:border-blue-400/45 hover:bg-blue-500/15 hover:text-blue-100"
                              >
                                <ExternalLink size={14} />
                                {t('manualDownload.action.open')}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyManualDownloadLink(item)}
                                className="flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-black text-slate-100 transition-colors duration-150 hover:border-blue-400/45 hover:bg-blue-500/15 hover:text-blue-100"
                              >
                                <ClipboardCopy size={14} />
                                {t('manualDownload.action.copy')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <footer className="flex flex-col gap-3 border-t border-slate-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 text-xs font-semibold text-slate-500">
                  <p>
                    {manualDownloadPendingCount > 0
                      ? tf('manualDownload.summary.remaining', {
                        done: manualDownloadCompleteCount,
                        total: manualDownloadItems.length,
                        remaining: manualDownloadPendingCount
                      })
                      : tf('manualDownload.summary.complete', {
                        done: manualDownloadCompleteCount,
                        total: manualDownloadItems.length
                      })}
                  </p>
                  {manualDownloadMessage && (
                    <p className="mt-1 truncate text-slate-300" data-tooltip={manualDownloadMessage}>{manualDownloadMessage}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.electron.openManualDownloadFolder().catch(() => undefined)}
                    className="flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-slate-500 hover:bg-slate-800"
                  >
                    <FolderOpen size={15} />
                    {t('manualDownload.action.folder')}
                  </button>
                  {manualDownloadAllComplete ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const instance = manualDownloadInstance
                          closeManualDownloads()
                          handleLaunchOrStop(instance).catch(() => undefined)
                        }}
                        className="flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-4 text-xs font-black text-white transition-colors duration-150 hover:bg-emerald-400"
                      >
                        <Play size={15} />
                        {t('manualDownload.ready.play')}
                      </button>
                      <button
                        type="button"
                        onClick={closeManualDownloads}
                        className="flex h-10 items-center rounded-md border border-slate-700 bg-slate-900 px-4 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-slate-500 hover:bg-slate-800"
                      >
                        {t('manualDownload.ready.close')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={openAllManualDownloads}
                        disabled={manualDownloadPendingCount === 0}
                        className="flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/45 hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <ExternalLink size={15} />
                        {t('manualDownload.action.openAll')}
                      </button>
                      <button
                        type="button"
                        onClick={closeManualDownloads}
                        className="flex h-10 items-center rounded-md border border-slate-700 bg-slate-900 px-4 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-slate-500 hover:bg-slate-800"
                      >
                        {t('manualDownload.action.skip')}
                      </button>
                      <button
                        type="button"
                        onClick={cancelManualDownloadsAndDeleteInstance}
                        className="flex h-10 items-center rounded-md border border-red-400/30 bg-red-500/10 px-4 text-xs font-black text-red-100 transition-colors duration-150 hover:bg-red-500/18"
                      >
                        {t('manualDownload.action.cancel')}
                      </button>
                    </>
                  )}
                </div>
              </footer>
            </motion.div>
          </div>
        )}

        {showInstanceSettings && instanceSettingsTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-3 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !savingInstanceSettings) setShowInstanceSettings(false)
            }}
          >
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="instance-settings-title"
              className="flex max-h-[calc(100vh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-blue-400/20 bg-[#0d1526] shadow-2xl shadow-black/55"
            >
              <header className="flex shrink-0 items-center justify-between gap-4 border-b border-blue-400/15 bg-slate-950/18 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <InstanceIcon instance={{ ...instanceSettingsTarget, iconUrl: instanceSettingsDraft.iconUrl || null }} size="sm" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-400">
                      <span className="truncate">{instanceSettingsTarget.name}</span>
                      <ChevronRight size={14} className="shrink-0" />
                      <span id="instance-settings-title" className="text-white">{t('instance.settings.title')}</span>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {instanceSettingsDraft.loader} / Minecraft {instanceSettingsDraft.version}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingInstanceSettings}
                  onClick={() => setShowInstanceSettings(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800/80 text-slate-300 transition-colors hover:bg-red-500/15 hover:text-red-100 disabled:cursor-wait disabled:opacity-60"
                  data-tooltip={t('window.close')}
                  aria-label={t('window.close')}
                >
                  <X size={18} />
                </button>
              </header>

              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[220px_1fr]">
                <aside className="border-b border-blue-400/10 bg-slate-950/10 p-4 md:border-b-0 md:border-r md:border-blue-400/10">
                  {([
                    { id: 'general' as InstanceSettingsTab, label: t('instance.settings.general'), icon: Info },
                    { id: 'installation' as InstanceSettingsTab, label: t('instance.settings.installation'), icon: Wrench }
                  ]).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setInstanceSettingsTab(tab.id)}
                      className={classNames(
                        'mb-2 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-black transition-colors',
                        instanceSettingsTab === tab.id
                          ? 'border border-blue-400/25 bg-blue-500/18 text-blue-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                      )}
                    >
                      <tab.icon size={16} />
                      {tab.label}
                    </button>
                  ))}
                </aside>

                <section className="min-h-0 overflow-y-auto p-6">
                  {instanceSettingsTab === 'general' ? (
                    <div className="grid gap-6 lg:grid-cols-[1fr_160px]">
                      <div className="space-y-6">
                        <label className="block">
                          <span className="mb-2 block text-sm font-black text-white">{t('instance.name')}</span>
                          <input
                            value={instanceSettingsDraft.name}
                            onChange={(event) => setInstanceSettingsDraft((prev) => ({ ...prev, name: event.target.value }))}
                            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/45 px-3 text-sm font-black text-white outline-none transition-colors focus:border-blue-400/70"
                          />
                        </label>

                        <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-sm font-semibold leading-6 text-amber-100/85">
                          {t('instance.settings.warning')}
                        </p>

                        <div>
                          <h3 className="text-base font-black text-white">{t('instance.delete.title')}</h3>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{t('instance.settings.deleteHelp')}</p>
                          <button
                            type="button"
                            disabled={deletingInstanceId === instanceSettingsTarget.id || isInstanceBusy(instanceSettingsTarget.id) || checkingUpdates}
                            onClick={() => {
                              setShowInstanceSettings(false)
                              deleteInstance(instanceSettingsTarget)
                            }}
                            className="mt-4 flex h-10 items-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-black text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingInstanceId === instanceSettingsTarget.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            {t('instance.delete.confirm')}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-500">
                          {instanceSettingsDraft.iconUrl ? (
                            <CachedImage
                              src={instanceSettingsDraft.iconUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              fallback={<Package size={34} />}
                            />
                          ) : (
                            <Package size={34} />
                          )}
                        </div>
                        <input
                          id="instance-settings-icon-file"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            handleInstanceSettingsIconUpload(event.target.files?.[0])
                            event.currentTarget.value = ''
                          }}
                        />
                        <label
                          htmlFor="instance-settings-icon-file"
                          className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-600 px-3 text-xs font-black text-slate-200 transition-colors hover:border-blue-400/60 hover:bg-blue-500/10 hover:text-blue-100"
                        >
                          <Upload size={14} />
                          {t('instance.settings.editIcon')}
                        </label>
                        {instanceSettingsDraft.iconUrl && (
                          <button
                            type="button"
                            onClick={() => setInstanceSettingsDraft((prev) => ({ ...prev, iconUrl: '' }))}
                            className="text-xs font-black text-slate-500 transition-colors hover:text-red-200"
                          >
                            {t('instance.icon.remove')}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-3xl space-y-6">
                      {!instanceSettingsEditingInstallation ? (
                        <>
                          <AnimatePresence initial={false}>
                            {instanceSettingsLoaderUpdate && (
                              <motion.div
                                key={`${instanceSettingsTarget.id}-${instanceSettingsLoaderUpdate.latestVersion}`}
                                data-testid="instance-loader-update-card"
                                initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.985 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.985 }}
                                transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
                                className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500/15 via-blue-500/10 to-violet-500/10 p-4 shadow-lg shadow-blue-950/20"
                              >
                                <Sparkles size={54} aria-hidden="true" className="pointer-events-none absolute -right-2 -top-2 rotate-12 text-sky-300/10" />
                                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                                  <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-slate-950/35 shadow-inner shadow-white/5">
                                      <LoaderIcon loader={instanceSettingsTarget.loader} className="h-8 w-8" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-sm font-black text-white">{t('instance.settings.loaderUpdate.title')}</h3>
                                        <span
                                          data-tone={getLoaderReleaseTone(instanceSettingsLoaderUpdate.releaseType)}
                                          title={instanceSettingsLoaderUpdate.releaseType}
                                          className={classNames(
                                            'rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]',
                                            getLoaderReleaseTone(instanceSettingsLoaderUpdate.releaseType) === 'stable'
                                              ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
                                              : getLoaderReleaseTone(instanceSettingsLoaderUpdate.releaseType) === 'unstable'
                                                ? 'border-amber-300/45 bg-amber-400/15 text-amber-200'
                                                : 'border-sky-300/35 bg-sky-400/12 text-sky-200'
                                          )}
                                        >
                                          {t(`instance.settings.loaderUpdate.channel.${getLoaderReleaseTone(instanceSettingsLoaderUpdate.releaseType)}`)}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                                        {tf('instance.settings.loaderUpdate.body', {
                                          loader: instanceSettingsTarget.loader === 'neoforge' ? 'NeoForge' : instanceSettingsTarget.loader,
                                          current: instanceSettingsLoaderUpdate.currentVersion,
                                          latest: instanceSettingsLoaderUpdate.latestVersion
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={updateInstanceLoaderNow}
                                    disabled={updatingInstanceLoader || checkingUpdates || isInstanceBusy(instanceSettingsTarget.id)}
                                    className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-black text-white shadow-lg shadow-sky-950/20 transition-colors hover:bg-sky-400 disabled:cursor-wait disabled:opacity-60"
                                  >
                                    {updatingInstanceLoader ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                    {updatingInstanceLoader
                                      ? t('instance.settings.loaderUpdate.updating')
                                      : t('instance.settings.loaderUpdate.action')}
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <div>
                            <h3 className="text-base font-black text-white">{t('instance.settings.installationTitle')}</h3>
                            <div className="mt-4 rounded-2xl border border-blue-400/10 bg-slate-950/45 p-4 text-sm font-bold">
                              <div className="flex items-center justify-between gap-4 py-1">
                                <span className="text-slate-500">{t('instance.settings.platform')}</span>
                                <span className="flex items-center gap-2 capitalize text-white">
                                  <LoaderIcon loader={instanceSettingsDraft.loader} className="h-6 w-6" />
                                  {instanceSettingsDraft.loader === 'neoforge' ? 'NeoForge' : instanceSettingsDraft.loader}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 py-1">
                                <span className="text-slate-500">{t('instance.settings.gameVersion')}</span>
                                <span className="font-mono text-white">{instanceSettingsDraft.version}</span>
                              </div>
                              {instanceSettingsDraft.loader !== 'vanilla' && (
                                <div className="flex items-center justify-between gap-4 py-1">
                                  <span className="text-slate-500">{tf('instance.settings.loaderVersion', { loader: instanceSettingsDraft.loader })}</span>
                                  <span className="max-w-[340px] truncate font-mono text-white">{instanceSettingsDraft.loaderVersion || '-'}</span>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={checkingUpdates}
                              onClick={() => {
                                setInstanceSettingsEditingInstallation(true)
                                void ensureMinecraftVersionList()
                              }}
                              className="mt-3 flex h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-black text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Wrench size={16} />
                              {t('instance.settings.editInstallation')}
                            </button>
                          </div>

                          <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-sm font-semibold leading-6 text-amber-100/85">
                            {t('instance.settings.warning')}
                          </p>

                          <div>
                            <h3 className="text-base font-black text-white">{t('instance.settings.repairTitle')}</h3>
                            <button
                              type="button"
                              disabled
                              className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/65 px-4 text-sm font-black text-slate-400"
                            >
                              <Wrench size={16} />
                              {t('instance.settings.repair')}
                            </button>
                            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                              {t('instance.settings.repairHelp')}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-2xl border border-blue-400/15 bg-slate-950/20 p-4">
                            <h3 className="text-base font-black text-white">{t('instance.settings.editInstallation')}</h3>
                            <div className="mt-4 space-y-4">
                              <div>
                                <span className="mb-2 block text-sm font-black text-white">{t('instance.settings.platform')}</span>
                                <div className="flex flex-wrap gap-2">
                                  {(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'] as LoaderType[]).map((loader) => (
                                    <button
                                      key={loader}
                                      type="button"
                                      onClick={() => setInstanceSettingsDraft((prev) => ({
                                        ...prev,
                                        loader,
                                        loaderVersion: loader === 'vanilla' ? '' : prev.loader === loader ? prev.loaderVersion : ''
                                      }))}
                                      className={classNames(
                                        'flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black capitalize transition-colors',
                                        instanceSettingsDraft.loader === loader
                                          ? 'border-blue-300/70 bg-blue-500/18 text-blue-100'
                                          : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-blue-400/35 hover:bg-blue-500/10 hover:text-slate-100'
                                      )}
                                    >
                                      <LoaderIcon loader={loader} className="h-6 w-6" />
                                      {loader === 'neoforge' ? 'NeoForge' : loader}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="block">
                                <InstanceSelect
                                  label={t('instance.settings.gameVersion')}
                                  value={instanceSettingsDraft.version}
                                  options={instanceSettingsGameVersionOptions.map((version) => ({
                                    value: version,
                                    label: version,
                                    detail: 'Minecraft Java Edition'
                                  }))}
                                  onOpen={() => void ensureMinecraftVersionList()}
                                  onChange={(version) => setInstanceSettingsDraft((prev) => ({
                                    ...prev,
                                    version,
                                    loaderVersion: ''
                                  }))}
                                  renderIcon={() => <Package size={18} className="text-emerald-300" />}
                                  testId="instance-settings-game-version-select"
                                />
                                <p className="mt-2 text-xs font-semibold text-slate-500">
                                  {minecraftVersionsLoading
                                    ? t('instance.settings.loadingVersions')
                                    : tf('instance.settings.versionCount', { count: instanceSettingsGameVersionOptions.length })}
                                </p>
                              </div>

                              {instanceSettingsDraft.loader !== 'vanilla' && (
                                <div className="block">
                                  <InstanceSelect
                                    label={tf('instance.settings.loaderVersion', { loader: instanceSettingsDraft.loader })}
                                    value={instanceSettingsDraft.loaderVersion}
                                    options={instanceSettingsLoaderVersionOptions.map((loaderId) => {
                                      const loader = instanceSettingsLoaderVersions.find((item) => item.id === loaderId)
                                      return {
                                        value: loaderId,
                                        label: loaderId,
                                        detail: loader?.type || 'installed'
                                      }
                                    })}
                                    onChange={(loaderVersion) => setInstanceSettingsDraft((prev) => ({ ...prev, loaderVersion }))}
                                    renderIcon={() => <LoaderIcon loader={instanceSettingsDraft.loader} className="h-6 w-6" />}
                                    disabled={instanceSettingsLoaderVersionsLoading || instanceSettingsLoaderVersionOptions.length === 0}
                                    testId="instance-settings-loader-version-select"
                                  />
                                  <p className="mt-2 text-xs font-semibold text-slate-500">
                                    {instanceSettingsLoaderVersionsLoading
                                      ? t('instance.settings.loaderVersionsLoading')
                                      : tf('instance.settings.versionCount', { count: instanceSettingsLoaderVersionOptions.length })}
                                  </p>
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={savingInstanceSettings || checkingUpdates}
                                  onClick={saveInstanceSettings}
                                  className="flex h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-black text-white transition-colors hover:bg-blue-400 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {savingInstanceSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                  {savingInstanceSettings ? t('instance.settings.saving') : t('instance.settings.save')}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingInstanceSettings}
                                  onClick={() => {
                                    resetInstanceSettingsDraft(instanceSettingsTarget)
                                    setInstanceSettingsEditingInstallation(false)
                                  }}
                                  className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-black text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                                >
                                  <X size={16} />
                                  {t('instance.settings.editCancel')}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-base font-black text-white">{t('instance.settings.repairTitle')}</h3>
                            <button
                              type="button"
                              disabled
                              className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/65 px-4 text-sm font-black text-slate-400"
                            >
                              <Wrench size={16} />
                              {t('instance.settings.repair')}
                            </button>
                            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                              {t('instance.settings.repairHelp')}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>
              </div>

              {instanceSettingsTab === 'general' && (
                <footer className="flex shrink-0 justify-end gap-2 border-t border-blue-400/10 px-5 py-4">
                  <button
                    type="button"
                    disabled={savingInstanceSettings || checkingUpdates}
                    onClick={() => setShowInstanceSettings(false)}
                    className="h-10 rounded-lg border border-slate-600 px-4 text-sm font-black text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {t('instance.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={savingInstanceSettings || checkingUpdates}
                    onClick={saveInstanceSettings}
                    className="flex h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-black text-white transition-colors hover:bg-blue-400 disabled:cursor-wait disabled:opacity-60"
                  >
                    {savingInstanceSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {savingInstanceSettings ? t('instance.settings.saving') : t('instance.settings.save')}
                  </button>
                </footer>
              )}
            </motion.div>
          </div>
        )}

        {showInstanceModal && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (!importingMrpack) setShowInstanceModal(false)
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="max-h-[calc(100vh-24px)] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0d1526] shadow-2xl shadow-black/40"
            >
              <div className="flex items-center justify-between border-b border-slate-800 p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/12 text-blue-200">
                    <Plus size={19} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-black">{t('instance.create.title')}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{t('instance.create.subtitle')}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (importingMrpack) {
                      cancelActiveInstall()
                      return
                    }
                    setShowInstanceModal(false)
                  }}
                  aria-label={importingMrpack ? t('mrpack.progress.cancel') : t('instance.creator.close')}
                  data-tooltip={importingMrpack ? t('mrpack.progress.cancelTooltip') : t('window.close')}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-red-500/15 hover:text-red-100"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="p-5">
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-400/20 bg-blue-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/15 text-blue-200">
                    <FileArchive size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-blue-100">{t('instance.import.title')}</p>
                    <p className="mt-1 text-xs font-semibold text-blue-100/60">
                      {t('instance.import.body')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={importingMrpack}
                  onClick={importLocalMrpack}
                  className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-blue-500 px-3 text-xs font-black text-white transition-colors duration-150 hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingMrpack ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {importingMrpack ? t('instance.import.importing') : t('instance.import.choose')}
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-950/25 p-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-blue-300">
                    {newInstance.iconUrl ? (
                      <CachedImage
                        src={newInstance.iconUrl}
                        alt=""
                        className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
                        fallback={<Package size={22} />}
                      />
                    ) : (
                      <Package size={22} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-100">{t('instance.icon.title')}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{t('instance.icon.subtitle')}</p>
                  </div>
                  <input
                    id="instance-icon-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      handleInstanceIconUpload(event.target.files?.[0])
                      event.currentTarget.value = ''
                    }}
                  />
                  <label
                    htmlFor="instance-icon-file"
                    className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                  >
                    <Upload size={15} />
                    {t('instance.icon.choose')}
                  </label>
                  {newInstance.iconUrl && (
                    <button
                      type="button"
                      onClick={() => setNewInstance((prev) => ({ ...prev, iconUrl: '' }))}
                      className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition-colors duration-150 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
                      data-tooltip={t('instance.icon.remove')}
                      aria-label={t('instance.icon.remove')}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                <label className="block space-y-2">
                  <span className="block text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t('instance.name')}</span>
                  <input
                    value={newInstance.name}
                    onChange={(event) => setNewInstance({ ...newInstance, name: event.target.value })}
                    data-launcher-autofocus="true"
                    className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/40 px-3 text-sm font-black outline-none transition-colors duration-150 focus:border-blue-400/60"
                  />
                </label>
                <InstanceSelect
                  label={t('instance.loader')}
                  value={newInstance.loader}
                  options={[
                    { value: 'vanilla', label: 'Vanilla' },
                    { value: 'fabric', label: 'Fabric' },
                    { value: 'forge', label: 'Forge' },
                    { value: 'quilt', label: 'Quilt' },
                    { value: 'neoforge', label: 'NeoForge' }
                  ]}
                  onChange={(loader) => setNewInstance({ ...newInstance, loader: loader as LoaderType })}
                  renderIcon={(loader) => <LoaderIcon loader={loader} className="h-6 w-6" />}
                  testId="create-instance-loader-select"
                />
                <div className="space-y-2">
                  <InstanceSelect
                    label={t('instance.minecraft')}
                    value={newInstance.version}
                    options={newInstanceGameVersionOptions.map((version) => ({ value: version, label: version }))}
                    onOpen={() => void ensureMinecraftVersionList()}
                    onChange={(version) => setNewInstance({ ...newInstance, version })}
                    renderIcon={() => <Package size={18} className="text-emerald-300" />}
                    testId="create-instance-version-select"
                  />
                  {minecraftVersionsLoading && (
                    <p className="text-[11px] font-bold text-blue-200">{t('instance.settings.loadingVersions')}</p>
                  )}
                </div>
                {newInstance.loader !== 'vanilla' && (
                  <InstanceSelect
                    label={`${newInstance.loader} ${t('instance.loaderBuild')}`}
                    value={newInstance.loaderVersion}
                    options={loaderVersions.map((loader) => ({
                      value: loader.id,
                      label: loader.id,
                      detail: loader.type
                    }))}
                    onChange={(loaderVersion) => setNewInstance({ ...newInstance, loaderVersion })}
                    renderIcon={() => <LoaderIcon loader={newInstance.loader} className="h-6 w-6" />}
                    testId="create-instance-loader-build-select"
                  />
                )}
              </div>

              <aside className="rounded-lg border border-slate-800 bg-slate-950/25 p-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-blue-300">
                  {newInstance.iconUrl ? (
                    <CachedImage
                      src={newInstance.iconUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      fallback={<Package size={24} />}
                    />
                  ) : (
                    <Package size={24} />
                  )}
                </div>
                <p className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">{t('instance.summary.title')}</p>
                <h3 className="mt-2 truncate text-lg font-black text-white">{newInstance.name || 'New Instance'}</h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{t('instance.summary.body')}</p>
                <div className="mt-5 space-y-3 text-xs font-bold">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">{t('instance.minecraft')}</span>
                    <span className="font-mono tabular-nums text-slate-200">{newInstance.version || latestVersion || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">{t('instance.loader')}</span>
                    <span className="capitalize text-slate-200">{newInstance.loader}</span>
                  </div>
                  {newInstance.loader !== 'vanilla' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">{t('instance.loaderBuild')}</span>
                      <span className="max-w-[150px] truncate font-mono text-slate-200">{newInstance.loaderVersion || '-'}</span>
                    </div>
                  )}
                </div>
                <div className="mt-5 rounded-md border border-blue-400/15 bg-blue-500/[0.06] p-3 text-xs font-semibold leading-5 text-blue-100/70">
                  {t('instance.summary.runtime')}
                </div>
              </aside>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button disabled={importingMrpack} onClick={() => setShowInstanceModal(false)} className="h-11 rounded-lg border border-slate-700 px-4 text-sm font-black text-slate-300 transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {t('instance.cancel')}
                </button>
                <button disabled={importingMrpack} onClick={createInstance} className="h-11 rounded-lg bg-blue-500 px-4 text-sm font-black text-white transition-colors duration-150 hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {t('instance.create.button')}
                </button>
              </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
