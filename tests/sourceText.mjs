// Author/creator: nattapat2871 (https://nattapat2871.me)
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const electronMainModules = [
  '../electron/main.ts',
  '../electron/mainRuntime.ts',
  '../electron/accounts/accountService.ts',
  '../electron/skins/skinService.ts',
  '../electron/instances/instanceService.ts',
  '../electron/content/contentService.ts',
  '../electron/content/loaderService.ts',
  '../electron/ipc/registerIpcHandlers.ts'
]

const rendererAppModules = [
  '../src/App.tsx',
  '../src/app/launcherCommon.tsx',
  '../src/app/useLauncherController.tsx',
  '../src/app/LauncherShell.tsx',
  '../src/views/HomeView.tsx',
  '../src/views/InstancesView.tsx',
  '../src/views/LibraryView.tsx',
  '../src/views/SkinsView.tsx',
  '../src/views/SettingsView.tsx'
]

const moduleUrl = (relativePath) => new URL(relativePath, import.meta.url)
const joinSource = (sources) => sources.join('\n\n')

export async function readElectronMainSource() {
  return joinSource(await Promise.all(
    electronMainModules.map((relativePath) => readFile(moduleUrl(relativePath), 'utf8'))
  ))
}

export function readElectronMainSourceSync() {
  return joinSource(electronMainModules.map(
    (relativePath) => readFileSync(moduleUrl(relativePath), 'utf8')
  ))
}

export async function readRendererAppSource() {
  const sources = await Promise.all(rendererAppModules.map(async (relativePath) => {
    try {
      return await readFile(moduleUrl(relativePath), 'utf8')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }))
  return joinSource(sources)
}

export function readRendererAppSourceSync() {
  return joinSource(rendererAppModules.map((relativePath) => {
    try {
      return readFileSync(moduleUrl(relativePath), 'utf8')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }))
}
