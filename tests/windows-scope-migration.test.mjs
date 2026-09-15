// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import {
  WINDOWS_SCOPE_MIGRATION_MARKER_FILE,
  createPendingWindowsScopeMigrationMarker,
  readWindowsScopeMigrationMarker,
  selectVerifiedLegacyCleanup,
  verifyLegacyInstallDataPreserved,
  writeWindowsScopeMigrationMarker
} from '../electron/updates/windowsLegacyInstallMigration.ts'

const localAppDataPath = String.raw`C:\Users\LauncherUser\AppData\Local`
const programFilesPath = String.raw`C:\Program Files`
const legacyInstallDirectory = String.raw`C:\Program Files\NamLauncher\Launcher`
const legacyLauncherPath = String.raw`C:\Program Files\NamLauncher\Launcher\NamLauncher.exe`
const currentUserInstallDirectory = String.raw`C:\Users\LauncherUser\AppData\Local\Programs\NamLauncher\Launcher`
const currentUserLauncherPath = String.raw`C:\Users\LauncherUser\AppData\Local\Programs\NamLauncher\Launcher\NamLauncher.exe`
const preservedDataPath = String.raw`C:\Users\LauncherUser\AppData\Roaming\NamLauncher`
const now = new Date('2026-09-14T05:00:00.000Z')

const createMarker = (overrides = {}) => createPendingWindowsScopeMigrationMarker({
  legacyLauncherPath,
  currentUserLauncherPath,
  dataPath: preservedDataPath,
  sourceVersion: '1.2.3',
  targetVersion: '1.2.4',
  now: new Date(now.getTime() - 60_000),
  nonce: 'a'.repeat(64),
  ...overrides
})

const uninstallRecords = [
  {
    hive: 'HKLM',
    installLocation: legacyInstallDirectory,
    uninstallString: `"${legacyInstallDirectory}\\Uninstall NamLauncher.exe" /allusers`
  },
  {
    hive: 'HKCU',
    installLocation: currentUserInstallDirectory,
    uninstallString: `"${currentUserInstallDirectory}\\Uninstall NamLauncher.exe" /currentuser`
  }
]

const verifySelection = (overrides = {}) => selectVerifiedLegacyCleanup({
  marker: createMarker(),
  currentLauncherPath: currentUserLauncherPath,
  currentVersion: '1.2.4',
  currentDataPath: preservedDataPath,
  localAppDataPath,
  programFilesRoots: [programFilesPath, String.raw`C:\Program Files (x86)`],
  uninstallRecords,
  now,
  ...overrides
})

test('selects exactly one legacy HKLM installation after one Current User HKCU relaunch', () => {
  assert.deepEqual(verifySelection(), {
    legacyInstallDirectory,
    uninstallerPath: String.raw`C:\Program Files\NamLauncher\Launcher\Uninstall NamLauncher.exe`,
    currentUserLauncherPath,
    dataPath: preservedDataPath
  })
})

test('fails closed when uninstall records are missing or ambiguous', () => {
  assert.throws(() => verifySelection({ uninstallRecords: uninstallRecords.slice(1) }), /missing or ambiguous/)
  assert.throws(() => verifySelection({
    uninstallRecords: [...uninstallRecords, { ...uninstallRecords[0] }]
  }), /missing or ambiguous/)
  assert.throws(() => verifySelection({
    uninstallRecords: [...uninstallRecords, { ...uninstallRecords[1] }]
  }), /missing or ambiguous/)
})

test('rejects unsafe legacy, active data, Current User, and LocalAppData paths', () => {
  const outsideProgramFiles = createMarker({
    legacyLauncherPath: String.raw`D:\Portable\NamLauncher\Launcher\NamLauncher.exe`
  })
  assert.throws(() => verifySelection({ marker: outsideProgramFiles }), /outside a verified Program Files/)
  assert.throws(() => verifySelection({
    marker: createMarker({
      legacyLauncherPath: String.raw`C:\Program Files\NamLauncher.exe`
    })
  }), /outside a verified Program Files/)
  assert.throws(() => verifySelection({
    currentDataPath: String.raw`C:\Program Files\NamLauncher\Launcher\data`,
    marker: createMarker({ dataPath: String.raw`C:\Program Files\NamLauncher\Launcher\data` })
  }), /overlaps active Current User files or data/)
  assert.throws(() => verifySelection({
    currentLauncherPath: String.raw`C:\Users\LauncherUser\Desktop\NamLauncher.exe`
  }), /relaunch was not verified/)
  assert.throws(() => verifySelection({ currentVersion: '1.2.3' }), /version does not match/)
  assert.throws(() => verifySelection({ localAppDataPath: 'relative' }), /LocalAppData path is invalid/)
})

