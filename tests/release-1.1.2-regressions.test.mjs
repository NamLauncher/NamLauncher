import assert from 'node:assert/strict'
// Author/creator: nattapat2871 (https://nattapat2871.me)
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await (await import('./sourceText.mjs')).readRendererAppSource()
const skinPageSource = await readFile(new URL('../src/components/SkinPage.tsx', import.meta.url), 'utf8')
const mainSource = await (await import('./sourceText.mjs')).readElectronMainSource()

test('account switcher renders the real skin texture as a two-layer 2D Minecraft head', () => {
  assert.match(appSource, /const AccountHead = \(\{[\s\S]*skinTextureSrc/)
  assert.match(appSource, /style=\{\{ width: '800%', left: '-100%', top: '-100%', imageRendering: 'pixelated' \}\}/)
  assert.match(appSource, /style=\{\{ width: '800%', left: '-500%', top: '-100%', imageRendering: 'pixelated' \}\}/)
  assert.match(appSource, /library\.effectiveSkin\?\.textureDataUrl/)
  assert.match(appSource, /refreshSkinLibrary\(account\.id\)/)
  assert.doesNotMatch(appSource, /mc-heads\.net|crafatar\.com|minotar\.net/)
})

test('offline profiles default to Steve and skin changes flow back to the account switcher', () => {
  assert.match(mainSource, /account\.type === 'offline'[\s\S]*accountStore\.activeDefaultSkinId = 'steve'/)
  assert.match(mainSource, /effectiveSkin/)
  assert.match(mainSource, /const prepareOfflineSkinLaunch = async[\s\S]*getDefaultSkinPreset\(accountStore\.activeDefaultSkinId \|\| 'steve'\)[\s\S]*downloadDefaultSkinBuffer\(defaultSkin\)/)
  assert.match(appSource, /DEFAULT_STEVE_TEXTURE_URL = 'data:image\/png;base64,/)
  assert.match(appSource, /const offlineFallback = account\.type === 'offline' \? DEFAULT_STEVE_TEXTURE_URL : ''/)
  assert.match(appSource, /if \(offlineFallback && resolvedSrc !== offlineFallback\)[\s\S]*setResolvedSrc\(offlineFallback\)/)
  assert.match(appSource, /setAccountSkinTextures\(\(current\) => \(\{[\s\S]*\[account\.id\]: DEFAULT_STEVE_TEXTURE_URL/)
  assert.match(skinPageSource, /onLibraryChange\?: \(library: SkinLibraryData\) => void/)
  assert.match(skinPageSource, /onLibraryChange\?\.\(next\)/)
})

test('Microsoft built-in default skins update the real profile and do not mask later Mojang skin changes', () => {
  const defaultActivation = mainSource.slice(
    mainSource.indexOf('const saveDefaultSkinPreset = async'),
    mainSource.indexOf('const importSkinByPlayerName = async')
  )
  assert.match(defaultActivation, /if \(account\.type === 'msa'\) \{[\s\S]*uploadMinecraftSkin\(account, defaultSkinBuffer, defaultSkin\.model, null, false\)/)
  assert.match(mainSource, /account\.type === 'msa' && accountStore\.activeDefaultSkinId/)
  assert.match(mainSource, /if \(!defaultHash \|\| defaultHash !== currentHash\) accountStore\.activeDefaultSkinId = null/)
})

test('Modrinth beta versions use a distinct amber badge', () => {
  assert.match(appSource, /version\.version_type === 'beta'[\s\S]*border-amber-300\/40 bg-amber-400\/15 text-amber-200/)
  assert.match(appSource, /version\.version_type === 'alpha'[\s\S]*border-rose-300\/40 bg-rose-400\/15 text-rose-200/)
  assert.match(appSource, /border-emerald-300\/30 bg-emerald-400\/10 text-emerald-200/)
})

test('new instances receive every shared Partner Server before they are marked ready', () => {
  assert.match(appSource, /await window\.electron\.provisionInstance\(instance\)[\s\S]*setInstances\(\(prev\) => \[\.\.\.prev, instance\]\)/)
  assert.match(mainSource, /const provisionInstanceDefaults = async[\s\S]*partnerServers: await provisionPartnerServers\(instance\)/)
  assert.match(mainSource, /const instanceHasAllPartnerServers = async/)
  assert.match(mainSource, /PARTNER_SERVERS\.every\(\(partner(?:: any)?\) =>/)
  assert.match(mainSource, /mergePartnerServersDat\(serversPath\)/)
})

test('Minecraft crash reports preserve root-cause context instead of only the final log lines', () => {
  assert.match(mainSource, /const readTextFileHeadAndTail =/)
  assert.match(mainSource, /middle of file omitted; preserving crash header and tail/)
  assert.match(mainSource, /const buildDiagnosticExcerpt =/)
  assert.match(mainSource, /caused by:[\s\S]*unsatisfiedlink/i)
  assert.match(mainSource, /diagnosticExcerpt/)
  assert.match(mainSource, /combined\.diagnosticExcerpt/)
  assert.doesNotMatch(mainSource, /combined\.content\.split\(\/\\r\?\\n\/\)\.slice\(-180\)/)
})

test('remote error truncation preserves both the beginning and end and Windows exit codes are normalized', () => {
  assert.match(mainSource, /const headLength = Math\.ceil\(available \* 0\.6\)/)
  assert.match(mainSource, /const tailLength = Math\.max\(0, available - headLength\)/)
  assert.match(mainSource, /code > 0x7fffffff[\s\S]*code - 0x100000000/)
  assert.match(mainSource, /Minecraft exited with code \$\{normalizedCode\}/)
})

test('optional website stats and heartbeat failures are rate-limited in launcher logs', () => {
  assert.match(mainSource, /NETWORK_FAILURE_LOG_INTERVAL_MS = 5 \* 60 \* 1000/)
  assert.match(mainSource, /now - lastLauncherStatsFailureLogAt >= NETWORK_FAILURE_LOG_INTERVAL_MS/)
  assert.match(mainSource, /now - lastOnlineHeartbeatFailureLogAt >= NETWORK_FAILURE_LOG_INTERVAL_MS/)
})

test('identical launcher error popups are deduplicated for a short recovery window', () => {
  assert.match(mainSource, /ERROR_REPORT_DEDUP_WINDOW_MS = 30_000/)
  assert.match(mainSource, /now - lastPublishedError\.at < ERROR_REPORT_DEDUP_WINDOW_MS/)
})
