// Author/creator: nattapat2871 (https://nattapat2871.me)
import type { LibraryEnvironment, LibrarySearchFilters, LibrarySort } from '../../shared/librarySearchFilters'
import { InstanceSelect } from '../components/InstanceSelect'
import LoaderIcon from '../components/LoaderIcon'
import { ProviderIcon } from '../components/ProviderIcon'

export function LibraryView({ model }: { model: any }) {
  const {
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
  } = model

  return (
              <motion.section
                ref={librarySectionRef}
                key="library"
                {...pageMotionProps}
                aria-labelledby="library-page-title"
                aria-busy={libraryLoading}
                className="rounded-lg border border-slate-800 bg-[#0d1526]"
              >
                <div className="border-b border-slate-800 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2
                        ref={libraryHeadingRef}
                        id="library-page-title"
                        tabIndex={-1}
                        className="rounded-sm text-2xl font-black tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0d1526]"
                      >
                        {t('library.title')}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{t('library.subtitle')}</p>
                      {currentTarget && libraryType !== 'modpack' && (
                        <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[11px] font-black text-blue-200">
                          <Package size={13} aria-hidden="true" className="shrink-0" />
                          <span className="whitespace-normal break-words">{tf('library.targetInstance', { name: currentTarget.name })}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-end gap-2">
                      <LibrarySourceSelect value={librarySource} label={t('library.source')} onChange={selectLibrarySource} />
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <div className="flex rounded-lg border border-slate-800 bg-slate-950/30 p-1" role="group" aria-label={t('library.categories')}>
                      {libraryTypes.map((type: any) => {
                        const TypeIcon = type.Icon
                        return (
                          <button
                            key={type.id}
                            type="button"
                            aria-pressed={libraryType === type.id}
                            onClick={() => {
                              setLibraryType(type.id)
                              setLibraryPage(0)
                            }}
                            className={classNames(
                              'flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-black transition-colors duration-150',
                              libraryType === type.id ? 'bg-blue-500 text-white' : 'text-slate-500 hover:text-slate-100'
                            )}
                          >
                            <TypeIcon size={14} aria-hidden="true" className="shrink-0" />
                            {type.label}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          void loadSkinPageModule()
                          setActiveView('skins')
                        }}
                        className="nam-allow-overflow relative flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-black text-slate-500 transition-colors duration-150 hover:bg-slate-800/80 hover:text-slate-100"
                        aria-label={`${t('nav.skins')} BETA`}
                      >
                        <Shirt size={14} aria-hidden="true" />
                        {t('nav.skins')}
                        <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#0d1526] bg-red-500 px-1 text-[8px] font-black tracking-tight text-white shadow-lg shadow-red-950/30">
                          BETA
                        </span>
                      </button>
                    </div>
                    <div className="relative min-w-[280px] flex-1">
                      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={modQuery}
                        onChange={(event) => {
                          setModQuery(event.target.value)
                          setLibraryPage(0)
                        }}
                        placeholder={tf('library.search', { source: librarySource === 'curseforge' ? 'CurseForge' : 'Modrinth' })}
                        aria-label={tf('library.search', { source: librarySource === 'curseforge' ? 'CurseForge' : 'Modrinth' })}
                        maxLength={LIBRARY_SEARCH_QUERY_MAX_LENGTH}
                        autoComplete="off"
                        spellCheck={false}
                        className="no-drag h-11 w-full rounded-lg border border-slate-800 bg-slate-950/40 pl-10 pr-3 text-sm font-bold outline-none transition-colors duration-150 placeholder:text-slate-600 focus:border-blue-400/60"
                      />
                      {libraryLoading && (
                        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                          <Loader2 size={16} className="animate-spin text-blue-300" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Wrench size={14} aria-hidden="true" className="text-blue-300" />
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                          {t('library.filters')}
                        </p>
                        {activeLibraryFilterCount > 0 && (
                          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-black text-blue-200">
                            {tf('library.filters.active', { count: activeLibraryFilterCount })}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={activeLibraryFilterCount === 0}
                        onClick={resetLibraryFilters}
                        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-black text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RotateCcw size={13} aria-hidden="true" />
                        {t('library.filters.reset')}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-2" role="group" aria-label={t('library.filters')}>
                      {libraryCompatibilityAvailable && currentTarget && (
                        <button
                          type="button"
                          aria-pressed={effectiveLibraryFilters.compatibleOnly}
                          onClick={() => updateLibraryFilters({
                            compatibleOnly: !effectiveLibraryFilters.compatibleOnly
                          })}
                          className={classNames(
                            'min-h-10 max-w-full whitespace-normal break-words rounded-md border px-3 py-2 text-xs font-black transition-colors',
                            effectiveLibraryFilters.compatibleOnly
                              ? 'border-blue-400/45 bg-blue-500/15 text-blue-100'
                              : 'border-slate-700 bg-slate-950/30 text-slate-400 hover:border-blue-400/35 hover:text-slate-200'
                          )}
                          data-tooltip={tf('library.filters.compatible', { name: currentTarget.name })}
                        >
                          {tf('library.filters.compatible', { name: currentTarget.name })}
                        </button>
                      )}

                      <InstanceSelect
                        compact
                        className="min-w-[150px]"
                        label={t('library.filters.sort')}
                        value={effectiveLibraryFilters.sort}
                        options={[
                          ...(librarySource === 'modrinth'
                            ? [{ value: 'relevance', label: t('library.filters.sort.relevance') }]
                            : []),
                          { value: 'downloads', label: t('library.filters.sort.downloads') },
                          { value: 'updated', label: t('library.filters.sort.updated') },
                          { value: 'newest', label: t('library.filters.sort.newest') }
                        ]}
                        onChange={(sort) => updateLibraryFilters({ sort: sort as LibrarySort })}
                        testId="library-sort-select"
                      />

                      <InstanceSelect
                        compact
                        className="min-w-[145px]"
                        label={t('library.filters.gameVersion')}
                        value={resolvedLibraryFilters.gameVersion}
                        disabled={effectiveLibraryFilters.compatibleOnly}
                        options={[
                          { value: '', label: t('library.filters.allVersions') },
                          ...libraryMinecraftVersionOptions.map((version: string) => ({ value: version, label: version }))
                        ]}
                        onChange={(gameVersion) => updateLibraryFilters({ gameVersion })}
                        testId="library-game-version-select"
                      />

                      {libraryLoaderFilterAvailable && (
                        <InstanceSelect
                          compact
                          className="min-w-[130px]"
                          label={t('library.filters.loader')}
                          value={resolvedLibraryFilters.loader}
                          disabled={effectiveLibraryFilters.compatibleOnly}
                          options={[
                            { value: '', label: t('library.filters.allLoaders') },
                            ...LIBRARY_LOADERS.map((loader: string) => ({ value: loader, label: loader }))
                          ]}
                          onChange={(loader) => updateLibraryFilters({
                            loader: loader as LibrarySearchFilters['loader']
                          })}
                          renderIcon={(loader) => loader
                            ? <LoaderIcon loader={loader} className="h-5 w-5" />
                            : <Package size={17} className="text-slate-400" />}
                          testId="library-loader-select"
                        />
                      )}

                      {librarySource === 'modrinth' && libraryType === 'mod' && (
                        <InstanceSelect
                          compact
                          className="min-w-[150px]"
                          label={t('library.filters.environment')}
                          value={effectiveLibraryFilters.environment}
                          options={[
                            { value: 'all', label: t('library.filters.environment.all') },
                            { value: 'client', label: t('library.filters.environment.client') },
                            { value: 'server', label: t('library.filters.environment.server') },
                            { value: 'both', label: t('library.filters.environment.both') }
                          ]}
                          onChange={(environment) => updateLibraryFilters({
                            environment: environment as LibraryEnvironment
                          })}
                          testId="library-environment-select"
                        />
                      )}

                      {librarySource === 'modrinth' && (
                        <button
                          type="button"
                          aria-pressed={effectiveLibraryFilters.openSourceOnly}
                          onClick={() => updateLibraryFilters({
                            openSourceOnly: !effectiveLibraryFilters.openSourceOnly
                          })}
                          className={classNames(
                            'h-10 rounded-md border px-3 text-xs font-black transition-colors',
                            effectiveLibraryFilters.openSourceOnly
                              ? 'border-blue-400/45 bg-blue-500/15 text-blue-100'
                              : 'border-slate-700 bg-slate-950/30 text-slate-400 hover:border-blue-400/35 hover:text-slate-200'
                          )}
                        >
                          {t('library.filters.openSource')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {libraryError && (
                  <div role="alert" aria-atomic="true" className="border-b border-red-400/15 bg-red-500/[0.06] px-5 py-3 text-xs font-bold text-red-200">
                    {libraryError}
                  </div>
                )}

                <LibraryPagination
                  idPrefix="library"
                  placement="top"
                  currentPage={libraryPage}
                  totalHits={totalHits}
                  resultText={libraryResultsText}
                  statusText={libraryPaginationStatusText}
                  labels={libraryPaginationLabels}
                  loading={libraryLoading}
                  onPageChange={goToLibraryPage}
                  className="border-b border-slate-800 bg-slate-950/10"
                />

                <div className="divide-y divide-slate-800">
                  {!libraryLoading && mods.length === 0 && (
                    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
                      <Package size={32} className="text-slate-700" />
                      <p className="mt-3 text-sm font-black text-slate-400">
                        {librarySource === 'curseforge' && !curseForgeConfigured ? t('library.empty.proxy.title') : t('library.empty.title')}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {librarySource === 'curseforge' && !curseForgeConfigured
                          ? t('library.empty.proxy.body')
                          : t('library.empty.body')}
                      </p>
                    </div>
                  )}
                  {mods.map((mod: any) => {
                    const projectId = getProjectKey(mod)
                    const status = contentStatuses[projectId]
                    const buttonState = getLibraryButtonState(mod)
                    const projectDetailsDisabled = libraryType === 'mod' && currentTarget?.loader === 'vanilla'

                    return (
                      <div key={mod.project_id} className="nam-interactive-surface flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-slate-800/35">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-slate-600">
                          <CachedImage
                            src={mod.icon_url}
                            alt=""
                            className="h-full w-full object-cover"
                            fallback={<Package size={20} />}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <h3 className="min-w-0 break-words text-base font-black text-white">{mod.title}</h3>
                            <span className={classNames(
                              'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase',
                              mod.provider === 'curseforge'
                                ? 'bg-orange-500/15 text-orange-200'
                                : 'bg-blue-500/15 text-blue-200'
                            )}>
                              <ProviderIcon provider={mod.provider === 'curseforge' ? 'curseforge' : 'modrinth'} size={11} />
                              {mod.provider === 'curseforge' ? 'CurseForge' : 'Modrinth'}
                            </span>
                            {status?.state === 'installed' && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-blue-200">
                                <CheckCircle2 size={11} aria-hidden="true" />
                                {t('library.status.installed')}
                              </span>
                            )}
                            {status?.state === 'update' && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-sky-200">
                                <RefreshCw size={11} aria-hidden="true" />
                                {t('library.status.update')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-1 text-sm font-medium text-slate-500">{mod.description}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
                            <span>{mod.author}</span>
                            <span className="flex items-center gap-1"><Download size={13} />{Number(mod.downloads || 0).toLocaleString()}</span>
                            {status?.state === 'installed' && status.installedVersion && (
                              <span className="inline-flex items-center gap-1 font-mono text-blue-300">
                                <CheckCircle2 size={12} aria-hidden="true" />
                                {tf('library.status.installedVersion', { version: status.installedVersion })}
                              </span>
                            )}
                            {status?.state === 'update' && (
                              <span className="inline-flex items-center gap-1 font-mono text-sky-300">
                                <RefreshCw size={12} aria-hidden="true" />
                                {status.installedVersion || t('library.status.installed')} -&gt; {status.latestVersion || t('library.status.latest')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={projectDetailsDisabled}
                            onClick={(event) => void openLibraryProjectDetails(mod, event.currentTarget)}
                            className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-600 bg-slate-950/25 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/55 hover:bg-blue-500/10 hover:text-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800/60 disabled:text-slate-500"
                            data-tooltip={projectDetailsDisabled ? t('library.install.needLoader') : t('library.detail.openTooltip')}
                          >
                            <FileText size={15} aria-hidden="true" />
                            {t('library.button.openProject')}
                          </button>
                          <button
                            disabled={buttonState.disabled}
                            onClick={() => installLibraryProject(mod)}
                            className={classNames(
                              'flex h-10 min-w-[112px] items-center justify-center gap-2 rounded-md px-3 text-xs font-black transition-colors duration-150 disabled:cursor-not-allowed',
                              buttonState.kind === 'installed'
                                ? 'bg-blue-500/15 text-blue-200'
                                : buttonState.kind === 'update'
                                  ? 'bg-sky-500 text-white hover:bg-sky-400'
                                  : buttonState.disabled
                                    ? 'bg-slate-700 text-slate-400'
                                    : 'bg-blue-500 text-white hover:bg-blue-400'
                            )}
                            data-tooltip={buttonState.title}
                          >
                            {buttonState.kind === 'installing' && <Loader2 size={15} className="animate-spin" />}
                            {buttonState.kind === 'installed' && <CheckCircle2 size={15} />}
                            {buttonState.kind === 'update' && <RefreshCw size={15} />}
                            {buttonState.kind === 'install' && <Download size={15} />}
                            {buttonState.kind === 'disabled' && <Download size={15} />}
                            {buttonState.label}
                          </button>
                          <button
                            onClick={() => window.electron.openExternal(
                              mod.website_url || `https://modrinth.com/${mod.project_type || libraryType}/${mod.slug}`
                            )}
                            className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                            data-tooltip={tf('library.openOn', { source: mod.provider === 'curseforge' ? 'CurseForge' : 'Modrinth' })}
                            aria-label={tf('library.openOn', { source: mod.provider === 'curseforge' ? 'CurseForge' : 'Modrinth' })}
                          >
                            <ExternalLink size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <LibraryPagination
                  idPrefix="library"
                  placement="bottom"
                  currentPage={libraryPage}
                  totalHits={totalHits}
                  resultText={libraryResultsText}
                  statusText={libraryPaginationStatusText}
                  labels={libraryPaginationLabels}
                  loading={libraryLoading}
                  onPageChange={goToLibraryPage}
                  className="border-t border-slate-800"
                />
              </motion.section>
            )
}
