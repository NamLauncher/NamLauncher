import assert from 'node:assert/strict'
// Author/creator: nattapat2871 (https://nattapat2871.me)
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const workflowSource = (await readFile(
  new URL('../.github/workflows/build-macos.yml', import.meta.url),
  'utf8'
)).replace(/\r\n?/g, '\n')
const appSource = await (await import('./sourceText.mjs')).readRendererAppSource()
const preloadSource = await readFile(new URL('../electron/preload.ts', import.meta.url), 'utf8')
const mainSource = await (await import('./sourceText.mjs')).readElectronMainSource()
const mainEntitlements = await readFile(new URL('../packaging/mac/entitlements.mac.plist', import.meta.url), 'utf8')
const inheritedEntitlements = await readFile(new URL('../packaging/mac/entitlements.mac.inherit.plist', import.meta.url), 'utf8')
const iconScriptSource = await readFile(new URL('../packaging/mac/prepare-icon.sh', import.meta.url), 'utf8')
const macIgnoreSource = await readFile(new URL('../packaging/mac/.gitignore', import.meta.url), 'utf8')
const stageSource = await readFile(new URL('../scripts/stage-release-artifacts.mjs', import.meta.url), 'utf8')
const readmeSource = await readFile(new URL('../README.md', import.meta.url), 'utf8')

const runStageScript = (fixtureRoot) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/stage-release-artifacts.mjs', 'mac'], {
    cwd: fixtureRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NAMLAUNCHER_ALLOW_PRERELEASE_STAGE: '1' }
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.once('error', reject)
  child.once('exit', (code) => resolve({ code, stdout, stderr }))
})
const createStageFixture = async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'namlauncher-mac-integrity-'))
  await mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true })
  await mkdir(path.join(fixtureRoot, 'release'), { recursive: true })
  await mkdir(path.join(fixtureRoot, 'release', 'staged'), { recursive: true })
  await writeFile(
    path.join(fixtureRoot, 'package.json'),
    JSON.stringify({ version: '9.8.7-integrity-test' }),
    'utf8'
  )
  await writeFile(path.join(fixtureRoot, 'scripts', 'stage-release-artifacts.mjs'), stageSource, 'utf8')
  return fixtureRoot
}

test('configures a deterministic unsigned universal DMG for the beta sandbox', () => {
  assert.equal(packageJson.version, '1.2.4')
  assert.deepEqual(packageJson.build.mac.target, [{ target: 'dmg', arch: ['universal'] }])
  assert.equal(packageJson.build.mac.icon, 'packaging/mac/generated/namlauncher.icns')
  assert.equal(packageJson.build.mac.category, 'public.app-category.games')
  assert.equal(packageJson.build.mac.hardenedRuntime, true)
  assert.equal(packageJson.build.mac.gatekeeperAssess, false)
  assert.equal(packageJson.build.mac.identity, null)
  assert.equal(packageJson.build.mac.notarize, false)
  assert.equal(packageJson.build.mac.entitlements, 'packaging/mac/entitlements.mac.plist')
  assert.equal(packageJson.build.mac.entitlementsInherit, 'packaging/mac/entitlements.mac.inherit.plist')
  assert.equal(packageJson.build.mac.artifactName, 'NamLauncher-${version}-macOS-universal.${ext}')
  assert.equal(packageJson.build.dmg.format, 'ULFO')
})

test('uses one unsigned-first build command with token verification and isolated staging', () => {
  assert.match(packageJson.scripts['predist:mac'], /assert-error-report-token\.mjs/)
  assert.match(packageJson.scripts['predist:mac'], /packaging\/mac\/prepare-icon\.sh/)
  assert.match(packageJson.scripts['dist:mac'], /npm run build/)
  assert.match(packageJson.scripts['dist:mac'], /verify-error-report-token-in-build\.mjs/)
  assert.match(packageJson.scripts['dist:mac'], /electron-builder --mac dmg --universal --publish never/)
  assert.match(packageJson.scripts['dist:mac'], /stage-release-artifacts\.mjs mac/)
  assert.equal(packageJson.scripts['dist:mac:unsigned'], undefined)
  assert.equal(packageJson.scripts['dist:mac:release'], undefined)
})

