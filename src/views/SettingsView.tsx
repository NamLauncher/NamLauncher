// Author/creator: nattapat2871 (https://nattapat2871.me)
import type { LauncherLanguage } from '../appText'
import type { LauncherTheme } from '../app/launcherCommon'
import type { PerformanceProfile } from './viewTypes'

export function SettingsView({ model }: { model: any }) {
  const {
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
  } = model

  return (
              <motion.section key="settings" {...pageMotionProps} onAnimationComplete={focusDiscordAccountSection} className="max-w-4xl space-y-5">
                <motion.div
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduceMotion ? 0.1 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h2 className="text-2xl font-black tracking-tight">{t('settings.title')}</h2>
                  <p className="mt-1 text-pretty text-sm font-semibold text-slate-500">{t('settings.subtitle')}</p>
                </motion.div>

                <motion.div
                  variants={settingsCardVariants}
                  initial="hidden"
                  animate="show"
                  className="nam-settings-card relative overflow-hidden rounded-xl border border-blue-400/20 bg-[linear-gradient(135deg,rgba(30,64,175,0.22),rgba(13,21,38,0.96)_48%,rgba(15,23,42,0.96))] p-5"
                >
                  <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-blue-400/10 blur-3xl" />
                  <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-300/25 bg-blue-400/10 text-blue-100 shadow-[0_12px_30px_rgba(37,99,235,0.18)]">
                        <Package size={21} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-white">{t('settings.about.title')}</h3>
                        <p className="mt-1 text-pretty text-xs font-semibold text-slate-400">{t('settings.about.subtitle')}</p>
                      </div>
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2">
                      <div className="rounded-lg border border-white/10 bg-slate-950/35 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('settings.about.version')}</p>
                        <p className="mt-1 font-mono text-sm font-black tabular-nums text-blue-100">v{currentLauncherVersion}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-slate-950/35 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{t('settings.about.channel')}</p>
                        <p className="mt-1 text-sm font-black capitalize text-slate-100">{currentLauncherChannel}</p>
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold text-slate-400">
                      {launcherUpdate?.updateAvailable
                        ? `${t('settings.update.latest')} v${launcherUpdate.latestVersion}`
                        : t('settings.about.ready')}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.electron.openExternal(NAMLAUNCHER_DISCORD_URL)}
                        className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-indigo-300/30 bg-indigo-500/10 px-3 text-xs font-black text-indigo-100 transition-colors duration-150 hover:border-indigo-300/55 hover:bg-indigo-500/18"
                      >
                        <DiscordLogo className="h-[15px] w-[15px]" />
                        {t('settings.discord.join')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void checkForLauncherUpdateNow()}
                        disabled={checkingLauncherUpdate}
                        className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-950/35 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-300/45 hover:bg-blue-500/10 hover:text-blue-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {checkingLauncherUpdate ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        {checkingLauncherUpdate ? t('settings.update.checking') : t('settings.update.check')}
                      </button>
                      <button
                        type="button"
                        onClick={openLegalReview}
                        className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-blue-300/30 bg-blue-500/10 px-3 text-xs font-black text-blue-100 transition-colors duration-150 hover:border-blue-300/55 hover:bg-blue-500/18"
                      >
                        <ShieldCheck size={15} />
                        {t('settings.legal.button')}
                      </button>
                    {launcherUpdate?.updateAvailable && (
                      <button
                        onClick={openLauncherUpdatePrompt}
                        disabled={launcherUpdateInstallState === 'installing'}
                        className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-blue-500 px-3 text-xs font-black text-white hover:bg-blue-400 disabled:cursor-wait disabled:opacity-65"
                      >
                        {launcherUpdateInstallState === 'installing' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        {t('settings.update.download')}
                      </button>
                    )}
                    </div>
                  </div>
                  <div className="relative mt-4 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => window.electron.openExternal('https://nattapat2871.me/')}
                      className="group flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/35 px-4 py-3 text-left transition-colors hover:border-blue-300/40 hover:bg-blue-500/[0.08]"
                      aria-label={t('settings.about.openDeveloper')}
                    >
                      <span className="min-w-0">
                        <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          {t('settings.about.developerLabel')}
                        </span>
                        <span className="mt-1 block truncate text-sm font-black text-white">{t('settings.about.developerName')}</span>
                      </span>
                      <ExternalLink size={15} className="shrink-0 text-blue-200 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => window.electron.openExternal('https://namlauncher.nattapat2871.me/')}
                      className="group flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/35 px-4 py-3 text-left transition-colors hover:border-blue-300/40 hover:bg-blue-500/[0.08]"
                      aria-label={t('settings.support.button')}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <MessageCircle size={18} className="shrink-0 text-blue-300" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-white">{t('settings.support.title')}</span>
                          <span className="mt-1 block truncate text-xs font-semibold text-slate-500">{t('settings.support.subtitle')}</span>
                        </span>
                      </span>
                      <ExternalLink size={15} className="shrink-0 text-blue-200 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                  <div className="relative mt-4 border-t border-white/10 pt-4">
                    <div className="mb-3">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">{t('settings.about.partnersTitle')}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{t('settings.about.partnersSubtitle')}</p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      {PARTNER_SERVERS.map((server: any) => (
                        <button
                          key={server.id}
                          type="button"
                          onClick={() => openPartnerServerWebsite(server)}
                          className="group flex min-w-0 items-center gap-3 rounded-lg border border-blue-300/20 bg-blue-500/[0.07] p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-200/55 hover:bg-blue-400/10 hover:shadow-[0_0_30px_rgba(59,130,246,0.16)]"
                          aria-label={tf('settings.about.openPartner', { name: server.name })}
                        >
                          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/25 text-blue-200 ring-1 ring-blue-200/20 transition-transform duration-200 group-hover:scale-105">
                            <Server size={21} aria-hidden="true" />
                            <img
                              src={server.iconUrl}
                              alt=""
                              loading={server.id === 'minisand' ? 'eager' : 'lazy'}
                              decoding="async"
                              className="absolute inset-0 h-full w-full bg-black/25 object-contain"
                              onError={(event) => { event.currentTarget.style.display = 'none' }}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-blue-200/75">
                              {server.relationship === 'owned' ? t('settings.about.ownedServer') : t('settings.about.partnerTitle')}
                            </span>
                            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-black text-white">
                              <span className="truncate">{server.name}</span>
                              <ExternalLink size={13} className="shrink-0 text-blue-200" />
                            </span>
                            <span className="mt-1 block truncate font-mono text-[11px] font-semibold text-slate-500">{server.address}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>

                <div className="nam-settings-card rounded-lg border border-slate-800 bg-[#0d1526]">
                  <div className="flex items-center gap-3 border-b border-slate-800 p-5">
                    <MonitorDown size={20} className="text-blue-300" />
                    <div>
                      <h3 className="font-black">{t('settings.performance.title')}</h3>
                      <p className="text-xs font-semibold text-slate-500">{t('settings.performance.subtitle')}</p>
                    </div>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div>
                        <p className="text-sm font-black text-slate-100">{t('settings.performance.profile.title')}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          {t('settings.performance.profile.subtitle')}
                        </p>
                      </div>
                      <div
                        className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
                        role="group"
                        aria-label={t('settings.performance.profile.title')}
                      >
                        {(['automatic', 'low-spec', 'balanced', 'max-fps'] as PerformanceProfile[]).map((profile) => (
                          <button
                            key={profile}
                            type="button"
                            aria-pressed={discordSettings.performanceProfile === profile}
                            onClick={() => updateLauncherSettings({ ...discordSettings, performanceProfile: profile })}
                            className={classNames(
                              'h-10 rounded-md border px-3 text-xs font-black transition-colors',
                              discordSettings.performanceProfile === profile
                                ? 'border-blue-300/60 bg-blue-500/15 text-blue-100'
                                : 'border-slate-700 text-slate-400 hover:border-blue-400/40 hover:bg-blue-500/[0.06] hover:text-slate-100'
                            )}
                          >
                            {t(`settings.performance.profile.${profile}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-100">{t('settings.autoMinimize.title')}</p>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500">
                          {discordSettings.autoMinimizeOnLaunch ? t('settings.autoMinimize.on') : t('settings.autoMinimize.off')}
                        </p>
                      </div>
                      <SwitchControl
                        checked={discordSettings.autoMinimizeOnLaunch}
                        onChange={() => updateLauncherSettings({
                          ...discordSettings,
                          autoMinimizeOnLaunch: !discordSettings.autoMinimizeOnLaunch
                        })}
                        title={t('settings.autoMinimize.title')}
                      />
                    </div>
                    <div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-100">{t('settings.closeToTray.title')}</p>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500">
                          {discordSettings.closeToTrayEnabled ? t('settings.closeToTray.on') : t('settings.closeToTray.off')}
                        </p>
                      </div>
                      <SwitchControl
                        checked={discordSettings.closeToTrayEnabled}
                        onChange={() => updateLauncherSettings({
                          ...discordSettings,
                          closeToTrayEnabled: !discordSettings.closeToTrayEnabled
                        })}
                        title={t('settings.closeToTray.title')}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Languages size={18} className="shrink-0 text-blue-300" />
                        <div>
                          <p className="text-sm font-black text-slate-100">{t('settings.language.title')}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{t('settings.language.subtitle')}</p>
                        </div>
                      </div>
                      <div className="flex rounded-lg border border-slate-800 bg-slate-950/40 p-1">
                        {(['en', 'th'] as LauncherLanguage[]).map((lang) => (
                          <button
                            key={lang}
                            onClick={() => updateLauncherSettings({ ...discordSettings, language: lang })}
                            className={classNames(
                              'h-9 min-w-[54px] rounded-md px-3 text-xs font-black transition-[background-color,color,box-shadow] duration-150',
                              language === lang
                                ? 'bg-blue-500 text-white shadow-lg shadow-blue-950/30'
                                : 'text-slate-500 hover:bg-slate-800/80 hover:text-slate-100'
                            )}
                          >
                            {lang.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Palette size={18} className="shrink-0 text-blue-300" />
                        <div>
                          <p className="text-sm font-black text-slate-100">{t('settings.appearance.title')}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{t('settings.appearance.subtitle')}</p>
                        </div>
                      </div>
                      <div
                        className="mt-3 grid gap-2 sm:grid-cols-3"
                        role="group"
                        aria-label={t('settings.appearance.title')}
                      >
                        {([
                          { id: 'system', Icon: Monitor },
                          { id: 'dark', Icon: Moon },
                          { id: 'light', Icon: Sun }
                        ] as { id: LauncherTheme; Icon: typeof Monitor }[]).map(({ id, Icon }) => {
                          const selected = (discordSettings.theme || 'system') === id
                          return (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => updateLauncherSettings({ ...discordSettings, theme: id })}
                              className={classNames(
                                'flex min-h-[78px] items-start gap-3 rounded-lg border px-3 py-3 text-left transition-[background-color,border-color,color,box-shadow] duration-200',
                                selected
                                  ? 'border-blue-300/60 bg-blue-500/15 text-blue-100 shadow-lg shadow-blue-950/15'
                                  : 'border-slate-700 bg-slate-950/20 text-slate-400 hover:border-blue-400/40 hover:bg-blue-500/[0.06] hover:text-slate-100'
                              )}
                            >
                              <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                              <span>
                                <span className="block text-xs font-black">{t(`settings.appearance.${id}`)}</span>
                                <span className="mt-1 block text-[11px] font-semibold leading-4 opacity-75">
                                  {t(`settings.appearance.${id}.description`)}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="nam-settings-card rounded-lg border border-slate-800 bg-[#0d1526]">
                  <div className="flex items-center gap-3 border-b border-slate-800 p-5">
                    <FolderOpen size={20} className="text-blue-300" />
                    <div>
                      <h3 className="font-black">{t('settings.storage.title')}</h3>
                      <p className="text-xs font-semibold text-slate-500">{t('settings.storage.subtitle')}</p>
                    </div>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className={classNames(
                      'rounded-lg border bg-slate-950/20 p-4',
                      dataLocationStatus === 'error' ? 'border-red-400/30' : 'border-slate-800'
                    )}>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">{t('settings.storage.current')}</p>
                      {dataLocationStatus === 'loading' ? (
                        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400" role="status">
                          <Loader2 size={14} className="shrink-0 animate-spin text-blue-300" />
                          {t('settings.storage.loading')}
                        </div>
                      ) : dataLocationStatus === 'error' ? (
                        <div className="mt-2 flex flex-col items-start gap-3" role="alert">
                          <div>
                            <p className="text-xs font-black text-red-200">{t('settings.storage.loadFailed')}</p>
                            {dataLocationError && (
                              <p className="mt-1 break-words font-mono text-[11px] font-semibold leading-5 text-red-200/60">
                                {dataLocationError}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void loadLauncherDataLocation()}
                            className="flex h-9 items-center gap-2 rounded-md border border-red-300/30 bg-red-500/10 px-3 text-xs font-black text-red-100 transition-colors duration-150 hover:bg-red-500/18"
                          >
                            <RefreshCw size={14} />
                            {t('settings.storage.retry')}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 break-all font-mono text-xs font-semibold leading-5 text-slate-300">
                          {dataLocation?.currentPath || t('settings.storage.unavailable')}
                        </p>
                      )}
                    </div>
                    {dataLocation?.nextPath && dataLocation.restartRequired && (
                      <div className="rounded-lg border border-blue-400/25 bg-blue-500/[0.08] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">{t('settings.storage.next')}</p>
                        <p className="mt-2 break-all font-mono text-xs font-semibold leading-5 text-blue-50/80">
                          {dataLocation.nextPath}
                        </p>
                        <p className="mt-3 text-xs font-bold text-blue-100/70">{t('settings.storage.restart')}</p>
                      </div>
                    )}
                    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="max-w-xl text-xs font-semibold leading-5 text-slate-500">{t('settings.storage.note')}</p>
                      <button
                        type="button"
                        disabled={movingDataLocation || gameRunning || launching}
                        onClick={chooseDataLocation}
                        className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {movingDataLocation ? <Loader2 size={15} className="animate-spin" /> : <FolderOpen size={15} />}
                        {movingDataLocation ? t('settings.storage.moving') : t('settings.storage.button')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="nam-settings-card rounded-lg border border-slate-800 bg-[#0d1526]">
                  <div className="flex items-center gap-3 border-b border-slate-800 p-5">
                    <Cpu size={20} className="text-blue-300" />
                    <div>
                      <h3 className="font-black">{t('settings.memory.title')}</h3>
                      <p className="text-xs font-semibold text-slate-500">{t('settings.memory.subtitle')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_140px] gap-5 p-5">
                    <input
                      type="range"
                      min={1}
                      max={32}
                      step={1}
                      value={memoryGb}
                      disabled={discordSettings.automaticMemory}
                      onChange={(event) => handleMemoryChange(Number(event.target.value))}
                      className="nam-range mt-3 w-full"
                    />
                    <div className="flex h-12 items-center rounded-lg border border-slate-700 bg-slate-950/30 px-3 focus-within:border-blue-400/60">
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={memoryGb}
                        disabled={discordSettings.automaticMemory}
                        onChange={(event) => handleMemoryChange(Number(event.target.value))}
                        className="w-full bg-transparent text-right font-mono text-xl font-black outline-none"
                      />
                      <span className="ml-2 text-sm font-black text-blue-300">GB</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-800 p-5">
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-100">{t('settings.memory.automatic.title')}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{t('settings.memory.automatic.body')}</p>
                      </div>
                      <SwitchControl
                        checked={discordSettings.automaticMemory}
                        onChange={() => updateLauncherSettings({
                          ...discordSettings,
                          automaticMemory: !discordSettings.automaticMemory
                        })}
                        title={t('settings.memory.automatic.title')}
                      />
                    </div>
                  </div>
                  <div className="border-t border-slate-800 p-5">
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-100">{t('settings.java.title')}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {t('settings.java.body')}
                        </p>
                      </div>
                      <SwitchControl
                        checked={discordSettings.customJavaArgsEnabled}
                        onChange={() => updateLauncherSettings({
                          ...discordSettings,
                          customJavaArgsEnabled: !discordSettings.customJavaArgsEnabled
                        })}
                        title={discordSettings.customJavaArgsEnabled ? 'Disable custom Java arguments' : 'Enable custom Java arguments'}
                      />
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      {discordSettings.customJavaArgsEnabled && (
                        <motion.div
                          key="custom-java-arguments"
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
                          transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 p-3"
                        >
                          <textarea
                            value={discordSettings.customJavaArgs}
                            onChange={(event) => setDiscordSettings((prev: any) => ({ ...prev, customJavaArgs: event.target.value }))}
                            onBlur={(event) => updateLauncherSettings({
                              ...discordSettings,
                              customJavaArgs: event.target.value
                            })}
                            spellCheck={false}
                            rows={4}
                            placeholder="-XX:+UseG1GC -XX:+UseStringDeduplication"
                            className="min-h-[112px] w-full resize-y bg-transparent font-mono text-xs font-semibold leading-6 text-slate-200 outline-none placeholder:text-slate-600"
                          />
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold text-slate-600">
                              {t('settings.java.note')}
                            </p>
                            <button
                              onClick={() => updateLauncherSettings(discordSettings)}
                              className="h-8 rounded-md bg-blue-500 px-3 text-[11px] font-black text-white transition-colors duration-150 hover:bg-blue-400"
                            >
                              {t('settings.java.save')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="nam-settings-card rounded-lg border border-slate-800 bg-[#0d1526]">
                  <div className="flex items-center gap-3 border-b border-slate-800 p-5">
                    <ShieldCheck size={20} className="text-blue-300" />
                    <div>
                      <h3 className="font-black">{t('settings.privacy.title')}</h3>
                      <p className="text-xs font-semibold text-slate-500">{t('settings.privacy.subtitle')}</p>
                    </div>
                  </div>
                  <div className="space-y-4 p-5">
                    <div ref={discordAccountSectionRef} id="discord-account-settings" tabIndex={-1} aria-labelledby="discord-account-heading" className="scroll-mt-5 rounded-lg border border-indigo-300/20 bg-indigo-500/[0.06] p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          {launcherDiscordAccount?.connected && launcherDiscordAccount.profile ? (
                            <img
                              src={launcherDiscordAccount.profile.avatarUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="h-12 w-12 shrink-0 rounded-full bg-slate-900 object-cover ring-2 ring-indigo-300/25"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-300/25">
                              <DiscordLogo className="h-6 w-6" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p id="discord-account-heading" className="text-sm font-black text-slate-100">{t('settings.discordAccount.title')}</p>
                            {launcherDiscordAccount?.connected && launcherDiscordAccount.profile ? (
                              <>
                                <p className="mt-1 truncate text-sm font-black text-white">{launcherDiscordAccount.profile.displayName}</p>
                                <p className="truncate text-xs font-semibold text-slate-500">@{launcherDiscordAccount.profile.username}</p>
                              </>
                            ) : (
                              <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500">
                                {t('settings.discordAccount.subtitle')}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={launcherDiscordAccountBusy}
                          onClick={() => void (launcherDiscordAccount?.connected ? requestDisconnectLauncherDiscord() : connectLauncherDiscord())}
                          className={classNames(
                            'flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-xs font-black transition-colors disabled:cursor-wait disabled:opacity-60',
                            launcherDiscordAccount?.connected
                              ? 'border border-slate-700 text-slate-200 hover:border-red-300/40 hover:bg-red-500/10 hover:text-red-100'
                              : 'bg-indigo-500 text-white hover:bg-indigo-400'
                          )}
                        >
                          {launcherDiscordAccountBusy
                            ? <Loader2 size={15} className="animate-spin" />
                            : launcherDiscordAccount?.connected
                              ? <LogOut size={15} />
                              : <DiscordLogo className="h-[15px] w-[15px] shrink-0" />}
                          {launcherDiscordAccountBusy
                            ? t('settings.discordAccount.waiting')
                            : launcherDiscordAccount?.connected
                              ? t('settings.discordAccount.logout')
                              : t('settings.discordAccount.login')}
                        </button>
                      </div>
                      {launcherDiscordAccountError && (
                        <p className="mt-3 rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100" role="alert">
                          {launcherDiscordAccountError}
                        </p>
                      )}
                      {launcherDiscordAccount?.connected && launcherDiscordAccount.offline && (
                        <p className="mt-3 text-[11px] font-semibold text-amber-200/75">{t('settings.discordAccount.offline')}</p>
                      )}
                      {launcherDiscordAccount?.connected && !launcherDiscordAccount.persistent && (
                        <p className="mt-3 text-[11px] font-semibold text-amber-200/75">{t('settings.discordAccount.notSaved')}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-slate-100">{t('settings.discord.title')}</p>
                          <span className={classNames('rounded px-2 py-0.5 text-[10px] font-black uppercase', discordStateClass)}>
                            {discordStateLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {discordSettings.discordRpcEnabled ? t('settings.discord.on') : t('settings.discord.off')}
                        </p>
                        {discordSettings.discordRpcEnabled && (
                          <p className="mt-1 max-w-xl truncate text-[11px] font-semibold text-slate-600" data-tooltip={discordStatus?.lastError || discordStatus?.lastActivity || undefined}>
                            {discordStatus?.lastError
                              ? discordStatus.lastError
                              : discordStatus?.lastActivity
                                ? `Last activity: ${discordStatus.lastActivity}${discordStatus.applicationId ? ` • App ${discordStatus.applicationId}` : ``}`
                                : t('settings.discord.waiting')}
                          </p>
                        )}
                      </div>
                      <SwitchControl
                        checked={discordSettings.discordRpcEnabled}
                        onChange={() => updateLauncherSettings({
                          ...discordSettings,
                          discordRpcEnabled: !discordSettings.discordRpcEnabled
                        })}
                        title={discordSettings.discordRpcEnabled ? 'Disable Discord IPC' : 'Enable Discord IPC'}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div>
                        <p className="text-sm font-black text-slate-100">{t('settings.playerBadge.title')}</p>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500">
                          {discordSettings.playerBadgeEnabled
                            ? t('settings.playerBadge.on')
                            : t('settings.playerBadge.off')}
                        </p>
                      </div>
                      <SwitchControl
                        checked={discordSettings.playerBadgeEnabled}
                        onChange={() => updateLauncherSettings({
                          ...discordSettings,
                          playerBadgeEnabled: !discordSettings.playerBadgeEnabled
                        })}
                        title={discordSettings.playerBadgeEnabled ? 'Disable in-game player badges' : 'Enable in-game player badges'}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div>
                        <p className="text-sm font-black text-slate-100">{t('settings.gameplayTelemetry.title')}</p>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500">
                          {t('settings.gameplayTelemetry.on')}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-200">
                        <ShieldCheck size={13} /> {t('settings.required')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
                      <div>
                        <p className="text-sm font-black text-slate-100">{t('settings.stats.title')}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {t('settings.stats.on')}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-200">
                        <ShieldCheck size={13} /> {t('settings.required')}
                      </span>
                    </div>
                    <div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText size={18} className="shrink-0 text-blue-300" />
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-100">{t('settings.legal.title')}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{t('settings.legal.subtitle')}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={openLegalReview}
                        className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                      >
                        <ShieldCheck size={15} />
                        {t('settings.legal.button')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="nam-settings-card rounded-lg border border-slate-800 bg-[#0d1526] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <FileText size={20} className="text-blue-300" />
                      <div>
                        <h3 className="font-black">{t('settings.logs.title')}</h3>
                        <p className="text-xs font-semibold text-slate-500">{t('settings.logs.subtitle')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => window.electron.openLogs()}
                      className="flex h-10 items-center gap-2 rounded-md border border-slate-700 px-3 text-xs font-black text-slate-200 transition-colors duration-150 hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-200"
                    >
                      <FileText size={15} />
                      {t('settings.logs.button')}
                    </button>
                  </div>
                </div>
              </motion.section>
            )
}
