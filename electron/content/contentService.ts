// Author/creator: nattapat2871 (https://nattapat2871.me)
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { reconcileMatchingContentFileCollision } from '../contentFileCollision.ts'
import { isManagedBrandingBridgeFile, listManagedBrandingBridgeFiles } from '../minecraft/brandingBridge.ts'
import { getModrinthPackFileIdentity, planModpackClientFiles } from '../../shared/modpackCompatibility.ts'
import {
  buildModrinthSearchFacets,
  isLibraryLoader,
  normalizeLibraryGameVersion,
  normalizeLibrarySearchFilters,
  normalizeLibrarySearchLimit,
  normalizeLibrarySearchOffset,
  normalizeLibrarySearchQuery,
  normalizeLibraryTotalHits
} from '../../shared/librarySearchFilters.ts'
import type { LoaderType } from '../loaderSupport.ts'
import type {
  ContentProvider,
  ContentUpdateItem,
  CurseForgeContentStatusRequest,
  CurseForgeFile,
  CurseForgeInstallRequest,
  CurseForgeManualDownload,
  CurseForgeManualDownloadRequest,
  CurseForgeMod,
  CurseForgePackManifest,
  CurseForgeProject,
  CurseForgeSearchRequest,
  ExportInstanceMrpackResult,
  InstalledContentFile,
  InstalledContentRecord,
  InstalledModrinthItem,
  InstanceContentKind,
  InstanceContentImportProgress,
  InstanceContentManifest,
  InstanceContentRequest,
  LaunchRequest,
  LauncherInstance,
  ModrinthContentStatusRequest,
  ModrinthInstallRequest,
  ModrinthPackFile,
  ModrinthPackIndex,
  ModrinthProjectType,
  ModrinthSearchRequest,
  ModrinthVersion,
  ModrinthVersionFile
} from '../main.ts'

type ContentServiceDependencies = {
  [key: string]: any
  ensureDir: (directory: string) => void
  log: typeof import('electron-log').default
  modrinthVersionCache: Map<string, { versions: ModrinthVersion[]; storedAt: number }>
  modrinthVersionRequests: Map<string, Promise<ModrinthVersion[]>>
  normalizeInstance: (request: LaunchRequest) => any
  readJsonFile: <T>(filePath: string, fallback: T) => T
  requestCurseForge: <T>(endpoint: string, config?: Record<string, any>) => Promise<import('axios').AxiosResponse<T>>
  requestModrinth: <T>(url: string, config?: Record<string, any>) => Promise<T>
}

