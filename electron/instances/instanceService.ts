// Author/creator: nattapat2871 (https://nattapat2871.me)
import type * as NodeFs from 'fs'
import type { MessageBoxOptions } from 'electron'
import type {
  InstanceServerPingRequest,
  InstanceUpdateRequest,
  LaunchRequest,
  LauncherInstance
} from '../main.ts'

type InstanceServiceDependencies = {
  [key: string]: any
  fs: typeof import('fs')
  readJsonFile: <T>(filePath: string, fallback: T) => T
  requestModrinth: <T>(url: string, config?: Record<string, any>) => Promise<T>
  readonly mainWindow: any
}

export const createInstanceService = (deps: InstanceServiceDependencies) => {
  const {
    normalizeLoader, path, fs, readJsonFile, requestModrinth, MODRINTH_API_BASE, writeJsonFile,
    log, userDataPath, ensureDir, runningGames, activeLaunches, app, getFileSha256, crypto,
    isPathInside, getCompactErrorLog, readMinecraftServersDat, PARTNER_SERVERS,
    normalizeMinecraftServerEndpoint, PARTNER_SERVER_REVISION, mergePartnerServersDat,
    redactSensitiveText, sendGameLog, queueGameSessionEvent, queuePlayerBadgePresence,
    checkLauncherUpdate, showMainWindow, getTrayLanguage, dialog, logPath, sanitizeBugReport,
    truncateRemoteText, assertPathWithinRoot, scanMinecraftWorlds, selectMinecraftServerPingTargets,
    pingMinecraftServer, createServerQuickPlay, createWorldQuickPlay, LAUNCHER_UPDATE_CHECK_INTERVAL_MS
  } = deps
  let launcherUpdateTimer: ReturnType<typeof setInterval> | null = null

  const normalizeInstance = (request: LaunchRequest) => {
    const raw = request.instance || {}
    const version = raw.version || request.version || '1.20.1'
    const loader = normalizeLoader(raw.loader || request.loader)
    const loaderVersion = raw.loaderVersion || request.loaderVersion || ''
    const name = raw.name || request.instanceName || (loader === 'vanilla' ? `Minecraft ${version}` : `${loader} ${version}`)
    const id = String(raw.id || `${loader}-${version}-${loaderVersion || 'default'}`)

    const iconUrl = typeof raw.iconUrl === 'string' && raw.iconUrl.trim() ? raw.iconUrl : null

    return { id, name, version, loader, loaderVersion, iconUrl }
  }

  const getModpackMetadataPath = (instance: ReturnType<typeof normalizeInstance>) => {
    const { instanceRoot } = getInstancePaths(instance)
    return path.join(instanceRoot, 'namlauncher-modpack.json')
  }

  const hydrateInstanceIcon = async (input: LauncherInstance) => {
    const normalized = normalizeInstance({ instance: input })
    const instance = {
      ...input,
      id: normalized.id,
      name: normalized.name,
      version: normalized.version,
      loader: normalized.loader,
      loaderVersion: normalized.loaderVersion,
      iconUrl: normalized.iconUrl
    }

    if (instance.iconUrl) return instance

    const metadataPath = getModpackMetadataPath(normalized)
    if (!fs.existsSync(metadataPath)) return instance

    const metadata = readJsonFile<Record<string, any>>(metadataPath, {})
    if (typeof metadata.iconUrl === 'string' && metadata.iconUrl.trim()) {
      return { ...instance, iconUrl: metadata.iconUrl }
    }

    const projectId = typeof metadata.projectId === 'string' ? metadata.projectId.trim() : ''
    if (!projectId) return instance
    if (metadata.source === 'local' || projectId.startsWith('local-')) return instance

    try {
      const project = await requestModrinth<{ icon_url?: string | null }>(
        `${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}`,
        {}
      )
      const iconUrl = project.icon_url || null
      if (!iconUrl) return instance

      writeJsonFile(metadataPath, { ...metadata, iconUrl })
      return { ...instance, iconUrl }
    } catch (err) {
      log.warn(`Could not hydrate modpack icon for ${instance.name}`, err)
      return instance
    }
  }

  const hydrateLauncherInstances = async (instances: LauncherInstance[] = []) => {
    return Promise.all(
      instances
        .filter(Boolean)
        .map((instance) => hydrateInstanceIcon(instance))
    )
  }

  const sanitizeFolderName = (value: string) => {
    const safe = value
      .normalize('NFKC')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/[^A-Za-z0-9\u0E00-\u0E7F _.-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[ .]+$/g, '')
      .replace(/\.+$/g, '')
      .trim()
      .slice(0, 80)

    return safe || 'instance'
  }

  const getInstancesRoot = () => path.join(userDataPath, 'instances')

  const getInstanceMarkerPath = (instanceRoot: string) => path.join(instanceRoot, 'namlauncher-instance.json')

  const readInstanceMarker = (instanceRoot: string) => {
    const markerPath = getInstanceMarkerPath(instanceRoot)
    assertChildPathIsSafe(instanceRoot, markerPath)
    return readJsonFile<{ instanceId?: string; name?: string }>(markerPath, {})
  }

  const findExistingInstanceRoot = (instancesRoot: string, instanceId: string) => {
    if (!fs.existsSync(instancesRoot)) return null

    for (const entry of fs.readdirSync(instancesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue

      const candidateRoot = path.join(instancesRoot, entry.name)
      assertInstancePathIsSafe(candidateRoot)
      const marker = readInstanceMarker(candidateRoot)
      if (marker.instanceId === instanceId) return candidateRoot
    }

    return null
  }

  const writeInstanceMarker = (
    instanceRoot: string,
    instance: ReturnType<typeof normalizeInstance>
  ) => {
    const markerPath = getInstanceMarkerPath(instanceRoot)
    assertChildPathIsSafe(instanceRoot, markerPath)
    writeJsonFile(markerPath, {
      instanceId: instance.id,
      name: instance.name,
      updatedAt: new Date().toISOString()
    })
  }

  const getAvailableInstanceFolderName = (
    instancesRoot: string,
    instance: ReturnType<typeof normalizeInstance>,
    preferredName: string
  ) => {
    for (let index = 1; index <= 100; index += 1) {
      const candidate = index === 1 ? preferredName : sanitizeFolderName(`${preferredName}-${index}`)
      const candidateRoot = path.join(instancesRoot, candidate)
      if (!fs.existsSync(candidateRoot)) return candidate

      assertInstancePathIsSafe(candidateRoot)
      const marker = readInstanceMarker(candidateRoot)
      if (!marker.instanceId || marker.instanceId === instance.id) return candidate
    }

    return sanitizeFolderName(`${preferredName}-${instance.id.slice(0, 8)}`)
  }

  const getInstancePaths = (instance: ReturnType<typeof normalizeInstance>) => {
    const instancesRoot = getInstancesRoot()
    const preferredName = sanitizeFolderName(instance.name)
    const preferredRoot = path.join(instancesRoot, preferredName)
    ensureDir(instancesRoot)
    const toSafePaths = (folderName: string, instanceRoot: string) => {
      const gameDirectory = path.join(instanceRoot, 'game')
      assertInstancePathIsSafe(instanceRoot)
      assertChildPathIsSafe(instanceRoot, gameDirectory)
      return { folderName, instanceRoot, gameDirectory }
    }

    if (fs.existsSync(preferredRoot)) {
      assertInstancePathIsSafe(preferredRoot)
      const preferredMarker = readInstanceMarker(preferredRoot)
      if (!preferredMarker.instanceId || preferredMarker.instanceId === instance.id) {
        return toSafePaths(preferredName, preferredRoot)
      }
    }

    const existingRoot = findExistingInstanceRoot(instancesRoot, instance.id)
    if (existingRoot) {
      const existingFolderName = path.basename(existingRoot)
      const existingPaths = toSafePaths(existingFolderName, existingRoot)
      if (existingFolderName !== preferredName && !fs.existsSync(preferredRoot)) {
        try {
          fs.renameSync(existingRoot, preferredRoot)
        } catch (err) {
          log.warn(`Could not rename instance folder ${existingFolderName} to ${preferredName}`, err)
          return existingPaths
        }
        writeInstanceMarker(preferredRoot, instance)
        return toSafePaths(preferredName, preferredRoot)
      }

      return existingPaths
    }

    if (!fs.existsSync(preferredRoot)) {
      return toSafePaths(preferredName, preferredRoot)
    }

    const folderName = getAvailableInstanceFolderName(instancesRoot, instance, preferredName)
    const instanceRoot = path.join(instancesRoot, folderName)
    return toSafePaths(folderName, instanceRoot)
  }

  const ensureInstanceRoot = (instance: ReturnType<typeof normalizeInstance>) => {
    const paths = getInstancePaths(instance)
    assertInstancePathIsSafe(paths.instanceRoot)
    ensureDir(paths.instanceRoot)
    assertInstancePathIsSafe(paths.instanceRoot)
    writeInstanceMarker(paths.instanceRoot, instance)
    return paths
  }

  const updateInstanceMetadata = (request: InstanceUpdateRequest) => {
    const current = normalizeInstance({ instance: request.instance })
    if (runningGames.has(current.id) || activeLaunches.has(current.id)) {
      throw new Error('Stop Minecraft before editing this instance.')
    }

    const updates = request.updates || {}
    const next = normalizeInstance({
      instance: {
        ...(request.instance || {}),
        ...updates,
        id: current.id,
        loaderVersion: updates.loader === 'vanilla' ? '' : updates.loaderVersion ?? request.instance?.loaderVersion
      }
    })

    ensureInstanceRoot(next)

    return {
      ...(request.instance || {}),
      id: next.id,
      name: next.name,
      version: next.version,
      loader: next.loader,
      loaderVersion: next.loaderVersion,
      iconUrl: next.iconUrl,
      updatedAt: new Date().toISOString()
    }
  }

  const THAI_RESOURCE_PACK_FILE = 'NamLauncher-Thai-Font.zip'
  const THAI_RESOURCE_PACK_SHA256 = 'fa09236c8410aec8123692a7d999149e5e9e3c63bb28b415e9e2666bc5eb4767'
  const THAI_RESOURCE_PACK_MARKER = 'namlauncher-default-resourcepacks.json'
  const PARTNER_SERVERS_MARKER = 'namlauncher-partner-servers.json'
  const LEGACY_THAI_RESOURCE_PACK_FILES = ['Th-En-Font.zip']
  const LEGACY_THAI_RESOURCE_PACK_ENTRIES = [
    ...LEGACY_THAI_RESOURCE_PACK_FILES,
    ...LEGACY_THAI_RESOURCE_PACK_FILES.map((filename) => filename.replace(/\.zip$/i, ''))
  ]

  const getBundledThaiResourcePackPath = () => {
    const candidates = [
      path.join(process.resourcesPath, 'resourcepacks', THAI_RESOURCE_PACK_FILE),
      path.join(app.getAppPath(), 'build', 'resourcepacks', THAI_RESOURCE_PACK_FILE)
    ]
    return candidates.find((candidate) => getFileSha256(candidate) === THAI_RESOURCE_PACK_SHA256) || null
  }

  const readMinecraftOptionList = (rawValue: string) => {
    try {
      const parsed = JSON.parse(rawValue)
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
      // Preserve quoted entries if another launcher wrote a non-standard list.
    }

    return Array.from(rawValue.matchAll(/"([^"]*)"/g)).map((match) => match[1])
  }

  const updateMinecraftOptionList = (
    lines: string[],
    key: string,
    update: (values: string[]) => string[]
  ) => {
    const index = lines.findIndex((line) => line.startsWith(`${key}:`))
    const current = index >= 0
      ? readMinecraftOptionList(lines[index].slice(key.length + 1))
      : []
    const next = Array.from(new Set(update(current)))
    const line = `${key}:${JSON.stringify(next)}`
    if (index >= 0) lines[index] = line
    else lines.push(line)
  }

  const enableResourcePackInOptions = (gameDirectory: string, filename: string) => {
    const optionsPath = path.join(gameDirectory, 'options.txt')
    const existing = fs.existsSync(optionsPath) ? fs.readFileSync(optionsPath, 'utf8') : ''
    const eol = existing.includes('\r\n') ? '\r\n' : '\n'
    const hadTrailingNewline = /\r?\n$/.test(existing)
    const lines = existing ? existing.replace(/\r?\n$/, '').split(/\r?\n/) : []
    const resourcePackId = `file/${filename}`
    const legacyResourcePackIds = new Set(
      LEGACY_THAI_RESOURCE_PACK_ENTRIES.map((legacyEntry) => `file/${legacyEntry}`)
    )

    updateMinecraftOptionList(lines, 'resourcePacks', (values) => (
      values.includes(resourcePackId)
        ? values.filter((value) => !legacyResourcePackIds.has(value))
        : [...values.filter((value) => !legacyResourcePackIds.has(value)), resourcePackId]
    ))
    updateMinecraftOptionList(lines, 'incompatibleResourcePacks', (values) => (
      values.filter((value) => value !== resourcePackId && !legacyResourcePackIds.has(value))
    ))

    fs.writeFileSync(optionsPath, `${lines.join(eol)}${hadTrailingNewline || !existing ? eol : ''}`, 'utf8')
  }

  const disableManagedThaiResourcePacksInOptions = (gameDirectory: string) => {
    const optionsPath = path.join(gameDirectory, 'options.txt')
    if (!fs.existsSync(optionsPath)) return

    const existing = fs.readFileSync(optionsPath, 'utf8')
    const eol = existing.includes('\r\n') ? '\r\n' : '\n'
    const hadTrailingNewline = /\r?\n$/.test(existing)
    const lines = existing.replace(/\r?\n$/, '').split(/\r?\n/)
    const managedIds = new Set([
      `file/${THAI_RESOURCE_PACK_FILE}`,
      ...LEGACY_THAI_RESOURCE_PACK_ENTRIES.map((legacyEntry) => `file/${legacyEntry}`)
    ])

    updateMinecraftOptionList(lines, 'resourcePacks', (values) => (
      values.filter((value) => !managedIds.has(value))
    ))
    updateMinecraftOptionList(lines, 'incompatibleResourcePacks', (values) => (
      values.filter((value) => !managedIds.has(value))
    ))
    fs.writeFileSync(optionsPath, `${lines.join(eol)}${hadTrailingNewline ? eol : ''}`, 'utf8')
  }

  const provisionThaiResourcePack = (instance: ReturnType<typeof normalizeInstance>) => {
    const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)
    assertInstancePathIsSafe(instanceRoot)
    ensureDir(gameDirectory)

    const bundledPath = getBundledThaiResourcePackPath()
    if (!bundledPath) throw new Error('Bundled Thai font resource pack failed integrity verification.')

    const resourcePacksDirectory = path.join(gameDirectory, 'resourcepacks')
    const destinationPath = path.join(resourcePacksDirectory, THAI_RESOURCE_PACK_FILE)
    ensureDir(resourcePacksDirectory)
    for (const legacyEntry of LEGACY_THAI_RESOURCE_PACK_ENTRIES) {
      const legacyPath = path.join(resourcePacksDirectory, legacyEntry)
      if (!isPathInside(legacyPath, resourcePacksDirectory) || !fs.existsSync(legacyPath)) continue
      try {
        const quarantinePath = `${legacyPath}.disabled-namlauncher-recovery-${Date.now()}-${crypto.randomUUID()}`
        fs.renameSync(legacyPath, quarantinePath)
        log.info(`Disabled legacy NamLauncher Thai font resource pack: ${legacyPath}`)
      } catch (err) {
        log.warn(`Could not disable legacy NamLauncher Thai font resource pack: ${legacyPath}`, getCompactErrorLog(err))
      }
    }

    if (getFileSha256(destinationPath) !== THAI_RESOURCE_PACK_SHA256) {
      const temporaryPath = `${destinationPath}.${crypto.randomUUID()}.tmp`
      fs.copyFileSync(bundledPath, temporaryPath)
      if (getFileSha256(temporaryPath) !== THAI_RESOURCE_PACK_SHA256) {
        fs.rmSync(temporaryPath, { force: true })
        throw new Error('Thai font resource pack copy failed integrity verification.')
      }
      fs.rmSync(destinationPath, { force: true })
      fs.renameSync(temporaryPath, destinationPath)
    }

    enableResourcePackInOptions(gameDirectory, THAI_RESOURCE_PACK_FILE)
    writeJsonFile(path.join(instanceRoot, THAI_RESOURCE_PACK_MARKER), {
      version: 2,
      filename: THAI_RESOURCE_PACK_FILE,
      sha256: THAI_RESOURCE_PACK_SHA256,
      enabledByDefault: true,
      installedAt: new Date().toISOString()
    })

    return {
      filename: THAI_RESOURCE_PACK_FILE,
      enabled: true,
      sha256: THAI_RESOURCE_PACK_SHA256
    }
  }

  const instanceHasAllPartnerServers = async (serversPath: string) => {
    try {
      const stored = (await readMinecraftServersDat(serversPath)).servers
      const existingKeys = new Set(stored.map((server: any) => server.canonicalKey))
      return PARTNER_SERVERS.every((partner: any) => (
        existingKeys.has(normalizeMinecraftServerEndpoint(partner.address).canonicalKey)
      ))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  const provisionPartnerServers = async (instance: ReturnType<typeof normalizeInstance>) => {
    const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)
    assertInstancePathIsSafe(instanceRoot)
    ensureDir(gameDirectory)

    const serversPath = path.join(gameDirectory, 'servers.dat')
    const markerPath = path.join(instanceRoot, PARTNER_SERVERS_MARKER)
    assertChildPathIsSafe(instanceRoot, markerPath)
    const marker = readJsonFile<{ revision?: number }>(markerPath, {})
    if (marker.revision === PARTNER_SERVER_REVISION && await instanceHasAllPartnerServers(serversPath)) {
      return {
        revision: PARTNER_SERVER_REVISION,
        changed: false,
        skipped: true,
        addedServerIds: [] as string[]
      }
    }

    const result = await mergePartnerServersDat(serversPath)
    writeJsonFile(markerPath, {
      revision: PARTNER_SERVER_REVISION,
      installedAt: new Date().toISOString(),
      addedServerIds: result.addedServerIds
    })
    return {
      revision: PARTNER_SERVER_REVISION,
      skipped: false,
      ...result
    }
  }

  const provisionInstanceDefaults = async (instance: ReturnType<typeof normalizeInstance>) => ({
    resourcePack: provisionThaiResourcePack(instance),
    partnerServers: await provisionPartnerServers(instance)
  })

  const createInstanceRunLog = (
    instance: ReturnType<typeof normalizeInstance>,
    _instanceRoot: string
  ) => {
    writeRunLog(null, `NamLauncher launch started for ${instance.name}`, instance)
    writeRunLog(null, `NamLauncher ${app.getVersion()} on ${process.platform}/${process.arch}`, instance)
    writeRunLog(null, `Minecraft ${instance.version} ${instance.loader} ${instance.loaderVersion || ''}`, instance)
    return null
  }

  const createRunLogEntry = (message: string) => {
    const at = new Date().toISOString()
    const text = redactSensitiveText(message).replace(/\r?\n$/, '')
    return {
      at,
      text,
      line: `[${at}] ${text}`
    }
  }

  const writeRunLog = (
    stream: NodeFs.WriteStream | null | undefined,
    message: string,
    instance?: ReturnType<typeof normalizeInstance>
  ) => {
    const entry = createRunLogEntry(message)
    if (stream && !stream.destroyed) {
      stream.write(`${entry.line}\n`)
    }
    sendGameLog({
      ...entry,
      instanceId: instance?.id || null,
      instanceName: instance?.name || null
    })
  }

  const closeRunLog = (
    stream: NodeFs.WriteStream | null | undefined,
    message?: string,
    instance?: ReturnType<typeof normalizeInstance>
  ) => {
    if (message) writeRunLog(stream, message, instance)
    if (stream && !stream.destroyed) stream.end()
  }

  const releaseChildProcessFromLauncher = (childProcess: any) => {
    try {
      childProcess?.stdout?.unref?.()
      childProcess?.stderr?.unref?.()
      childProcess?.stdin?.unref?.()
      childProcess?.unref?.()
    } catch (err) {
      log.debug('Failed to unref Minecraft process handles.', err)
    }
  }

  const releaseRunningGamesForLauncherExit = () => {
    const telemetryFlushes: Promise<void>[] = []
    for (const game of runningGames.values()) {
      if (game.telemetryActive) {
        telemetryFlushes.push(queueGameSessionEvent(game, 'end', { endReason: 'launcher-exit' }))
      }
      if (game.badgePresenceActive) {
        telemetryFlushes.push(queuePlayerBadgePresence(game, 'end'))
      }
      releaseChildProcessFromLauncher(game.process)
      closeRunLog(
        game.logStream,
        'Launcher closed. Minecraft continues running in detached mode.'
      )
      game.logStream = null
    }
    return Promise.allSettled(telemetryFlushes).then(() => undefined)
  }

  const publishLauncherUpdate = async () => {
    const update = await checkLauncherUpdate()
    if (!deps.mainWindow || deps.mainWindow.isDestroyed() || deps.mainWindow.webContents.isDestroyed()) return update
    deps.mainWindow.webContents.send('launcher-update', update)
    return update
  }

  async function checkLauncherUpdateFromTray() {
    showMainWindow()
    const update = await publishLauncherUpdate()
    if (update.updateAvailable) return update

    const thai = getTrayLanguage() === 'th'
    const updateError = 'error' in update ? String(update.error || '') : ''
    const options: MessageBoxOptions = {
      type: updateError ? 'warning' : 'info',
      buttons: [thai ? 'ตกลง' : 'OK'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: thai ? 'ตรวจสอบอัปเดต NamLauncher' : 'NamLauncher update check',
      message: updateError
        ? (thai ? 'ยังตรวจสอบอัปเดตไม่ได้ในขณะนี้' : 'NamLauncher could not check for updates right now.')
        : (thai ? 'NamLauncher เป็นเวอร์ชันล่าสุดแล้ว' : 'NamLauncher is up to date.'),
      detail: updateError || `Version ${update.currentVersion}`
    }
    if (deps.mainWindow && !deps.mainWindow.isDestroyed()) await dialog.showMessageBox(deps.mainWindow, options)
    else await dialog.showMessageBox(options)
    return update
  }

  const configureLauncherUpdateChecks = () => {
    if (launcherUpdateTimer) clearInterval(launcherUpdateTimer)
    launcherUpdateTimer = setInterval(() => {
      publishLauncherUpdate().catch((err) => log.debug('Scheduled launcher update check failed.', getCompactErrorLog(err)))
    }, LAUNCHER_UPDATE_CHECK_INTERVAL_MS)
  }

  const stopLauncherUpdateChecks = () => {
    if (!launcherUpdateTimer) return
    clearInterval(launcherUpdateTimer)
    launcherUpdateTimer = null
  }

  const readTextFileTail = (filePath: string, maxBytes: number) => {
    if (!fs.existsSync(filePath)) {
      return {
        content: '',
        exists: false,
        truncated: false
      }
    }

    const stat = fs.statSync(filePath)
    const start = Math.max(0, stat.size - maxBytes)
    const length = stat.size - start
    const buffer = Buffer.alloc(length)
    const fd = fs.openSync(filePath, 'r')

    try {
      fs.readSync(fd, buffer, 0, length, start)
    } finally {
      fs.closeSync(fd)
    }

    return {
      content: buffer.toString('utf8'),
      exists: true,
      truncated: start > 0
    }
  }

  const readTextFileHeadAndTail = (filePath: string, headBytes: number, tailBytes: number) => {
    if (!fs.existsSync(filePath)) {
      return {
        content: '',
        exists: false,
        truncated: false
      }
    }

    const stat = fs.statSync(filePath)
    const totalBytes = Math.max(0, headBytes) + Math.max(0, tailBytes)
    if (stat.size <= totalBytes) {
      return {
        content: fs.readFileSync(filePath, 'utf8'),
        exists: true,
        truncated: false
      }
    }

    const head = Buffer.alloc(Math.max(0, headBytes))
    const tail = Buffer.alloc(Math.max(0, tailBytes))
    const fd = fs.openSync(filePath, 'r')
    try {
      fs.readSync(fd, head, 0, head.length, 0)
      fs.readSync(fd, tail, 0, tail.length, Math.max(0, stat.size - tail.length))
    } finally {
      fs.closeSync(fd)
    }

    return {
      content: `${head.toString('utf8')}\n\n[NamLauncher] middle of file omitted; preserving crash header and tail.\n\n${tail.toString('utf8')}`,
      exists: true,
      truncated: true
    }
  }

  const getLatestCrashReportPath = (gameDirectory: string, since = 0) => {
    const crashReportsDirectory = path.join(gameDirectory, 'crash-reports')
    if (!fs.existsSync(crashReportsDirectory)) return ''

    return fs.readdirSync(crashReportsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
      .map((entry) => {
        const filePath = path.join(crashReportsDirectory, entry.name)
        return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
      })
      .filter((entry) => entry.mtimeMs >= since)
      .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath || ''
  }

  const buildDiagnosticExcerpt = (value: string, headLines: number, tailLines: number) => {
    const lines = value.split(/\r?\n/)
    if (lines.length <= headLines + tailLines) return value

    const selected = new Set<number>()
    for (let index = 0; index < Math.min(headLines, lines.length); index += 1) selected.add(index)
    for (let index = Math.max(0, lines.length - tailLines); index < lines.length; index += 1) selected.add(index)

    const signalPattern = /(?:caused by:|exception|error|failed|fatal|crash|mixin|requires\b|incompatible|glfw|renderer|noclass|nosuch|unsatisfiedlink)/i
    for (let index = 0; index < lines.length; index += 1) {
      if (!signalPattern.test(lines[index])) continue
      for (let offset = -2; offset <= 4; offset += 1) {
        const candidate = index + offset
        if (candidate >= 0 && candidate < lines.length) selected.add(candidate)
      }
    }

    const ordered = [...selected].sort((left, right) => left - right)
    const output: string[] = []
    let previous = -2
    for (const index of ordered) {
      if (index > previous + 1) output.push('[... lines omitted ...]')
      output.push(lines[index])
      previous = index
    }
    return output.join('\n')
  }

  const buildInstanceCrashLog = (instance: ReturnType<typeof normalizeInstance>, since = 0) => {
    const { instanceRoot, gameDirectory } = getInstancePaths(instance)
    const latestLogPath = path.join(gameDirectory, 'logs', 'latest.log')
    const latestCrashReportPath = getLatestCrashReportPath(gameDirectory, since)
    const combinedLogPath = path.join(instanceRoot, 'crash_logs.txt')
    // Only current-launch files may determine ownership; an old companion crash
    // must not turn a new third-party mod issue into an automatic report.
    const latestLogIsCurrent = since === 0 || (fs.existsSync(latestLogPath) && fs.statSync(latestLogPath).mtimeMs >= since)
    const latestLog = latestLogIsCurrent ? readTextFileTail(latestLogPath, 512 * 1024) : {
      content: '', exists: false, truncated: false
    }
    const crashReport = latestCrashReportPath ? readTextFileHeadAndTail(latestCrashReportPath, 192 * 1024, 128 * 1024) : {
      content: '',
      exists: false,
      truncated: false
    }
    const launcherLog = readTextFileTail(logPath, 256 * 1024)
    const sections = [
      `NamLauncher combined instance logs`,
      `Generated: ${new Date().toISOString()}`,
      `Instance: ${instance.name}`,
      `Minecraft: ${instance.version} ${instance.loader} ${instance.loaderVersion || ''}`,
      '',
      `===== Game latest.log (${latestLogPath}) =====`,
      latestLog.exists
        ? `${latestLog.truncated ? '[NamLauncher] latest.log was truncated to the latest 512 KiB.\n' : ''}${redactSensitiveText(latestLog.content)}`
        : '[NamLauncher] latest.log was not found.',
      '',
      `===== Latest crash report (${latestCrashReportPath || 'none'}) =====`,
      crashReport.exists
        ? `${crashReport.truncated ? '[NamLauncher] crash report was truncated while preserving its header and tail.\n' : ''}${redactSensitiveText(crashReport.content)}`
        : '[NamLauncher] No crash report was found.',
      '',
      `===== Launcher app log (${logPath}) =====`,
      launcherLog.exists
        ? `${launcherLog.truncated ? '[NamLauncher] launcher log was truncated to the latest 256 KiB.\n' : ''}${sanitizeBugReport(launcherLog.content)}`
        : '[NamLauncher] Launcher app log was not found.',
      ''
    ]
    const content = sections.join('\n')
    const diagnosticExcerpt = truncateRemoteText([
      '===== Crash report diagnostic excerpt =====',
      crashReport.exists
        ? redactSensitiveText(buildDiagnosticExcerpt(crashReport.content, 90, 45))
        : '[NamLauncher] No crash report was found.',
      '',
      '===== latest.log diagnostic excerpt =====',
      latestLog.exists
        ? redactSensitiveText(buildDiagnosticExcerpt(latestLog.content, 25, 90))
        : '[NamLauncher] latest.log was not found.'
    ].join('\n'), 9000)

    ensureDir(instanceRoot)
    fs.writeFileSync(combinedLogPath, content, 'utf8')

    return {
      content,
      diagnosticExcerpt,
      path: combinedLogPath,
      exists: true,
      truncated: latestLog.truncated || crashReport.truncated || launcherLog.truncated,
      latestLogPath,
      latestCrashReportPath: latestCrashReportPath || null,
      launcherLogPath: logPath
    }
  }

  const getInstanceRunLog = (request: LaunchRequest) => {
    return buildInstanceCrashLog(normalizeInstance(request))
  }

  const assertInstancePathIsSafe = (targetPath: string) => {
    const instancesRoot = path.resolve(userDataPath, 'instances')
    assertPathWithinRoot(instancesRoot, targetPath)
  }

  const assertChildPathIsSafe = (parentPath: string, targetPath: string) => {
    assertPathWithinRoot(parentPath, targetPath, { allowRoot: true })
  }

  const getInstancePlacesPaths = (instance: ReturnType<typeof normalizeInstance>) => {
    const { instanceRoot, gameDirectory } = getInstancePaths(instance)
    assertInstancePathIsSafe(instanceRoot)
    assertChildPathIsSafe(instanceRoot, gameDirectory)
    const serversPath = path.join(gameDirectory, 'servers.dat')
    const savesDirectory = path.join(gameDirectory, 'saves')
    assertChildPathIsSafe(instanceRoot, serversPath)
    assertChildPathIsSafe(instanceRoot, savesDirectory)
    return {
      instanceRoot,
      gameDirectory,
      serversPath
    }
  }

  const readInstanceServers = async (instance: ReturnType<typeof normalizeInstance>) => {
    const { serversPath } = getInstancePlacesPaths(instance)
    try {
      return (await readMinecraftServersDat(serversPath)).servers
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  const readWorldIconDataUrl = (gameDirectory: string, iconPath: string | null) => {
    if (!iconPath) return null
    try {
      const savesDirectory = path.join(gameDirectory, 'saves')
      const resolvedPath = fs.realpathSync(iconPath)
      assertChildPathIsSafe(savesDirectory, resolvedPath)
      const info = fs.lstatSync(resolvedPath)
      if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > 512 * 1024) return null
      const content = fs.readFileSync(resolvedPath)
      if (content.length < 8 || !content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return null
      }
      return `data:image/png;base64,${content.toString('base64')}`
    } catch {
      return null
    }
  }

  const serializeMinecraftWorld = (
    world: Awaited<ReturnType<typeof scanMinecraftWorlds>>['worlds'][number],
    gameDirectory: string
  ) => ({
    folderName: world.folderName,
    displayName: world.displayName,
    iconDataUrl: readWorldIconDataUrl(gameDirectory, world.iconPath),
    recoveredFromBackup: world.recoveredFromBackup,
    lastPlayedAt: world.lastPlayedAt,
    gameMode: world.gameMode,
    difficulty: world.difficulty,
    hardcore: world.hardcore,
    allowCommands: world.allowCommands,
    minecraftVersion: world.minecraftVersion,
    dataVersion: world.dataVersion
  })

  const getInstancePlaces = async (request: LaunchRequest) => {
    const instance = normalizeInstance(request)
    const { gameDirectory } = getInstancePlacesPaths(instance)
    const [worldResult, servers] = await Promise.all([
      scanMinecraftWorlds(gameDirectory),
      readInstanceServers(instance)
    ])
    return {
      worlds: worldResult.worlds.map((world: any) => serializeMinecraftWorld(world, gameDirectory)),
      worldFailures: worldResult.failures.map((failure: any) => ({
        folderName: failure.folderName,
        message: failure.message
      })),
      servers
    }
  }

  const mapWithConcurrency = async <Input, Output>(
    values: readonly Input[],
    concurrency: number,
    worker: (value: Input, index: number) => Promise<Output>
  ) => {
    const output = new Array<Output>(values.length)
    let nextIndex = 0
    const runners = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex
        nextIndex += 1
        output[index] = await worker(values[index], index)
      }
    })
    await Promise.all(runners)
    return output
  }

  const pingInstanceServers = async (request: InstanceServerPingRequest) => {
    const instance = normalizeInstance(request)
    const targets = selectMinecraftServerPingTargets(await readInstanceServers(instance), request.addresses)
    return mapWithConcurrency<any, any>(targets, 8, async ({ server, requestedAddresses }) => {
      if (!server.canonicalKey) {
        return {
          index: server.index,
          name: server.name,
          canonicalKey: null,
          address: server.address,
          requestedAddresses,
          iconDataUrl: server.iconDataUrl,
          online: false,
          errorCode: 'INVALID_ADDRESS',
          errorMessage: 'Minecraft server address is invalid.'
        }
      }
      try {
        const status = await pingMinecraftServer(server.address, { timeoutMs: 2_500 })
        return {
          index: server.index,
          name: server.name,
          canonicalKey: server.canonicalKey,
          address: server.address,
          requestedAddresses,
          iconDataUrl: server.iconDataUrl,
          online: true,
          status
        }
      } catch (error) {
        return {
          index: server.index,
          name: server.name,
          canonicalKey: server.canonicalKey,
          address: server.address,
          requestedAddresses,
          iconDataUrl: server.iconDataUrl,
          online: false,
          errorCode: String((error as { code?: unknown })?.code || 'NETWORK'),
          errorMessage: error instanceof Error ? error.message : 'Could not connect to Minecraft server.'
        }
      }
    })
  }

  const validateQuickPlayRequest = async (
    request: LaunchRequest,
    instance: ReturnType<typeof normalizeInstance>
  ) => {
    const quickPlay = request.quickPlay
    if (!quickPlay) return null

    if (quickPlay.type === 'server') {
      const endpoint = normalizeMinecraftServerEndpoint(String(quickPlay.address || ''))
      const servers = await readInstanceServers(instance)
      if (!servers.some((server: any) => server.canonicalKey === endpoint.canonicalKey)) {
        throw new Error('Refresh the instance server list before joining this server.')
      }
      return createServerQuickPlay(endpoint, instance.version)
    }

    if (quickPlay.type === 'world') {
      const folderName = String(quickPlay.folderName || '')
      if (!folderName || folderName !== path.basename(folderName) || folderName.length > 255) {
        throw new Error('Minecraft world folder name is invalid.')
      }
      const { gameDirectory } = getInstancePlacesPaths(instance)
      const worlds = await scanMinecraftWorlds(gameDirectory)
      if (!worlds.worlds.some((world: any) => world.folderName === folderName)) {
        throw new Error('Refresh the instance world list before opening this world.')
      }
      return createWorldQuickPlay(folderName, instance.version)
    }

    throw new Error('Minecraft quick play request is invalid.')
  }
  return {
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
  }
}
