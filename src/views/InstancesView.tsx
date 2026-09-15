// Author/creator: nattapat2871 (https://nattapat2871.me)
import type { MinecraftServerPlace } from '../components/WorldsServersPanel'
import { ProviderIcon } from '../components/ProviderIcon'

const getLoaderReleaseTone = (releaseType?: string) => {
  const normalized = String(releaseType || '').trim().toLowerCase()
  if (normalized === 'stable' || normalized === 'recommended') return 'stable'
  if (normalized === 'unstable' || normalized === 'beta' || normalized === 'snapshot') return 'unstable'
  return 'latest'
}

export function InstancesView({ model }: { model: any }) {
  const {
    CachedImage,
    AlertTriangle,
    CheckCircle2,
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
    contentImportProgress,
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
    refreshCurrentTargetLoaderUpdate,
    refreshInstanceContent,
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
  } = model
  const contentImportPercent = contentImportProgress
    ? Math.min(100, Math.max(0, Math.round((contentImportProgress.completed / Math.max(1, contentImportProgress.total)) * 100)))
    : 0
  const contentImportComplete = contentImportProgress?.phase === 'complete'
  const contentImportFailed = contentImportProgress?.phase === 'error'

  const loaderUpdateTone = getLoaderReleaseTone(currentTargetLoaderUpdate?.releaseType)
  const visibleUpdateCount = currentUpdateCount + (currentTargetLoaderUpdate ? 1 : 0)

  return (
              <motion.div key="instances" {...pageMotionProps} className="h-full min-h-[680px]">
                {currentTarget ? (
                  <section aria-labelledby="instance-detail-title" className="min-w-0 rounded-lg border border-slate-800 bg-[#0d1526]">
                  <div className="border-b border-slate-800 p-5">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <InstanceIcon instance={currentTarget} running={currentRunningThisTarget} size="lg" />
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">{t('home.selectedInstance')}</p>
                          <h2
                            ref={instanceHeadingRef}
                            id="instance-detail-title"
                            tabIndex={-1}
                            className="mt-2 truncate rounded-sm text-3xl font-black tracking-tight text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0d1526]"
                          >
                            {currentTarget.name}
                          </h2>
                          <p className="mt-2 flex items-center gap-2 text-sm font-semibold capitalize text-slate-400">
                            <LoaderIcon loader={currentTarget.loader} className="h-5 w-5 shrink-0" />
                            {currentTarget.loader} / Minecraft {currentTarget.version}{currentTarget.loaderVersion ? ` / ${currentTarget.loaderVersion}` : ''}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {runningServers[currentTarget.id] && (
                              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-[11px] font-black text-emerald-100">
                                <Server size={13} aria-hidden="true" />
                                {tf('instance.server.playing', { server: runningServers[currentTarget.id].label })}
                              </span>
                            )}
                            {visibleUpdateCount > 0 ? (
                              <span className="rounded bg-sky-500/15 px-2 py-1 text-[11px] font-black uppercase text-sky-200">
                                {tf('home.updatesAvailable', { count: visibleUpdateCount })}
                              </span>
                            ) : (
                              <span className="rounded bg-slate-800 px-2 py-1 text-[11px] font-black uppercase text-slate-400">
                                {checkingUpdates || currentTargetLoaderUpdateLoading ? t('home.checkingUpdates') : t('home.upToDate')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto xl:justify-end">
                        <button
                          type="button"
                          onClick={() => handleLaunchOrStop(currentTarget)}
                          className={classNames(
                            'flex h-12 min-w-[150px] flex-1 items-center justify-center gap-2 rounded-lg px-5 text-sm font-black text-white shadow-lg transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none',
                            currentBusyThisTarget ? 'bg-red-500 shadow-red-950/30 hover:bg-red-400' : 'bg-blue-500 shadow-blue-950/30 hover:bg-blue-400'
                          )}
                        >
                          {currentBusyThisTarget ? <Square size={17} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                          {currentBusyThisTarget ? t('play.stop') : t('play.play')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openInstanceModsLibrary(currentTarget.id)}
                          aria-label={tf('instance.mods.addFor', { name: currentTarget.name })}
                          className="flex h-12 min-w-[132px] flex-1 items-center justify-center gap-2 rounded-lg border border-blue-400/35 bg-blue-500/10 px-4 text-sm font-black text-blue-100 transition-colors duration-150 hover:border-blue-300/55 hover:bg-blue-500/20 sm:flex-none"
                        >
                          <Plus size={18} aria-hidden="true" />
                          {t('instance.mods.add')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openInstanceSettings(currentTarget)}
                          className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-800/80 text-slate-300 transition-colors duration-150 hover:border-blue-300/45 hover:bg-blue-500/12 hover:text-blue-100"
                          data-tooltip={t('instance.settings.open')}
                          aria-label={t('instance.settings.open')}
                        >
                          <Settings size={19} />
                        </button>
                        <div ref={instanceActionMenuRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setInstanceActionMenuOpen((value: boolean) => !value)}
                            className="flex h-12 w-12 items-center justify-center rounded-full text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100"
                            data-tooltip={t('instance.actions.menu')}
                            aria-label={t('instance.actions.menu')}
                          >
                            <MoreVertical size={21} />
                          </button>
                          {instanceActionMenuOpen && (
                            <div className="absolute right-0 top-14 z-40 w-56 overflow-hidden rounded-lg border border-slate-700 bg-[#111827] p-1 shadow-2xl shadow-black/45">
                              <button
                                type="button"
                                disabled={exportingInstanceId === currentTarget.id || currentBusyThisTarget}
                                onClick={() => {
                                  setInstanceActionMenuOpen(false)
                                  exportInstanceMrpack(currentTarget)
                                }}
                                className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-black text-slate-300 transition-colors hover:bg-slate-800 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {exportingInstanceId === currentTarget.id ? <Loader2 size={16} className="animate-spin" /> : <FileArchive size={16} />}
                                {t('instance.export.button')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {(launching || progress > 0) && (
                      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-blue-400 transition-[width] duration-200" style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 border-b border-slate-800">
                    <div className="border-r border-slate-800 p-4">
                      <div className="mb-2 flex items-center gap-2 text-slate-500">
                        <Clock3 size={16} />
                        <span className="text-[11px] font-black uppercase tracking-[0.16em]">{t('instance.metric.playtime')}</span>
                      </div>
                      <p className="font-mono text-2xl font-black text-white">{formatPlaytime(targetPlaytime + (currentRunningThisTarget ? (runningElapsedByInstance[currentTarget.id] || 0) : 0))}</p>
                    </div>
                    <div className="border-r border-slate-800 p-4">
                      <div className="mb-2 flex items-center gap-2 text-slate-500">
                        <HardDrive size={16} />
                        <span className="text-[11px] font-black uppercase tracking-[0.16em]">{t('instance.metric.memory')}</span>
                      </div>
                      <p className="font-mono text-2xl font-black text-white">{memoryGb}G</p>
                    </div>
                    <div className="p-4">
                      <div className="mb-2 flex items-center gap-2 text-slate-500">
                        <LoaderIcon loader={currentTarget.loader} className="h-5 w-5" />
                        <span className="text-[11px] font-black uppercase tracking-[0.16em]">{t('instance.metric.loader')}</span>
                      </div>
                      <p className="truncate text-sm font-bold capitalize text-white">{currentTarget.loader === 'neoforge' ? 'NeoForge' : currentTarget.loader}</p>
                    </div>
                  </div>

                  <div className="p-5">
                    {instancePanelView === 'content' && currentTargetLoaderUpdate && (
                      <motion.div
                        key={`${currentTarget.id}-${currentTarget.loader}-${currentTarget.version}-${currentTargetLoaderUpdate.latestVersion}`}
                        data-testid="instance-content-loader-update-card"
                        initial={{ opacity: 0, y: -8, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="relative mb-5 overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-r from-sky-500/16 via-blue-500/10 to-violet-500/10 p-4 shadow-lg shadow-blue-950/20"
                      >
                        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-slate-950/35 shadow-inner shadow-white/5">
                              <LoaderIcon loader={currentTarget.loader} className="h-8 w-8" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-black text-white">{t('instance.settings.loaderUpdate.title')}</h3>
                                <span
                                  data-tone={loaderUpdateTone}
                                  title={currentTargetLoaderUpdate.releaseType}
                                  className={classNames(
                                    'rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]',
                                    loaderUpdateTone === 'stable'
                                      ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
                                      : loaderUpdateTone === 'unstable'
                                        ? 'border-amber-300/45 bg-amber-400/15 text-amber-200'
                                        : 'border-sky-300/35 bg-sky-400/12 text-sky-200'
                                  )}
                                >
                                  {t(`instance.settings.loaderUpdate.channel.${loaderUpdateTone}`)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                                {tf('instance.settings.loaderUpdate.body', {
                                  loader: currentTarget.loader === 'neoforge' ? 'NeoForge' : currentTarget.loader,
                                  current: currentTargetLoaderUpdate.currentVersion,
                                  latest: currentTargetLoaderUpdate.latestVersion
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                            <button
                              type="button"
                              onClick={updateCurrentTargetLoaderNow}
                              disabled={updatingInstanceLoader || checkingUpdates || currentBusyThisTarget || updatingInstanceId === currentTarget.id}
                              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-black text-white shadow-lg shadow-sky-950/20 transition-colors hover:bg-sky-400 disabled:cursor-wait disabled:opacity-60"
                            >
                              {updatingInstanceLoader ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                              {updatingInstanceLoader
                                ? t('instance.settings.loaderUpdate.updating')
                                : t('instance.settings.loaderUpdate.action')}
                            </button>
                            <button
                              type="button"
                              onClick={dismissCurrentTargetLoaderUpdate}
                              disabled={updatingInstanceLoader}
                              className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-600/80 bg-slate-950/25 px-3 text-xs font-black text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              <X size={15} aria-hidden="true" />
                              {t('instance.settings.loaderUpdate.dismiss')}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black">
                          {instancePanelView === 'logs'
                            ? t('instance.logs.title')
                            : instancePanelView === 'places'
                              ? t('instance.places.title')
                              : t('instance.content.title')}
                        </h3>
                        <p className="text-xs font-semibold text-slate-500">
                          {instancePanelView === 'logs'
                            ? currentRunningThisTarget
                              ? t('instance.logs.live')
                              : gameLogPath
                                ? 'latest.log'
                                : t('instance.logs.empty')
                            : instancePanelView === 'places'
                              ? t('instance.places.description')
                              : tf('instance.content.count', { count: instanceContent.length, folder: currentContentTab.folder })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {instancePanelView === 'content' && currentUpdateCount > 0 && (
                          <button
                            disabled={updatingInstanceId === currentTarget.id || currentUpdateAllBlocked}
                            onClick={() => updateAllContent(currentTarget)}
                            className="flex h-10 items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 text-xs font-black text-emerald-100 transition-colors duration-150 hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                            data-tooltip={currentUpdateAllBlocked ? t('content.update.busy') : t('home.updateAllTooltip')}
                          >
                            {updatingInstanceId === currentTarget.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                            {t('home.updateAll')}
                          </button>
                        )}
                        {instancePanelView === 'content' && (
                          <button
                            disabled={checkingUpdates || currentTargetLoaderUpdateLoading}
                            onClick={() => {
                              refreshCurrentTargetLoaderUpdate()
                              refreshUpdateSummaries([currentTarget])
                                .then(() => refreshInstanceContent(contentTab, currentTarget, { force: true }))
                                .catch(() => undefined)
                            }}
                            className="flex h-10 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-200 disabled:cursor-wait disabled:opacity-60"
                          >
                            {checkingUpdates || currentTargetLoaderUpdateLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                            {t('instance.updates.refresh')}
                          </button>
                        )}
                        <button
                          onClick={() => window.electron.openInstanceFolder(currentTarget)}
                          className="flex h-10 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                        >
                          <FolderOpen size={15} />
                          {t('instance.folder.button')}
                        </button>
                        <div className="flex flex-wrap rounded-lg border border-slate-700 bg-slate-950/30 p-1" role="tablist" aria-label={t('instance.panel.tabs')}>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={instancePanelView === 'content'}
                            onClick={() => setInstancePanelView('content')}
                            className={classNames(
                              'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-black transition-colors',
                              instancePanelView === 'content' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-100'
                            )}
                          >
                            <Package size={14} />
                            {t('instance.content.button')}
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={instancePanelView === 'places'}
                            onClick={() => setInstancePanelView('places')}
                            className={classNames(
                              'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-black transition-colors',
                              instancePanelView === 'places' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-100'
                            )}
                          >
                            <Server size={14} />
                            {t('instance.places.button')}
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={instancePanelView === 'logs'}
                            onClick={() => openInstanceLogs(currentTarget)}
                            className={classNames(
                              'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-black transition-colors',
                              instancePanelView === 'logs' ? 'bg-blue-500 text-white' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-100'
                            )}
                          >
                            <FileText size={14} />
                            {t('instance.logs.button')}
                          </button>
                        </div>
                      </div>
                    </div>

                    {instancePanelView === 'logs' ? (
                      <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#050914] shadow-inner shadow-black/20">
                        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/45 px-4">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={classNames(
                              'h-2.5 w-2.5 shrink-0 rounded-full',
                              currentRunningThisTarget ? 'bg-blue-300 shadow-[0_0_12px_rgba(96,165,250,0.85)]' : 'bg-slate-600'
                            )} />
                            <p className="truncate font-mono text-[11px] font-semibold text-slate-500" data-tooltip={gameLogPath}>
                              {gameLogPath || 'latest.log'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-[11px] font-black uppercase text-slate-500">
                            {gameLogLoading ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                {t('instance.logs.loading')}
                              </>
                            ) : (
                              <span className="font-mono tabular-nums">{tf('instance.logs.lines', { count: gameLogLines.length })}</span>
                            )}
                          </div>
                        </div>
                        <div className="nam-selectable h-[460px] cursor-text overflow-y-auto bg-black/35 p-4 font-mono text-[11px] leading-5 text-slate-300">
                          {gameLogLoading ? (
                            <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-slate-500">
                              <Loader2 size={17} className="animate-spin" />
                              {t('instance.logs.loadingFile')}
                            </div>
                          ) : gameLogLines.length > 0 ? (
                            gameLogLines.map((line: string, index: number) => {
                              const lower = line.toLowerCase()
                              const tone = lower.includes('error') || lower.includes('exception') || lower.includes('failed')
                                ? 'text-red-300'
                                : lower.includes('warn')
                                  ? 'text-amber-300'
                                  : lower.includes('[debug]')
                                    ? 'text-slate-500'
                                    : 'text-slate-300'

                              return (
                                <div key={`${index}-${line.slice(0, 24)}`} className={classNames('whitespace-pre-wrap break-words', tone)}>
                                  {line}
                                </div>
                              )
                            })
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-600">
                              {t('instance.logs.none')}
                            </div>
                          )}
                          <div ref={logEndRef} />
                        </div>
                      </div>
                    ) : instancePanelView === 'places' ? (
                      <Suspense
                        fallback={(
                          <div className="flex min-h-64 items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950/20 text-sm font-bold text-slate-500">
                            <Loader2 size={18} className="animate-spin" />
                            {t('places.loading')}
                          </div>
                        )}
                      >
                        <WorldsServersPanel
                          key={currentTarget.id}
                          instance={currentTarget}
                          api={window.electron}
                          language={language}
                          busy={currentBusyThisTarget}
                          t={t}
                          tf={tf}
                          onStatus={setStatusText}
                          onPlay={(quickPlay: any, label: string) => handleLaunchOrStop(currentTarget, quickPlay, label)}
                          confirmRemoval={(server: MinecraftServerPlace, onConfirm: () => Promise<void>) => {
                            setConfirmDialog({
                              title: t('places.remove.title'),
                              body: tf('places.remove.body', { name: server.name, address: server.address }),
                              confirmLabel: t('places.remove.confirm'),
                              cancelLabel: t('places.remove.cancel'),
                              danger: true,
                              onConfirm
                            })
                          }}
                        />
                      </Suspense>
                    ) : (
                      <div
                        onDragOver={handleContentDragOver}
                        onDragLeave={handleContentDragLeave}
                        onDrop={handleContentDrop}
                        className={classNames(
                          'relative rounded-lg border border-transparent p-0 transition-colors duration-150',
                          contentDropActive ? 'border-blue-300/45 bg-blue-500/[0.05]' : ''
                        )}
                      >
                    {contentDropActive && (
                      <div className="pointer-events-none absolute inset-0 z-40 flex min-h-72 flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-300/70 bg-[#09101f]/95 px-6 text-center shadow-2xl shadow-blue-950/50 backdrop-blur-md" role="status" aria-live="polite">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/35">
                          <Upload size={26} />
                        </div>
                        <p className="mt-4 text-base font-black text-blue-100">{t('content.drop.overlayTitle')}</p>
                        <p className="mt-1 max-w-md text-xs font-semibold leading-5 text-slate-400">
                          {tf('content.drop.overlayBody', { folder: currentContentTab.folder })}
                        </p>
                      </div>
                    )}
                    <div className="mb-4 flex rounded-lg border border-slate-800 bg-slate-950/30 p-1">
                      {instanceContentTabs.map((tab: any) => (
                        <button
                          key={tab.id}
                          onClick={() => setContentTab(tab.id)}
                          className={classNames(
                            'h-10 flex-1 rounded-md px-3 text-xs font-black transition-colors duration-150',
                            contentTab === tab.id
                              ? 'bg-blue-500 text-white shadow-lg shadow-blue-950/30'
                              : 'text-slate-500 hover:bg-slate-800/80 hover:text-slate-100'
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 transition-colors focus-within:border-blue-400/60 focus-within:bg-slate-950">
                        <Search size={16} className="shrink-0 text-slate-500" />
                        <input
                          type="text"
                          value={instanceContentQuery}
                          onChange={(event) => setInstanceContentQuery(event.target.value)}
                          placeholder={tf('content.search.placeholder', { label: currentContentTab.label.toLowerCase() })}
                          aria-label={tf('content.search.placeholder', { label: currentContentTab.label.toLowerCase() })}
                          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-100 outline-none placeholder:text-slate-600"
                        />
                        {instanceContentQuery && (
                          <button
                            type="button"
                            onClick={() => setInstanceContentQuery('')}
                            aria-label={t('content.search.clear')}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-100"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </label>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500">
                        {instanceContentQuery.trim()
                          ? tf('content.files.filtered', { filtered: filteredInstanceContent.length, total: instanceContent.length })
                          : tf('content.files.total', { count: instanceContent.length })}
                      </span>
                    </div>

                    <div className={classNames(
                      'mb-4 rounded-lg border px-4 py-3 transition-colors duration-200',
                      contentImportComplete
                        ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100'
                        : contentImportFailed
                          ? 'border-red-400/45 bg-red-500/10 text-red-100'
                          : contentDropActive || contentImporting
                            ? 'border-blue-300/45 bg-blue-500/10 text-blue-100'
                            : 'border-slate-800 bg-slate-950/25 text-slate-500'
                    )}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-950/45">
                            {contentImportComplete
                              ? <CheckCircle2 size={17} className="text-emerald-300" />
                              : contentImportFailed
                                ? <AlertTriangle size={17} className="text-red-300" />
                                : contentImporting
                                  ? <Loader2 size={16} className="animate-spin" />
                                  : <Upload size={16} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-200">
                              {contentImportComplete
                                ? t('content.import.complete')
                                : contentImportFailed
                                  ? t('content.import.failed')
                                  : contentImportProgress?.phase === 'scanning'
                                    ? t('content.import.scanning')
                                    : contentImporting
                                      ? t('content.importing')
                                      : tf('content.drop.title', { label: currentContentTab.label.toLowerCase() })}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {contentImportComplete && contentImportProgress
                                ? tf('content.import.done', {
                                    count: contentImportProgress.imported,
                                    skipped: contentImportProgress.skipped + contentImportProgress.rejected
                                  })
                                : contentImportFailed
                                  ? t('status.droppedImportFailed')
                                  : contentImportProgress?.phase === 'scanning'
                                    ? t('content.import.scanningDetail')
                                    : tf('content.drop.body', { folder: currentContentTab.folder })}
                            </p>
                          </div>
                        </div>
                        <span className="hidden shrink-0 font-mono text-[11px] font-black uppercase text-slate-500 sm:block">
                          {currentContentTab.folder}
                        </span>
                      </div>
                      {contentImportProgress && (
                        <div className="mt-3">
                          <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-black tabular-nums">
                            <span>{tf('content.import.progress', {
                              completed: contentImportProgress.completed,
                              total: contentImportProgress.total
                            })}</span>
                            <span>{contentImportPercent}%</span>
                          </div>
                          <div
                            className="h-2 overflow-hidden rounded-full bg-slate-950/70 ring-1 ring-white/10"
                            role="progressbar"
                            aria-label={t('content.import.progressLabel')}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={contentImportPercent}
                          >
                            <div
                              className={classNames(
                                'h-full rounded-full transition-[width,background-color] duration-300 ease-out',
                                contentImportComplete
                                  ? 'bg-emerald-400'
                                  : contentImportFailed
                                    ? 'bg-red-400'
                                    : 'bg-blue-400'
                              )}
                              style={{ width: `${contentImportPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="overflow-hidden rounded-lg border border-slate-800">
                      {contentLoading ? (
                        <div className="flex h-48 items-center justify-center gap-2 text-sm font-bold text-slate-500">
                          <Loader2 size={17} className="animate-spin" />
                          {currentContentCached ? t('content.loading.refreshing') : t('content.loading')}
                        </div>
                      ) : filteredInstanceContent.length > 0 && showingScreenshots ? (
                        <div className="grid gap-3 bg-slate-950/20 p-3 sm:grid-cols-2 xl:grid-cols-3">
                          {filteredInstanceContent.map((item: any) => {
                            const busy = busyContentId === item.id
                            return (
                              <div key={item.id} className="group overflow-hidden rounded-lg border border-slate-800 bg-slate-950/35 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-300/35 hover:shadow-xl hover:shadow-blue-950/20">
                                <button
                                  type="button"
                                  onClick={() => openScreenshotViewer(item)}
                                  className="relative block aspect-video w-full overflow-hidden bg-slate-900 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                                  aria-label={tf('screenshot.open', { name: item.fileName })}
                                >
                                  {item.iconUrl ? (
                                    <CachedImage
                                      src={item.iconUrl}
                                      alt=""
                                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.045]"
                                      fallback={<div className="flex h-full w-full items-center justify-center text-slate-600"><ImageIcon size={24} /></div>}
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-slate-600">
                                      <ImageIcon size={24} />
                                    </div>
                                  )}
                                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-10 text-[11px] font-black text-white/85 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                    <span>{t('screenshot.view')}</span>
                                    <ZoomIn size={14} />
                                  </span>
                                </button>
                                <div className="p-3">
                                  <p className="truncate text-sm font-black text-slate-100" data-tooltip={item.fileName}>
                                    {item.fileName}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                                    <span className="font-mono tabular-nums">{formatBytes(item.size)}</span>
                                    <span>{formatDate(item.updatedAt)}</span>
                                  </div>
                                  <div className="mt-3 flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => revealContentFile(item)}
                                      className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                                      data-tooltip={t('content.showFolder')}
                                      aria-label={t('content.showFolder')}
                                    >
                                      <FolderOpen size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => deleteContent(item)}
                                      className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition-colors duration-150 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-50"
                                      data-tooltip={t('content.delete.tooltip')}
                                      aria-label={t('content.delete.tooltip')}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : filteredInstanceContent.length > 0 ? (
                        <div className="divide-y divide-slate-800">
                          {filteredInstanceContent.map((item: any) => {
                            const busy = busyContentId === item.id
                            const contentBlocked = shouldBlockCurrentTargetContent(item.kind)
                            const update = item.projectId
                              ? currentUpdates.find((candidate: any) => candidate.projectId === item.projectId)
                              : null
                            const updatingThis = Boolean(update && updatingProjectIds.includes(update.projectId))
                            return (
                              <div key={item.id} className="flex items-center gap-4 bg-slate-950/20 px-4 py-3 transition-colors duration-150 hover:bg-blue-500/[0.04]">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-blue-300">
                                  {item.iconUrl ? (
                                    <CachedImage
                                      src={item.iconUrl}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      fallback={<ImageIcon size={18} />}
                                    />
                                  ) : (
                                    <ImageIcon size={18} />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <p className="truncate text-sm font-black text-slate-100" data-tooltip={getContentDisplayName(item)}>
                                      {getContentDisplayName(item)}
                                    </p>
                                    <span className={classNames(
                                      'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase',
                                      item.source === 'modrinth'
                                        ? 'bg-blue-500/15 text-blue-200'
                                        : item.source === 'curseforge'
                                          ? 'bg-orange-500/15 text-orange-200'
                                          : 'bg-slate-700/70 text-slate-300'
                                    )}>
                                      {item.source === 'modrinth' || item.source === 'curseforge'
                                        ? <ProviderIcon provider={item.source} size={11} />
                                        : <HardDrive size={11} aria-hidden="true" className="text-slate-400" />}
                                      {item.source === 'modrinth' ? 'Modrinth' : item.source === 'curseforge' ? 'CurseForge' : t('content.source.local')}
                                    </span>
                                    {!item.enabled && (
                                      <span className="shrink-0 rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-300">
                                        {t('content.disabled')}
                                      </span>
                                    )}
                                    {update && (
                                      <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-sky-200">
                                        {t('content.update')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                                    <span className="max-w-full truncate">{item.fileName}</span>
                                    <span className="font-mono tabular-nums">{formatBytes(item.size)}</span>
                                    {item.versionNumber && <span className="font-mono text-blue-300">{item.versionNumber}</span>}
                                    {update && (
                                      <span className="font-mono text-sky-300">
                                        {update.installedVersion} -&gt; {update.latestVersion}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {item.kind === 'mods' && item.projectId && (item.source === 'modrinth' || item.source === 'curseforge') && (
                                    <button
                                      type="button"
                                      disabled={busy || contentBlocked || Boolean(updatingInstanceId === currentTarget.id)}
                                      onClick={(event) => void openInstalledModProjectDetails(item, event.currentTarget)}
                                      data-testid="installed-mod-version-button"
                                      className="flex h-10 items-center gap-2 rounded-md border border-blue-400/35 bg-blue-500/10 px-3 text-xs font-black text-blue-100 transition-colors duration-150 hover:border-blue-300/60 hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                                      data-tooltip={contentBlocked ? t('content.update.busy') : t('content.versionPicker.tooltip')}
                                    >
                                      <FileText size={15} aria-hidden="true" />
                                      {t('content.versionPicker.button')}
                                    </button>
                                  )}
                                  {update && (
                                    <button
                                      type="button"
                                      disabled={busy || updatingThis || contentBlocked || (updatingInstanceId === currentTarget.id && !updatingThis)}
                                      onClick={() => updateInstalledContent(currentTarget, update)}
                                      className="flex h-10 items-center gap-2 rounded-md bg-sky-500 px-3 text-xs font-black text-white transition-colors duration-150 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                                      data-tooltip={contentBlocked ? t('content.update.busy') : t('content.update.tooltip')}
                                    >
                                      {updatingThis ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                                      {t('content.update')}
                                    </button>
                                  )}
                                  <SwitchControl
                                    checked={item.enabled}
                                    onChange={() => toggleContent(item)}
                                    disabled={contentBlocked}
                                    busy={busy}
                                    title={contentBlocked ? t('content.toggle.busy') : item.enabled ? t('content.disable') : t('content.enable')}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => revealContentFile(item)}
                                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                                    data-tooltip={t('content.showFolder')}
                                    aria-label={t('content.showFolder')}
                                  >
                                    <FolderOpen size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy || contentBlocked}
                                    onClick={() => deleteContent(item)}
                                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-400 transition-colors duration-150 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-50"
                                    data-tooltip={contentBlocked ? t('content.delete.busy') : t('content.delete.tooltip')}
                                    aria-label={contentBlocked ? t('content.delete.busy') : t('content.delete.tooltip')}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : instanceContent.length > 0 && instanceContentQuery.trim() ? (
                        <div className="flex h-48 flex-col items-center justify-center px-4 text-center">
                          <Search size={30} className="text-slate-700" />
                          <p className="mt-3 text-sm font-black text-slate-400">{tf('content.empty.filtered.title', { label: currentContentTab.label.toLowerCase() })}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-600">{t('content.empty.filtered.body')}</p>
                        </div>
                      ) : (
                        <div className="flex h-48 flex-col items-center justify-center text-center">
                          <FileArchive size={30} className="text-slate-700" />
                          <p className="mt-3 text-sm font-black text-slate-400">{tf('content.empty.title', { label: currentContentTab.label.toLowerCase() })}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-600">
                            {tf('content.empty.body', { folder: currentContentTab.folder })}
                          </p>
                        </div>
                      )}
                    </div>
                      </div>
                    )}
                  </div>
                  </section>
                ) : (
                  <section className="flex min-h-[520px] min-w-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-[#0d1526] px-6 py-12 text-center">
                    <Package size={42} className="text-slate-700" />
                    <h2 className="mt-4 text-2xl font-black tracking-tight text-white">{t('instance.empty.selected.title')}</h2>
                    <p className="mt-2 max-w-md text-sm font-semibold text-slate-500">
                      {t('instance.empty.selected.body')}
                    </p>
                    <button
                      onClick={() => setShowInstanceModal(true)}
                      className="mt-5 flex h-11 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition-colors duration-150 hover:bg-blue-400"
                    >
                      <Plus size={16} />
                      {t('instance.empty.selected.button')}
                    </button>
                  </section>
                )}
              </motion.div>
            )
}