test('rejects expired and future migration markers', () => {
  assert.throws(() => verifySelection({
    marker: createMarker({ now: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000) })
  }), /expired/)
  assert.throws(() => verifySelection({
    marker: createMarker({ now: new Date(now.getTime() + 1) })
  }), /dated in the future/)
})

test('atomically replaces a valid migration marker without losing its data', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'namlauncher-scope-marker-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const markerPath = path.join(root, WINDOWS_SCOPE_MIGRATION_MARKER_FILE)
  writeWindowsScopeMigrationMarker(markerPath, createMarker())
  writeWindowsScopeMigrationMarker(markerPath, createMarker({ targetVersion: '1.2.5', nonce: 'b'.repeat(64) }))
  const persisted = readWindowsScopeMigrationMarker(markerPath)
  assert.equal(persisted?.targetVersion, '1.2.5')
  assert.equal(persisted?.nonce, 'b'.repeat(64))
})

test('verifies every legacy data file byte-for-byte before cleanup', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'namlauncher-scope-data-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const legacyDirectory = path.join(root, 'legacy')
  const legacyData = path.join(legacyDirectory, 'data')
  const currentData = path.join(root, 'current')
  await Promise.all([
    mkdir(path.join(legacyData, 'instances', 'example'), { recursive: true }),
    mkdir(path.join(currentData, 'instances', 'example'), { recursive: true })
  ])
  const files = [
    ['accounts.json', '{"slot":"same1"}'],
    [path.join('instances', 'example', 'options.txt'), 'renderDistance:12']
  ]
  await Promise.all(files.flatMap(([relativePath, content]) => [
    writeFile(path.join(legacyData, relativePath), content),
    writeFile(path.join(currentData, relativePath), content)
  ]))

  const result = await verifyLegacyInstallDataPreserved({
    legacyInstallDirectory: legacyDirectory,
    currentDataPath: currentData
  })
  assert.equal(result.files, 2)
  assert.equal(result.bytes, files.reduce((sum, [, content]) => sum + Buffer.byteLength(content), 0))

  await writeFile(path.join(currentData, 'accounts.json'), '{"slot":"same2"}')
  await assert.rejects(verifyLegacyInstallDataPreserved({
    legacyInstallDirectory: legacyDirectory,
    currentDataPath: currentData
  }), /does not match/)

  await writeFile(path.join(currentData, 'accounts.json'), '{"slot":"same1"}')
  await unlink(path.join(currentData, 'instances', 'example', 'options.txt'))
  await assert.rejects(verifyLegacyInstallDataPreserved({
    legacyInstallDirectory: legacyDirectory,
    currentDataPath: currentData
  }), /ENOENT|does not match/)
})

test('wires cleanup only after renderer readiness and packages a UAC-only helper', async () => {
  const require = createRequire(import.meta.url)
  const packageJson = require('../package.json')
  const [main, helper, installer] = await Promise.all([
    readFile(new URL('../electron/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../packaging/cleanup-legacy-windows.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../build/installer.nsh', import.meta.url), 'utf8')
  ])
  const rendererReadyIndex = main.indexOf("trustedIpcHandle('renderer-ready'")
  const cleanupCallIndex = main.indexOf('runPendingWindowsScopeMigrationAfterRendererReady()')
  assert.ok(rendererReadyIndex > 0)
  assert.ok(cleanupCallIndex > rendererReadyIndex)
  assert.equal([...main.matchAll(/runPendingWindowsScopeMigrationAfterRendererReady\(\)/g)].length, 1)
  assert.equal([...main.matchAll(/preparePendingWindowsScopeMigration\(update\.latestVersion\)/g)].length, 2)
  assert.match(main, /await spawnDownloadedLauncherInstaller\(installerPath, \['--updated', '\/currentuser'\]\)/)
  assert.doesNotMatch(main, /--choose-install-mode/)

  assert.ok(packageJson.build.extraResources.some((resource) => (
    resource.from === 'packaging/cleanup-legacy-windows.ps1'
    && resource.to === 'updater/cleanup-legacy-windows.ps1'
  )))
  assert.match(helper, /Start-Process[\s\S]*-Verb RunAs[\s\S]*-Wait/)
  assert.match(helper, /cleanup-deferred/)
  assert.match(helper, /operation was canceled\|1223/)
  assert.match(helper, /Programs\\NamLauncher\\Launcher/)
  assert.doesNotMatch(helper, /Remove-Item|RMDir/)

  const installerOnly = installer.split('!ifdef BUILD_UNINSTALLER')[0]
  assert.match(installerOnly, /setInstallModePerUser/)
  assert.doesNotMatch(installerOnly, /DeleteRegKey HKLM|RMDir\s+\/r/)
})
