// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  getWindowsBundleFileName,
  normalizeWindowsBundleHealth,
  normalizeWindowsBundleUpdateStatus,
  shouldUseWindowsApplicationBundle
} from '../shared/windowsBundleUpdate.ts'
import { assertWindowsBundleArchive } from '../electron/updates/windowsBundleUpdater.ts'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const powershell = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
)
const cscCandidates = [
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
]
const csc = cscCandidates.find((candidate) => fs.existsSync(candidate))
const updaterSource = new URL('../packaging/update-windows-bundle.ps1', import.meta.url)

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const waitFor = async (predicate, timeoutMs = 15_000, label = 'condition') => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await wait(50)
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

const readJsonIfPresent = async (filePath) => {
  try { return JSON.parse(await readFile(filePath, 'utf8')) } catch { return null }
}

const runProcess = (file, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { windowsHide: true, shell: false, ...options })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
  child.once('error', reject)
  child.once('close', (code) => resolve({ code, stdout, stderr }))
})

const compileLauncherFixture = async (outputPath, confirmsHealth) => {
  if (!csc) throw new Error('The Windows C# compiler fixture is unavailable.')
  const sourcePath = `${outputPath}.cs`
  const source = `// Author/creator: nattapat2871 (https://nattapat2871.me)
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

public static class Program {
  private static string ReadArgument(string[] args, string name) {
    for (int index = 0; index + 1 < args.Length; index++) {
      if (args[index] == name) return args[index + 1];
    }
    return "";
  }

  public static void Main(string[] args) {
    string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
    if (Array.IndexOf<string>(args, "--auto-update-fallback") >= 0) {
      File.WriteAllText(Path.Combine(baseDirectory, "fallback.txt"), "restored", new UTF8Encoding(false));
      return;
    }

    if (${confirmsHealth ? 'true' : 'false'}) {
      string healthPath = ReadArgument(args, "--auto-update-health");
      string attemptId = ReadArgument(args, "--auto-update-attempt");
      string nonce = ReadArgument(args, "--auto-update-nonce");
      string version = ReadArgument(args, "--auto-update-version");
      if (!String.IsNullOrEmpty(healthPath)) {
        string json = "{\\\"schemaVersion\\\":1,\\\"attemptId\\\":\\\"" + attemptId
          + "\\\",\\\"nonce\\\":\\\"" + nonce + "\\\",\\\"version\\\":\\\"" + version
          + "\\\",\\\"launcherPid\\\":" + Process.GetCurrentProcess().Id
          + ",\\\"at\\\":\\\"" + DateTime.UtcNow.ToString("o") + "\\\"}";
        File.WriteAllText(healthPath, json, new UTF8Encoding(false));
        Thread.Sleep(1200);
        return;
      }
    }

    Thread.Sleep(30000);
  }
}`
  await writeFile(sourcePath, source, 'utf8')
  const result = await runProcess(csc, [
    '/nologo', '/target:winexe', `/out:${outputPath}`, sourcePath
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.code, 0, result.stderr || result.stdout)
}

const writeBundleFixture = async (directory, version, confirmsHealth) => {
  await mkdir(directory, { recursive: true })
  const launcherPath = path.join(directory, 'NamLauncher.exe')
  const versionPath = path.join(directory, 'version.txt')
  await compileLauncherFixture(launcherPath, confirmsHealth)
  await writeFile(versionPath, version, 'utf8')
  const files = [launcherPath, versionPath].map((absolute) => ({
    path: path.basename(absolute),
    size: fs.statSync(absolute).size,
    sha256: sha256(absolute)
  }))
  const manifestPath = path.join(directory, 'namlauncher-bundle.json')
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: 1,
    version,
    platform: 'win32',
    arch: 'x64',
    entrypoint: 'NamLauncher.exe',
    createdAt: new Date().toISOString(),
    files
  }), 'utf8')
  return { launcherPath, manifestPath, versionPath }
}

