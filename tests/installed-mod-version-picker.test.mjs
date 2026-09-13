// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await (await import('./sourceText.mjs')).readRendererAppSource()
const appTextSource = await readFile(new URL('../src/appText.ts', import.meta.url), 'utf8')
const contentServiceSource = await readFile(new URL('../electron/content/contentService.ts', import.meta.url), 'utf8')

test('installed managed mods expose a localized version picker', () => {
  assert.match(appSource, /item\.kind === 'mods' && item\.projectId && \(item\.source === 'modrinth' \|\| item\.source === 'curseforge'\)/)
  assert.match(appSource, /data-testid="installed-mod-version-button"/)
  assert.match(appSource, /openInstalledModProjectDetails\(item, event\.currentTarget\)/)
  assert.match(appTextSource, /'content\.versionPicker\.button': 'Versions'/)
  assert.match(appTextSource, /'content\.versionPicker\.button': 'เวอร์ชัน'/)
})

test('version picker forwards exact selected ids to each provider installer', () => {
  assert.match(appSource, /installLibraryProject\(libraryProjectDetails, selectedLibraryVersionId\)/)
  assert.match(appSource, /installCurseForgeContent\(\{[\s\S]*?fileId: selectedVersionId \|\| undefined/)
  assert.match(appSource, /installModrinthContent\(\{[\s\S]*?versionId: selectedVersionId \|\| undefined/)
})

test('installed versions are labelled and cannot be installed again', () => {
  assert.match(appSource, /const installed = libraryProjectDetails\.installedVersionId === version\.id/)
  assert.match(appSource, /installed && \([\s\S]*?library\.button\.alreadyInstalled/)
  assert.match(appSource, /selectedLibraryVersionId === libraryProjectDetails\.installedVersionId/)
  assert.match(appSource, /\? t\('library\.button\.alreadyInstalled'\)[\s\S]*?: t\('library\.detail\.installSelected'\)/)
})

test('installing another managed version removes outdated managed files first', () => {
  const removalCalls = contentServiceSource.match(/removeOutdatedContentFiles\(manifest, gameDirectory, installedItems\)/g) || []
  assert.ok(removalCalls.length >= 2, 'both Modrinth and CurseForge installs should remove outdated managed files')
  assert.match(contentServiceSource, /removeOutdatedContentFiles\(manifest, gameDirectory, installedItems\)[\s\S]*?Object\.entries\(grouped\)/)
})

test('account removal stays visible without hover-only opacity classes', () => {
  const button = appSource.match(/<button[\s\S]*?data-testid="remove-account-button"[\s\S]*?<\/button>/)?.[0] || ''
  assert.ok(button, 'remove account button should exist')
  assert.doesNotMatch(button, /opacity-0|group-hover:opacity-100/)
  assert.match(button, /border-red-400\/35/)
  assert.match(button, /<Trash2/)
})
