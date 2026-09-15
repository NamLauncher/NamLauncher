// Author/creator: nattapat2871 (https://nattapat2871.me)
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  executableFromWindowsCommand,
  recordMatchesWindowsLauncherDirectory,
  type WindowsUninstallRecord
} from './windowsInstallScope.ts'

export const WINDOWS_SCOPE_MIGRATION_MARKER_FILE = 'pending-windows-scope-migration.json'
export const WINDOWS_SCOPE_MIGRATION_SCHEMA_VERSION = 1
const MAX_MARKER_BYTES = 64 * 1024
const MAX_VERIFIED_ENTRIES = 250_000
const MAX_MARKER_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type WindowsScopeMigrationState =
  | 'pending-relaunch'
  | 'ready-for-cleanup'
  | 'cleanup-deferred'
  | 'cleanup-complete'
  | 'blocked'

export type WindowsScopeMigrationMarker = Readonly<{
  schemaVersion: 1
  nonce: string
  state: WindowsScopeMigrationState
  legacyLauncherPath: string
  legacyInstallDirectory: string
  currentUserLauncherPath: string
  dataPath: string
  sourceVersion: string
  targetVersion: string
  createdAt: string
  readyAt?: string
  currentLauncherPid?: number
  uninstallerPath?: string
  uninstallerSha256?: string
  blockedReason?: string
}>

export type VerifiedLegacyCleanup = Readonly<{
  legacyInstallDirectory: string
  uninstallerPath: string
  currentUserLauncherPath: string
  dataPath: string
}>

const normalizeWindowsPath = (value: string) => path.win32.normalize(value.trim().replace(/^"|"$/g, ''))
const comparableWindowsPath = (value: string) => normalizeWindowsPath(value).replace(/[\\/]+$/, '').toLocaleLowerCase('en-US')

const isWindowsPathAtOrInside = (candidate: string, parent: string) => {
  const relative = path.win32.relative(normalizeWindowsPath(parent), normalizeWindowsPath(candidate))
  return relative === '' || (Boolean(relative) && !relative.startsWith('..') && !path.win32.isAbsolute(relative))
}

const isWindowsPathStrictlyInside = (candidate: string, parent: string) => {
  const relative = path.win32.relative(normalizeWindowsPath(parent), normalizeWindowsPath(candidate))
  return Boolean(relative) && !relative.startsWith('..') && !path.win32.isAbsolute(relative)
}

const assertAbsoluteExe = (value: string, label: string) => {
  const normalized = normalizeWindowsPath(value)
  if (!path.win32.isAbsolute(normalized) || path.win32.extname(normalized).toLowerCase() !== '.exe') {
    throw new Error(`${label} is invalid.`)
  }
  return normalized
}

const assertMarkerShape = (value: unknown): WindowsScopeMigrationMarker => {
  if (!value || typeof value !== 'object') throw new Error('Windows scope migration marker is invalid.')
  const marker = value as Record<string, unknown>
  const state = String(marker.state || '') as WindowsScopeMigrationState
  const validStates: WindowsScopeMigrationState[] = [
    'pending-relaunch', 'ready-for-cleanup', 'cleanup-deferred', 'cleanup-complete', 'blocked'
  ]
  if (
    marker.schemaVersion !== WINDOWS_SCOPE_MIGRATION_SCHEMA_VERSION
    || !/^[a-f0-9]{64}$/i.test(String(marker.nonce || ''))
    || !validStates.includes(state)
    || !Number.isFinite(Date.parse(String(marker.createdAt || '')))
    || typeof marker.sourceVersion !== 'string'
    || typeof marker.targetVersion !== 'string'
    || typeof marker.dataPath !== 'string'
  ) {
    throw new Error('Windows scope migration marker is invalid.')
  }
  assertAbsoluteExe(String(marker.legacyLauncherPath || ''), 'Legacy launcher path')
  assertAbsoluteExe(String(marker.currentUserLauncherPath || ''), 'Current User launcher path')
  if (!path.win32.isAbsolute(String(marker.legacyInstallDirectory || '')) || !path.win32.isAbsolute(String(marker.dataPath || ''))) {
    throw new Error('Windows scope migration marker paths are invalid.')
  }
  return marker as unknown as WindowsScopeMigrationMarker
}

const assertSafeMarkerFile = (markerPath: string) => {
  const marker = fs.lstatSync(markerPath)
  if (!marker.isFile() || marker.isSymbolicLink() || marker.size < 2 || marker.size > MAX_MARKER_BYTES) {
    throw new Error('Windows scope migration marker file is unsafe.')
  }
}

export const readWindowsScopeMigrationMarker = (markerPath: string): WindowsScopeMigrationMarker | null => {
  if (!fs.existsSync(markerPath)) return null
  assertSafeMarkerFile(markerPath)
  return assertMarkerShape(JSON.parse(fs.readFileSync(markerPath, 'utf8')))
}

