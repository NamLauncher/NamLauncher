// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')
const storeConfig = require('../packaging/store-appx.cjs')
const workflow = await readFile(new URL('../.github/workflows/build-microsoft-store.yml', import.meta.url), 'utf8')
const buildHelper = await readFile(new URL('../scripts/build-store-msix.mjs', import.meta.url), 'utf8')
const validator = await readFile(new URL('../scripts/validate-store-package.ps1', import.meta.url), 'utf8')
const packageMarker = (await readFile(new URL('../packaging/microsoft-store/package-type', import.meta.url), 'utf8')).trim()
const mainRuntime = await readFile(new URL('../electron/mainRuntime.ts', import.meta.url), 'utf8')

test('uses the exact identity reserved in Microsoft Partner Center', () => {
  assert.equal(storeConfig.appx.identityName, 'Nattapat2871.NamLauncher')
  assert.equal(storeConfig.appx.publisher, 'CN=1D87CE2F-D8CB-4D34-8B9A-CD416F0DDBD6')
  assert.equal(storeConfig.appx.publisherDisplayName, 'Nattapat2871')
  assert.equal(storeConfig.appx.displayName, 'NamLauncher')
  assert.equal(storeConfig.forceCodeSigning, false)
})

test('builds, validates, and uploads the unsigned Store artifact in GitHub Actions', () => {
  assert.equal(packageJson.scripts['dist:win:store'], 'node scripts/build-store-msix.mjs')
  assert.match(workflow, /^\s*workflow_dispatch:/m)
  assert.match(workflow, /^\s*pull_request:/m)
  assert.match(workflow, /^\s*push:/m)
  assert.match(workflow, /npm test[\s\S]*npm run dist:win:store/)
  assert.match(workflow, /release-store\/\*\.msix/)
  assert.doesNotMatch(workflow, /contents:\s*write|gh release|Microsoft\.Store\/submission/)
  assert.match(buildHelper, /-OutputDirectory', outputDirectory/)
  assert.match(validator, /AppxSignature\.p7x/)
  assert.match(validator, /System\.Security\.Cryptography\.SHA256/)
  assert.doesNotMatch(validator, /Get-FileHash|Get-AuthenticodeSignature/)
  assert.match(validator, /Expected an unsigned Store package/)
})

test('marks Store builds and leaves their updates to Microsoft Store', () => {
  assert.equal(packageMarker, 'microsoft-store')
  assert.match(mainRuntime, /getPackagedPackageType\(\) === 'microsoft-store'/)
  assert.match(mainRuntime, /Microsoft Store manages updates for this installation/)
})