export const createContentService = (deps: ContentServiceDependencies) => {
  const {
    normalizeInstance, getInstancePaths, readJsonFile, writeJsonFile, hasActiveMinecraft,
    assertChildPathIsSafe, runningGames, activeLaunches, requestModrinth, modrinthVersionCache,
    MODRINTH_VERSION_CACHE_TTL_MS, modrinthVersionRequests, MODRINTH_API_BASE,
    setCachedModrinthVersions, throwIfInstallCancelled, DOWNLOAD_INTEGRITY_ERROR_CODE,
    HTTP_HEADERS, ensureInstanceRoot, assertInstancePathIsSafe, sendProgress, yieldToEventLoop,
    sanitizeBugReport, MAX_CONTENT_DOWNLOAD_BYTES, withFileDownloadLock, INSTALL_CANCELLED_MESSAGE,
    isInstallCancelledError, shouldRetryDownloadError, getGenericRetryAfterMs, getCompactErrorLog,
    waitForModrinthRetry, userDataPath, MAX_MODPACK_ICON_BYTES, MAX_MODPACK_INDEX_BYTES,
    MAX_ZIP_METADATA_ENTRY_BYTES, MAX_MODPACK_OVERRIDE_FILES, MAX_MODPACK_OVERRIDE_ENTRY_BYTES,
    MAX_MODPACK_OVERRIDE_TOTAL_BYTES, provisionInstanceDefaults, isPathInside, CURSEFORGE_CLASS_IDS,
    getCachedProjectSearchResult, projectSearchInFlight, setCachedProjectSearchResult,
    shouldRetryModrinthRequest, shouldFallbackToModrinthProxy, requestCurseForge,
    getCurseForgeFailureMessage, ensureDir, log
  } = deps

  const getContentManifestPath = (instance: ReturnType<typeof normalizeInstance>) => {
    const { instanceRoot } = getInstancePaths(instance)
    return path.join(instanceRoot, 'namlauncher-content.json')
  }

  const readContentManifest = (instance: ReturnType<typeof normalizeInstance>): InstanceContentManifest => {
    const manifest = readJsonFile<InstanceContentManifest>(getContentManifestPath(instance), {
      version: 1,
      projects: {}
    })

    return {
      version: 1,
      projects: manifest.projects && typeof manifest.projects === 'object' ? manifest.projects : {}
    }
  }

  const writeContentManifest = (
    instance: ReturnType<typeof normalizeInstance>,
    manifest: InstanceContentManifest
  ) => {
    writeJsonFile(getContentManifestPath(instance), manifest)
  }

  const listInstanceMods = (instance: ReturnType<typeof normalizeInstance>) => {
    const { instanceRoot, gameDirectory } = getInstancePaths(instance)
    const modsDirectory = path.join(gameDirectory, 'mods')

    if (!fs.existsSync(modsDirectory)) return []
    const managedFiles = new Set(listManagedBrandingBridgeFiles({ instanceRoot, gameDirectory }).map((file) => path.resolve(file)))

    return fs.readdirSync(modsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile()
        && entry.name.toLowerCase().endsWith('.jar')
        && !managedFiles.has(path.resolve(modsDirectory, entry.name)))
      .map((entry) => {
        const filePath = path.join(modsDirectory, entry.name)
        const stat = fs.statSync(filePath)
        return {
          name: entry.name,
          size: stat.size,
          updatedAt: stat.mtime.toISOString()
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const normalizeContentKind = (kind?: string): InstanceContentKind => {
    if (kind === 'resourcepacks' || kind === 'shaderpacks' || kind === 'screenshots') return kind
    return 'mods'
  }

  const getContentDirectory = (gameDirectory: string, kind: InstanceContentKind) => {
    if (kind === 'resourcepacks') return path.join(gameDirectory, 'resourcepacks')
    if (kind === 'shaderpacks') return path.join(gameDirectory, 'shaderpacks')
    if (kind === 'screenshots') return path.join(gameDirectory, 'screenshots')
    return path.join(gameDirectory, 'mods')
  }

  const stripDisableSuffix = (filename: string) => filename.replace(/\.(disable|disabled)$/i, '')

  const isDisabledContentFile = (filename: string) => /\.(disable|disabled)$/i.test(filename)

  const isContentFileForKind = (kind: InstanceContentKind, filename: string) => {
    const enabledName = stripDisableSuffix(filename).toLowerCase()
    if (kind === 'mods') return enabledName.endsWith('.jar') || enabledName.endsWith('.litemod')
    if (kind === 'screenshots') return /\.(png|jpe?g|webp)$/i.test(enabledName)
    return enabledName.endsWith('.zip')
  }

  const getInstanceContentId = (contentDirectory: string, fileName: string) => {
    const canonicalPath = path.join(contentDirectory, stripDisableSuffix(fileName))
    return crypto.createHash('sha1').update(canonicalPath).digest('hex')
  }

  const getContentKindFileLabel = (kind: InstanceContentKind) => {
    if (kind === 'mods') return 'mod'
    if (kind === 'resourcepacks') return 'resource pack'
    if (kind === 'shaderpacks') return 'shader pack'
    return 'screenshot'
  }

  const assertArchiveContentReadable = (filePath: string, kind: InstanceContentKind) => {
    if (kind === 'screenshots') return
    try {
      const zip = new AdmZip(filePath)
      zip.getEntries()
    } catch {
      throw new Error(`The selected ${getContentKindFileLabel(kind)} is not a valid ZIP/JAR archive. Download it again before importing.`)
    }
  }

  const getLocalImageDataUrl = (filePath: string) => {
    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile() || stat.size > 16 * 1024 * 1024) return null
      const data = fs.readFileSync(filePath)
      return `data:${getMimeType(filePath)};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  }

  const getMimeType = (filename: string) => {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
    if (lower.endsWith('.webp')) return 'image/webp'
    return 'image/png'
  }

  const getZipEntryDataUrl = (zip: AdmZip, entryName?: string | null) => {
    if (!entryName) return null
    const normalizedName = entryName.replace(/^\/+/, '')
    const entry = zip.getEntry(normalizedName)
      || zip.getEntries().find((candidate) => candidate.entryName.toLowerCase() === normalizedName.toLowerCase())
      || zip.getEntries().find((candidate) => path.basename(candidate.entryName).toLowerCase() === path.basename(normalizedName).toLowerCase())

    if (!entry || entry.isDirectory) return null

    try {
      const data = getZipEntryDataWithLimit(entry, MAX_ZIP_METADATA_ENTRY_BYTES, 'ZIP image entry')
      return `data:${getMimeType(entry.entryName)};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  }

  const getFabricIconPath = (metadata: any) => {
    const icon = metadata?.icon
    if (typeof icon === 'string') return icon
    if (icon && typeof icon === 'object') {
      const entries = Object.entries(icon)
        .filter(([, value]) => typeof value === 'string')
        .sort(([a], [b]) => Number(b) - Number(a))
      return entries[0]?.[1] as string | undefined
    }
    return null
  }

  const getQuiltIconPath = (metadata: any) => {
    const icon = metadata?.quilt_loader?.metadata?.icon || metadata?.quilt_loader?.metadata?.icon_url
    return typeof icon === 'string' ? icon : null
  }

  const getForgeLogoPath = (modsToml: string) => {
    const match = modsToml.match(/logoFile\s*=\s*["']([^"']+)["']/i)
    return match?.[1] || null
  }

  const readZipJsonEntry = (zip: AdmZip, entryName: string) => {
    const entry = zip.getEntry(entryName)
    if (!entry) return null

    try {
      return JSON.parse(getZipEntryDataWithLimit(entry, MAX_ZIP_METADATA_ENTRY_BYTES, entryName).toString('utf8'))
    } catch {
      return null
    }
  }

  const getZipEntrySize = (entry: AdmZip.IZipEntry) => {
    const size = Number(entry.header?.size ?? 0)
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`Archive entry ${entry.entryName} has an invalid size.`)
    }
    return size
  }

  const getZipEntryDataWithLimit = (entry: AdmZip.IZipEntry, maxBytes: number, label: string) => {
    const expectedSize = getZipEntrySize(entry)
    if (expectedSize > maxBytes) {
      throw new Error(`${label} is too large to process safely.`)
    }

    const data = entry.getData()
    if (data.length > maxBytes) {
      throw new Error(`${label} expanded beyond the safe size limit.`)
    }
    return data
  }

  const preflightModpackOverrideEntries = (entries: AdmZip.IZipEntry[], label: string) => {
    if (entries.length > MAX_MODPACK_OVERRIDE_FILES) {
      throw new Error(`${label} contains too many override files to extract safely.`)
    }

    let totalSize = 0
    for (const entry of entries) {
      const entrySize = getZipEntrySize(entry)
      if (entrySize > MAX_MODPACK_OVERRIDE_ENTRY_BYTES) {
        throw new Error(`${label} contains an override file that is too large to extract safely.`)
      }
      totalSize += entrySize
      if (totalSize > MAX_MODPACK_OVERRIDE_TOTAL_BYTES) {
        throw new Error(`${label} overrides are too large to extract safely.`)
      }
    }
  }

  const writeZipEntryToFile = (entry: AdmZip.IZipEntry, targetPath: string, label: string) => {
    const data = getZipEntryDataWithLimit(entry, MAX_MODPACK_OVERRIDE_ENTRY_BYTES, label)
    ensureDir(path.dirname(targetPath))
    fs.writeFileSync(targetPath, data)
  }

  const getTomlString = (content: string, key: string) => {
    const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'im'))
    return match?.[1]?.trim() || null
  }

  const normalizeArchiveVersion = (value: unknown) => {
    const version = String(value || '').trim()
    if (!version || /^\$\{.+\}$/.test(version) || version === 'unknown') return null
    return version
  }

  const getArchiveContentMetadata = (filePath: string, kind: InstanceContentKind) => {
    try {
      if (kind === 'screenshots') {
        return { iconUrl: getLocalImageDataUrl(filePath), name: null, version: null }
      }

      const zip = new AdmZip(filePath)

      if (kind !== 'mods') {
        return { iconUrl: getZipEntryDataUrl(zip, 'pack.png'), name: null, version: null }
      }

      const fabricMetadata = readZipJsonEntry(zip, 'fabric.mod.json')
      if (fabricMetadata) {
        const metadata = fabricMetadata
        const icon = getFabricIconPath(metadata)
        return {
          iconUrl: getZipEntryDataUrl(zip, icon),
          name: String(metadata.name || metadata.id || '').trim() || null,
          version: normalizeArchiveVersion(metadata.version)
        }
      }

      const quiltMetadata = readZipJsonEntry(zip, 'quilt.mod.json')
      if (quiltMetadata) {
        const metadata = quiltMetadata
        const icon = getQuiltIconPath(metadata)
        const loaderMetadata = metadata.quilt_loader || metadata
        return {
          iconUrl: getZipEntryDataUrl(zip, icon),
          name: String(loaderMetadata?.metadata?.name || loaderMetadata?.id || '').trim() || null,
          version: normalizeArchiveVersion(loaderMetadata?.version)
        }
      }

      const forgeEntry = zip.getEntry('META-INF/mods.toml') || zip.getEntry('META-INF/neoforge.mods.toml')
      if (forgeEntry) {
        const content = getZipEntryDataWithLimit(forgeEntry, MAX_ZIP_METADATA_ENTRY_BYTES, 'Forge mod metadata').toString('utf8')
        const icon = getForgeLogoPath(content)
        return {
          iconUrl: getZipEntryDataUrl(zip, icon),
          name: getTomlString(content, 'displayName') || getTomlString(content, 'modId'),
          version: normalizeArchiveVersion(getTomlString(content, 'version'))
        }
      }

      const legacyMetadata = readZipJsonEntry(zip, 'mcmod.info')
      const legacyMod = Array.isArray(legacyMetadata) ? legacyMetadata[0] : legacyMetadata?.modList?.[0]
      return {
        iconUrl: getZipEntryDataUrl(zip, legacyMod?.logoFile || 'pack.png'),
        name: String(legacyMod?.name || legacyMod?.modid || '').trim() || null,
        version: normalizeArchiveVersion(legacyMod?.version)
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      log.debug(`Could not read content metadata for ${filePath}: ${detail}`)
      return { iconUrl: null, name: null, version: null }
    }
  }

  const findInstalledRecordForFile = (manifest: InstanceContentManifest, filePath: string, filename: string) => {
    const resolvedPath = path.resolve(filePath)
    const normalizedName = stripDisableSuffix(filename).toLowerCase()

    return Object.values(manifest.projects).find((record) => record.files.some((file) => {
      const storedPath = path.resolve(file.path)
      const storedName = stripDisableSuffix(path.basename(file.path)).toLowerCase()
      return storedPath === resolvedPath || storedName === normalizedName
    }))
  }

  const EMPTY_ARCHIVE_CONTENT_METADATA = Object.freeze({ iconUrl: null, name: null, version: null })
  const INSTANCE_CONTENT_YIELD_INTERVAL = 8

  const getInstanceContent = async (request: InstanceContentRequest) => {
    const instance = normalizeInstance({ instance: request.instance })
    const kind = normalizeContentKind(request.kind)
    const { instanceRoot, gameDirectory } = getInstancePaths(instance)
    const contentDirectory = getContentDirectory(gameDirectory, kind)
    const manifest = readContentManifest(instance)
    const lightweightWhilePlaying = hasActiveMinecraft() && kind !== 'screenshots'

    if (!fs.existsSync(contentDirectory)) return []

    const entries = fs.readdirSync(contentDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isContentFileForKind(kind, entry.name))
    const managedFiles = kind === 'mods'
      ? new Set(listManagedBrandingBridgeFiles({ instanceRoot, gameDirectory }).map((file) => path.resolve(file)))
      : new Set<string>()
    const items = []

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const filePath = path.join(contentDirectory, entry.name)
      if (managedFiles.has(path.resolve(filePath))) continue
      const stat = fs.statSync(filePath)
      const enabledName = stripDisableSuffix(entry.name)
      const record = findInstalledRecordForFile(manifest, filePath, entry.name)
      const archiveMetadata = lightweightWhilePlaying
        ? EMPTY_ARCHIVE_CONTENT_METADATA
        : getArchiveContentMetadata(filePath, kind)
      const iconDataUrl = record?.iconUrl || archiveMetadata.iconUrl
      items.push({
        id: getInstanceContentId(contentDirectory, entry.name),
        kind,
        name: archiveMetadata.name || record?.title || enabledName.replace(/\.(jar|litemod|zip|png|jpe?g|webp)$/i, ''),
        fileName: entry.name,
        enabledFileName: enabledName,
        filePath,
        enabled: !isDisabledContentFile(entry.name),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        iconUrl: iconDataUrl,
        projectId: record?.projectId || null,
        versionId: record?.versionId || null,
        versionNumber: archiveMetadata.version || record?.versionNumber || null,
        source: record?.provider || (record ? 'modrinth' : 'local')
      })

      if (!lightweightWhilePlaying && (index + 1) % INSTANCE_CONTENT_YIELD_INTERVAL === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    return items.sort((a, b) => kind === 'screenshots'
      ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      : a.name.localeCompare(b.name)
    )
  }

  const getSafeContentFilePath = (request: InstanceContentRequest) => {
    const instance = normalizeInstance({ instance: request.instance })
    const kind = normalizeContentKind(request.kind)
    const { gameDirectory } = getInstancePaths(instance)
    const contentDirectory = getContentDirectory(gameDirectory, kind)
    const fileName = String(request.fileName || '').trim()
    const contentId = String(request.contentId || '').trim().toLowerCase()

    if (
      !fileName
      || path.basename(fileName) !== fileName
      || !isContentFileForKind(kind, fileName)
      || !/^[a-f0-9]{40}$/.test(contentId)
    ) {
      throw new Error('Content selection is no longer current. Refresh the instance content and try again.')
    }

    const expectedContentId = getInstanceContentId(contentDirectory, fileName)
    if (contentId !== expectedContentId) {
      throw new Error('Content selection is no longer current. Refresh the instance content and try again.')
    }

    const filePath = path.join(contentDirectory, fileName)

    assertChildPathIsSafe(contentDirectory, filePath)
    return { instance, kind, gameDirectory, contentDirectory, filePath }
  }

  const isModContentMutation = (contentType: ModrinthProjectType | InstanceContentKind) => {
    return contentType === 'mod' || contentType === 'mods'
  }

  const assertInstanceContentMutable = (
    instance: ReturnType<typeof normalizeInstance>,
    contentType: ModrinthProjectType | InstanceContentKind
  ) => {
    if (!isModContentMutation(contentType)) return
    if (runningGames.has(instance.id) || activeLaunches.has(instance.id)) {
      throw new Error('Stop Minecraft before changing mods in this instance.')
    }
  }

  const assertContentFileIsNotLauncherManaged = (
    instance: ReturnType<typeof normalizeInstance>,
    kind: InstanceContentKind,
    gameDirectory: string,
    filePath: string
  ) => {
    if (kind === 'mods' && isManagedBrandingBridgeFile({
      instanceRoot: getInstancePaths(instance).instanceRoot,
      gameDirectory,
      filePath
    })) {
      throw new Error('This NamLauncher game component is maintained automatically and cannot be changed here.')
    }
  }

  const updateManifestFilePath = (
    instance: ReturnType<typeof normalizeInstance>,
    oldPath: string,
    nextPath: string | null
  ) => {
    const manifest = readContentManifest(instance)
    let changed = false

    Object.entries(manifest.projects).forEach(([projectId, record]) => {
      const seenPaths = new Set<string>()
      const nextFiles = record.files
        .map((file) => {
          if (path.resolve(file.path) !== path.resolve(oldPath)) return file
          changed = true
          return nextPath ? { ...file, path: nextPath, filename: path.basename(nextPath) } : null
        })
        .filter(Boolean) as InstalledContentFile[]

      const uniqueFiles = nextFiles.filter((file) => {
        const resolvedPath = path.resolve(file.path)
        if (seenPaths.has(resolvedPath)) {
          changed = true
          return false
        }
        seenPaths.add(resolvedPath)
        return true
      })

      if (uniqueFiles.length === 0) {
        delete manifest.projects[projectId]
        changed = true
        return
      }

      manifest.projects[projectId] = {
        ...record,
        files: uniqueFiles,
        updatedAt: new Date().toISOString()
      }
    })

    if (changed) writeContentManifest(instance, manifest)
  }

  const toggleInstanceContent = async (request: InstanceContentRequest) => {
    const { instance, kind, gameDirectory, filePath, contentDirectory } = getSafeContentFilePath(request)
    assertInstanceContentMutable(instance, kind)
    assertContentFileIsNotLauncherManaged(instance, kind, gameDirectory, filePath)
    if (!fs.existsSync(filePath)) throw new Error('Content file was not found.')

    const enable = Boolean(request.enabled)
    const filename = path.basename(filePath)
    const disabled = isDisabledContentFile(filename)
    let nextPath = filePath

    if (enable && disabled) {
      nextPath = path.join(path.dirname(filePath), stripDisableSuffix(filename))
    } else if (!enable && !disabled) {
      nextPath = `${filePath}.disable`
    }

    assertChildPathIsSafe(contentDirectory, nextPath)

    if (nextPath !== filePath) {
      if (fs.existsSync(nextPath)) {
        if (!await reconcileMatchingContentFileCollision(filePath, nextPath)) {
          throw new Error('A different file already uses the target enabled/disabled name. Remove one duplicate in the instance folder, refresh, and try again.')
        }
        updateManifestFilePath(instance, filePath, nextPath)
      } else {
        fs.renameSync(filePath, nextPath)
        updateManifestFilePath(instance, filePath, nextPath)
      }
    }

    const stat = fs.statSync(nextPath)
    return {
      success: true,
      filePath: nextPath,
      fileName: path.basename(nextPath),
      enabledFileName: stripDisableSuffix(path.basename(nextPath)),
      enabled: enable,
      updatedAt: stat.mtime.toISOString()
    }
  }

  const deleteInstanceContent = (request: InstanceContentRequest) => {
    const { instance, kind, gameDirectory, filePath } = getSafeContentFilePath(request)
    assertInstanceContentMutable(instance, kind)
    assertContentFileIsNotLauncherManaged(instance, kind, gameDirectory, filePath)
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
      updateManifestFilePath(instance, filePath, null)
    }

    return { success: true, deleted: !fs.existsSync(filePath) }
  }

  const getUniqueContentDestinationPath = (contentDirectory: string, filename: string) => {
    const parsed = path.parse(filename)
    let candidate = path.join(contentDirectory, filename)
    let index = 1

    while (fs.existsSync(candidate)) {
      candidate = path.join(contentDirectory, `${parsed.name} (${index})${parsed.ext}`)
      index += 1
    }

    return candidate
  }

  const sanitizeDroppedContentFilename = (filename: string) => {
    return path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  }

  const importInstanceContentFiles = async (
    request: InstanceContentRequest,
    onProgress?: (progress: InstanceContentImportProgress) => void
  ) => {
    const instance = normalizeInstance({ instance: request.instance })
    const kind = normalizeContentKind(request.kind)
    assertInstanceContentMutable(instance, kind)

    const { gameDirectory } = getInstancePaths(instance)
    const contentDirectory = getContentDirectory(gameDirectory, kind)
    ensureDir(contentDirectory)

    const filePaths = Array.from(new Set((request.filePaths || [])
      .map((filePath) => String(filePath || '').trim())
      .filter(Boolean)
    ))

    if (filePaths.length === 0) throw new Error('Drop one or more files to import.')

    const requestId = String(request.requestId || '').trim().slice(0, 128)
    const imported: Array<{ sourcePath: string; filePath: string; fileName: string }> = []
    const skipped: Array<{ sourcePath: string; reason: string }> = []
    const rejected: Array<{ sourcePath: string; reason: string }> = []
    const emitProgress = (phase: InstanceContentImportProgress['phase'], completed: number) => {
      if (!requestId || !onProgress) return
      onProgress({
        requestId,
        phase,
        completed,
        total: filePaths.length,
        imported: imported.length,
        skipped: skipped.length,
        rejected: rejected.length
      })
    }

    emitProgress('copying', 0)

    for (let index = 0; index < filePaths.length; index += 1) {
      const sourcePath = filePaths[index]
      try {
        const stat = fs.statSync(sourcePath)
        if (!stat.isFile()) {
          skipped.push({ sourcePath, reason: 'Not a file' })
          continue
        }

        const safeName = sanitizeDroppedContentFilename(path.basename(sourcePath))
        if (!safeName || !isContentFileForKind(kind, safeName) || isDisabledContentFile(safeName)) {
          rejected.push({ sourcePath, reason: `Unsupported file for ${kind}` })
          continue
        }

        assertArchiveContentReadable(sourcePath, kind)

        const sourceResolved = path.resolve(sourcePath)
        const destination = getUniqueContentDestinationPath(contentDirectory, safeName)
        const destinationResolved = path.resolve(destination)
        if (sourceResolved === destinationResolved) {
          skipped.push({ sourcePath, reason: 'Already in this folder' })
          continue
        }

        assertChildPathIsSafe(contentDirectory, destination)
        fs.copyFileSync(sourcePath, destination)
        imported.push({ sourcePath, filePath: destination, fileName: path.basename(destination) })
      } catch (err) {
        rejected.push({
          sourcePath,
          reason: err instanceof Error ? err.message : 'Could not import file'
        })
      }

      emitProgress('copying', index + 1)
      await yieldToEventLoop()
    }

    emitProgress('scanning', filePaths.length)

    return {
      success: imported.length > 0,
      kind,
      imported,
      skipped,
      rejected,
      content: await getInstanceContent({ instance, kind })
    }
  }

  const revealInstanceContentFile = (request: InstanceContentRequest) => {
    const { filePath, contentDirectory } = getSafeContentFilePath(request)
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath)
    } else {
      ensureDir(contentDirectory)
      shell.openPath(contentDirectory).catch(() => undefined)
    }
    return { success: true }
  }

  const normalizeModrinthProjectType = (value?: string): ModrinthProjectType => {
    if (value === 'modpack' || value === 'resourcepack' || value === 'shader') return value
    return 'mod'
  }

  const getModrinthLoaderFilters = (projectType: ModrinthProjectType, instance: ReturnType<typeof normalizeInstance>) => {
    if (projectType === 'mod') {
      if (instance.loader === 'vanilla') {
        throw new Error('Mods require a Fabric, Forge, Quilt, or NeoForge instance.')
      }
      return [instance.loader]
    }

    if (projectType === 'resourcepack') return ['minecraft']
    return []
  }

  const getModrinthInstallFolder = (projectType: ModrinthProjectType, gameDirectory: string) => {
    if (projectType === 'mod') return path.join(gameDirectory, 'mods')
    if (projectType === 'resourcepack') return path.join(gameDirectory, 'resourcepacks')
    if (projectType === 'shader') return path.join(gameDirectory, 'shaderpacks')
    throw new Error('Modpack installation is not supported yet.')
  }

  const isVersionCompatible = (
    version: ModrinthVersion,
    instance: ReturnType<typeof normalizeInstance>,
    loaderFilters: string[]
  ) => {
    if (!version.game_versions.includes(instance.version)) return false
    if (loaderFilters.length === 0) return true
    return loaderFilters.some((loader) => version.loaders.includes(loader))
  }

  const getProjectVersions = async (
    projectId: string,
    instance: ReturnType<typeof normalizeInstance>,
    loaderFilters: string[]
  ) => {
    const cacheKey = JSON.stringify({
      projectId,
      gameVersion: instance.version,
      loaders: [...loaderFilters].sort()
    })
    const cached = modrinthVersionCache.get(cacheKey)
    if (cached && Date.now() - cached.storedAt < MODRINTH_VERSION_CACHE_TTL_MS) {
      return cached.versions
    }
    if (cached) modrinthVersionCache.delete(cacheKey)

    const inFlight = modrinthVersionRequests.get(cacheKey)
    if (inFlight) return inFlight

    const request = requestModrinth<ModrinthVersion[]>(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version`, {
      params: {
        game_versions: JSON.stringify([instance.version]),
        ...(loaderFilters.length > 0 ? { loaders: JSON.stringify(loaderFilters) } : {}),
        include_changelog: false
      }
    }).then((versions) => {
      const normalized = Array.isArray(versions) ? versions : []
      setCachedModrinthVersions(cacheKey, normalized)
      return normalized
    }).finally(() => {
      modrinthVersionRequests.delete(cacheKey)
    })

    modrinthVersionRequests.set(cacheKey, request)
    return request
  }

  const getVersionById = async (versionId: string, signal?: AbortSignal) => {
    throwIfInstallCancelled(signal)
    return requestModrinth<ModrinthVersion>(`${MODRINTH_API_BASE}/version/${encodeURIComponent(versionId)}`, {
      params: {
        include_changelog: false
      },
      signal
    })
  }

  const selectProjectVersion = (versions: ModrinthVersion[]) => {
    const withFiles = versions.filter((version) => Array.isArray(version.files) && version.files.length > 0)
    return withFiles.find((version) => version.version_type === 'release') || withFiles[0] || null
  }

  const resolveCompatibleProjectVersion = async (
    projectId: string,
    projectType: ModrinthProjectType,
    instance: ReturnType<typeof normalizeInstance>,
    loaderFilters: string[]
  ) => {
    let versions = await getProjectVersions(projectId, instance, loaderFilters)
    if (versions.length === 0 && projectType !== 'mod' && loaderFilters.length > 0) {
      versions = await getProjectVersions(projectId, instance, [])
    }
    return selectProjectVersion(versions)
  }

  const getModrinthProjectId = (project?: ModrinthInstallRequest['project']) => {
    return String(project?.project_id || project?.id || project?.slug || '').trim()
  }

  const getModrinthProjectTitle = (project: ModrinthInstallRequest['project'], fallback: string) => {
    return String(project?.title || project?.slug || fallback)
  }

  const isInstallableModrinthFile = (projectType: ModrinthProjectType, file: ModrinthVersionFile) => {
    const filename = file.filename.toLowerCase()
    const ignoredTypes = ['sources-jar', 'dev-jar', 'javadoc-jar', 'signature']

    if (file.file_type && ignoredTypes.includes(file.file_type)) return false
    if (projectType === 'modpack') return filename.endsWith('.mrpack')
    if (projectType === 'mod') return filename.endsWith('.jar') || filename.endsWith('.litemod')
    if (projectType === 'resourcepack' || projectType === 'shader') return filename.endsWith('.zip')
    return false
  }

  const selectVersionFile = (projectType: ModrinthProjectType, version: ModrinthVersion) => {
    return version.files.find((file) => file.primary && isInstallableModrinthFile(projectType, file))
      || version.files.find((file) => isInstallableModrinthFile(projectType, file))
      || null
  }

  const sanitizeDownloadFileName = (filename: string) => {
    const safeName = path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim()
    return safeName || 'download.jar'
  }

  const assertModrinthDownloadUrl = (url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.modrinth.com') {
      throw new Error('Refusing to download a file from an unsupported host.')
    }
  }

  const assertModpackDownloadUrl = (url: string) => {
    const parsed = new URL(url)
    const allowedHosts = new Set([
      'cdn.modrinth.com',
      'github.com',
      'raw.githubusercontent.com',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com',
      'gitlab.com'
    ])

    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
      throw new Error(`Refusing to download an unsupported modpack file host: ${parsed.hostname}`)
    }
  }

  const resolveModpackRelativePath = (gameDirectory: string, relativePath: string) => {
    const rawPath = String(relativePath || '').replace(/\\/g, '/')
    const normalized = path.posix.normalize(rawPath).replace(/^\.\/+/, '')

    if (
      !normalized ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      /^[A-Za-z]:\//.test(rawPath) ||
      rawPath.startsWith('/')
    ) {
      throw new Error(`Unsafe modpack file path: ${relativePath}`)
    }

    const targetPath = path.join(gameDirectory, ...normalized.split('/').filter(Boolean))
    assertChildPathIsSafe(gameDirectory, targetPath)
    return targetPath
  }

  const hashFile = (filePath: string, algorithm: string) => new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(filePath)

    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })

  const verifyModrinthFile = async (filePath: string, file: ModrinthVersionFile) => {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false
    if (file.size && fs.statSync(filePath).size !== file.size) return false

    const sha512 = String(file.hashes?.sha512 || '').trim().toLowerCase()
    if (/^[a-f0-9]{128}$/.test(sha512)) {
      return (await hashFile(filePath, 'sha512')).toLowerCase() === sha512
    }
    const sha1 = String(file.hashes?.sha1 || '').trim().toLowerCase()
    if (/^[a-f0-9]{40}$/.test(sha1)) {
      return (await hashFile(filePath, 'sha1')).toLowerCase() === sha1
    }
    return false
  }

  type DownloadCandidateValidator = (candidatePath: string) => Promise<void>
  type DownloadRedirectValidator = (redirectUrl: string) => void

  const assertModrinthFileVerifiable = (file: ModrinthVersionFile, filename: string) => {
    const sha512 = String(file.hashes?.sha512 || '').trim()
    const sha1 = String(file.hashes?.sha1 || '').trim()
    if (/^[a-f0-9]{128}$/i.test(sha512) || /^[a-f0-9]{40}$/i.test(sha1)) return
    throw new Error(`Modrinth did not provide a supported checksum for ${filename}.`)
  }

  const createModrinthCandidateValidator = (
    file: ModrinthVersionFile,
    filename: string
  ): DownloadCandidateValidator => {
    assertModrinthFileVerifiable(file, filename)
    return async (candidatePath) => {
      if (await verifyModrinthFile(candidatePath, file)) return

      const error = new Error(`Downloaded file failed verification: ${filename}`) as Error & { code?: string }
      error.code = DOWNLOAD_INTEGRITY_ERROR_CODE
      throw error
    }
  }

  const getMrpackDependencies = (instance: ReturnType<typeof normalizeInstance>) => {
    const dependencies: Record<string, string> = {
      minecraft: instance.version
    }

    if (instance.loader === 'fabric' && instance.loaderVersion) {
      dependencies['fabric-loader'] = instance.loaderVersion
    } else if (instance.loader === 'forge' && instance.loaderVersion) {
      dependencies.forge = instance.loaderVersion
    } else if (instance.loader === 'quilt' && instance.loaderVersion) {
      dependencies['quilt-loader'] = instance.loaderVersion
    } else if (instance.loader === 'neoforge' && instance.loaderVersion) {
      dependencies.neoforge = instance.loaderVersion
    }

    return dependencies
  }

  const getEnabledExportContentFiles = (instance: ReturnType<typeof normalizeInstance>) => {
    const { gameDirectory } = getInstancePaths(instance)
    const manifest = readContentManifest(instance)
    const items: Array<{
      kind: InstanceContentKind
      filePath: string
      relativePath: string
      filename: string
      size: number
      record?: InstalledContentRecord
    }> = []

    ;(['mods', 'resourcepacks', 'shaderpacks'] as InstanceContentKind[]).forEach((kind) => {
      const directory = getContentDirectory(gameDirectory, kind)
      if (!fs.existsSync(directory)) return

      fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && isContentFileForKind(kind, entry.name) && !isDisabledContentFile(entry.name))
        .forEach((entry) => {
          const filePath = path.join(directory, entry.name)
          const stat = fs.statSync(filePath)
          const relativePath = path.relative(gameDirectory, filePath).replace(/\\/g, '/')
          if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return

          items.push({
            kind,
            filePath,
            relativePath,
            filename: entry.name,
            size: stat.size,
            record: findInstalledRecordForFile(manifest, filePath, entry.name)
          })
        })
    })

    return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  }

  const selectExportVersionFile = async (
    record: InstalledContentRecord,
    filePath: string,
    filename: string
  ) => {
    if (record.projectType === 'modpack' || !record.versionId) return null

    try {
      const version = await getVersionById(record.versionId)
      const storedFile = record.files.find((file) => {
        return path.resolve(file.path) === path.resolve(filePath)
          || stripDisableSuffix(file.filename).toLowerCase() === stripDisableSuffix(filename).toLowerCase()
      })
      const installableFiles = version.files.filter((file) => isInstallableModrinthFile(record.projectType, file))
      const selected = installableFiles.find((file) => file.filename.toLowerCase() === stripDisableSuffix(filename).toLowerCase())
        || installableFiles.find((file) => storedFile?.hashes?.sha512 && file.hashes?.sha512 === storedFile.hashes.sha512)
        || installableFiles.find((file) => storedFile?.hashes?.sha1 && file.hashes?.sha1 === storedFile.hashes.sha1)
        || selectVersionFile(record.projectType, version)

      if (!selected?.url) return null
      assertModpackDownloadUrl(selected.url)

      if (!await verifyModrinthFile(filePath, selected)) return null
      return selected
    } catch (err) {
      log.warn(`Could not resolve Modrinth export metadata for ${filename}`, err)
      return null
    }
  }

  const addInstanceIconToMrpack = async (zip: AdmZip, iconUrl?: string | null) => {
    const source = String(iconUrl || '').trim()
    const dataMatch = source.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/)

    if (dataMatch) {
      const extension = dataMatch[1] === 'image/jpeg' ? 'jpg' : dataMatch[1].split('/')[1]
      const buffer = Buffer.from(dataMatch[2], 'base64')
      if (buffer.length > 0 && buffer.length <= 1_500_000) {
        zip.addFile(`icon.${extension}`, buffer)
      }
      return
    }

    if (!source) return

    try {
      const parsed = new URL(source)
      if (parsed.protocol !== 'https:') return

      const response = await axios.get<ArrayBuffer>(source, {
        headers: HTTP_HEADERS,
        responseType: 'arraybuffer',
        timeout: 8000,
        maxContentLength: 1_500_000
      })
      const contentType = String(response.headers['content-type'] || '').toLowerCase()
      const extension = contentType.includes('jpeg') || contentType.includes('jpg')
        ? 'jpg'
        : contentType.includes('webp')
          ? 'webp'
          : 'png'
      const buffer = Buffer.from(response.data as any)
      if (buffer.length > 0 && buffer.length <= 1_500_000) {
        zip.addFile(`icon.${extension}`, buffer)
      }
    } catch (err) {
      log.warn('Could not include instance icon in exported .mrpack', err)
    }
  }

  const exportInstanceMrpack = async (
    input: LauncherInstance | undefined,
    outputPath: string
  ): Promise<ExportInstanceMrpackResult> => {
    const instance = normalizeInstance({ instance: input })
    const { instanceRoot } = ensureInstanceRoot(instance)
    assertInstancePathIsSafe(instanceRoot)

    const zip = new AdmZip()
    const packFiles: ModrinthPackFile[] = []
    const contentFiles = getEnabledExportContentFiles(instance)
    let overrideFiles = 0

    sendProgress({ type: 'content-export', task: 8, total: 100, detail: 'Preparing export' })

    for (let index = 0; index < contentFiles.length; index += 1) {
      const item = contentFiles[index]
      const modrinthFile = item.record
        ? await selectExportVersionFile(item.record, item.filePath, item.filename)
        : null

      if (modrinthFile?.url) {
        packFiles.push({
          path: item.relativePath,
          hashes: modrinthFile.hashes || {},
          env: {
            client: 'required',
            server: 'unsupported'
          },
          downloads: [modrinthFile.url],
          fileSize: modrinthFile.size || item.size
        })
      } else {
        zip.addFile(`overrides/${item.relativePath}`, fs.readFileSync(item.filePath))
        overrideFiles += 1
      }

      sendProgress({
        type: 'content-export',
        task: 8 + Math.round(((index + 1) / Math.max(1, contentFiles.length)) * 82),
        total: 100,
        detail: item.relativePath
      })
      await yieldToEventLoop()
    }

    const packIndex: ModrinthPackIndex = {
      formatVersion: 1,
      game: 'minecraft',
      versionId: `namlauncher-${instance.id}-${Date.now()}`,
      name: instance.name,
      summary: `Exported from NamLauncher for Minecraft ${instance.version}.`,
      files: packFiles,
      dependencies: getMrpackDependencies(instance)
    }

    await addInstanceIconToMrpack(zip, instance.iconUrl)
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(packIndex, null, 2), 'utf8'))

    const finalPath = outputPath.toLowerCase().endsWith('.mrpack') ? outputPath : `${outputPath}.mrpack`
    ensureDir(path.dirname(finalPath))
    zip.writeZip(finalPath)

    sendProgress({ type: 'content-export', task: 100, total: 100, detail: path.basename(finalPath) })

    return {
      success: true,
      filePath: finalPath,
      modrinthFiles: packFiles.length,
      overrideFiles,
      totalFiles: contentFiles.length
    }
  }

  const recordFilesExist = (record?: InstalledContentRecord) => {
    if (!record || record.files.length === 0) return false
    return record.files.every((file) => fs.existsSync(file.path))
  }

  const getLocalContentFilePath = (
    projectType: ModrinthProjectType,
    gameDirectory: string,
    filename: string
  ) => {
    const installDirectory = getModrinthInstallFolder(projectType, gameDirectory)
    const enabledPath = path.join(installDirectory, sanitizeDownloadFileName(filename))
    const disabledPath = `${enabledPath}.disable`
    if (fs.existsSync(enabledPath)) return enabledPath
    if (fs.existsSync(disabledPath)) return disabledPath
    return enabledPath
  }

  const findInstalledVersionFromFiles = async (
    projectType: ModrinthProjectType,
    instance: ReturnType<typeof normalizeInstance>,
    versions: ModrinthVersion[]
  ) => {
    const { gameDirectory } = getInstancePaths(instance)

    for (const version of versions) {
      const file = selectVersionFile(projectType, version)
      if (!file) continue

      const candidatePath = getLocalContentFilePath(projectType, gameDirectory, file.filename)
      if (!fs.existsSync(candidatePath)) continue

      try {
        if (await verifyModrinthFile(candidatePath, file)) {
          return { version, file, path: candidatePath }
        }
      } catch (err) {
        log.debug(`Could not verify local Modrinth file ${candidatePath}`, err)
      }
    }

    return null
  }

  const getModrinthContentStatuses = async (request: ModrinthContentStatusRequest) => {
    const instance = normalizeInstance({ instance: request.instance })
    const manifest = readContentManifest(instance)
    const projects = Array.isArray(request.projects) ? request.projects.filter(Boolean) : []
    const statuses: Record<string, any> = {}

    await Promise.all(projects.map(async (project) => {
      const projectId = getModrinthProjectId(project)
      if (!projectId) return

      const projectType = normalizeModrinthProjectType(project?.project_type)
      const installed = manifest.projects[projectId]

      try {
        if (projectType === 'modpack') {
          statuses[projectId] = { state: 'install' }
          return
        }

        if (!installed || !recordFilesExist(installed)) {
          statuses[projectId] = { state: 'install' }
          return
        }

        const loaderFilters = getModrinthLoaderFilters(projectType, instance)
        let versions = await getProjectVersions(projectId, instance, loaderFilters)
        if (versions.length === 0 && projectType !== 'mod' && loaderFilters.length > 0) {
          versions = await getProjectVersions(projectId, instance, [])
        }
        const latest = selectProjectVersion(versions)

        if (!latest) {
          statuses[projectId] = {
            state: installed && recordFilesExist(installed) ? 'installed' : 'unavailable',
            reason: `No compatible version for Minecraft ${instance.version}.`,
            installedVersion: installed?.versionNumber || null,
            installedVersionId: installed?.versionId || null
          }
          return
        }

        statuses[projectId] = installed.versionId === latest.id
            ? {
                state: 'installed',
                installedVersion: installed.versionNumber,
                installedVersionId: installed.versionId,
                latestVersion: latest.version_number,
                latestVersionId: latest.id
              }
            : {
                state: 'update',
                installedVersion: installed.versionNumber,
                installedVersionId: installed.versionId,
                latestVersion: latest.version_number,
                latestVersionId: latest.id
              }
      } catch (err: any) {
        statuses[projectId] = {
          state: recordFilesExist(installed) ? 'installed' : 'unavailable',
          reason: err?.message || 'Could not resolve compatible version.',
          installedVersion: installed?.versionNumber || null,
          installedVersionId: installed?.versionId || null
        }
      }
    }))

    return statuses
  }

  const normalizeLocalProjectSearchText = (value: string) => String(value || '')
    .replace(/\.(jar|litemod|zip)$/i, '')
    .replace(/\[[^\]]+\]|\([^)]+\)/g, ' ')
    .replace(/\b(?:fabric|forge|neoforge|quilt|mc|minecraft)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)+(?:[-+][0-9a-z.-]+)?\b/gi, ' ')
    .replace(/[_+.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  type InstanceContentResultItem = Awaited<ReturnType<typeof getInstanceContent>>[number]

  const getLocalModSearchTerms = (item: InstanceContentResultItem) => {
    const terms = [
      normalizeLocalProjectSearchText(item.name),
      normalizeLocalProjectSearchText(item.enabledFileName),
      normalizeLocalProjectSearchText(item.fileName)
    ].filter((value) => value.length >= 3)

    return Array.from(new Set(terms)).slice(0, 3)
  }

  const resolveLocalModrinthRecord = async (
    instance: ReturnType<typeof normalizeInstance>,
    item: InstanceContentResultItem
  ) => {
    if (item.kind !== 'mods' || item.projectId || !item.enabled) return null

    const loaderFilters = getModrinthLoaderFilters('mod', instance)
    const terms = getLocalModSearchTerms(item)
    if (terms.length === 0) return null

    for (const query of terms) {
      const result = await searchModrinthProjects({
        query,
        projectType: 'mod',
        limit: 5,
        offset: 0
      }) as { hits?: Array<Record<string, any>> }

      for (const project of result.hits || []) {
        const projectId = getModrinthProjectId(project)
        if (!projectId) continue

        const versions = await getProjectVersions(projectId, instance, loaderFilters)
        if (versions.length === 0) continue

        for (const version of versions) {
          const file = selectVersionFile('mod', version)
          if (!file || !await verifyModrinthFile(item.filePath, file)) continue

          const latest = selectProjectVersion(versions)
          return {
            record: {
              projectId,
              title: getModrinthProjectTitle(project, item.name),
              projectType: 'mod' as ModrinthProjectType,
              iconUrl: typeof project.icon_url === 'string' ? project.icon_url : item.iconUrl || null,
              versionId: version.id,
              versionNumber: version.version_number,
              versionName: version.name,
              gameVersion: instance.version,
              loader: instance.loader,
              files: [{
                filename: path.basename(item.filePath),
                path: item.filePath,
                hashes: file.hashes || {},
                dependency: false
              }],
              installedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              provider: 'modrinth' as ContentProvider
            },
            latest
          }
        }
      }
    }

    return null
  }

  const getInstanceUpdateSummary = async (request: LaunchRequest) => {
    const instance = normalizeInstance(request)
    const manifest = readContentManifest(instance)
    const records = Object.values(manifest.projects)
      .filter((record) => record.projectType !== 'modpack')
      .filter((record) => recordFilesExist(record))
    const updates: ContentUpdateItem[] = []

    for (const record of records) {
      try {
        if (record.provider === 'curseforge') {
          const modId = Number(record.projectId.replace(/^curseforge:/i, ''))
          if (!modId) continue
          const projectType = normalizeCurseForgeProjectType(record.projectType)
          if (projectType === 'modpack') continue
          const latestFile = (await getCurseForgeCompatibleFiles(modId, instance, projectType))[0]
          if (!latestFile || String(latestFile.id) === record.versionId) continue

          updates.push({
            projectId: record.projectId,
            title: record.title,
            projectType,
            iconUrl: record.iconUrl || null,
            installedVersion: record.versionNumber,
            installedVersionId: record.versionId,
            latestVersion: latestFile.displayName || latestFile.fileName,
            latestVersionId: String(latestFile.id),
            provider: 'curseforge'
          })
          continue
        }

        const projectType = record.projectType as Exclude<ModrinthProjectType, 'modpack'>
        const loaderFilters = getModrinthLoaderFilters(projectType, instance)
        const latest = await resolveCompatibleProjectVersion(record.projectId, projectType, instance, loaderFilters)

        if (!latest || latest.id === record.versionId) continue

        updates.push({
          projectId: record.projectId,
          title: record.title,
          projectType,
          iconUrl: record.iconUrl || null,
          installedVersion: record.versionNumber,
          installedVersionId: record.versionId,
          latestVersion: latest.version_number,
          latestVersionId: latest.id,
          provider: 'modrinth'
        })
      } catch (err) {
        log.warn(`Could not check update for ${record.title}`, err)
      }
    }

    return {
      updates,
      checkedAt: new Date().toISOString()
    }
  }

  const getRedirectTargetUrl = (options: Record<string, any>) => {
    const protocol = String(options.protocol || '').toLowerCase()
    const hostname = String(options.hostname || '').toLowerCase()
    const port = options.port ? `:${String(options.port)}` : ''
    if (!protocol || !hostname) throw new Error('Refusing a redirect with an invalid target.')
    return new URL(String(options.path || '/'), `${protocol}//${hostname}${port}`).toString()
  }

  const getDownloadUrlForLog = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl)
      parsed.username = ''
      parsed.password = ''
      parsed.search = ''
      parsed.hash = ''
      return sanitizeBugReport(parsed.toString())
    } catch {
      return '[invalid download URL]'
    }
  }

  const replaceFileWithCandidate = (candidatePath: string, targetPath: string) => {
    if (!fs.existsSync(targetPath)) {
      fs.renameSync(candidatePath, targetPath)
      return
    }

    const backupPath = `${targetPath}.${process.pid}-${crypto.randomUUID()}.backup`
    fs.renameSync(targetPath, backupPath)
    let replacementInstalled = false
    try {
      fs.renameSync(candidatePath, targetPath)
      replacementInstalled = true
    } catch (replacementError) {
      try {
        fs.renameSync(backupPath, targetPath)
      } catch (restoreError) {
        try {
          fs.copyFileSync(backupPath, targetPath)
        } catch {
          log.error('A verified download could not be installed and the previous file could not be restored automatically.', restoreError)
          throw new Error('NamLauncher could not safely replace the existing file. The previous copy was preserved as a backup.', {
            cause: replacementError
          })
        }
      }
      throw replacementError
    } finally {
      if (replacementInstalled && fs.existsSync(backupPath)) {
        try {
          fs.rmSync(backupPath, { force: true })
        } catch (cleanupError) {
          log.warn('A download backup could not be removed after a successful replacement.', cleanupError)
        }
      }
    }
  }

  const downloadFile = async (
    url: string,
    filePath: string,
    progressType: string,
    force = false,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void,
    maxBytes = MAX_CONTENT_DOWNLOAD_BYTES,
    validateCandidate?: DownloadCandidateValidator,
    validateRedirect?: DownloadRedirectValidator
  ) => withFileDownloadLock(filePath, async () => {
    throwIfInstallCancelled(signal)
    if (!force && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      return filePath
    }

    ensureDir(path.dirname(filePath))
    const legacyTempPath = `${filePath}.download`
    const tempPath = `${filePath}.${process.pid}-${crypto.randomUUID()}.download`
    if (fs.existsSync(legacyTempPath)) fs.rmSync(legacyTempPath, { force: true })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })

      try {
        const response = await axios({
          method: 'GET',
          url,
          responseType: 'stream',
          headers: HTTP_HEADERS,
          timeout: 120000,
          signal,
          maxRedirects: validateRedirect ? 5 : undefined,
          beforeRedirect: validateRedirect
            ? (options: Record<string, any>) => validateRedirect(getRedirectTargetUrl(options))
            : undefined,
          maxContentLength: maxBytes,
          maxBodyLength: maxBytes
        })
        throwIfInstallCancelled(signal)

        const totalLength = Number(response.headers['content-length']) || 0
        if (totalLength > maxBytes) {
          throw new Error('The download is larger than NamLauncher can install safely.')
        }

        let downloadedLength = 0
        let lastProgressAt = 0
        let lastProgressValue = -1
        const writer = fs.createWriteStream(tempPath)

        response.data.on('data', (chunk: Buffer) => {
          downloadedLength += chunk.length
          if (downloadedLength > maxBytes) {
            const error = new Error('The download is larger than NamLauncher can install safely.')
            response.data.destroy(error)
            writer.destroy(error)
            return
          }
          if (totalLength > 0) {
            const progressValue = Math.round((downloadedLength / totalLength) * 100)
            const now = Date.now()
            if (progressValue !== lastProgressValue && (now - lastProgressAt > 250 || progressValue >= 100)) {
              lastProgressAt = now
              lastProgressValue = progressValue
              if (onProgress) {
                onProgress(Math.min(progressValue, 100))
              } else {
                sendProgress({
                  type: progressType,
                  task: progressValue,
                  total: 100
                })
              }
            }
          }
        })

        await new Promise<void>((resolve, reject) => {
          let settled = false
          const finish = (error?: Error | null) => {
            if (settled) return
            settled = true
            signal?.removeEventListener('abort', abort)
            if (error) reject(error)
            else resolve()
          }
          const abort = () => {
            const error = new Error(INSTALL_CANCELLED_MESSAGE)
            response.data.destroy?.(error)
            writer.destroy(error)
            finish(error)
          }
          if (signal?.aborted) {
            abort()
            return
          }
          signal?.addEventListener('abort', abort, { once: true })
          response.data.on('error', (error: Error) => finish(error))
          writer.on('error', (error) => finish(error))
          writer.on('finish', () => finish())
          response.data.pipe(writer)
        })
        throwIfInstallCancelled(signal)
        if (validateCandidate) await validateCandidate(tempPath)
        replaceFileWithCandidate(tempPath, filePath)
        return filePath
      } catch (err) {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
        if (signal?.aborted || isInstallCancelledError(err, signal)) throw err
        if (attempt >= 2 || !shouldRetryDownloadError(err)) throw err

        const retryDelay = getGenericRetryAfterMs(err, 750 * (attempt + 1))
        log.warn(`Download failed; retrying in ${retryDelay}ms: ${getDownloadUrlForLog(url)}`, getCompactErrorLog(err))
        await waitForModrinthRetry(retryDelay, signal)
      }
    }

    throw new Error(`Could not download ${url}`)
  })

  const getDeclaredDownloadLimit = (declaredSize?: number | null) => {
    const size = Number(declaredSize)
    if (!Number.isFinite(size) || size <= 0) return MAX_CONTENT_DOWNLOAD_BYTES
    return Math.min(Math.ceil(size), MAX_CONTENT_DOWNLOAD_BYTES)
  }

  const downloadModrinthFile = async (
    file: ModrinthVersionFile,
    installDirectory: string,
    signal?: AbortSignal
  ) => {
    throwIfInstallCancelled(signal)
    assertModrinthDownloadUrl(file.url)
    ensureDir(installDirectory)

    const filename = sanitizeDownloadFileName(file.filename)
    const targetPath = path.join(installDirectory, filename)
    const targetExisted = fs.existsSync(targetPath)

    if (targetExisted && await verifyModrinthFile(targetPath, file)) {
      return { filename, path: targetPath, skipped: true, created: false }
    }

    await downloadFile(
      file.url,
      targetPath,
      'content-download',
      true,
      signal,
      undefined,
      getDeclaredDownloadLimit(file.size),
      createModrinthCandidateValidator(file, filename),
      assertModrinthDownloadUrl
    )

    return { filename, path: targetPath, skipped: false, created: !targetExisted }
  }

  const getModrinthProjectVersions = async (request: ModrinthInstallRequest) => {
    const project = request.project || {}
    const projectId = String(request.projectId || getModrinthProjectId(project)).trim()
    const projectType = normalizeModrinthProjectType(request.projectType || project.project_type)

    if (!projectId) throw new Error('Missing Modrinth project id.')

    let versions: ModrinthVersion[]
    if (request.instance && projectType !== 'modpack') {
      const instance = normalizeInstance({ instance: request.instance })
      const loaderFilters = getModrinthLoaderFilters(projectType, instance)
      versions = await getProjectVersions(projectId, instance, loaderFilters)
      if (versions.length === 0 && projectType !== 'mod' && loaderFilters.length > 0) {
        versions = await getProjectVersions(projectId, instance, [])
      }
      versions = versions.filter((version) => isVersionCompatible(version, instance, projectType === 'mod' ? loaderFilters : []))
    } else {
      versions = await requestModrinth<ModrinthVersion[]>(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version`, {
        params: { include_changelog: false }
      })
    }

    return versions
      .filter((version) => version.files.some((file) => isInstallableModrinthFile(projectType, file)))
      .map((version: any) => ({
        id: version.id,
        name: version.name,
        version_number: version.version_number,
        version_type: version.version_type,
        game_versions: version.game_versions || [],
        loaders: version.loaders || [],
        date_published: version.date_published || version.datePublished || null,
        files: version.files || []
      }))
  }

  const downloadModpackArchive = async (
    version: ModrinthVersion,
    signal?: AbortSignal,
    onProgress?: (percent: number, detail: string) => void
  ) => {
    throwIfInstallCancelled(signal)
    const file = selectVersionFile('modpack', version)
    if (!file) throw new Error(`No .mrpack file found for ${version.name}.`)

    assertModrinthDownloadUrl(file.url)
    const cacheDirectory = path.join(userDataPath, 'cache', 'modpacks')
    ensureDir(cacheDirectory)

    const filename = `${version.id}-${sanitizeDownloadFileName(file.filename)}`
    const targetPath = path.join(cacheDirectory, filename)

    if (fs.existsSync(targetPath) && await verifyModrinthFile(targetPath, file)) {
      return targetPath
    }

    await downloadFile(file.url, targetPath, 'content-download', true, signal, (percent) => {
      onProgress?.(percent, file.filename)
    }, getDeclaredDownloadLimit(file.size), createModrinthCandidateValidator(file, file.filename), assertModrinthDownloadUrl)

    return targetPath
  }

  const getLocalMrpackVersion = (filePath: string, index: ModrinthPackIndex): ModrinthVersion => {
    const stat = fs.statSync(filePath)
    const hash = crypto
      .createHash('sha1')
      .update(`${path.resolve(filePath)}:${stat.size}:${stat.mtimeMs}:${index.versionId || index.name}`)
      .digest('hex')
      .slice(0, 12)
    const dependencies = index.dependencies || {}
    const loaders = Object.keys(dependencies)
      .filter((key) => key === 'fabric-loader' || key === 'forge' || key === 'quilt-loader' || key === 'neoforge')

    return {
      id: index.versionId || `local-${hash}`,
      project_id: `local-${hash}`,
      name: index.name || path.basename(filePath, '.mrpack'),
      version_number: index.versionId || 'local',
      version_type: 'release',
      game_versions: dependencies.minecraft ? [dependencies.minecraft] : [],
      loaders,
      files: []
    }
  }

  const getModpackIconDataUrl = (zip: AdmZip) => {
    const candidates = [
      'icon.png',
      'icon.jpg',
      'icon.jpeg',
      'icon.webp',
      'overrides/icon.png',
      'overrides/icon.jpg',
      'overrides/icon.jpeg',
      'overrides/icon.webp',
      'client-overrides/icon.png',
      'client-overrides/icon.jpg',
      'client-overrides/icon.jpeg',
      'client-overrides/icon.webp'
    ]
    const entry = candidates
      .map((candidate) => zip.getEntry(candidate))
      .find((candidate) => candidate && !candidate.isDirectory)

    if (!entry) return null

    const ext = path.extname(entry.entryName).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/png'

    try {
      const data = getZipEntryDataWithLimit(entry, MAX_MODPACK_ICON_BYTES, 'Modpack icon')
      return `data:${mime};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  }

  const readModpackIndex = (zip: AdmZip): ModrinthPackIndex => {
    const entry = zip.getEntry('modrinth.index.json')
    if (!entry || entry.isDirectory) throw new Error('This .mrpack is missing modrinth.index.json.')

    const index = JSON.parse(getZipEntryDataWithLimit(entry, MAX_MODPACK_INDEX_BYTES, 'Modrinth modpack index').toString('utf8')) as ModrinthPackIndex
    if (index.formatVersion !== 1 || index.game !== 'minecraft') {
      throw new Error('Unsupported Modrinth modpack format.')
    }

    if (!index.dependencies?.minecraft) {
      throw new Error('This modpack does not declare a Minecraft version.')
    }

    if (index.files !== undefined && !Array.isArray(index.files)) {
      throw new Error('This modpack has an invalid file list.')
    }

    if ((index.files || []).length > MAX_MODPACK_OVERRIDE_FILES) {
      throw new Error('This modpack contains too many files to install safely.')
    }

    return index
  }

  const getModpackInstanceFromIndex = (
    request: ModrinthInstallRequest,
    version: ModrinthVersion,
    index: ModrinthPackIndex
  ) => {
    const project = request.project || {}
    const projectId = String(request.projectId || getModrinthProjectId(project) || version.project_id).trim()
    const dependencies = index.dependencies || {}
    const minecraftVersion = dependencies.minecraft || version.game_versions[0]
    let loader: LoaderType = 'vanilla'
    let loaderVersion = ''

    if (dependencies['fabric-loader']) {
      loader = 'fabric'
      loaderVersion = dependencies['fabric-loader']
    } else if (dependencies.forge) {
      loader = 'forge'
      loaderVersion = dependencies.forge
    } else if (dependencies['quilt-loader']) {
      loader = 'quilt'
      loaderVersion = dependencies['quilt-loader']
    } else if (dependencies.neoforge) {
      loader = 'neoforge'
      loaderVersion = dependencies.neoforge
    }

    return {
      id: `modpack-${projectId || 'pack'}-${version.id}-${Date.now()}`,
      name: getModrinthProjectTitle(project, index.name || version.name),
      version: minecraftVersion,
      loader,
      loaderVersion,
      iconUrl: project.icon_url || null,
      createdAt: new Date().toISOString(),
      playtimeSeconds: 0
    }
  }

  const getProjectTypeFromModpackPath = (filePath: string): Exclude<ModrinthProjectType, 'modpack'> | null => {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase()
    if (normalized.startsWith('mods/')) return 'mod'
    if (normalized.startsWith('resourcepacks/')) return 'resourcepack'
    if (normalized.startsWith('shaderpacks/')) return 'shader'
    return null
  }

  const resolveModpackClientFilePlan = async (
    files: ModrinthPackFile[],
    minecraftVersion: string,
    signal?: AbortSignal
  ) => {
    const optionalVersionIds = Array.from(new Set(files
      .filter((file) => file.env?.client === 'optional')
      .map((file) => getModrinthPackFileIdentity(file)?.versionId || '')
      .filter(Boolean)))
    const versionsById = new Map<string, ModrinthVersion>()

    for (let offset = 0; offset < optionalVersionIds.length; offset += 100) {
      throwIfInstallCancelled(signal)
      const versionIds = optionalVersionIds.slice(offset, offset + 100)
      try {
        const versions = await requestModrinth<ModrinthVersion[]>(`${MODRINTH_API_BASE}/versions`, {
          params: {
            ids: JSON.stringify(versionIds),
            include_changelog: false
          },
          signal
        })
        for (const version of Array.isArray(versions) ? versions : []) {
          if (version?.id) versionsById.set(version.id, version)
        }
      } catch (err) {
        if (signal?.aborted || isInstallCancelledError(err, signal)) throw err
        log.warn(
          `Could not verify ${versionIds.length} optional modpack file${versionIds.length === 1 ? '' : 's'}; preserving the pack declaration.`,
          getCompactErrorLog(err)
        )
      }
    }

    const plan = planModpackClientFiles(files, minecraftVersion, versionsById)
    for (const file of plan.skippedIncompatibleFiles) {
      log.warn(`Skipping optional modpack file that does not support Minecraft ${minecraftVersion}: ${file.path}`)
    }
    return plan
  }

  const verifyModpackFile = async (filePath: string, file: ModrinthPackFile) => {
    const fileForHash: ModrinthVersionFile = {
      url: '',
      filename: path.basename(file.path),
      hashes: file.hashes,
      size: file.fileSize
    }
    return verifyModrinthFile(filePath, fileForHash)
  }

  const downloadModpackIndexFile = async (
    file: ModrinthPackFile,
    gameDirectory: string,
    signal?: AbortSignal,
    onProgress?: (percent: number, detail: string) => void
  ) => {
    throwIfInstallCancelled(signal)
    if (!Array.isArray(file.downloads) || file.downloads.length === 0) {
      throw new Error(`No download URL for ${file.path}`)
    }

    const supportedUrls = Array.from(new Set(file.downloads.filter((candidate) => {
      try {
        assertModpackDownloadUrl(candidate)
        return true
      } catch {
        return false
      }
    })))
    if (supportedUrls.length === 0) throw new Error(`No supported download URL for ${file.path}`)

    const targetPath = resolveModpackRelativePath(gameDirectory, file.path)
    ensureDir(path.dirname(targetPath))
    const identity = getModrinthPackFileIdentity(file)
    const projectType = getProjectTypeFromModpackPath(file.path)
    const filename = path.basename(targetPath)

    if (fs.existsSync(targetPath) && await verifyModpackFile(targetPath, file)) {
      return {
        filename,
        path: targetPath,
        skipped: true,
        hashes: file.hashes,
        projectType,
        projectId: identity?.projectId || null,
        versionId: identity?.versionId || null
      }
    }

    const validateCandidate = createModrinthCandidateValidator({
      url: supportedUrls[0],
      filename,
      hashes: file.hashes,
      size: file.fileSize
    }, file.path)
    let lastMirrorError: unknown = null
    let downloadedFromMirror = false
    for (const url of supportedUrls) {
      try {
        await downloadFile(url, targetPath, 'content-download', true, signal, (percent) => {
          onProgress?.(percent, file.path)
        }, getDeclaredDownloadLimit(file.fileSize), validateCandidate, assertModpackDownloadUrl)
        downloadedFromMirror = true
        break
      } catch (err) {
        if (signal?.aborted || isInstallCancelledError(err, signal)) throw err
        lastMirrorError = err
        log.warn(`Modpack mirror failed for ${file.path}; trying another declared mirror.`, getCompactErrorLog(err))
      }
    }
    if (!downloadedFromMirror) {
      throw new Error(`All supported download mirrors failed for ${file.path}.`, { cause: lastMirrorError })
    }

    return {
      filename,
      path: targetPath,
      skipped: false,
      hashes: file.hashes,
      projectType,
      projectId: identity?.projectId || null,
      versionId: identity?.versionId || null
    }
  }

  const extractModpackOverrides = async (zip: AdmZip, gameDirectory: string, signal?: AbortSignal) => {
    let count = 0
    const overridePrefixes = ['overrides/', 'client-overrides/']
    const entries = zip.getEntries()
      .filter((entry) => !entry.isDirectory && overridePrefixes.some((prefix) => entry.entryName.startsWith(prefix)))
    preflightModpackOverrideEntries(entries, 'Modrinth modpack')

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      throwIfInstallCancelled(signal)
      const entry = entries[entryIndex]
      const prefix = overridePrefixes.find((candidate) => entry.entryName.startsWith(candidate)) || ''
      const relativePath = entry.entryName.slice(prefix.length)
      if (!relativePath) continue

      const targetPath = resolveModpackRelativePath(gameDirectory, relativePath)
      writeZipEntryToFile(entry, targetPath, 'Modrinth modpack override file')
      count += 1
      sendProgress({
        type: 'content-install',
        task: 86 + Math.round(((entryIndex + 1) / Math.max(1, entries.length)) * 10),
        total: 100,
        detail: relativePath
      })
      if (count % 12 === 0) await yieldToEventLoop()
    }

    return count
  }

  const persistModpackInstalledContent = (
    instance: ReturnType<typeof normalizeInstance>,
    installedItems: Array<{
      filename: string
      path: string
      skipped: boolean
      hashes?: Record<string, string>
      projectType: Exclude<ModrinthProjectType, 'modpack'> | null
      projectId: string | null
      versionId: string | null
    }>
  ) => {
    const manifest = readContentManifest(instance)
    const now = new Date().toISOString()
    let changed = false

    installedItems
      .filter((item) => item.projectId && item.versionId && item.projectType)
      .forEach((item) => {
        const projectId = item.projectId as string
        const projectType = item.projectType as Exclude<ModrinthProjectType, 'modpack'>
        const previous = manifest.projects[projectId]

        manifest.projects[projectId] = {
          projectId,
          provider: 'modrinth',
          title: previous?.title || path.basename(item.filename).replace(/\.(jar|litemod|zip)$/i, ''),
          projectType,
          iconUrl: previous?.iconUrl || null,
          versionId: item.versionId as string,
          versionNumber: previous?.versionNumber && previous.versionId === item.versionId
            ? previous.versionNumber
            : item.versionId as string,
          versionName: previous?.versionName && previous.versionId === item.versionId
            ? previous.versionName
            : item.filename,
          gameVersion: instance.version,
          loader: instance.loader,
          files: [{
            filename: item.filename,
            path: item.path,
            hashes: item.hashes,
            dependency: false
          }],
          installedAt: previous?.installedAt || now,
          updatedAt: now
        }
        changed = true
      })

    if (changed) writeContentManifest(instance, manifest)
  }

  const installModpackArchive = async (
    request: ModrinthInstallRequest,
    version: ModrinthVersion,
    archivePath: string,
    options: {
      projectId: string
      source: 'modrinth' | 'local'
      sourcePath?: string
      zip?: AdmZip
      index?: ModrinthPackIndex
      signal?: AbortSignal
    }
  ) => {
    const signal = options.signal
    throwIfInstallCancelled(signal)
    const project = request.project || {}
    const zip = options.zip || new AdmZip(archivePath)
    const index = options.index || readModpackIndex(zip)
    const instance = getModpackInstanceFromIndex(request, version, index)
    const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)

    assertInstancePathIsSafe(instanceRoot)
    ensureDir(gameDirectory)

    const filePlan = await resolveModpackClientFilePlan(index.files || [], instance.version, signal)
    const packFiles = filePlan.installableFiles
    sendProgress({ type: 'content-install', task: 15, total: 100, detail: index.name })

    let installedFiles = 0
    let skippedFiles = 0
    const installedItems: Awaited<ReturnType<typeof downloadModpackIndexFile>>[] = []
    for (let indexFile = 0; indexFile < packFiles.length; indexFile += 1) {
      throwIfInstallCancelled(signal)
      const file = packFiles[indexFile]
      const fileStart = 15 + ((indexFile / Math.max(1, packFiles.length)) * 70)
      const fileEnd = 15 + (((indexFile + 1) / Math.max(1, packFiles.length)) * 70)
      sendProgress({
        type: 'content-install',
        task: Math.round(fileStart),
        total: 100,
        detail: file.path
      })
      const downloaded = await downloadModpackIndexFile(file, gameDirectory, signal, (percent, detail) => {
        sendProgress({
          type: 'content-install',
          task: Math.round(fileStart + ((fileEnd - fileStart) * (Math.min(Math.max(percent, 0), 100) / 100))),
          total: 100,
          detail
        })
      })
      installedItems.push(downloaded)
      if (downloaded.skipped) skippedFiles += 1
      else installedFiles += 1

      sendProgress({
        type: 'content-install',
        task: 15 + Math.round(((indexFile + 1) / Math.max(1, packFiles.length)) * 70),
        total: 100,
        detail: file.path
      })
      await yieldToEventLoop()
    }

    const overrideFiles = await extractModpackOverrides(zip, gameDirectory, signal)
    await provisionInstanceDefaults(instance)
    persistModpackInstalledContent(instance, installedItems)
    writeJsonFile(path.join(instanceRoot, 'namlauncher-modpack.json'), {
      projectId: options.projectId,
      projectTitle: getModrinthProjectTitle(project, index.name),
      versionId: version.id,
      versionNumber: version.version_number,
      modpackName: index.name,
      iconUrl: instance.iconUrl || null,
      source: options.source,
      sourcePath: options.sourcePath || null,
      installedAt: new Date().toISOString()
    })

    sendProgress({ type: 'content-install', task: 100, total: 100, detail: index.name })

    return {
      success: true,
      instance,
      version: version.version_number,
      installedFiles,
      skippedFiles,
      overrideFiles,
      incompatibleOptionalFiles: filePlan.skippedIncompatibleFiles.map((file) => file.path)
    }
  }

  const installModrinthModpack = async (request: ModrinthInstallRequest, signal?: AbortSignal) => {
    throwIfInstallCancelled(signal)
    const project = request.project || {}
    const projectId = String(request.projectId || getModrinthProjectId(project)).trim()
    if (!projectId) throw new Error('Missing Modrinth project id.')

    const version = request.versionId
      ? await getVersionById(request.versionId, signal)
      : selectProjectVersion(await requestModrinth<ModrinthVersion[]>(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version`, {
          params: { include_changelog: false },
          signal
        }))

    if (!version) throw new Error('No installable modpack version was found.')

    const archivePath = await downloadModpackArchive(version, signal, (percent, detail) => {
      sendProgress({
        type: 'content-install',
        task: 3 + Math.round((Math.min(Math.max(percent, 0), 100) / 100) * 9),
        total: 100,
        detail
      })
    })
    return installModpackArchive(request, version, archivePath, {
      projectId,
      source: 'modrinth',
      signal
    })
  }

  const installLocalMrpack = async (filePath: string, signal?: AbortSignal) => {
    throwIfInstallCancelled(signal)
    const archivePath = path.resolve(String(filePath || ''))
    if (!archivePath.toLowerCase().endsWith('.mrpack')) {
      throw new Error('Please choose a .mrpack file.')
    }
    if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) {
      throw new Error('The selected .mrpack file was not found.')
    }

    sendProgress({ type: 'content-install', task: 2, total: 100, detail: `Reading ${path.basename(archivePath)}` })
    await yieldToEventLoop()
    throwIfInstallCancelled(signal)
    const zip = new AdmZip(archivePath)
    sendProgress({ type: 'content-install', task: 6, total: 100, detail: 'Validating modpack index' })
    throwIfInstallCancelled(signal)
    const index = readModpackIndex(zip)
    const version = getLocalMrpackVersion(archivePath, index)
    const iconUrl = getModpackIconDataUrl(zip)
    const projectId = version.project_id
    const request: ModrinthInstallRequest = {
      project: {
        project_id: projectId,
        id: projectId,
        title: index.name || path.basename(archivePath, '.mrpack'),
        project_type: 'modpack',
        icon_url: iconUrl
      },
      projectId,
      projectType: 'modpack',
      versionId: version.id
    }

    sendProgress({ type: 'content-install', task: 10, total: 100, detail: index.name || path.basename(archivePath) })
    return installModpackArchive(request, version, archivePath, {
      projectId,
      source: 'local',
      sourcePath: archivePath,
      zip,
      index,
      signal
    })
  }

  const installModrinthVersion = async (
    version: ModrinthVersion,
    projectType: ModrinthProjectType,
    instance: ReturnType<typeof normalizeInstance>,
    installDirectory: string,
    loaderFilters: string[],
    visited: Set<string>,
    createdPaths: Set<string>
  ): Promise<InstalledModrinthItem[]> => {
    if (visited.has(version.id)) return []
    visited.add(version.id)

    if (!isVersionCompatible(version, instance, loaderFilters)) {
      throw new Error(`No compatible version found for Minecraft ${instance.version}.`)
    }

    const installed: InstalledModrinthItem[] = []

    if (projectType === 'mod') {
      const requiredDependencies = (version.dependencies || [])
        .filter((dependency) => dependency.dependency_type === 'required')

      for (const dependency of requiredDependencies) {
        let dependencyVersion: ModrinthVersion | null = null

        if (dependency.version_id) {
          const exactVersion = await getVersionById(dependency.version_id)
          if (isVersionCompatible(exactVersion, instance, loaderFilters)) {
            dependencyVersion = exactVersion
          }
        }

        if (!dependencyVersion && dependency.project_id) {
          const dependencyVersions = await getProjectVersions(dependency.project_id, instance, loaderFilters)
          dependencyVersion = selectProjectVersion(dependencyVersions)
        }

        if (!dependencyVersion) {
          throw new Error('A required Modrinth dependency has no compatible version.')
        }

        const dependencyFiles = await installModrinthVersion(
          dependencyVersion,
          projectType,
          instance,
          installDirectory,
          loaderFilters,
          visited,
          createdPaths
        )
        installed.push(...dependencyFiles.map((item) => ({ ...item, dependency: true })))
        await yieldToEventLoop()
      }
    }

    const file = selectVersionFile(projectType, version)
    if (!file) {
      throw new Error(`No installable file found for ${version.name}.`)
    }

    sendProgress({ type: 'content-install', task: 35, total: 100, detail: file.filename })
    const downloaded = await downloadModrinthFile(file, installDirectory)
    if (downloaded.created) createdPaths.add(downloaded.path)
    await yieldToEventLoop()
    installed.push({
      ...downloaded,
      hashes: file.hashes,
      dependency: false,
      projectId: version.project_id,
      versionId: version.id,
      versionNumber: version.version_number,
      versionName: version.name
    })

    return installed
  }

  const groupInstalledItems = (items: InstalledModrinthItem[]) => {
    return items.reduce<Record<string, InstalledModrinthItem[]>>((groups, item) => {
      if (!groups[item.projectId]) groups[item.projectId] = []
      groups[item.projectId].push(item)
      return groups
    }, {})
  }

  const removeOutdatedContentFiles = (
    manifest: InstanceContentManifest,
    gameDirectory: string,
    installedItems: InstalledModrinthItem[]
  ) => {
    const grouped = groupInstalledItems(installedItems)

    Object.entries(grouped).forEach(([projectId, nextItems]) => {
      const previous = manifest.projects[projectId]
      if (!previous) return

      const nextPaths = new Set(nextItems.map((item) => path.resolve(item.path)))
      previous.files.forEach((file) => {
        const previousPath = path.resolve(file.path)
        if (nextPaths.has(previousPath) || !fs.existsSync(previousPath)) return

        if (!isPathInside(previousPath, gameDirectory)) {
          log.warn(`Ignored stale content manifest path outside the active instance: ${previousPath}`)
          return
        }
        fs.rmSync(previousPath, { force: true })
      })
    })
  }

  const removeLocalContentFileReplacedByInstall = (
    gameDirectory: string,
    localMatch: Awaited<ReturnType<typeof findInstalledVersionFromFiles>>,
    installedItems: InstalledModrinthItem[]
  ) => {
    if (!localMatch) return

    const localPath = path.resolve(localMatch.path)
    if (!fs.existsSync(localPath)) return

    const installedPaths = new Set(installedItems.map((item) => path.resolve(item.path)))
    if (installedPaths.has(localPath)) return

    const replacedByMainInstall = installedItems.some((item) => (
      item.projectId === localMatch.version.project_id && !item.dependency
    ))
    if (!replacedByMainInstall) return

    assertChildPathIsSafe(gameDirectory, localPath)
    fs.rmSync(localPath, { force: true })
    log.info(`Removed local content file replaced by Modrinth install: ${localPath}`)
  }

  const persistInstalledContent = (
    instance: ReturnType<typeof normalizeInstance>,
    project: ModrinthInstallRequest['project'],
    projectType: ModrinthProjectType,
    installedItems: InstalledModrinthItem[]
  ) => {
    const { gameDirectory } = getInstancePaths(instance)
    const manifest = readContentManifest(instance)
    const now = new Date().toISOString()
    const mainProjectId = getModrinthProjectId(project)
    const grouped = groupInstalledItems(installedItems)

    removeOutdatedContentFiles(manifest, gameDirectory, installedItems)

    Object.entries(grouped).forEach(([projectId, items]) => {
      const first = items[0]
      const previous = manifest.projects[projectId]
      const title = projectId === mainProjectId
        ? getModrinthProjectTitle(project, projectId)
        : previous?.title || projectId

      manifest.projects[projectId] = {
        projectId,
        provider: 'modrinth',
        title,
        projectType,
        iconUrl: projectId === mainProjectId ? project?.icon_url || previous?.iconUrl || null : previous?.iconUrl || null,
        versionId: first.versionId,
        versionNumber: first.versionNumber,
        versionName: first.versionName,
        gameVersion: instance.version,
        loader: instance.loader,
        files: items.map((item) => ({
          filename: item.filename,
          path: item.path,
          hashes: item.hashes,
          dependency: item.dependency
        })),
        installedAt: previous?.installedAt || now,
        updatedAt: now
      }
    })

    writeContentManifest(instance, manifest)
  }

  const installModrinthProject = async (request: ModrinthInstallRequest) => {
    const instance = normalizeInstance({ instance: request.instance })
    const project = request.project || {}
    const projectId = String(request.projectId || getModrinthProjectId(project)).trim()
    const projectType = normalizeModrinthProjectType(request.projectType || project.project_type)

    if (!projectId) {
      throw new Error('Missing Modrinth project id.')
    }

    if (projectType === 'modpack') {
      throw new Error('Modpacks need a separate instance importer and cannot be dropped into mods.')
    }

    assertInstanceContentMutable(instance, projectType)
    const loaderFilters = getModrinthLoaderFilters(projectType, instance)
    const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)
    assertInstancePathIsSafe(instanceRoot)
    ensureDir(gameDirectory)

    const installDirectory = getModrinthInstallFolder(projectType, gameDirectory)
    const title = project.title || project.slug || projectId
    sendProgress({ type: 'content-install', task: 10, total: 100, detail: title })

    let versions = await getProjectVersions(projectId, instance, loaderFilters)
    if (versions.length === 0 && projectType !== 'mod' && loaderFilters.length > 0) {
      versions = await getProjectVersions(projectId, instance, [])
    }
    versions = versions.filter((candidate) => (
      isVersionCompatible(candidate, instance, projectType === 'mod' ? loaderFilters : [])
      && candidate.files.some((file) => isInstallableModrinthFile(projectType, file))
    ))
    const requestedVersionId = String(request.versionId || '').trim()
    const version = requestedVersionId
      ? versions.find((candidate) => candidate.id === requestedVersionId) || null
      : selectProjectVersion(versions)
    if (requestedVersionId && !version) {
      throw new Error('Selected Modrinth version is not compatible with this instance.')
    }
    if (!version) {
      throw new Error(`No compatible ${projectType} version found for Minecraft ${instance.version}.`)
    }
    const localMatch = await findInstalledVersionFromFiles(projectType, instance, versions)

    const createdPaths = new Set<string>()
    let installed: InstalledModrinthItem[]
    try {
      installed = await installModrinthVersion(
        version,
        projectType,
        instance,
        installDirectory,
        loaderFilters,
        new Set<string>(),
        createdPaths
      )
    } catch (err) {
      for (const createdPath of createdPaths) {
        if (isPathInside(createdPath, installDirectory) && fs.existsSync(createdPath)) {
          fs.rmSync(createdPath, { force: true })
        }
      }
      throw err
    }

    removeLocalContentFileReplacedByInstall(gameDirectory, localMatch, installed)
    persistInstalledContent(instance, project, projectType, installed)

    sendProgress({ type: 'content-install', task: 100, total: 100, detail: title })

    return {
      success: true,
      projectType,
      version: version.version_number,
      installDirectory,
      installed
    }
  }

  const getCurseForgeModId = (project?: CurseForgeProject | null) => {
    const raw = String(project?.project_id || project?.id || '').replace(/^curseforge:/i, '')
    const modId = Number(raw)
    return Number.isInteger(modId) && modId > 0 ? modId : 0
  }

  const getCurseForgeProjectId = (modId: number | string) => `curseforge:${modId}`

  const getCurseForgeLoaderName = (instance: ReturnType<typeof normalizeInstance>) => {
    if (instance.loader === 'forge' || instance.loader === 'fabric' || instance.loader === 'quilt' || instance.loader === 'neoforge') {
      return instance.loader
    }
    return undefined
  }

  const normalizeCurseForgeProjectType = (value?: string): ModrinthProjectType => normalizeModrinthProjectType(value)

  const getCurseForgeProjectTypeFromClassId = (classId?: number): ModrinthProjectType => {
    const match = (Object.entries(CURSEFORGE_CLASS_IDS) as Array<[ModrinthProjectType, number]>)
      .find(([, id]) => id === classId)
    return match?.[0] || 'mod'
  }

  const getCurseForgeWebsiteSection = (projectType: ModrinthProjectType) => {
    if (projectType === 'modpack') return 'modpacks'
    if (projectType === 'resourcepack') return 'texture-packs'
    if (projectType === 'shader') return 'shaders'
    return 'mc-mods'
  }

  const getCurseForgeProjectWebsiteUrl = (mod: CurseForgeMod, projectType: ModrinthProjectType) => {
    return mod.links?.websiteUrl
      || `https://www.curseforge.com/minecraft/${getCurseForgeWebsiteSection(projectType)}/${encodeURIComponent(mod.slug)}`
  }

  const getCurseForgeFilePageUrl = (mod: CurseForgeMod, file: CurseForgeFile, projectType: ModrinthProjectType) => {
    return `${getCurseForgeProjectWebsiteUrl(mod, projectType).replace(/\/+$/, '')}/download/${file.id}`
  }

  const mapCurseForgeProject = (mod: CurseForgeMod, requestedType?: ModrinthProjectType) => {
    const projectType = requestedType || getCurseForgeProjectTypeFromClassId(mod.classId)
    return {
    id: mod.id,
    project_id: getCurseForgeProjectId(mod.id),
    provider: 'curseforge' as const,
    project_type: projectType,
    slug: mod.slug,
    title: mod.name,
    description: mod.summary || '',
    author: mod.authors?.map((author) => author.name).filter(Boolean).join(', ') || 'CurseForge author',
    downloads: Number(mod.downloadCount || 0),
    icon_url: mod.logo?.thumbnailUrl || mod.logo?.url || null,
    website_url: getCurseForgeProjectWebsiteUrl(mod, projectType),
    allow_distribution: mod.allowModDistribution !== false,
    available: mod.isAvailable !== false
    }
  }

  const normalizeModrinthSearchIndex = (value: unknown) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'relevance' || normalized === 'updated' || normalized === 'newest') return normalized
    return 'downloads'
  }

  const searchModrinthProjects = async (request: ModrinthSearchRequest, signal?: AbortSignal) => {
    const offset = normalizeLibrarySearchOffset(request.offset)
    const limit = normalizeLibrarySearchLimit(request.limit)
    const projectType = normalizeModrinthProjectType(request.projectType)
    const query = normalizeLibrarySearchQuery(request.query)
    const index = normalizeModrinthSearchIndex(request.index)
    const requestedLoader = String(request.loader || '').trim().toLowerCase()
    const filters = normalizeLibrarySearchFilters({
      sort: index,
      gameVersion: request.gameVersion,
      loader: isLibraryLoader(requestedLoader) ? requestedLoader : '',
      environment: request.environment,
      openSourceOnly: request.openSourceOnly,
      compatibleOnly: false
    })
    const facets = buildModrinthSearchFacets(projectType, {
      sort: filters.sort,
      gameVersion: filters.gameVersion,
      loader: filters.loader,
      environment: filters.environment,
      openSourceOnly: filters.openSourceOnly
    })
    const cacheKey = JSON.stringify({ provider: 'modrinth', query, projectType, offset, limit, index, facets })
    const cached = getCachedProjectSearchResult(cacheKey)
    if (cached) return cached

    const inFlight = signal ? null : projectSearchInFlight.get(cacheKey)
    if (inFlight) return inFlight

    const searchRequest = requestModrinth<{ hits?: any[]; total_hits?: number }>(`${MODRINTH_API_BASE}/search`, {
      timeout: 10000,
      signal,
      params: {
        query,
        limit,
        offset,
        index,
        facets: JSON.stringify(facets)
      }
    }).then((result) => {
      const hits = Array.isArray(result.hits) ? result.hits : []
      const normalizedResult = {
        ...result,
        hits,
        total_hits: normalizeLibraryTotalHits(result.total_hits, hits.length)
      }
      setCachedProjectSearchResult(cacheKey, normalizedResult)
      return normalizedResult
    }).catch((err) => {
      if (signal?.aborted || axios.isCancel(err)) throw err

      const staleResult = getCachedProjectSearchResult(cacheKey, true)
      const canUseStaleResult = shouldRetryModrinthRequest(err) || shouldFallbackToModrinthProxy(err)
      if (staleResult && canUseStaleResult) {
        log.warn('Modrinth search is temporarily unavailable; returning a cached result.', getCompactErrorLog(err))
        return { ...staleResult, stale: true }
      }
      throw err
    }).finally(() => {
      if (projectSearchInFlight.get(cacheKey) === searchRequest) {
        projectSearchInFlight.delete(cacheKey)
      }
    })

    if (!signal) projectSearchInFlight.set(cacheKey, searchRequest)
    return searchRequest
  }

  const getModrinthFailureMessage = (err: unknown, operation: 'search' | 'download') => {
    if (!axios.isAxiosError(err)) return 'Modrinth request failed unexpectedly.'
    const status = err.response?.status
    if (status === 429) return 'Modrinth is busy. Please wait a moment and try again.'
    if (status === 502 || status === 503 || status === 504) return 'Modrinth is temporarily unavailable. Please try again shortly.'
    if (status === 404 && operation === 'download') return 'The requested Modrinth file is no longer available.'
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return 'Modrinth did not respond before the request timed out.'
    return `Modrinth request failed${status ? ` (HTTP ${status})` : ''}. Check the network and try again.`
  }

  const searchCurseForgeProjects = async (request: CurseForgeSearchRequest, signal?: AbortSignal) => {
    const offset = normalizeLibrarySearchOffset(request.offset)
    const limit = normalizeLibrarySearchLimit(request.limit)
    const query = normalizeLibrarySearchQuery(request.query)
    const projectType = normalizeCurseForgeProjectType(request.projectType)
    const instance = request.instance ? normalizeInstance({ instance: request.instance }) : null
    const normalizedFilters = normalizeLibrarySearchFilters({
      sort: request.sort,
      compatibleOnly: false
    })
    const gameVersion = normalizeLibraryGameVersion(request.gameVersion) || (
      request.gameVersion === undefined && projectType !== 'modpack'
        ? normalizeLibraryGameVersion(instance?.version)
        : ''
    )
    const requestedLoader = String(request.loader || '').trim().toLowerCase()
    const instanceLoader = String(instance ? getCurseForgeLoaderName(instance) : '').trim().toLowerCase()
    const loader = projectType === 'mod'
      ? (isLibraryLoader(requestedLoader)
          ? requestedLoader
          : request.loader === undefined && isLibraryLoader(instanceLoader)
            ? instanceLoader
            : '')
      : ''
    const sort = normalizedFilters.sort === 'relevance' ? 'downloads' : normalizedFilters.sort
    const cacheKey = JSON.stringify({
      provider: 'curseforge',
      query,
      projectType,
      offset,
      limit,
      gameVersion,
      loader,
      sort
    })
    const cached = getCachedProjectSearchResult(cacheKey)
    if (cached) return cached

    log.info(`Searching CurseForge ${projectType} projects (query length=${query.length}, offset=${offset}, limit=${limit}).`)
    try {
      const response = await requestCurseForge<{ data?: CurseForgeMod[]; pagination?: { totalCount?: number } }>(
        '/projects',
        {
          signal,
          params: {
            content_type: projectType,
            q: query || undefined,
            game_version: gameVersion || undefined,
            loader: loader || undefined,
            sort,
            index: offset,
            page_size: limit
          }
        }
      )

      const hits = (response.data.data || []).map((mod) => mapCurseForgeProject(mod, projectType))
      const result = {
        hits,
        total_hits: normalizeLibraryTotalHits(response.data.pagination?.totalCount, hits.length)
      }
      setCachedProjectSearchResult(cacheKey, result)
      return result
    } catch (err) {
      if (signal?.aborted || axios.isCancel(err)) throw err
      const message = getCurseForgeFailureMessage(err, 'search')
      log.error(`CurseForge search failed: ${message}`)
      throw new Error(message)
    }
  }

  const getCurseForgeMod = async (modId: number, signal?: AbortSignal) => {
    const response = await requestCurseForge<{ data?: CurseForgeMod }>(`/projects/${modId}`, { signal })
    if (!response.data.data) throw new Error(`CurseForge project ${modId} was not found.`)
    return response.data.data
  }

  const getCurseForgeCompatibleFiles = async (
    modId: number,
    instance: ReturnType<typeof normalizeInstance> | null,
    projectType: ModrinthProjectType,
    signal?: AbortSignal
  ) => {
    const loader = instance ? getCurseForgeLoaderName(instance) : undefined
    if (projectType === 'mod' && !loader) throw new Error('CurseForge mods require a Fabric, Forge, Quilt, or NeoForge instance.')

    const response = await requestCurseForge<{ data?: CurseForgeFile[] }>(`/projects/${modId}/files`, {
      params: {
        game_version: instance?.version,
        loader: projectType === 'mod' || projectType === 'modpack' ? loader : undefined,
        page_size: 50
      },
      signal
    })

    return (response.data.data || [])
      .filter((file) => {
        const filename = file.fileName?.toLowerCase() || ''
        if (file.isAvailable === false) return false
        if (projectType === 'mod') return filename.endsWith('.jar') || filename.endsWith('.litemod')
        return filename.endsWith('.zip')
      })
      .sort((left, right) => new Date(right.fileDate || 0).getTime() - new Date(left.fileDate || 0).getTime())
  }

  const getCurseForgeFileById = async (modId: number, fileId: number, signal?: AbortSignal) => {
    const response = await requestCurseForge<{ data?: CurseForgeFile }>(`/projects/${modId}/files/${fileId}`, { signal })
    if (!response.data.data) throw new Error(`CurseForge file ${fileId} was not found.`)
    return response.data.data
  }

  const CURSEFORGE_DISTRIBUTION_DISABLED_MESSAGE = 'This author disabled third-party downloads. Open the project on CurseForge to download it manually.'

  const getCurseForgeDistributionDisabledMessage = (mod?: CurseForgeMod | null) => {
    const title = mod?.name ? `"${mod.name}"` : 'This author'
    return `${title} disabled third-party downloads. Open the project on CurseForge to download it manually.`
  }

  const assertCurseForgeDistributionAllowed = (mod: CurseForgeMod) => {
    if (mod.allowModDistribution === false) {
      throw new Error(getCurseForgeDistributionDisabledMessage(mod))
    }
  }

  const isCurseForgeDownloadUnavailableStatus = (status?: number) => status === 403 || status === 404 || status === 451

  const isCurseForgeManualDownloadRequiredError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err || '')
    return /disabled third-party downloads|does not allow third-party downloads/i.test(message)
  }

  const getCurseForgeDownloadUrl = async (file: CurseForgeFile, signal?: AbortSignal) => {
    if (file.downloadUrl) return file.downloadUrl
    try {
      const response = await requestCurseForge<{ data?: string }>(
        `/projects/${file.modId}/files/${file.id}/download-url`,
        { signal }
      )
      if (response.data.data) return response.data.data
    } catch (err) {
      if (!axios.isAxiosError(err) || !isCurseForgeDownloadUnavailableStatus(err.response?.status)) throw err
    }
    throw new Error(CURSEFORGE_DISTRIBUTION_DISABLED_MESSAGE)
  }

  const assertCurseForgeDownloadUrl = (rawUrl: string) => {
    const parsed = new URL(rawUrl)
    const hostname = parsed.hostname.toLowerCase()
    if (parsed.protocol !== 'https:' || !(hostname === 'forgecdn.net' || hostname.endsWith('.forgecdn.net'))) {
      throw new Error(`Blocked unexpected CurseForge download host: ${hostname}`)
    }
  }

  const getCurseForgeHashes = (file: CurseForgeFile) => {
    const hashes: Record<string, string> = {}
    file.hashes?.forEach((hash) => {
      if (hash.algo === 1) hashes.sha1 = hash.value
      if (hash.algo === 2) hashes.md5 = hash.value
    })
    return hashes
  }

  const verifyCurseForgeFile = async (filePath: string, file: CurseForgeFile) => {
    const hashes = getCurseForgeHashes(file)
    if (hashes.sha1) return (await hashFile(filePath, 'sha1')) === hashes.sha1.toLowerCase()
    if (hashes.md5) return (await hashFile(filePath, 'md5')) === hashes.md5.toLowerCase()
    if (file.fileLength && fs.existsSync(filePath)) return fs.statSync(filePath).size === file.fileLength
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
  }

  const createCurseForgeManualDownload = (
    mod: CurseForgeMod,
    file: CurseForgeFile,
    projectType: Exclude<ModrinthProjectType, 'modpack'>,
    targetDirectory: string
  ): CurseForgeManualDownload => ({
    id: `${mod.id}:${file.id}`,
    title: mod.name,
    filename: sanitizeDownloadFileName(file.fileName),
    displayName: file.displayName || file.fileName,
    projectId: mod.id,
    fileId: file.id,
    projectType,
    websiteUrl: getCurseForgeProjectWebsiteUrl(mod, projectType),
    fileUrl: getCurseForgeFilePageUrl(mod, file, projectType),
    iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || null,
    targetDirectory,
    hashes: getCurseForgeHashes(file),
    fileLength: file.fileLength
  })

  const verifyManualCurseForgeDownload = async (filePath: string, item: CurseForgeManualDownload) => {
    const hashes = item.hashes || {}
    if (hashes.sha1) return (await hashFile(filePath, 'sha1')) === hashes.sha1.toLowerCase()
    if (hashes.md5) return (await hashFile(filePath, 'md5')) === hashes.md5.toLowerCase()
    if (item.fileLength && fs.existsSync(filePath)) return fs.statSync(filePath).size === item.fileLength
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
  }

  const isTemporaryBrowserDownload = (filename: string) => /\.(?:crdownload|download|part|tmp)$/i.test(filename)

  const findManualCurseForgeDownload = async (downloadsDirectory: string, item: CurseForgeManualDownload) => {
    const filename = sanitizeDownloadFileName(item.filename)
    const exactPath = path.join(downloadsDirectory, filename)
    assertChildPathIsSafe(downloadsDirectory, exactPath)
    if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile() && await verifyManualCurseForgeDownload(exactPath, item)) {
      return exactPath
    }

    const hasVerificationSignal = Boolean(item.hashes?.sha1 || item.hashes?.md5 || item.fileLength)
    if (!hasVerificationSignal) return ''

    const entries = fs.existsSync(downloadsDirectory)
      ? fs.readdirSync(downloadsDirectory, { withFileTypes: true }).filter((entry) => entry.isFile()).slice(0, 300)
      : []
    const expectedExtension = path.extname(filename).toLowerCase()

    for (const entry of entries) {
      if (entry.name === filename || isTemporaryBrowserDownload(entry.name)) continue
      if (expectedExtension && path.extname(entry.name).toLowerCase() !== expectedExtension) continue
      const candidatePath = path.join(downloadsDirectory, entry.name)
      assertChildPathIsSafe(downloadsDirectory, candidatePath)
      const stat = fs.statSync(candidatePath)
      if (item.fileLength && stat.size !== item.fileLength) continue
      if (await verifyManualCurseForgeDownload(candidatePath, item)) return candidatePath
    }

    return ''
  }

  const moveFileReplacingTarget = (sourcePath: string, targetPath: string) => {
    ensureDir(path.dirname(targetPath))
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true })
    try {
      fs.renameSync(sourcePath, targetPath)
    } catch (err: any) {
      if (err?.code !== 'EXDEV') throw err
      fs.copyFileSync(sourcePath, targetPath)
      fs.rmSync(sourcePath, { force: true })
    }
  }

  type InstalledCurseForgeItem = InstalledModrinthItem & {
    title: string
    iconUrl?: string | null
  }

  const installCurseForgeFile = async (
    mod: CurseForgeMod,
    file: CurseForgeFile,
    instance: ReturnType<typeof normalizeInstance>,
    projectType: Exclude<ModrinthProjectType, 'modpack'>,
    installDirectory: string,
    visited: Set<number>
  ): Promise<InstalledCurseForgeItem[]> => {
    if (visited.has(mod.id)) return []
    visited.add(mod.id)
    assertCurseForgeDistributionAllowed(mod)

    const installed: InstalledCurseForgeItem[] = []
    const requiredDependencies = projectType === 'mod'
      ? (file.dependencies || []).filter((dependency) => dependency.relationType === 3)
      : []
    for (const dependency of requiredDependencies) {
      const dependencyMod = await getCurseForgeMod(dependency.modId)
      assertCurseForgeDistributionAllowed(dependencyMod)
      const dependencyFile = (await getCurseForgeCompatibleFiles(dependency.modId, instance, 'mod'))[0]
      if (!dependencyFile) throw new Error(`Required dependency ${dependencyMod.name} has no compatible file.`)
      const dependencyItems = await installCurseForgeFile(
        dependencyMod,
        dependencyFile,
        instance,
        'mod',
        installDirectory,
        visited
      )
      installed.push(...dependencyItems.map((item) => ({ ...item, dependency: true })))
    }

    const downloadUrl = await getCurseForgeDownloadUrl(file)
    assertCurseForgeDownloadUrl(downloadUrl)
    ensureDir(installDirectory)
    const filename = sanitizeDownloadFileName(file.fileName)
    const targetPath = path.join(installDirectory, filename)
    let skipped = false

    if (fs.existsSync(targetPath) && await verifyCurseForgeFile(targetPath, file)) {
      skipped = true
    } else {
      await downloadFile(downloadUrl, targetPath, 'content-download', true, undefined, undefined, getDeclaredDownloadLimit(file.fileLength))
      if (!await verifyCurseForgeFile(targetPath, file)) {
        fs.rmSync(targetPath, { force: true })
        throw new Error(`Downloaded CurseForge file failed verification: ${filename}`)
      }
    }

    installed.push({
      filename,
      path: targetPath,
      hashes: getCurseForgeHashes(file),
      dependency: false,
      projectId: getCurseForgeProjectId(mod.id),
      versionId: String(file.id),
      versionNumber: file.displayName || file.fileName,
      versionName: file.displayName || file.fileName,
      skipped,
      title: mod.name,
      iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || null,
      projectType
    })
    return installed
  }

  const persistCurseForgeContent = (
    instance: ReturnType<typeof normalizeInstance>,
    projectType: Exclude<ModrinthProjectType, 'modpack'>,
    installedItems: InstalledCurseForgeItem[]
  ) => {
    const { gameDirectory } = getInstancePaths(instance)
    const manifest = readContentManifest(instance)
    const now = new Date().toISOString()
    removeOutdatedContentFiles(manifest, gameDirectory, installedItems)

    Object.entries(groupInstalledItems(installedItems)).forEach(([projectId, rawItems]) => {
      const items = rawItems as InstalledCurseForgeItem[]
      const first = items[0]
      const previous = manifest.projects[projectId]
      manifest.projects[projectId] = {
        projectId,
        provider: 'curseforge',
        title: first.title || previous?.title || projectId,
        projectType: first.projectType || projectType,
        iconUrl: first.iconUrl || previous?.iconUrl || null,
        versionId: first.versionId,
        versionNumber: first.versionNumber,
        versionName: first.versionName,
        gameVersion: instance.version,
        loader: instance.loader,
        files: items.map((item) => ({
          filename: item.filename,
          path: item.path,
          hashes: item.hashes,
          dependency: item.dependency
        })),
        installedAt: previous?.installedAt || now,
        updatedAt: now
      }
    })
    writeContentManifest(instance, manifest)
  }

  const importCurseForgeManualDownload = async (request: CurseForgeManualDownloadRequest) => {
    const instance = normalizeInstance({ instance: request.instance })
    const item = request.item
    if (!item) throw new Error('Missing CurseForge manual download item.')

    const projectType = normalizeCurseForgeProjectType(item.projectType)
    if (projectType === 'modpack') throw new Error('Manual modpack files cannot be imported into an instance.')
    const projectId = Number(item.projectId || 0)
    const fileId = Number(item.fileId || 0)
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid CurseForge manual download identifiers.')
    }

    const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)
    assertInstancePathIsSafe(instanceRoot)
    const downloadsDirectory = app.getPath('downloads')
    ensureDir(downloadsDirectory)
    const filename = sanitizeDownloadFileName(item.filename)
    const installDirectory = getModrinthInstallFolder(projectType, gameDirectory)
    const targetPath = path.join(installDirectory, filename)
    assertChildPathIsSafe(gameDirectory, targetPath)

    if (fs.existsSync(targetPath) && await verifyManualCurseForgeDownload(targetPath, item)) {
      return { success: true, imported: true, alreadyInstalled: true, path: targetPath, filename }
    }

    const sourcePath = await findManualCurseForgeDownload(downloadsDirectory, item)
    if (!sourcePath) {
      return { success: true, imported: false, downloadDirectory: downloadsDirectory, filename }
    }

    moveFileReplacingTarget(sourcePath, targetPath)
    if (!await verifyManualCurseForgeDownload(targetPath, item)) {
      fs.rmSync(targetPath, { force: true })
      throw new Error(`Manual CurseForge download failed verification: ${filename}`)
    }

    const installed: InstalledCurseForgeItem = {
      filename,
      path: targetPath,
      hashes: item.hashes || {},
      dependency: false,
      projectId: getCurseForgeProjectId(projectId),
      projectType,
      versionId: String(fileId),
      versionNumber: item.displayName || filename,
      versionName: item.displayName || filename,
      skipped: false,
      title: item.title || `CurseForge project ${projectId}`,
      iconUrl: item.iconUrl || null
    }
    persistCurseForgeContent(instance, projectType, [installed])

    return { success: true, imported: true, path: targetPath, filename }
  }

  const installCurseForgeProject = async (request: CurseForgeInstallRequest) => {
    const instance = normalizeInstance({ instance: request.instance })
    const project = request.project || {}
    const modId = getCurseForgeModId(project)
    const projectType = normalizeCurseForgeProjectType(project.project_type)
    if (!modId) throw new Error('Missing CurseForge project id.')
    if (project.provider !== 'curseforge') throw new Error('Invalid CurseForge project request.')
    if (projectType === 'modpack') throw new Error('CurseForge modpacks must be installed as a new instance.')

    assertInstanceContentMutable(instance, projectType)
    const mod = await getCurseForgeMod(modId)
    assertCurseForgeDistributionAllowed(mod)
    const compatibleFiles = await getCurseForgeCompatibleFiles(modId, instance, projectType)
    const requestedFileIdText = String(request.fileId || '').trim()
    if (requestedFileIdText && !/^\d{1,12}$/.test(requestedFileIdText)) {
      throw new Error('Selected CurseForge file id is invalid.')
    }
    const requestedFileId = requestedFileIdText ? Number(requestedFileIdText) : 0
    const file = requestedFileId
      ? compatibleFiles.find((candidate) => candidate.id === requestedFileId)
      : compatibleFiles[0]
    if (requestedFileId && !file) {
      throw new Error('Selected CurseForge file is not compatible with this instance.')
    }
    if (!file) throw new Error(`No compatible CurseForge file found for Minecraft ${instance.version}.`)

    const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)
    assertInstancePathIsSafe(instanceRoot)
    const installDirectory = getModrinthInstallFolder(projectType, gameDirectory)
    sendProgress({ type: 'content-install', task: 10, total: 100, detail: mod.name })
    const installed = await installCurseForgeFile(mod, file, instance, projectType, installDirectory, new Set<number>())
    persistCurseForgeContent(instance, projectType, installed)
    sendProgress({ type: 'content-install', task: 100, total: 100, detail: mod.name })

    return {
      success: true,
      projectType,
      version: file.displayName || file.fileName,
      installDirectory,
      installed
    }
  }

  const getCurseForgeModpackVersions = async (request: CurseForgeInstallRequest) => {
    const project = request.project || {}
    const modId = getCurseForgeModId(project)
    if (!modId) throw new Error('Missing CurseForge modpack project id.')
    const files = await getCurseForgeCompatibleFiles(modId, null, 'modpack')
    return files.map((file) => ({
      id: String(file.id),
      name: file.displayName || file.fileName,
      version_number: file.displayName || file.fileName,
      version_type: file.releaseType === 2 ? 'beta' : file.releaseType === 3 ? 'alpha' : 'release',
      game_versions: (file.gameVersions || []).filter((version) => !/^(fabric|forge|neoforge|quilt)$/i.test(version)),
      loaders: (file.gameVersions || []).filter((version) => /^(fabric|forge|neoforge|quilt)$/i.test(version)).map((value) => value.toLowerCase()),
      date_published: file.fileDate || null
    }))
  }

  const downloadCurseForgeFileToDirectory = async (
    mod: CurseForgeMod,
    file: CurseForgeFile,
    projectType: Exclude<ModrinthProjectType, 'modpack'>,
    installDirectory: string,
    signal?: AbortSignal,
    onProgress?: (percent: number, detail: string) => void
  ): Promise<InstalledCurseForgeItem> => {
    throwIfInstallCancelled(signal)
    assertCurseForgeDistributionAllowed(mod)
    const downloadUrl = await getCurseForgeDownloadUrl(file, signal)
    assertCurseForgeDownloadUrl(downloadUrl)
    ensureDir(installDirectory)
    const filename = sanitizeDownloadFileName(file.fileName)
    const targetPath = path.join(installDirectory, filename)
    let skipped = false

    if (fs.existsSync(targetPath) && await verifyCurseForgeFile(targetPath, file)) {
      skipped = true
    } else {
      await downloadFile(downloadUrl, targetPath, 'content-download', true, signal, (percent) => {
        onProgress?.(percent, filename)
      }, getDeclaredDownloadLimit(file.fileLength))
      if (!await verifyCurseForgeFile(targetPath, file)) {
        fs.rmSync(targetPath, { force: true })
        throw new Error(`Downloaded CurseForge file failed verification: ${filename}`)
      }
    }

    return {
      filename,
      path: targetPath,
      hashes: getCurseForgeHashes(file),
      dependency: false,
      projectId: getCurseForgeProjectId(mod.id),
      projectType,
      versionId: String(file.id),
      versionNumber: file.displayName || file.fileName,
      versionName: file.displayName || file.fileName,
      skipped,
      title: mod.name,
      iconUrl: mod.logo?.thumbnailUrl || mod.logo?.url || null
    }
  }

  const readCurseForgePackManifest = (zip: AdmZip) => {
    const entry = zip.getEntry('manifest.json')
    if (!entry || entry.isDirectory) {
      throw new Error('This CurseForge modpack is missing a valid manifest.json.')
    }
    const manifest = JSON.parse(getZipEntryDataWithLimit(entry, MAX_MODPACK_INDEX_BYTES, 'CurseForge modpack manifest').toString('utf8')) as CurseForgePackManifest
    if (manifest.manifestType !== 'minecraftModpack' || !manifest.minecraft?.version) {
      throw new Error('Unsupported CurseForge modpack manifest.')
    }
    if (!Array.isArray(manifest.files) || manifest.files.length > 5000) {
      throw new Error('The CurseForge modpack file list is invalid or too large.')
    }
    return manifest
  }

  const getCurseForgePackInstance = (
    project: CurseForgeProject,
    modId: number,
    file: CurseForgeFile,
    manifest: CurseForgePackManifest
  ) => {
    const loaders = manifest.minecraft?.modLoaders || []
    const selected = loaders.find((loader) => loader.primary) || loaders[0]
    const loaderId = String(selected?.id || '')
    let loader: LoaderType = 'vanilla'
    let loaderVersion = ''

    if (/^forge-/i.test(loaderId)) {
      loader = 'forge'
      loaderVersion = loaderId.replace(/^forge-/i, '')
    } else if (/^(?:fabric|fabricloader)-/i.test(loaderId)) {
      loader = 'fabric'
      loaderVersion = loaderId.replace(/^(?:fabric|fabricloader)-/i, '')
    } else if (/^(?:quilt|quiltloader)-/i.test(loaderId)) {
      loader = 'quilt'
      loaderVersion = loaderId.replace(/^(?:quilt|quiltloader)-/i, '')
    } else if (/^neoforge-/i.test(loaderId)) {
      loader = 'neoforge'
      loaderVersion = loaderId.replace(/^neoforge-/i, '')
    } else if (loaderId) {
      throw new Error(`This CurseForge modpack uses an unsupported loader: ${loaderId}`)
    }

    return normalizeInstance({ instance: {
      id: `curseforge-modpack-${modId}-${file.id}-${Date.now()}`,
      name: String(project.title || project.name || manifest.name || file.displayName || 'CurseForge Modpack'),
      version: manifest.minecraft?.version,
      loader,
      loaderVersion,
      iconUrl: project.icon_url || null,
      createdAt: new Date().toISOString(),
      playtimeSeconds: 0
    } })
  }

  const extractCurseForgeOverrides = async (
    zip: AdmZip,
    gameDirectory: string,
    rawPrefix?: string,
    signal?: AbortSignal
  ) => {
    const prefix = `${String(rawPrefix || 'overrides').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/`
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory && entry.entryName.startsWith(prefix))
    preflightModpackOverrideEntries(entries, 'CurseForge modpack')

    let count = 0
    for (const entry of entries) {
      throwIfInstallCancelled(signal)
      const relativePath = entry.entryName.slice(prefix.length)
      if (!relativePath) continue
      const targetPath = resolveModpackRelativePath(gameDirectory, relativePath)
      writeZipEntryToFile(entry, targetPath, 'CurseForge modpack override file')
      count += 1
      if (count % 12 === 0) await yieldToEventLoop()
    }
    return count
  }

  const installCurseForgeModpack = async (request: CurseForgeInstallRequest, signal?: AbortSignal) => {
    throwIfInstallCancelled(signal)
    const project = request.project || {}
    const modId = getCurseForgeModId(project)
    if (!modId) throw new Error('Missing CurseForge modpack project id.')
    const mod = await getCurseForgeMod(modId, signal)
    assertCurseForgeDistributionAllowed(mod)

    const requestedFileId = Number(request.fileId || 0)
    const file = requestedFileId > 0
      ? await getCurseForgeFileById(modId, requestedFileId, signal)
      : (await getCurseForgeCompatibleFiles(modId, null, 'modpack', signal))[0]
    if (!file || !file.fileName.toLowerCase().endsWith('.zip')) throw new Error('No installable CurseForge modpack file was found.')
    if (file.fileLength && file.fileLength > 2 * 1024 * 1024 * 1024) throw new Error('This CurseForge modpack archive is too large.')

    const downloadUrl = await getCurseForgeDownloadUrl(file, signal)
    assertCurseForgeDownloadUrl(downloadUrl)
    const cacheDirectory = path.join(userDataPath, 'cache', 'modpacks')
    ensureDir(cacheDirectory)
    const archivePath = path.join(cacheDirectory, `curseforge-${modId}-${file.id}-${sanitizeDownloadFileName(file.fileName)}`)
    if (!fs.existsSync(archivePath) || !await verifyCurseForgeFile(archivePath, file)) {
      await downloadFile(downloadUrl, archivePath, 'content-download', true, signal, (percent) => {
        sendProgress({
          type: 'content-install',
          task: 3 + Math.round((Math.min(Math.max(percent, 0), 100) / 100) * 7),
          total: 100,
          detail: file.fileName
        })
      }, getDeclaredDownloadLimit(file.fileLength))
      if (!await verifyCurseForgeFile(archivePath, file)) {
        fs.rmSync(archivePath, { force: true })
        throw new Error('Downloaded CurseForge modpack failed verification.')
      }
    }

    const zip = new AdmZip(archivePath)
    const manifest = readCurseForgePackManifest(zip)
    const instance = getCurseForgePackInstance(project, modId, file, manifest)
    const { instanceRoot, gameDirectory } = ensureInstanceRoot(instance)
    assertInstancePathIsSafe(instanceRoot)
    ensureDir(gameDirectory)

    const installedItems: InstalledCurseForgeItem[] = []
    const blockedFiles: string[] = []
    const manualDownloads: CurseForgeManualDownload[] = []
    let installedFiles = 0
    let skippedFiles = 0
    const packFiles = manifest.files || []
    sendProgress({ type: 'content-install', task: 10, total: 100, detail: manifest.name || mod.name })
    for (let index = 0; index < packFiles.length; index += 1) {
      throwIfInstallCancelled(signal)
      const item = packFiles[index]
      const projectId = Number(item.projectID || 0)
      const fileId = Number(item.fileID || 0)
      if (!projectId || !fileId || item.required === false) continue

      const childMod = await getCurseForgeMod(projectId, signal)
      const childType = getCurseForgeProjectTypeFromClassId(childMod.classId)
      if (childType === 'modpack') continue
      const childFile = await getCurseForgeFileById(projectId, fileId, signal)
      const installDirectory = getModrinthInstallFolder(childType, gameDirectory)
      const childName = childMod.name || `CurseForge project ${projectId}`
      const reason = `${childName} (${projectId}/${fileId})`
      const fileStart = 10 + ((index / Math.max(1, packFiles.length)) * 75)
      const fileEnd = 10 + (((index + 1) / Math.max(1, packFiles.length)) * 75)

      if (childMod.allowModDistribution === false) {
        const manualDownload = createCurseForgeManualDownload(childMod, childFile, childType, installDirectory)
        blockedFiles.push(reason)
        manualDownloads.push(manualDownload)
        skippedFiles += 1
        log.warn(`Queued CurseForge ${childType} dependency for browser download because third-party distribution is disabled: ${reason}.`)
        sendProgress({
          type: 'content-install',
          task: 10 + Math.round(((index + 1) / Math.max(1, packFiles.length)) * 75),
          total: 100,
          detail: childFile.fileName
        })
        await yieldToEventLoop()
        continue
      }

      let installed: InstalledCurseForgeItem
      try {
        sendProgress({
          type: 'content-install',
          task: Math.round(fileStart),
          total: 100,
          detail: childFile.fileName
        })
        installed = await downloadCurseForgeFileToDirectory(childMod, childFile, childType, installDirectory, signal, (percent, detail) => {
          sendProgress({
            type: 'content-install',
            task: Math.round(fileStart + ((fileEnd - fileStart) * (Math.min(Math.max(percent, 0), 100) / 100))),
            total: 100,
            detail
          })
        })
      } catch (err) {
        if (!isCurseForgeManualDownloadRequiredError(err)) throw err
        const manualDownload = createCurseForgeManualDownload(childMod, childFile, childType, installDirectory)
        blockedFiles.push(reason)
        manualDownloads.push(manualDownload)
        skippedFiles += 1
        log.warn(`Queued CurseForge ${childType} dependency for browser download after launcher download was denied: ${reason}.`)
        sendProgress({
          type: 'content-install',
          task: 10 + Math.round(((index + 1) / Math.max(1, packFiles.length)) * 75),
          total: 100,
          detail: childFile.fileName
        })
        await yieldToEventLoop()
        continue
      }
      installedItems.push(installed)
      if (installed.skipped) skippedFiles += 1
      else installedFiles += 1
      sendProgress({
        type: 'content-install',
        task: 10 + Math.round(((index + 1) / Math.max(1, packFiles.length)) * 75),
        total: 100,
        detail: childFile.fileName
      })
      await yieldToEventLoop()
    }

    const overrideFiles = await extractCurseForgeOverrides(zip, gameDirectory, manifest.overrides, signal)
    await provisionInstanceDefaults(instance)
    if (installedItems.length > 0) persistCurseForgeContent(instance, 'mod', installedItems)
    writeJsonFile(path.join(instanceRoot, 'namlauncher-modpack.json'), {
      projectId: getCurseForgeProjectId(modId),
      projectTitle: project.title || mod.name,
      versionId: String(file.id),
      versionNumber: file.displayName || file.fileName,
      modpackName: manifest.name || mod.name,
      iconUrl: instance.iconUrl || null,
      source: 'curseforge',
      blockedFiles,
      manualDownloads,
      installedAt: new Date().toISOString()
    })
    sendProgress({ type: 'content-install', task: 100, total: 100, detail: manifest.name || mod.name })
    return {
      success: true,
      instance,
      version: file.displayName || file.fileName,
      installedFiles,
      skippedFiles,
      overrideFiles,
      blockedFiles,
      manualDownloads,
      manualDownloadDirectory: app.getPath('downloads')
    }
  }

  const getCurseForgeContentStatus = async (request: CurseForgeContentStatusRequest) => {
    const projects = Array.isArray(request.projects) ? request.projects.slice(0, 50) : []
    if (!request.instance) {
      return Object.fromEntries(projects.map((project) => {
        const projectType = normalizeCurseForgeProjectType(project.project_type)
        return [String(project.project_id || project.id), projectType === 'modpack'
          ? { state: 'install' }
          : {
              state: 'unsupported',
              reason: projectType === 'mod'
                ? 'Select a Fabric or Forge instance first.'
                : 'Select an instance first.'
            }]
      }))
    }

    const instance = normalizeInstance({ instance: request.instance })
    const manifest = readContentManifest(instance)
    const statuses: Record<string, any> = {}
    await Promise.all(projects.map(async (project) => {
      const modId = getCurseForgeModId(project)
      const projectId = getCurseForgeProjectId(modId)
      const projectType = normalizeCurseForgeProjectType(project.project_type)
      if (projectType === 'modpack') {
        statuses[projectId] = { state: 'install' }
        return
      }
      if (!modId || project.allow_distribution === false) {
        statuses[projectId] = {
          state: 'unsupported',
          reason: 'The author disabled third-party distribution.'
        }
        return
      }

      const record = manifest.projects[projectId]
      try {
        const latest = (await getCurseForgeCompatibleFiles(modId, instance, projectType))[0]
        if (!latest) {
          statuses[projectId] = {
            state: record && recordFilesExist(record) ? 'installed' : 'unavailable',
            reason: `No compatible file for Minecraft ${instance.version}.`,
            installedVersion: record?.versionNumber || null,
            installedVersionId: record?.versionId || null
          }
          return
        }

        statuses[projectId] = record && recordFilesExist(record)
          ? String(latest.id) === record.versionId
            ? {
                state: 'installed',
                installedVersion: record.versionNumber,
                installedVersionId: record.versionId,
                latestVersion: latest.displayName || latest.fileName,
                latestVersionId: String(latest.id)
              }
            : {
                state: 'update',
                installedVersion: record.versionNumber,
                installedVersionId: record.versionId,
                latestVersion: latest.displayName || latest.fileName,
                latestVersionId: String(latest.id)
              }
          : {
              state: 'install',
              latestVersion: latest.displayName || latest.fileName,
              latestVersionId: String(latest.id)
            }
      } catch (err: any) {
        statuses[projectId] = {
          state: record && recordFilesExist(record) ? 'installed' : 'unavailable',
          reason: err?.message || 'Could not resolve a compatible CurseForge file.'
        }
      }
    }))
    return statuses
  }
  return {
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
  }
}
