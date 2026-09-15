// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { verifyWindowsBundleZip } from '../scripts/verify-windows-bundle-zip.mjs'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const packageJson = require('../package.json')
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

const writeFixture = (archivePath, { executable = Buffer.from('final executable'), extraFile = false, expectedExecutable } = {}) => {
  const recordedExecutable = expectedExecutable || executable
  const manifest = {
    schemaVersion: 1,
    version: packageJson.version,
    platform: 'win32',
    arch: 'x64',
    entrypoint: 'NamLauncher.exe',
    createdAt: new Date().toISOString(),
    files: [
      { path: 'NamLauncher.exe', size: recordedExecutable.length, sha256: sha256(recordedExecutable) },
      { path: 'resources/app.asar', size: 4, sha256: sha256(Buffer.from('asar')) }
    ]
  }
  const archive = new AdmZip()
  archive.addFile('NamLauncher.exe', executable)
  archive.addFile('resources/app.asar', Buffer.from('asar'))
  archive.addFile('namlauncher-bundle.json', Buffer.from(JSON.stringify(manifest)))
  if (extraFile) archive.addFile('unexpected.txt', Buffer.from('unexpected'))
  archive.writeZip(archivePath)
}

test('Windows packaging creates its manifest after executable mutation and verifies the final ZIP', async () => {
  const source = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(source.build.afterPack, undefined)
  assert.equal(source.build.afterSign, 'scripts/write-windows-bundle-manifest.cjs')
  assert.match(source.scripts['dist:win'], /electron-builder[\s\S]*verify-windows-bundle-zip\.mjs[\s\S]*ensure-installer-icon\.mjs/)
  assert.match(source.scripts['dist:win:local'], /electron-builder[\s\S]*verify-windows-bundle-zip\.mjs[\s\S]*ensure-installer-icon\.mjs/)
})

test('production ZIP verification accepts an exact manifest and rejects changed or extra files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'namlauncher-production-zip-'))
  try {
    const valid = path.join(root, 'valid.zip')
    writeFixture(valid)
    assert.equal(verifyWindowsBundleZip(valid).fileCount, 2)

    const changed = path.join(root, 'changed.zip')
    writeFixture(changed, {
      executable: Buffer.from('mutated after manifest'),
      expectedExecutable: Buffer.from('final executable')
    })
    assert.throws(() => verifyWindowsBundleZip(changed), /integrity verification failed: NamLauncher\.exe/)

    const extra = path.join(root, 'extra.zip')
    writeFixture(extra, { extraFile: true })
    assert.throws(() => verifyWindowsBundleZip(extra), /inventory does not exactly match/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
