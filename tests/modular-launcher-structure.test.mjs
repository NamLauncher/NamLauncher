// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../', import.meta.url)
const modules = [
  'src/App.tsx',
  'src/app/launcherCommon.tsx',
  'src/app/useLauncherController.tsx',
  'src/app/LauncherShell.tsx',
  'src/views/HomeView.tsx',
  'src/views/InstancesView.tsx',
  'src/views/SkinsView.tsx',
  'src/views/LibraryView.tsx',
  'src/views/SettingsView.tsx',
  'electron/main.ts',
  'electron/mainRuntime.ts',
  'electron/accounts/accountService.ts',
  'electron/skins/skinService.ts',
  'electron/instances/instanceService.ts',
  'electron/content/contentService.ts',
  'electron/content/loaderService.ts',
  'electron/ipc/registerIpcHandlers.ts'
]

const moduleUrl = (relativePath) => new URL(relativePath, rootUrl)

test('keeps the Electron and renderer entrypoints thin and delegates feature work', async () => {
  const [appSource, mainSource, appInfo, mainInfo] = await Promise.all([
    readFile(moduleUrl('src/App.tsx'), 'utf8'),
    readFile(moduleUrl('electron/main.ts'), 'utf8'),
    stat(moduleUrl('src/App.tsx')),
    stat(moduleUrl('electron/main.ts'))
  ])

  assert.ok(appInfo.size < 4_096, `src/App.tsx grew to ${appInfo.size} bytes`)
  assert.ok(mainInfo.size < 4_096, `electron/main.ts grew to ${mainInfo.size} bytes`)
  assert.match(appSource, /useLauncherController\(\)/)
  assert.match(appSource, /<LauncherShell model=\{model\} \/>/)
  assert.match(mainSource, /export \* from '\.\/mainRuntime\.ts'/)
})

test('keeps feature modules bounded and preserves the project author header', async () => {
  const entries = await Promise.all(modules.map(async (relativePath) => ({
    relativePath,
    source: await readFile(moduleUrl(relativePath), 'utf8'),
    info: await stat(moduleUrl(relativePath))
  })))

  for (const entry of entries) {
    assert.match(
      entry.source,
      /^\/\/ Author\/creator: nattapat2871 \(https:\/\/nattapat2871\.me\)/,
      `${entry.relativePath} is missing the author header`
    )
  }

  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry.info.size]))
  assert.ok(byPath.get('src/app/useLauncherController.tsx') < 200_000)
  assert.ok(byPath.get('src/app/LauncherShell.tsx') < 210_000)
  assert.ok(byPath.get('src/app/launcherCommon.tsx') < 65_536)

  for (const relativePath of modules.filter((value) => value.startsWith('src/views/'))) {
    assert.ok(byPath.get(relativePath) < 65_536, `${relativePath} should remain a focused view module`)
  }
})
