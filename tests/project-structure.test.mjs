import assert from 'node:assert/strict'
// Author/creator: nattapat2871 (https://nattapat2871.me)
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await (await import('./sourceText.mjs')).readRendererAppSource()
const appTextSource = await readFile(new URL('../src/appText.ts', import.meta.url), 'utf8')
const storageSource = await readFile(new URL('../src/storageKeys.ts', import.meta.url), 'utf8')
const electronMainSource = await (await import('./sourceText.mjs')).readElectronMainSource()
const electronLegalSource = await readFile(new URL('../electron/legal.ts', import.meta.url), 'utf8')
const appIdentitySource = await readFile(new URL('../electron/appIdentity.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const legalJson = JSON.parse(await readFile(new URL('../shared/legal.json', import.meta.url), 'utf8'))
const aurPkgbuildSource = await readFile(new URL('../packaging/aur/PKGBUILD', import.meta.url), 'utf8')
const aurGeneratorSource = await readFile(new URL('../scripts/generate-aur-metadata.mjs', import.meta.url), 'utf8')
const windowsWorkflowSource = await readFile(new URL('../.github/workflows/build-desktop.yml', import.meta.url), 'utf8')
const macWorkflowSource = await readFile(new URL('../.github/workflows/build-macos.yml', import.meta.url), 'utf8')

test('keeps launcher copy and local-storage keys in focused modules', () => {
  assert.match(appSource, /from '\.{1,2}\/appText'/)
  assert.match(appSource, /from '\.{1,2}\/storageKeys'/)
  assert.match(appTextSource, /export const uiText/)
  assert.match(storageSource, /export const storage/)
  assert.doesNotMatch(appSource, /const uiText:\s*Record/)
  assert.doesNotMatch(appSource, /const storage\s*=/)
})

test('uses the stable 1.2.4 public identity consistently', () => {
  assert.equal(packageJson.version, '1.2.4')
  assert.equal(packageJson.build.npmRebuild, false)
  assert.match(appIdentitySource, /LAUNCHER_VERSION = '1\.2\.4'/)
  assert.match(electronMainSource, /PROVIDER_USER_AGENT/)
  assert.match(electronLegalSource, /LAUNCHER_USER_AGENT/)
  assert.match(aurPkgbuildSource, /sha256sums=/)
  assert.match(aurGeneratorSource, /const version = packageJson\.version/)
  assert.match(aurGeneratorSource, /NamLauncher-\$\{version\}-Linux-x64\.AppImage/)
  assert.match(aurGeneratorSource, /\^\[a-f0-9\]\{64\}\$/)
})

test('runs the test suite before Windows packaging', () => {
  const testIndex = windowsWorkflowSource.indexOf('- run: npm test')
  const packageIndex = windowsWorkflowSource.indexOf('- run: npm run dist:win')
  assert.ok(testIndex >= 0)
  assert.ok(packageIndex > testIndex)
})

test('pins Windows packaging actions and does not persist checkout credentials', () => {
  assert.match(windowsWorkflowSource, /actions\/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/)
  assert.match(windowsWorkflowSource, /persist-credentials: false/)
  assert.match(windowsWorkflowSource, /actions\/setup-node@a0853c24544627f65ddf259abe73b1d18a591444/)
  assert.match(windowsWorkflowSource, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/)
  assert.doesNotMatch(windowsWorkflowSource, /uses:\s+actions\/(?:checkout|setup-node|upload-artifact)@v\d/)
})

test('desktop workflows verify bundled companions without compiling private source', () => {
  for (const workflow of [windowsWorkflowSource, macWorkflowSource]) {
    assert.doesNotMatch(workflow, /NAMLAUNCHER_JAVA(?:17|21|25)_HOME|NAMLAUNCHER_GRADLE8_HOME/)
    assert.doesNotMatch(workflow, /game-bridge\/src|game-companions\//)
  }
})

test('ships refreshed bilingual legal copy for stable community releases', () => {
  assert.equal(legalJson.version, '2026-09-14.1')
  assert.equal(legalJson.updatedAt, '2026-09-14.1')
  assert.ok(legalJson.documents.en.terms.some((term) => term.body.includes('stable community build')))
  assert.ok(legalJson.documents.th.terms.some((term) => /รุ่นเสถียรแบบ community build/.test(term.body)))
  assert.ok(/\p{Script=Thai}/u.test(JSON.stringify(legalJson.documents.th)))
  assert.ok(legalJson.references.some((reference) => reference.label.includes('Minecraft')))
})