const processExists = (processId) => {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

const createBundleArchive = (sourceDirectory, bundlePath) => {
  const archive = new AdmZip()
  for (const name of ['NamLauncher.exe', 'version.txt', 'namlauncher-bundle.json']) {
    archive.addLocalFile(path.join(sourceDirectory, name))
  }
  archive.writeZip(bundlePath)
  return sha256(bundlePath)
}

const runBundleScenario = async (confirmsHealth) => {
  const version = '1.2.4-beta3'
  const root = await mkdtemp(path.join(os.tmpdir(), 'namlauncher-beta3-bundle-'))
  const workDirectory = path.join(root, 'updates')
  const installDirectory = path.join(root, 'NamLauncher')
  const bundleDirectory = path.join(root, 'bundle-source')
  let parent = null
  try {
    await mkdir(workDirectory, { recursive: true })
    await mkdir(installDirectory, { recursive: true })
    const launcherPath = path.join(installDirectory, 'NamLauncher.exe')
    await compileLauncherFixture(launcherPath, false)
    await writeFile(path.join(installDirectory, 'old-version.txt'), '1.2.4-beta2', 'utf8')
    await writeBundleFixture(bundleDirectory, version, confirmsHealth)

    const bundlePath = path.join(workDirectory, getWindowsBundleFileName(version))
    const expectedSha256 = createBundleArchive(bundleDirectory, bundlePath)
    const attemptId = crypto.randomUUID()
    const nonce = crypto.randomBytes(32).toString('hex')
    const helperPath = path.join(workDirectory, `apply-app-update-${attemptId}.ps1`)
    const statusPath = path.join(workDirectory, `app-update-status-${attemptId}.json`)
    const cancellationPath = path.join(workDirectory, `app-update-cancel-${attemptId}.json`)
    const healthPath = path.join(workDirectory, `app-update-health-${attemptId}.json`)
    await writeFile(helperPath, await readFile(updaterSource, 'utf8'), 'utf8')

    parent = spawn(launcherPath, [], { windowsHide: true, shell: false, stdio: 'ignore' })
    await waitFor(() => processExists(parent.pid), 3_000, 'fixture launcher process')
    const updaterResultPromise = runProcess(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', helperPath,
      '-BundlePath', bundlePath,
      '-ExpectedSha256', expectedSha256,
      '-ExpectedVersion', version,
      '-LauncherPath', launcherPath,
      '-ParentId', String(parent.pid),
      '-StatusPath', statusPath,
      '-CancellationPath', cancellationPath,
      '-HealthPath', healthPath,
      '-AttemptId', attemptId,
      '-Nonce', nonce,
      '-HealthTimeoutSeconds', '5'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PSModulePath: path.join(path.dirname(powershell), 'Modules') }
    })

    const ready = await waitFor(async () => {
      const status = await readJsonIfPresent(statusPath)
      if (status?.state === 'failed' || status?.state === 'rolled-back') {
        const updaterResult = await updaterResultPromise
        throw new Error(`Bundle updater stopped before readiness: ${status.detail}; ${updaterResult.stderr}`)
      }
      return status?.state === 'ready' ? status : null
    }, 15_000, 'verified bundle readiness')
    assert.equal(ready.attemptId, attemptId)
    assert.equal(ready.nonce, nonce)
    assert.equal(ready.helperPid > 0, true)

    parent.kill()
    await waitFor(() => !processExists(parent.pid), 5_000, 'old launcher exit')
    const updaterResult = await updaterResultPromise
    const finalStatus = await waitFor(async () => {
      const status = await readJsonIfPresent(statusPath)
      return ['healthy', 'rolled-back', 'failed'].includes(status?.state) ? status : null
    }, 10_000, 'final updater status')
    if (finalStatus.launcherPid) {
      await waitFor(() => !processExists(finalStatus.launcherPid), 5_000, 'fixture updated launcher exit')
    }
    return {
      root,
      installDirectory,
      bundlePath,
      expectedSha256,
      updaterResult,
      finalStatus
    }
  } catch (error) {
    if (parent && processExists(parent.pid)) parent.kill()
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

test('Windows bundle markers require the exact attempt, nonce, helper, version, and launcher process', () => {
  const expected = {
    attemptId: '12345678-1234-4123-8123-123456789abc',
    nonce: 'a'.repeat(64),
    helperPid: 4321
  }
  const status = {
    schemaVersion: 1,
    ...expected,
    state: 'ready',
    detail: 'Verified application bundle.',
    at: new Date().toISOString()
  }
  assert.deepEqual(normalizeWindowsBundleUpdateStatus(status, expected), status)
  assert.equal(normalizeWindowsBundleUpdateStatus({ ...status, nonce: 'b'.repeat(64) }, expected), null)
  assert.equal(normalizeWindowsBundleUpdateStatus({ ...status, helperPid: 4322 }, expected), null)

  const health = {
    schemaVersion: 1,
    attemptId: expected.attemptId,
    nonce: expected.nonce,
    version: '1.2.4-beta3',
    launcherPid: 8765,
    at: new Date().toISOString()
  }
  assert.deepEqual(normalizeWindowsBundleHealth(health, {
    attemptId: expected.attemptId,
    nonce: expected.nonce,
    version: health.version,
    launcherPid: health.launcherPid
  }), health)
  assert.equal(normalizeWindowsBundleHealth({ ...health, version: '1.2.4-beta2' }, {
    attemptId: expected.attemptId,
    nonce: expected.nonce,
    version: health.version,
    launcherPid: health.launcherPid
  }), null)
})

test('the bridge release uses a bundle only for a Current User install with complete metadata', () => {
  assert.equal(shouldUseWindowsApplicationBundle('current-user', 'https://example.invalid/app.zip', 'a'.repeat(64)), true)
  assert.equal(shouldUseWindowsApplicationBundle('all-users', 'https://example.invalid/app.zip', 'a'.repeat(64)), false)
  assert.equal(shouldUseWindowsApplicationBundle('current-user', null, 'a'.repeat(64)), false)
  assert.equal(shouldUseWindowsApplicationBundle('current-user', 'https://example.invalid/app.zip', null), false)
  assert.equal(getWindowsBundleFileName('1.2.4-beta3'), 'NamLauncher-1.2.4-beta3-Windows-x64.zip')
})

test('download validation rejects a changed digest and a non-ZIP payload', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'namlauncher-bundle-validation-'))
  try {
    const validPath = path.join(root, 'fixture.zip')
    const archive = new AdmZip()
    archive.addFile('fixture.txt', Buffer.from('verified beta3 fixture'))
    archive.writeZip(validPath)
    const digest = sha256(validPath)
    assert.equal(assertWindowsBundleArchive(validPath, digest), digest)
    assert.throws(() => assertWindowsBundleArchive(validPath, '0'.repeat(64)), /integrity verification/)

    const invalidPath = path.join(root, 'not-a-zip.zip')
    await writeFile(invalidPath, Buffer.alloc(64, 7))
    assert.throws(() => assertWindowsBundleArchive(invalidPath, sha256(invalidPath)), /header is invalid/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('1.2.4 beta3 bundle replaces a beta2 Current User app and confirms healthy startup', {
  skip: process.platform !== 'win32' || !csc,
  timeout: 45_000
}, async () => {
  const scenario = await runBundleScenario(true)
  try {
    assert.equal(scenario.updaterResult.code, 0, scenario.updaterResult.stderr)
    assert.equal(scenario.finalStatus.state, 'healthy')
    assert.equal(await readFile(path.join(scenario.installDirectory, 'version.txt'), 'utf8'), '1.2.4-beta3')
    assert.equal(fs.existsSync(path.join(scenario.installDirectory, 'old-version.txt')), false)
    assert.equal(assertWindowsBundleArchive(scenario.bundlePath, scenario.expectedSha256), scenario.expectedSha256)
    assert.equal((await readdir(scenario.root)).some((name) => name.includes('-backup-')), false)
  } finally {
    await rm(scenario.root, { recursive: true, force: true })
  }
})

test('a beta3 bundle that never confirms its UI is rolled back to beta2', {
  skip: process.platform !== 'win32' || !csc,
  timeout: 45_000
}, async () => {
  const scenario = await runBundleScenario(false)
  try {
    assert.equal(scenario.updaterResult.code, 1)
    assert.equal(scenario.finalStatus.state, 'rolled-back')
    assert.match(scenario.finalStatus.detail, /did not confirm a healthy interface/)
    assert.equal(await readFile(path.join(scenario.installDirectory, 'old-version.txt'), 'utf8'), '1.2.4-beta2')
    assert.equal(fs.existsSync(path.join(scenario.installDirectory, 'version.txt')), false)
    await waitFor(
      () => fs.existsSync(path.join(scenario.installDirectory, 'fallback.txt')),
      5_000,
      'rollback fallback restart'
    )
    assert.equal((await readdir(scenario.root)).some((name) => name.includes('-backup-')), false)
  } finally {
    await rm(scenario.root, { recursive: true, force: true })
  }
})
