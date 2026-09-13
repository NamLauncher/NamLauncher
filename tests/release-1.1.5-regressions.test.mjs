import assert from 'node:assert/strict'
// Author/creator: nattapat2871 (https://nattapat2871.me)
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packageLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const appIdentitySource = await readFile(new URL('../electron/appIdentity.ts', import.meta.url), 'utf8')
const releaseMetadataGateSource = await readFile(new URL('../scripts/assert-release-metadata.mjs', import.meta.url), 'utf8')

test('keeps beta package metadata separate from the stable launcher identity', () => {
  assert.equal(packageJson.version, '1.2.4-beta3')
  assert.equal(packageLock.version, '1.2.4-beta3')
  assert.equal(packageLock.packages[''].version, '1.2.4-beta3')
  assert.match(appIdentitySource, /LAUNCHER_VERSION = '1\.2\.3'/)
})

test('blocks packaging until metadata references a real ancestor commit', () => {
  for (const target of ['win', 'linux', 'mac']) {
    assert.match(packageJson.scripts[`predist:${target}`], /node scripts\/assert-release-metadata\.mjs/)
  }
  assert.match(releaseMetadataGateSource, /commit:\\s\*pending/i)
  assert.match(releaseMetadataGateSource, /merge-base/)
  assert.match(releaseMetadataGateSource, /--is-ancestor/)
})