test('keeps only the explicit Electron JIT entitlement without weakening macOS security', () => {
  for (const source of [mainEntitlements, inheritedEntitlements]) {
    assert.match(source, /Author\/creator: nattapat2871/)
    assert.match(source, /com\.apple\.security\.cs\.allow-jit/)
    assert.doesNotMatch(source, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/)
    assert.doesNotMatch(source, /com\.apple\.security\.cs\.disable-library-validation/)
    assert.doesNotMatch(source, /com\.apple\.security\.app-sandbox/)
  }
})

test('generates the macOS icon locally from the existing launcher asset', () => {
  assert.match(iconScriptSource, /Author\/creator: nattapat2871/)
  assert.match(iconScriptSource, /NamLauncher-icon\.png/)
  assert.match(iconScriptSource, /mktemp -d/)
  assert.match(iconScriptSource, /sips -z/)
  assert.match(iconScriptSource, /iconutil -c icns/)
  assert.match(iconScriptSource, /icon_512x512@2x\.png/)
  assert.doesNotMatch(iconScriptSource, /curl|wget/)
  assert.match(macIgnoreSource, /Author\/creator: nattapat2871/)
  assert.match(macIgnoreSource, /^generated\/$/m)
})

test('stages DMG checksum metadata and a platform manifest without backend source', () => {
  assert.match(stageSource, /Author\/creator: nattapat2871/)
  assert.match(stageSource, /mac: \[`NamLauncher-\$\{version\}-macOS-universal\.dmg`\]/)
  assert.match(stageSource, /selectedTargets = target === 'all' \? \['win', 'mac', 'linux'\] : \[target\]/)
  assert.match(stageSource, /\.sha256/)
  assert.match(stageSource, /createHash\('sha256'\)/)
  assert.match(stageSource, /temporaryPathFor\(destination\)/)
  assert.match(stageSource, /await link\(preparedArtifactPath, destination\)/)
  assert.match(stageSource, /Refusing to overwrite a non-identical release artifact/)
  assert.match(stageSource, /mac: 'macOS'/)
  assert.match(stageSource, /-SHA256SUMS\.txt`/)
  assert.ok(
    stageSource.indexOf('publishChecksumAtomically(checksumDestination, checksum)')
      < stageSource.indexOf('link(preparedArtifactPath, destination)')
  )
  assert.match(stageSource, /NAMLAUNCHER_RELEASE_STAGE_DIR/)
  assert.doesNotMatch(stageSource, /website[\\/]downloads/)
})

test('atomically stages a matching DMG and refuses a different build under the same version', async (context) => {
  const fixtureRoot = await createStageFixture()
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }))

  const fileName = 'NamLauncher-9.8.7-integrity-test-macOS-universal.dmg'
  const releaseDmg = path.join(fixtureRoot, 'release', fileName)
  const releaseChecksum = `${releaseDmg}.sha256`
  const downloadDmg = path.join(fixtureRoot, 'release', 'staged', fileName)
  const downloadChecksum = `${downloadDmg}.sha256`
  const firstBytes = Buffer.alloc(4096, 0x41)
  await writeFile(releaseDmg, firstBytes)

  const firstRun = await runStageScript(fixtureRoot)
  assert.equal(firstRun.code, 0, firstRun.stderr)
  assert.deepEqual(await readFile(downloadDmg), firstBytes)
  const expectedDigest = createHash('sha256').update(firstBytes).digest('hex')
  assert.equal(await readFile(downloadChecksum, 'utf8'), `${expectedDigest}  ${fileName}\n`)

  const identicalRun = await runStageScript(fixtureRoot)
  assert.equal(identicalRun.code, 0, identicalRun.stderr)
  assert.match(identicalRun.stdout, /Already staged immutable/)

  const secondBytes = Buffer.alloc(4096, 0x42)
  await writeFile(releaseDmg, secondBytes)
  const conflictingRun = await runStageScript(fixtureRoot)
  assert.notEqual(conflictingRun.code, 0)
  assert.match(conflictingRun.stderr, /Refusing to overwrite a non-identical release checksum/)

  const secondDigest = createHash('sha256').update(secondBytes).digest('hex')
  await writeFile(releaseChecksum, `${secondDigest}  ${fileName}\n`, 'utf8')
  const conflictingWebsiteRun = await runStageScript(fixtureRoot)
  assert.notEqual(conflictingWebsiteRun.code, 0)
  assert.match(conflictingWebsiteRun.stderr, /Refusing to overwrite a non-identical release artifact/)
  assert.deepEqual(await readFile(downloadDmg), firstBytes)
  assert.equal(await readFile(downloadChecksum, 'utf8'), `${expectedDigest}  ${fileName}\n`)

  const remainingNames = await readdir(path.join(fixtureRoot, 'release', 'staged'))
  assert.equal(remainingNames.some((name) => name.endsWith('.tmp') || name.endsWith('.stage.lock')), false)
})

test('runs tests before a manual unsigned build and limits optional artifact storage', () => {
  const testIndex = workflowSource.indexOf('- run: npm test')
  const buildIndex = workflowSource.indexOf('run: npm run dist:mac')
  const architectureIndex = workflowSource.indexOf('lipo -archs')
  const checksumIndex = workflowSource.indexOf('name: Verify unsigned DMG output and checksum')
  const smokeIndex = workflowSource.indexOf('name: Smoke test application from the mounted DMG')
  const uploadIndex = workflowSource.indexOf('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02')

  assert.match(workflowSource, /Author\/creator: nattapat2871/)
  assert.match(workflowSource, /workflow_dispatch:/)
  assert.doesNotMatch(workflowSource, /^\s*push:/m)
  assert.match(workflowSource, /runs-on: macos-15/)
  assert.ok(testIndex >= 0)
  assert.ok(buildIndex > testIndex)
  assert.ok(architectureIndex > buildIndex)
  assert.ok(checksumIndex > architectureIndex)
  assert.ok(smokeIndex > checksumIndex)
  assert.ok(uploadIndex > smokeIndex)
  assert.match(workflowSource, /for required_architecture in arm64 x86_64/)
  assert.match(workflowSource, /Contents\/MacOS\/NamLauncher/)
  assert.match(workflowSource, /inputs\.upload_artifact/)
  assert.match(workflowSource, /compression-level: 0/)
  assert.match(workflowSource, /retention-days: 1/)
  assert.doesNotMatch(workflowSource, /secrets\.|CSC_|APPLE_API|Developer ID|notariz/i)
  assert.doesNotMatch(workflowSource, /set -x/)
})

test('pins macOS workflow actions and isolates Draft Release write permission', () => {
  const fallbackJobIndex = workflowSource.indexOf('  macos_draft_release:')
  const intelJobIndex = workflowSource.indexOf('  macos_draft_release_intel:')
  const artifactIntelJobIndex = workflowSource.indexOf('  macos_artifact_intel:')
  assert.ok(fallbackJobIndex > 0)
  assert.ok(intelJobIndex > fallbackJobIndex)
  assert.ok(artifactIntelJobIndex > intelJobIndex)
  const defaultJobSource = workflowSource.slice(workflowSource.indexOf('  macos:'), fallbackJobIndex)
  const fallbackJobSource = workflowSource.slice(fallbackJobIndex, intelJobIndex)
  const intelJobSource = workflowSource.slice(intelJobIndex, artifactIntelJobIndex)
  const artifactIntelJobSource = workflowSource.slice(artifactIntelJobIndex)

  assert.match(workflowSource, /^permissions:\n  contents: read$/m)
  assert.match(defaultJobSource, /if: \$\{\{ inputs\.release_tag == '' \}\}/)
  assert.doesNotMatch(defaultJobSource, /contents: write/)
  assert.match(fallbackJobSource, /if: \$\{\{ inputs\.release_tag != '' \}\}/)
  assert.match(fallbackJobSource, /permissions:\n      contents: write/)
  assert.match(intelJobSource, /if: \$\{\{ inputs\.release_tag != '' \}\}/)
  assert.match(intelJobSource, /needs: macos_draft_release/)
  assert.match(intelJobSource, /GitHub hides Draft Releases from read-only installation tokens/)
  assert.match(intelJobSource, /permissions:\n      contents: write/)
  assert.match(artifactIntelJobSource, /if: \$\{\{ inputs\.release_tag == '' && inputs\.upload_artifact \}\}/)
  assert.match(artifactIntelJobSource, /needs: macos/)
  assert.match(artifactIntelJobSource, /permissions:\n      contents: read/)
  assert.doesNotMatch(artifactIntelJobSource, /contents: write/)
  assert.doesNotMatch(workflowSource, /uses: [^\n]+@v\d/)
  assert.equal(
    [...workflowSource.matchAll(/uses: actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@([0-9a-f]{40})/g)].length,
    10
  )
  assert.equal((workflowSource.match(/persist-credentials: false/g) ?? []).length, 4)
  assert.equal((workflowSource.match(/fetch-depth: 0/g) ?? []).length, 3)
  assert.equal((workflowSource.match(/ref: refs\/tags\/\$\{\{ inputs\.release_tag \}\}/g) ?? []).length, 2)
})

test('mounts and runtime-smoke-tests every verified DMG before any artifact upload', () => {
  const fallbackJobIndex = workflowSource.indexOf('  macos_draft_release:')
  const intelJobIndex = workflowSource.indexOf('  macos_draft_release_intel:')
  const artifactIntelJobIndex = workflowSource.indexOf('  macos_artifact_intel:')
  assert.ok(fallbackJobIndex > 0)
  assert.ok(intelJobIndex > fallbackJobIndex)
  assert.ok(artifactIntelJobIndex > intelJobIndex)
  const defaultJobSource = workflowSource.slice(workflowSource.indexOf('  macos:'), fallbackJobIndex)
  const fallbackJobSource = workflowSource.slice(fallbackJobIndex, intelJobIndex)
  const intelJobSource = workflowSource.slice(intelJobIndex, artifactIntelJobIndex)
  const artifactIntelJobSource = workflowSource.slice(artifactIntelJobIndex)

  assert.equal(
    (workflowSource.match(/name: Smoke test (?:application from the mounted DMG|exact Draft Release application on Intel|short-lived artifact application on Intel)/g) ?? []).length,
    4
  )
  assert.equal((workflowSource.match(/timeout-minutes: 3/g) ?? []).length, 4)
  assert.equal((workflowSource.match(/run: &mounted_dmg_smoke \|/g) ?? []).length, 1)
  assert.equal((workflowSource.match(/run: \*mounted_dmg_smoke/g) ?? []).length, 3)

  for (const [index, jobSource] of [defaultJobSource, fallbackJobSource].entries()) {
    const checksumIndex = jobSource.indexOf('name: Verify unsigned DMG output and checksum')
    const smokeIndex = jobSource.indexOf('name: Smoke test application from the mounted DMG')
    const uploadIndex = index === 0
      ? jobSource.indexOf('name: Upload optional short-lived unsigned DMG')
      : jobSource.indexOf('name: Upload verified files without replacing release assets')

    assert.ok(checksumIndex >= 0)
    assert.ok(smokeIndex > checksumIndex)
    assert.ok(uploadIndex > smokeIndex)
  }

  assert.match(defaultJobSource, /run: &mounted_dmg_smoke \|/)
  assert.match(fallbackJobSource, /run: \*mounted_dmg_smoke/)
  assert.match(intelJobSource, /run: \*mounted_dmg_smoke/)
  assert.match(artifactIntelJobSource, /run: \*mounted_dmg_smoke/)
  assert.match(defaultJobSource, /hdiutil attach "\$dmg_path" -readonly -nobrowse -mountpoint "\$mount_root"/)
  assert.match(defaultJobSource, /find "\$mount_root" -maxdepth 2 -type d -name 'NamLauncher\.app'/)
  assert.match(defaultJobSource, /main_binary="\$app_path\/Contents\/MacOS\/NamLauncher"/)
  assert.match(defaultJobSource, /NAMLAUNCHER_DATA_DIR="\$data_root"/)
  assert.match(defaultJobSource, /"--user-data-dir=\$chromium_profile"/)
  assert.match(defaultJobSource, /smoke_seconds=15/)
  assert.match(defaultJobSource, /kill -0 "\$app_pid"/)
  assert.match(defaultJobSource, /startup_log="\$data_root\/logs\/app\.logs"/)
  assert.match(defaultJobSource, /--- NamLauncher starting ---/)
  assert.match(defaultJobSource, /--- NamLauncher renderer ready ---/)
  assert.match(defaultJobSource, /LAUNCHER-ERROR/)
  assert.match(defaultJobSource, /trap cleanup EXIT/)
  assert.match(defaultJobSource, /hdiutil detach "\$mount_root" -force/)
  assert.match(defaultJobSource, /actual_runner_arch="\$\(uname -m\)"/)
  assert.match(defaultJobSource, /EXPECTED_RUNNER_ARCH: arm64/)
  assert.match(fallbackJobSource, /EXPECTED_RUNNER_ARCH: arm64/)
  assert.match(intelJobSource, /EXPECTED_RUNNER_ARCH: x86_64/)
  assert.match(artifactIntelJobSource, /EXPECTED_RUNNER_ARCH: x86_64/)
  assert.doesNotMatch(workflowSource, /--no-sandbox/)
})

test('records renderer readiness across the isolated Electron IPC boundary', () => {
  assert.match(appSource, /window\.electron\.rendererReady\(\)\.catch\(\(\) => undefined\)/)
  assert.match(preloadSource, /rendererReady: \(\) => invoke\('renderer-ready'\)/)
  assert.match(mainSource, /trustedIpcHandle\('renderer-ready', async \(event\) =>/)
  assert.match(mainSource, /const isMainRendererInvocation = \(event: IpcMainInvokeEvent\) => isTrustedRendererSender\(mainWindow, event\.sender\)/)
  assert.match(mainSource, /trustedIpcHandle\('renderer-ready',[\s\S]*!isMainRendererInvocation\(event\)/)
  assert.match(mainSource, /log\.info\('--- NamLauncher renderer ready ---'\)/)
  assert.match(workflowSource, /'--- NamLauncher renderer ready ---'/)
})

test('re-downloads the arm64-verified Draft assets and smoke-tests the same bytes on Intel', () => {
  const artifactIntelJobIndex = workflowSource.indexOf('  macos_artifact_intel:')
  const armJobSource = workflowSource.slice(
    workflowSource.indexOf('  macos_draft_release:'),
    workflowSource.indexOf('  macos_draft_release_intel:')
  )
  const intelJobSource = workflowSource.slice(
    workflowSource.indexOf('  macos_draft_release_intel:'),
    artifactIntelJobIndex
  )
  const downloadIndex = intelJobSource.indexOf('name: Download and verify exact Draft Release assets')
  const smokeIndex = intelJobSource.indexOf('name: Smoke test exact Draft Release application on Intel')

  assert.match(armJobSource, /runs-on: macos-15/)
  assert.match(intelJobSource, /runs-on: macos-15-intel/)
  assert.match(intelJobSource, /needs: macos_draft_release/)
  assert.match(intelJobSource, /permissions:\n      contents: write/)
  assert.equal((intelJobSource.match(/GH_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length, 1)
  assert.ok(downloadIndex >= 0)
  assert.ok(smokeIndex > downloadIndex)
  assert.match(intelJobSource, /EXPECTED_RELEASE_ID: \$\{\{ needs\.macos_draft_release\.outputs\.release_id \}\}/)
  assert.match(intelJobSource, /EXPECTED_DMG_SHA256: \$\{\{ needs\.macos_draft_release\.outputs\.dmg_sha256 \}\}/)
  assert.match(intelJobSource, /EXPECTED_CHECKSUM_SHA256: \$\{\{ needs\.macos_draft_release\.outputs\.checksum_sha256 \}\}/)
  assert.match(intelJobSource, /EXPECTED_MANIFEST_SHA256: \$\{\{ needs\.macos_draft_release\.outputs\.manifest_sha256 \}\}/)
  assert.match(intelJobSource, /EXPECTED_SOURCE_SHA: \$\{\{ needs\.macos_draft_release\.outputs\.source_sha \}\}/)
  assert.match(intelJobSource, /"\$\(git rev-parse --verify 'HEAD\^\{commit\}'\)" != "\$EXPECTED_SOURCE_SHA"/)
  assert.match(intelJobSource, /intel_local_tag_sha="\$\(git rev-parse --verify "refs\/tags\/\$\{RELEASE_TAG\}\^\{commit\}"\)"/)
  assert.match(intelJobSource, /"\$intel_local_tag_sha" != "\$EXPECTED_SOURCE_SHA"/)
  assert.match(intelJobSource, /git\/ref\/tags\/\$\{RELEASE_TAG\}/)
  assert.match(intelJobSource, /query_unique_draft/)
  assert.match(intelJobSource, /select\(\.tag_name == \$release_tag and \.draft == true\)/)
  assert.match(intelJobSource, /"\$release_id" != "\$EXPECTED_RELEASE_ID"/)
  assert.match(intelJobSource, /releases\/\$\{EXPECTED_RELEASE_ID\}\/assets\?per_page=100/)
  assert.match(intelJobSource, /releases\/assets\/\$\{asset_id\}/)
  assert.match(intelJobSource, /Accept: application\/octet-stream/)
  assert.match(intelJobSource, /"\$actual_digest" != "\$expected_digest"/)
  assert.match(intelJobSource, /"\$api_digest" != "sha256:\$\{actual_digest\}"/)
  assert.match(intelJobSource, /shasum -a 256 -c "\$checksum_name"/)
  assert.match(intelJobSource, /shasum -a 256 -c "\$manifest_name"/)
  assert.match(intelJobSource, /"\$tag_sha_after" != "\$tag_sha_before"/)
  assert.match(intelJobSource, /"\$tag_sha_after" != "\$EXPECTED_SOURCE_SHA"/)
  assert.match(intelJobSource, /"\$release_after" != "\$release_before"/)
  assert.match(intelJobSource, /"\$expected_assets_after" != "\$expected_assets_before"/)
  assert.match(intelJobSource, /EXPECTED_RUNNER_ARCH: x86_64/)
  assert.match(intelJobSource, /run: \*mounted_dmg_smoke/)
  assert.doesNotMatch(intelJobSource, /\$GITHUB_SHA/)
  assert.doesNotMatch(intelJobSource, /gh release upload|--clobber|actions\/upload-artifact|--method (?:POST|PATCH|DELETE)|gh release delete/i)
})

test('re-downloads the arm64-verified short-lived artifact and smoke-tests the same bytes on Intel', () => {
  const armJobSource = workflowSource.slice(
    workflowSource.indexOf('  macos:'),
    workflowSource.indexOf('  macos_draft_release:')
  )
  const intelJobSource = workflowSource.slice(workflowSource.indexOf('  macos_artifact_intel:'))
  const downloadIndex = intelJobSource.indexOf('name: Download arm64-verified short-lived artifact')
  const verifyIndex = intelJobSource.indexOf('name: Verify exact short-lived artifact bytes')
  const smokeIndex = intelJobSource.indexOf('name: Smoke test short-lived artifact application on Intel')

  assert.match(armJobSource, /outputs:\n      dmg_sha256: \$\{\{ steps\.mac_artifacts\.outputs\.dmg_sha256 \}\}/)
  assert.match(armJobSource, /checksum_sha256: \$\{\{ steps\.mac_artifacts\.outputs\.checksum_sha256 \}\}/)
  assert.match(armJobSource, /id: mac_artifacts/)
  assert.match(intelJobSource, /runs-on: macos-15-intel/)
  assert.match(intelJobSource, /if: \$\{\{ inputs\.release_tag == '' && inputs\.upload_artifact \}\}/)
  assert.match(intelJobSource, /needs: macos/)
  assert.match(intelJobSource, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/)
  assert.ok(downloadIndex >= 0)
  assert.ok(verifyIndex > downloadIndex)
  assert.ok(smokeIndex > verifyIndex)
  assert.match(intelJobSource, /EXPECTED_DMG_SHA256: \$\{\{ needs\.macos\.outputs\.dmg_sha256 \}\}/)
  assert.match(intelJobSource, /EXPECTED_CHECKSUM_SHA256: \$\{\{ needs\.macos\.outputs\.checksum_sha256 \}\}/)
  assert.match(intelJobSource, /"\$actual_dmg_sha256" != "\$EXPECTED_DMG_SHA256"/)
  assert.match(intelJobSource, /"\$actual_checksum_sha256" != "\$EXPECTED_CHECKSUM_SHA256"/)
  assert.match(intelJobSource, /shasum -a 256 -c "\$checksum_name"/)
  assert.match(intelJobSource, /EXPECTED_RUNNER_ARCH: x86_64/)
  assert.match(intelJobSource, /run: \*mounted_dmg_smoke/)
  assert.doesNotMatch(intelJobSource, /GH_TOKEN|contents: write|gh release|--clobber|--method (?:POST|PATCH|DELETE)/i)
})

test('uploads only a matching verified macOS build to an unchanged existing Draft Release', () => {
  const fallbackJobSource = workflowSource.slice(
    workflowSource.indexOf('  macos_draft_release:'),
    workflowSource.indexOf('  macos_draft_release_intel:')
  )
  const validateIndex = fallbackJobSource.indexOf('name: Validate tag and existing Draft Release')
  const testIndex = fallbackJobSource.indexOf('- run: npm test')
  const buildIndex = fallbackJobSource.indexOf('run: npm run dist:mac')
  const architectureIndex = fallbackJobSource.indexOf('lipo -archs')
  const checksumIndex = fallbackJobSource.indexOf('shasum -a 256 -c "$(basename "$checksum_path")"', architectureIndex)
  const smokeIndex = fallbackJobSource.indexOf('name: Smoke test application from the mounted DMG')
  const uploadIndex = fallbackJobSource.indexOf('gh release upload')

  assert.match(workflowSource, /release_tag:[\s\S]*required: false[\s\S]*type: string[\s\S]*default: ""/)
  assert.ok(validateIndex >= 0)
  assert.ok(testIndex > validateIndex)
  assert.ok(buildIndex > testIndex)
  assert.ok(architectureIndex > buildIndex)
  assert.ok(checksumIndex > architectureIndex)
  assert.ok(smokeIndex > checksumIndex)
  assert.ok(uploadIndex > smokeIndex)
  assert.match(fallbackJobSource, /expected_tag="v\$\{package_version\}"/)
  assert.match(fallbackJobSource, /"\$RELEASE_TAG" != "\$expected_tag"/)
  assert.match(fallbackJobSource, /git\/ref\/tags\/\$\{RELEASE_TAG\}/)
  assert.match(fallbackJobSource, /checked_out_sha="\$\(git rev-parse --verify 'HEAD\^\{commit\}'\)"/)
  assert.match(fallbackJobSource, /local_tag_sha="\$\(git rev-parse --verify "refs\/tags\/\$\{RELEASE_TAG\}\^\{commit\}"\)"/)
  assert.match(fallbackJobSource, /"\$local_tag_sha" != "\$checked_out_sha"/)
  assert.match(fallbackJobSource, /"\$tag_sha" != "\$checked_out_sha"/)
  assert.match(fallbackJobSource, /source_sha: \$\{\{ steps\.draft_release\.outputs\.source_sha \}\}/)
  assert.match(fallbackJobSource, /SOURCE_SHA: \$\{\{ steps\.draft_release\.outputs\.source_sha \}\}/)
  assert.match(fallbackJobSource, /"\$\(git rev-parse --verify 'HEAD\^\{commit\}'\)" != "\$SOURCE_SHA"/)
  assert.match(fallbackJobSource, /"\$upload_local_tag_sha" != "\$SOURCE_SHA"/)
  assert.match(fallbackJobSource, /"\$upload_tag_sha" != "\$SOURCE_SHA"/)
  assert.match(fallbackJobSource, /"\$release_draft" != "true"/)
  assert.match(fallbackJobSource, /"\$current_release_id" != "\$RELEASE_ID"/)
  assert.match(fallbackJobSource, /"\$current_tag" != "\$RELEASE_TAG"/)
  assert.match(fallbackJobSource, /grep -Fqx -- "\$artifact_name"/)
  assert.match(fallbackJobSource, /NamLauncher-\$\{package_version\}-macOS-universal\.dmg/)
  assert.match(fallbackJobSource, /NamLauncher-\$\{package_version\}-macOS-SHA256SUMS\.txt/)
  assert.match(fallbackJobSource, /upload_paths=\("\$dmg_path" "\$checksum_path" "\$manifest_path"\)/)
  assert.match(fallbackJobSource, /dmg_sha256: \$\{\{ steps\.mac_artifacts\.outputs\.dmg_sha256 \}\}/)
  assert.match(fallbackJobSource, /checksum_sha256: \$\{\{ steps\.mac_artifacts\.outputs\.checksum_sha256 \}\}/)
  assert.match(fallbackJobSource, /manifest_sha256: \$\{\{ steps\.mac_artifacts\.outputs\.manifest_sha256 \}\}/)
  assert.doesNotMatch(fallbackJobSource, /\$GITHUB_SHA/)
  assert.doesNotMatch(fallbackJobSource, /--clobber/)
  assert.doesNotMatch(fallbackJobSource, /actions\/upload-artifact/)
})

test('finds a unique Draft Release through the authenticated paginated releases list', () => {
  const fallbackJobSource = workflowSource.slice(
    workflowSource.indexOf('  macos_draft_release:'),
    workflowSource.indexOf('  macos_draft_release_intel:')
  )

  assert.equal(
    (fallbackJobSource.match(/gh api --paginate --slurp "repos\/\$\{GITHUB_REPOSITORY\}\/releases\?per_page=100"/g) ?? []).length,
    2
  )
  assert.equal(
    (fallbackJobSource.match(/jq -c --arg release_tag "\$RELEASE_TAG"/g) ?? []).length,
    2
  )
  assert.equal(
    (fallbackJobSource.match(/select\(\.tag_name == \$release_tag and \.draft == true\)/g) ?? []).length,
    2
  )
  assert.match(fallbackJobSource, /draft_release_count="\$\(jq -r 'length'/)
  assert.match(fallbackJobSource, /"\$draft_release_count" != "1"/)
  assert.match(fallbackJobSource, /current_release_count="\$\(jq -r 'length'/)
  assert.match(fallbackJobSource, /"\$current_release_count" != "1"/)
  assert.doesNotMatch(fallbackJobSource, /\/releases\/tags\//)
})

test('documents the free unsigned flow and safe per-app Gatekeeper approval', () => {
  for (const source of [readmeSource]) {
    assert.match(source, /npm run dist:mac/)
    assert.match(source, /unsigned/i)
    assert.match(source, /SHA-256/i)
    assert.match(source, /Control-click/)
    assert.match(source, /Privacy & Security/)
    assert.match(source, /Never (?:advise )?(?:disable|globally disabling)/i)
    assert.match(source, /Actions\s+artifact/)
    assert.doesNotMatch(source, /dist:mac:release|MACOS_CSC_LINK|MACOS_APPLE_API_PRIVATE_KEY/)
    assert.doesNotMatch(source, /spctl\s+--master-disable|csrutil\s+disable/i)
  }
})