export const writeWindowsScopeMigrationMarker = (
  markerPath: string,
  marker: WindowsScopeMigrationMarker
) => {
  const validated = assertMarkerShape(marker)
  const directory = path.dirname(markerPath)
  fs.mkdirSync(directory, { recursive: true })
  const directoryInfo = fs.lstatSync(directory)
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error('Windows scope migration marker directory is unsafe.')
  }
  if (fs.existsSync(markerPath)) assertSafeMarkerFile(markerPath)
  const temporaryPath = `${markerPath}.${crypto.randomUUID()}.tmp`
  const backupPath = `${markerPath}.backup`
  let movedExistingMarker = false
  try {
    if (fs.existsSync(backupPath)) {
      assertSafeMarkerFile(backupPath)
      fs.rmSync(backupPath, { force: true })
    }
    fs.writeFileSync(temporaryPath, JSON.stringify(validated, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    })
    if (fs.existsSync(markerPath)) {
      fs.renameSync(markerPath, backupPath)
      movedExistingMarker = true
    }
    fs.renameSync(temporaryPath, markerPath)
    fs.rmSync(backupPath, { force: true })
  } catch (error) {
    if (movedExistingMarker && !fs.existsSync(markerPath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, markerPath)
    }
    throw error
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

export const createPendingWindowsScopeMigrationMarker = (options: {
  legacyLauncherPath: string
  currentUserLauncherPath: string
  dataPath: string
  sourceVersion: string
  targetVersion: string
  now?: Date
  nonce?: string
}): WindowsScopeMigrationMarker => {
  const legacyLauncherPath = assertAbsoluteExe(options.legacyLauncherPath, 'Legacy launcher path')
  const currentUserLauncherPath = assertAbsoluteExe(options.currentUserLauncherPath, 'Current User launcher path')
  if (comparableWindowsPath(legacyLauncherPath) === comparableWindowsPath(currentUserLauncherPath)) {
    throw new Error('Legacy and Current User launcher paths must be different.')
  }
  if (!path.win32.isAbsolute(options.dataPath)) throw new Error('Launcher data path is invalid.')
  return {
    schemaVersion: WINDOWS_SCOPE_MIGRATION_SCHEMA_VERSION,
    nonce: options.nonce || crypto.randomBytes(32).toString('hex'),
    state: 'pending-relaunch',
    legacyLauncherPath,
    legacyInstallDirectory: path.win32.dirname(legacyLauncherPath),
    currentUserLauncherPath,
    dataPath: normalizeWindowsPath(options.dataPath),
    sourceVersion: options.sourceVersion,
    targetVersion: options.targetVersion,
    createdAt: (options.now || new Date()).toISOString()
  }
}

const getAllowedProgramFilesRoots = (programFilesRoots: readonly string[]) => programFilesRoots
  .filter((root) => root && path.win32.isAbsolute(root))
  .map(normalizeWindowsPath)

export const selectVerifiedLegacyCleanup = (options: {
  marker: WindowsScopeMigrationMarker
  currentLauncherPath: string
  currentVersion: string
  currentDataPath: string
  localAppDataPath: string
  programFilesRoots: readonly string[]
  uninstallRecords: readonly WindowsUninstallRecord[]
  now?: Date
}): VerifiedLegacyCleanup => {
  const marker = assertMarkerShape(options.marker)
  if (marker.state !== 'pending-relaunch') throw new Error('Windows scope migration is not awaiting a verified relaunch.')
  if (options.currentVersion !== marker.targetVersion) {
    throw new Error('Current User launcher version does not match the migration target.')
  }
  const markerAgeMs = (options.now || new Date()).getTime() - Date.parse(marker.createdAt)
  if (markerAgeMs < 0) throw new Error('Windows scope migration marker is dated in the future.')
  if (markerAgeMs > MAX_MARKER_AGE_MS) {
    throw new Error('Windows scope migration marker has expired.')
  }

  const currentLauncherPath = assertAbsoluteExe(options.currentLauncherPath, 'Current launcher path')
  const localAppDataPath = normalizeWindowsPath(options.localAppDataPath)
  if (!path.win32.isAbsolute(localAppDataPath)) throw new Error('Windows LocalAppData path is invalid.')
  const expectedCurrentDirectory = path.win32.join(
    localAppDataPath, 'Programs', 'NamLauncher', 'Launcher'
  )
  if (
    comparableWindowsPath(currentLauncherPath) !== comparableWindowsPath(marker.currentUserLauncherPath)
    || comparableWindowsPath(path.win32.dirname(currentLauncherPath)) !== comparableWindowsPath(expectedCurrentDirectory)
  ) {
    throw new Error('Current User launcher relaunch was not verified.')
  }
  if (comparableWindowsPath(options.currentDataPath) !== comparableWindowsPath(marker.dataPath)) {
    throw new Error('Launcher data location changed during the scope migration.')
  }

  const legacyLauncherPath = assertAbsoluteExe(marker.legacyLauncherPath, 'Legacy launcher path')
  const legacyInstallDirectory = normalizeWindowsPath(marker.legacyInstallDirectory)
  if (
    comparableWindowsPath(path.win32.dirname(legacyLauncherPath)) !== comparableWindowsPath(legacyInstallDirectory)
    || isWindowsPathAtOrInside(options.currentDataPath, legacyInstallDirectory)
    || isWindowsPathAtOrInside(currentLauncherPath, legacyInstallDirectory)
  ) {
    throw new Error('Legacy installation overlaps active Current User files or data.')
  }
  const allowedRoots = getAllowedProgramFilesRoots(options.programFilesRoots)
  if (!allowedRoots.some((root) => isWindowsPathStrictlyInside(legacyInstallDirectory, root))) {
    throw new Error('Legacy installation is outside a verified Program Files directory.')
  }

  const legacyRecords = options.uninstallRecords.filter((record) => (
    record.hive === 'HKLM' && recordMatchesWindowsLauncherDirectory(legacyInstallDirectory, record)
  ))
  const currentRecords = options.uninstallRecords.filter((record) => (
    record.hive === 'HKCU' && recordMatchesWindowsLauncherDirectory(expectedCurrentDirectory, record)
  ))
  if (legacyRecords.length !== 1 || currentRecords.length !== 1) {
    throw new Error('Windows installation records are missing or ambiguous.')
  }
  const uninstallerPath = assertAbsoluteExe(
    executableFromWindowsCommand(legacyRecords[0].uninstallString || ''),
    'Legacy uninstaller path'
  )
  if (
    !isWindowsPathAtOrInside(uninstallerPath, legacyInstallDirectory)
    || path.win32.basename(uninstallerPath).toLocaleLowerCase('en-US') !== 'uninstall namlauncher.exe'
  ) {
    throw new Error('Legacy uninstaller is outside the verified installation.')
  }
  return { legacyInstallDirectory, uninstallerPath, currentUserLauncherPath: currentLauncherPath, dataPath: marker.dataPath }
}

const hashFileSha256 = (filePath: string) => new Promise<string>((resolve, reject) => {
  const digest = crypto.createHash('sha256')
  const input = fs.createReadStream(filePath)
  input.on('data', (chunk) => digest.update(chunk))
  input.on('error', reject)
  input.on('end', () => resolve(digest.digest('hex')))
})

const verifySourceTreeAtTarget = async (sourceRoot: string, targetRoot: string) => {
  let entries = 0
  let files = 0
  let bytes = 0
  const visit = async (relativeDirectory: string): Promise<void> => {
    const sourceDirectory = path.join(sourceRoot, relativeDirectory)
    const targetDirectory = path.join(targetRoot, relativeDirectory)
    const sourceItems = await fs.promises.readdir(sourceDirectory, { withFileTypes: true })
    const targetDirectoryStat = await fs.promises.lstat(targetDirectory)
    if (!targetDirectoryStat.isDirectory() || targetDirectoryStat.isSymbolicLink()) {
      throw new Error('Migrated launcher data contains an unsafe target directory.')
    }
    for (const sourceItem of sourceItems) {
      entries += 1
      if (entries > MAX_VERIFIED_ENTRIES) throw new Error('Legacy launcher data is too large to verify safely.')
      const relativePath = path.join(relativeDirectory, sourceItem.name)
      const sourcePath = path.join(sourceRoot, relativePath)
      const targetPath = path.join(targetRoot, relativePath)
      const sourceStat = await fs.promises.lstat(sourcePath)
      if (sourceStat.isSymbolicLink()) throw new Error('Legacy launcher data contains a symbolic link.')
      if (sourceStat.isDirectory()) {
        await visit(relativePath)
        continue
      }
      if (!sourceStat.isFile()) throw new Error('Legacy launcher data contains an unsupported filesystem entry.')
      const targetStat = await fs.promises.lstat(targetPath)
      if (!targetStat.isFile() || targetStat.isSymbolicLink() || targetStat.size !== sourceStat.size) {
        throw new Error(`Migrated launcher data does not match: ${relativePath}`)
      }
      const [sourceHash, targetHash] = await Promise.all([
        hashFileSha256(sourcePath), hashFileSha256(targetPath)
      ])
      if (sourceHash !== targetHash) throw new Error(`Migrated launcher data does not match: ${relativePath}`)
      files += 1
      bytes += sourceStat.size
    }
  }
  await visit('')
  return { entries, files, bytes }
}

export const verifyLegacyInstallDataPreserved = async (options: {
  legacyInstallDirectory: string
  currentDataPath: string
}) => {
  const legacyInstallDirectory = path.resolve(options.legacyInstallDirectory)
  const currentDataPath = path.resolve(options.currentDataPath)
  if (isWindowsPathAtOrInside(currentDataPath, legacyInstallDirectory)) {
    throw new Error('Active launcher data remains inside the legacy installation.')
  }
  const legacyDataPath = path.join(legacyInstallDirectory, 'data')
  if (!fs.existsSync(legacyDataPath)) return { entries: 0, files: 0, bytes: 0 }
  const legacyStat = fs.lstatSync(legacyDataPath)
  if (!legacyStat.isDirectory() || legacyStat.isSymbolicLink()) {
    throw new Error('Legacy launcher data path is unsafe.')
  }
  return verifySourceTreeAtTarget(legacyDataPath, currentDataPath)
}
