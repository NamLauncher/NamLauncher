// Author/creator: nattapat2871 (https://nattapat2871.me)

import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../shared/loaderUpdate.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const module = { exports: {} }
vm.runInNewContext(transpiled, { module, exports: module.exports, Intl })
const { compareLoaderVersions, getLoaderUpdateCandidate, normalizeLoaderVersion } = module.exports

test('compares numeric loader segments instead of lexicographic text', () => {
  assert.ok(compareLoaderVersions('0.19.10', '0.19.5') > 0)
  assert.ok(compareLoaderVersions('47.4.10', '47.4.2') > 0)
})

test('normalizes Forge coordinates before checking for an update', () => {
  assert.equal(normalizeLoaderVersion('forge', '1.20.1', '1.20.1-47.4.10'), '47.4.10')
  assert.deepEqual({ ...getLoaderUpdateCandidate({
    loader: 'forge',
    minecraftVersion: '1.20.1',
    currentVersion: '1.20.1-47.4.2',
    versions: [
      { id: '47.3.0', type: 'recommended' },
      { id: '47.4.10', type: 'latest' }
    ]
  }) }, {
    currentVersion: '47.4.2',
    latestVersion: '47.4.10',
    releaseType: 'latest'
  })
})

test('prefers stable releases and never offers a downgrade or the same version', () => {
  assert.deepEqual({ ...getLoaderUpdateCandidate({
    loader: 'fabric',
    minecraftVersion: '1.21.1',
    currentVersion: '0.16.9',
    versions: [
      { id: '0.17.0-beta.1', type: 'unstable' },
      { id: '0.16.10', type: 'stable' },
      { id: '0.16.9', type: 'stable' }
    ]
  }) }, {
    currentVersion: '0.16.9',
    latestVersion: '0.16.10',
    releaseType: 'stable'
  })

  assert.equal(getLoaderUpdateCandidate({
    loader: 'quilt',
    minecraftVersion: '1.20.1',
    currentVersion: '0.27.1',
    versions: [{ id: '0.27.1', type: 'stable' }, { id: '0.26.0', type: 'stable' }]
  }), null)
})
