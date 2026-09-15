import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Author/creator: nattapat2871 (https://nattapat2871.me)

const mainSource = await (await import('./sourceText.mjs')).readElectronMainSource()
const preloadSource = await readFile(new URL('../electron/preload.ts', import.meta.url), 'utf8')
const appSource = await (await import('./sourceText.mjs')).readRendererAppSource()
const skinPageSource = await readFile(new URL('../src/components/SkinPage.tsx', import.meta.url), 'utf8')

test('opens the skin page from local cache and refreshes the Microsoft profile in the background', () => {
  assert.match(mainSource, /type StoredMinecraftProfileCache =/)
  assert.match(mainSource, /const readCachedMinecraftProfile =/)
  assert.match(mainSource, /const cacheMinecraftProfile =/)
  assert.match(mainSource, /trustedIpcHandle\('get-skin-library'[\s\S]*getPublicSkinLibrary\(accountId, false\)/)
  assert.match(mainSource, /trustedIpcHandle\('refresh-skin-library'[\s\S]*getPublicSkinLibrary\(accountId, true\)/)
  assert.match(preloadSource, /refreshSkinLibrary: \(accountId: string\) => invoke\('refresh-skin-library'/)
  assert.match(skinPageSource, /await window\.electron\.getSkinLibrary\(accountId\)[\s\S]*setLoading\(false\)[\s\S]*await window\.electron\.refreshSkinLibrary\(accountId\)/)
  assert.match(appSource, /onPointerEnter={[\s\S]*loadSkinPageModule/)
})
test('serializes same-path downloads and gives every transfer its own temporary file', () => {
  assert.match(mainSource, /const fileDownloadLocks = new Map<string, Promise<void>>\(\)/)
  assert.match(mainSource, /const withFileDownloadLock = async/)
  assert.match(mainSource, /withFileDownloadLock\(filePath, async \(\) =>/)
  assert.match(mainSource, /`\$\{filePath\}\.\$\{process\.pid\}-\$\{crypto\.randomUUID\(\)\}\.download`/)
  assert.match(mainSource, /const replaceFileWithCandidate = \(candidatePath: string, targetPath: string\) => \{/)
  assert.match(mainSource, /fs\.renameSync\(targetPath, backupPath\)[\s\S]*fs\.renameSync\(candidatePath, targetPath\)/)
  assert.match(mainSource, /replaceFileWithCandidate\(tempPath, filePath\)/)
  assert.doesNotMatch(mainSource, /if \(force && fs\.existsSync\(filePath\)\) fs\.rmSync\(filePath/)
  assert.doesNotMatch(mainSource, /const tempPath = `\$\{filePath\}\.download`/)
})

test('pre-verifies the vanilla Minecraft client before running the NeoForge installer', () => {
  assert.match(mainSource, /const MOJANG_VERSION_MANIFEST_URL = 'https:\/\/piston-meta\.mojang\.com\/mc\/game\/version_manifest_v2\.json'/)
  assert.match(mainSource, /const ensureVerifiedMinecraftClient = async/)
  assert.match(mainSource, /hashFile\(clientPath, 'sha1'\)/)
  assert.match(mainSource, /client failed checksum verification after 3 downloads/)
  assert.match(mainSource, /await ensureVerifiedMinecraftClient\(instanceRoot, safeMinecraftVersion, signal\)[\s\S]*await runNeoForgeInstaller/)
})

test('recovers a missing launch IPC reply by reconciling the main-process game state', () => {
  assert.match(preloadSource, /const isMissingIpcReplyError =/)
  assert.match(preloadSource, /const launchMinecraftWithRecovery = async/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('get-game-state'\)/)
  assert.match(preloadSource, /alreadyRunning: true/)
  assert.match(preloadSource, /alreadyLaunching: true/)
  assert.match(preloadSource, /launchMinecraft: \(options: any\) => launchMinecraftWithRecovery\(options\)/)
})
