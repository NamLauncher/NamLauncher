// Author/creator: nattapat2871 (https://nattapat2871.me)

export function HomeView({ model }: { model: any }) {
  const {
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
  } = model

  return (
              <motion.div key="home" {...pageMotionProps} className="mx-auto max-w-[1500px] space-y-6">
                <section
                  aria-labelledby="home-welcome-title"
                  className="relative isolate flex min-h-[132px] items-center justify-between gap-5 overflow-hidden rounded-xl border border-blue-400/20 bg-[#0d1526]/92 p-5 shadow-[0_18px_50px_rgba(2,8,23,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6"
                >
                  <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_88%_50%,rgba(59,130,246,0.18),transparent_34%),linear-gradient(110deg,rgba(15,23,42,0.2),transparent_65%)]" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">{t('home.welcome')}</p>
                    <h2 id="home-welcome-title" className="mt-1 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">{welcomeName}</h2>
                  </div>
                  <div aria-hidden="true" className="shrink-0 rounded-xl border border-blue-300/25 bg-slate-950/40 p-1.5 shadow-[0_14px_36px_rgba(30,64,175,0.24)]">
                    {activeAccount ? (
                      <AccountHead
                        account={activeAccount}
                        skinTextureSrc={accountSkinTextures[activeAccount.id]}
                        sizeClass="h-16 w-16 sm:h-20 sm:w-20"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-slate-800 text-slate-500 sm:h-20 sm:w-20">
                        <User size={28} />
                      </div>
                    )}
                  </div>
                </section>

                <section aria-labelledby="home-recent-title">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 id="home-recent-title" className="text-lg font-black text-white">{t('home.recent.title')}</h2>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{t('home.recent.subtitle')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('instances')}
                      className="flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-300 transition-colors hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-100"
                    >
                      {t('home.recent.all')}
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {recentInstances.length > 0 ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {recentInstances.map((instance: any) => {
                        const busy = isInstanceBusy(instance.id)
                        const elapsed = busy ? runningElapsedByInstance[instance.id] || 0 : 0
                        return (
                          <article key={instance.id} className="nam-interactive-surface flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-[#0d1526] p-3 transition-colors hover:border-blue-400/35 hover:bg-blue-500/[0.05]">
                            <button
                              type="button"
                              onClick={() => openInstanceDetail(instance.id)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                              aria-label={tf('home.recent.open', { name: instance.name })}
                            >
                              <InstanceIcon instance={instance} running={busy} size="sm" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-black text-white">{instance.name}</span>
                                <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                                  {instance.loader} / Minecraft {instance.version}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-600">
                                  <span>{tf('home.recent.played', { time: formatRelativeDate(instance.lastPlayedAt!, language) })}</span>
                                  <span className="font-mono tabular-nums">{formatPlaytime((instance.playtimeSeconds || 0) + elapsed)}</span>
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLaunchOrStop(instance)}
                              className={classNames(
                                'flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-black text-white transition-colors',
                                busy ? 'bg-red-500 hover:bg-red-400' : 'bg-blue-500 hover:bg-blue-400'
                              )}
                              aria-label={busy ? tf('home.recent.stop', { name: instance.name }) : tf('home.recent.play', { name: instance.name })}
                            >
                              {busy ? <Square size={14} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                              {busy ? t('play.stop') : t('play.play')}
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-[#0d1526]/70 px-6 text-center">
                      <Clock3 size={25} className="text-slate-700" />
                      <p className="mt-3 text-sm font-black text-slate-400">{t('home.recent.empty.title')}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">{t('home.recent.empty.body')}</p>
                    </div>
                  )}
                </section>

                {recentPlayablePlaces.length > 0 && (
                  <section aria-labelledby="home-places-title">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h2 id="home-places-title" className="text-lg font-black text-white">{t('home.places.title')}</h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{t('home.places.subtitle')}</p>
                      </div>
                      {recentPlayablePlaces.some(({ place }: any) => place.type === 'server') && (
                        <button
                          type="button"
                          onClick={() => {
                            for (const [key, cached] of homeServerStatusCacheRef.current) {
                              homeServerStatusCacheRef.current.set(key, { ...cached, expiresAt: 0 })
                            }
                            setHomeServerStatusRefresh((value: number) => value + 1)
                          }}
                          disabled={homeServerStatusesRefreshing}
                          className="flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-300 transition-colors hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-100 disabled:cursor-wait disabled:opacity-60"
                        >
                          <RefreshCw size={14} className={homeServerStatusesRefreshing ? 'animate-spin' : ''} />
                          {t('places.refresh')}
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {recentPlayablePlaces.map(({ place, instance, quickPlay }: any) => {
                        const busy = isInstanceBusy(instance.id)
                        const placeIdentity = quickPlay.type === 'server' ? quickPlay.address : quickPlay.folderName
                        const serverStatus = place.type === 'server' && place.address
                          ? homeServerStatuses[getHomeServerStatusKey(instance.id, place.address)]
                          : undefined
                        const serverPing = serverStatus?.ping
                        const serverOnline = serverStatus?.phase === 'online'
                        const serverLoading = place.type === 'server' && (!serverStatus || serverStatus.phase === 'loading')
                        const partnerServer = place.type === 'server' && place.address
                          ? PARTNER_SERVERS.find((server: any) => (
                            normalizeHomeServerAddress(server.address) === normalizeHomeServerAddress(place.address!)
                          ))
                          : undefined
                        const serverIcon = serverPing?.status?.faviconDataUrl || serverPing?.iconDataUrl || partnerServer?.iconUrl
                        return (
                          <article key={`${instance.id}:${quickPlay.type}:${placeIdentity}`} className="nam-interactive-surface flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-[#0d1526] p-3 transition-colors hover:border-blue-400/35 hover:bg-blue-500/[0.05]">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInstanceId(instance.id)
                                setInstancePanelView('places')
                                setActiveView('instances')
                              }}
                              className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                              aria-label={tf('home.places.open', { name: place.label })}
                            >
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-400/20 bg-blue-500/10 text-blue-200">
                                {place.type === 'server' ? (
                                  <CachedImage
                                    src={serverIcon}
                                    alt=""
                                    className="h-full w-full object-contain"
                                    loading="lazy"
                                    fallback={<Server size={19} />}
                                  />
                                ) : <Package size={19} />}
                              </span>
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="min-w-0 truncate text-sm font-black text-white">{place.label}</span>
                                  {place.type === 'server' && (serverLoading ? (
                                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-slate-500">
                                      <Loader2 size={10} className="animate-spin" />{t('places.checking')}
                                    </span>
                                  ) : serverOnline ? (
                                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-emerald-300">
                                      <CheckCircle2 size={10} />{t('places.online')}
                                    </span>
                                  ) : (
                                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-red-300">
                                      <WifiOff size={10} />{t('places.offline')}
                                    </span>
                                  ))}
                                </span>
                                <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-slate-500">
                                  <span className={place.type === 'server' ? 'truncate font-mono text-slate-400' : 'truncate'}>
                                    {place.type === 'server' ? place.address : instance.name}
                                  </span>
                                  {serverOnline && serverPing?.status?.players && (
                                    <span className="flex shrink-0 items-center gap-1 text-emerald-300">
                                      <Users size={11} />{serverPing.status.players.online}/{serverPing.status.players.max}
                                    </span>
                                  )}
                                  {serverOnline && (
                                    <span className="shrink-0 font-mono tabular-nums text-slate-500">
                                      {Math.round(serverPing?.status?.latencyMs || 0)} ms
                                    </span>
                                  )}
                                </span>
                                {place.type === 'server' && (
                                  <MinecraftServerMotd
                                    motd={serverOnline ? serverPing?.status?.motd : null}
                                    fallback={serverLoading
                                      ? t('places.checking')
                                      : serverOnline
                                        ? t('places.motd.empty')
                                        : t('places.cannotConnect')}
                                    className={classNames(
                                      'mt-1 line-clamp-2 whitespace-pre-line break-words font-mono text-[11px] font-semibold leading-4',
                                      serverLoading ? 'text-slate-600' : serverOnline ? 'text-slate-300' : 'text-red-300/80'
                                    )}
                                  />
                                )}
                                <span className="mt-1 block truncate text-[11px] font-bold text-slate-600">
                                  {tf('home.places.played', { time: formatRelativeDate(place.playedAt, language), instance: instance.name })}
                                </span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLaunchOrStop(instance, quickPlay, place.label)}
                              className={classNames(
                                'flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-black text-white transition-colors',
                                busy ? 'bg-red-500 hover:bg-red-400' : 'bg-blue-500 hover:bg-blue-400'
                              )}
                              aria-label={busy
                                ? tf('home.recent.stop', { name: instance.name })
                                : tf('home.places.play', { name: place.label })}
                            >
                              {busy ? <Square size={14} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                              {busy ? t('play.stop') : t('play.play')}
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )}

                <section aria-labelledby="home-modpacks-title">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 id="home-modpacks-title" className="text-lg font-black text-white">{t('home.modpacks.title')}</h2>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{t('home.modpacks.subtitle')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLibrarySource('modrinth')
                        setLibraryType('modpack')
                        setLibraryPage(0)
                        setModQuery('')
                        setActiveView('library')
                      }}
                      className="flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-300 transition-colors hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-100"
                    >
                      {t('home.modpacks.browse')}
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {homeModpacksLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label={t('home.modpacks.loading')}>
                      {Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="animate-pulse overflow-hidden rounded-lg border border-slate-800 bg-[#0d1526]">
                          <div className="aspect-[2/1] bg-slate-800/70" />
                          <div className="p-4">
                            <div className="h-4 w-2/3 rounded bg-slate-800/70" />
                            <div className="mt-3 h-3 rounded bg-slate-800/50" />
                            <div className="mt-2 h-3 w-4/5 rounded bg-slate-800/40" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : homeModpacksError ? (
                    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-red-400/20 bg-red-500/[0.05] px-6 text-center" role="alert">
                      <AlertTriangle size={25} className="text-red-300" />
                      <p className="mt-3 text-sm font-black text-red-100">{t('home.modpacks.error')}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setHomeModpacksLoaded(false)
                          setHomeModpacksError(false)
                          setHomeModpacksRetry((value: number) => value + 1)
                        }}
                        className="mt-3 flex h-9 items-center gap-2 rounded-md border border-red-300/30 bg-red-500/10 px-3 text-xs font-black text-red-100 transition-colors hover:bg-red-500/20"
                      >
                        <RefreshCw size={14} />
                        {t('home.modpacks.retry')}
                      </button>
                    </div>
                  ) : homeModpacks.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {homeModpacks.map((modpack: any) => {
                        // Author/creator: nattapat2871 (https://nattapat2871.me)
                        const artwork = resolveHomeModpackArtwork(modpack)
                        const iconFallback = (
                          <span className="flex h-full w-full items-center justify-center bg-slate-950/35 p-5">
                            <CachedImage
                              src={artwork.iconUrl}
                              alt=""
                              loading="lazy"
                              className="max-h-24 max-w-24 object-contain transition-transform duration-300 group-hover:scale-105"
                              fallback={<Package size={30} className="text-slate-700" />}
                            />
                          </span>
                        )

                        return (
                          <article key={getProjectKey(modpack)} className="group overflow-hidden rounded-lg border border-slate-800 bg-[#0d1526] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-950/20">
                            <button
                              type="button"
                              onClick={() => void openModpackInstaller(modpack)}
                              className="block h-full w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300/70"
                              aria-label={tf('home.modpacks.install', { name: modpack.title })}
                            >
                              <span className="flex aspect-[2/1] w-full items-center justify-center overflow-hidden bg-slate-950/35">
                                {artwork.bannerUrl ? (
                                  <CachedImage
                                    src={artwork.bannerUrl}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                                    fallback={iconFallback}
                                  />
                                ) : iconFallback}
                              </span>
                              <span className="block p-4">
                                <span className="block truncate text-sm font-black text-white">{modpack.title}</span>
                                <span className="mt-1 line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-slate-500">{modpack.description}</span>
                                <span className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
                                  <span className="truncate">{modpack.author}</span>
                                  <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
                                    <Download size={12} />
                                    {Number(modpack.downloads || 0).toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}
                                  </span>
                                </span>
                              </span>
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-[#0d1526]/70 px-6 text-center">
                      <Package size={25} className="text-slate-700" />
                      <p className="mt-3 text-sm font-black text-slate-400">{t('home.modpacks.empty')}</p>
                    </div>
                  )}
                </section>
              </motion.div>
            )
}
