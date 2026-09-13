// Author/creator: nattapat2871 (https://nattapat2871.me)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { assertFileSha256 } from '../../shared/launcherUpdateIntegrity.ts'
import {
  isWindowsBundleVersion,
  normalizeWindowsBundleUpdateStatus,
  type WindowsBundleUpdateExpectation,
  type WindowsBundleUpdateStatus
} from '../../shared/windowsBundleUpdate.ts'
import { startIndependentPowerShell } from './windowsAutoInstaller.ts'

const READY_TIMEOUT_MS = 180_000
const STATUS_POLL_INTERVAL_MS = 100
const READY_STABILITY_MS = 250
const MAX_STATUS_BYTES = 4_096
const CANCELLATION_TIMEOUT_MS = 5_000
const MAX_BUNDLE_ARCHIVE_BYTES = 512 * 1024 * 1024
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04])

export type WindowsBundleUpdateHandoff = WindowsBundleUpdateExpectation & {
  helperPath: string
  statusPath: string
  cancellationPath: string
  healthPath: string
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const assertRegularFile = (filePath: string, label: string) => {
  const info = fs.lstatSync(filePath)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular file.`)
}

export const assertWindowsBundleArchive = (bundlePath: string, expectedSha256: string) => {
  const info = fs.lstatSync(bundlePath)
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error('Windows application bundle must be a regular file.')
  }
  if (info.size < 22 || info.size > MAX_BUNDLE_ARCHIVE_BYTES) {
    throw new Error('Windows application bundle size is invalid.')
  }
  const verifiedSha256 = assertFileSha256(bundlePath, expectedSha256)
  const descriptor = fs.openSync(bundlePath, 'r')
  try {
    const header = Buffer.alloc(ZIP_LOCAL_FILE_HEADER.length)
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length
      || !header.equals(ZIP_LOCAL_FILE_HEADER)) {
      throw new Error('Windows application bundle header is invalid.')
    }
  } finally {
    fs.closeSync(descriptor)
  }
  return verifiedSha256
}

const processExists = (processId: number) => {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

const readMatchingStatus = (
  statusPath: string,
  expected: WindowsBundleUpdateExpectation
): WindowsBundleUpdateStatus | null => {
  try {
    const info = fs.lstatSync(statusPath)
    if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > MAX_STATUS_BYTES) return null
    return normalizeWindowsBundleUpdateStatus(JSON.parse(fs.readFileSync(statusPath, 'utf8')), expected)
  } catch {
    return null
  }
}

const writeCancellationMarker = (
  cancellationPath: string,
  expected: Pick<WindowsBundleUpdateExpectation, 'attemptId' | 'nonce'>
) => {
  const payload = JSON.stringify({
    schemaVersion: 1,
    attemptId: expected.attemptId,
    nonce: expected.nonce,
    cancelledAt: new Date().toISOString()
  })
  try {
    fs.writeFileSync(cancellationPath, payload, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (!fs.existsSync(cancellationPath)) throw error
    const info = fs.lstatSync(cancellationPath)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe Windows bundle update cancellation path.')
  }
}

const cancelHelperSafely = async (handoff: WindowsBundleUpdateHandoff) => {
  writeCancellationMarker(handoff.cancellationPath, handoff)
  const deadline = Date.now() + CANCELLATION_TIMEOUT_MS
  while (processExists(handoff.helperPid) && Date.now() < deadline) await wait(50)
  if (processExists(handoff.helperPid)) {
    throw new Error('Windows bundle updater did not acknowledge cancellation safely.')
  }
  for (const candidate of [handoff.helperPath, handoff.statusPath, handoff.cancellationPath, handoff.healthPath]) {
    try {
      if (!fs.existsSync(candidate)) continue
      const info = fs.lstatSync(candidate)
      if (info.isFile() && !info.isSymbolicLink()) fs.rmSync(candidate, { force: true })
    } catch {
      // Diagnostics are best effort and links are never followed.
    }
  }
}

export const waitForWindowsBundleReady = async (options: {
  statusPath: string
  expected: WindowsBundleUpdateExpectation
  timeoutMs?: number
}) => {
  const deadline = Date.now() + (options.timeoutMs ?? READY_TIMEOUT_MS)
  while (Date.now() < deadline) {
    const status = readMatchingStatus(options.statusPath, options.expected)
    if (status?.state === 'failed' || status?.state === 'rolled-back') {
      throw new Error(`Windows bundle updater failed: ${status.detail}`)
    }
    if (status?.state === 'ready') {
      await wait(READY_STABILITY_MS)
      const stable = readMatchingStatus(options.statusPath, options.expected)
      if (stable?.state === 'ready') return stable
    }
    if (!processExists(options.expected.helperPid)) {
      throw new Error('Windows bundle updater exited before the application bundle was ready.')
    }
    await wait(STATUS_POLL_INTERVAL_MS)
  }
  throw new Error('Windows bundle updater did not verify the application bundle in time.')
}

export const launchWindowsBundleUpdater = async (options: {
  bundlePath: string
  expectedSha256: string
  expectedVersion: string
  launcherPath: string
  helperSource: string
  workDirectory: string
  parentId: number
  readyTimeoutMs?: number
}): Promise<WindowsBundleUpdateHandoff> => {
  if (process.platform !== 'win32') throw new Error('Windows bundle updates can only run on Windows.')
  if (!isWindowsBundleVersion(options.expectedVersion)) throw new Error('Invalid Windows bundle update version.')
  if (!Number.isSafeInteger(options.parentId) || options.parentId < 1) throw new Error('Invalid launcher process id.')

  assertWindowsBundleArchive(options.bundlePath, options.expectedSha256)
  const directory = fs.realpathSync(options.workDirectory)
  const bundlePath = fs.realpathSync(options.bundlePath)
  const launcherPath = fs.realpathSync(options.launcherPath)
  const helperSource = fs.realpathSync(options.helperSource)
  assertRegularFile(bundlePath, 'Windows application bundle')
  assertRegularFile(launcherPath, 'Launcher executable')
  assertRegularFile(helperSource, 'Windows bundle updater helper')
  if (path.dirname(bundlePath) !== directory || !/^[A-Za-z0-9._-]+\.zip$/i.test(path.basename(bundlePath))) {
    throw new Error('Unsafe Windows application bundle location.')
  }
  if (path.basename(launcherPath).toLocaleLowerCase('en-US') !== 'namlauncher.exe') {
    throw new Error('Unsafe Windows launcher executable path.')
  }

  const attemptId = crypto.randomUUID()
  const nonce = crypto.randomBytes(32).toString('hex')
  const helperPath = path.join(directory, `apply-app-update-${attemptId}.ps1`)
  const statusPath = path.join(directory, `app-update-status-${attemptId}.json`)
  const cancellationPath = path.join(directory, `app-update-cancel-${attemptId}.json`)
  const healthPath = path.join(directory, `app-update-health-${attemptId}.json`)
  fs.copyFileSync(helperSource, helperPath, fs.constants.COPYFILE_EXCL)
  assertRegularFile(helperPath, 'Windows bundle updater helper copy')

  const powershellPath = fs.realpathSync(path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
  ))
  assertRegularFile(powershellPath, 'Windows PowerShell executable')
  const args = [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', helperPath,
    '-BundlePath', bundlePath,
    '-ExpectedSha256', options.expectedSha256,
    '-ExpectedVersion', options.expectedVersion,
    '-LauncherPath', launcherPath,
    '-ParentId', String(options.parentId),
    '-StatusPath', statusPath,
    '-CancellationPath', cancellationPath,
    '-HealthPath', healthPath,
    '-AttemptId', attemptId,
    '-Nonce', nonce
  ]
  const helperPid = await startIndependentPowerShell({ powershellPath, args, nonce })
  const handoff: WindowsBundleUpdateHandoff = {
    attemptId,
    nonce,
    helperPid,
    helperPath,
    statusPath,
    cancellationPath,
    healthPath
  }

  try {
    await waitForWindowsBundleReady({
      statusPath,
      expected: handoff,
      timeoutMs: options.readyTimeoutMs
    })
    return handoff
  } catch (error) {
    try {
      await cancelHelperSafely(handoff)
    } catch (cancelError) {
      throw new AggregateError([error, cancelError], 'Windows bundle updater failed and could not be cancelled safely.')
    }
    throw error
  }
}
