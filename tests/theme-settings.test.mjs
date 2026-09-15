// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [commonSource, mainSource, ipcSource, controllerSource, settingsSource, textSource, cssSource, instanceSelectSource, skinPageSource] = await Promise.all([
  readSource('src/app/launcherCommon.tsx'),
  readSource('electron/mainRuntime.ts'),
  readSource('electron/ipc/registerIpcHandlers.ts'),
  readSource('src/app/useLauncherController.tsx'),
  readSource('src/views/SettingsView.tsx'),
  readSource('src/appText.ts'),
  readSource('src/index.css'),
  readSource('src/components/InstanceSelect.tsx'),
  readSource('src/components/SkinPage.tsx')
])

test('persists a bounded launcher theme preference with system as the default', () => {
  assert.match(commonSource, /LauncherTheme = 'system' \| 'dark' \| 'light'/)
  assert.match(commonSource, /theme: 'system'/)
  assert.match(mainSource, /theme: settings\.theme === 'dark' \|\| settings\.theme === 'light' \? settings\.theme : 'system'/)
  assert.match(ipcSource, /settings\.theme === 'system' \|\| settings\.theme === 'dark' \|\| settings\.theme === 'light'/)
})

test('system theme follows device changes and resolved themes are applied to the document', () => {
  assert.match(controllerSource, /matchMedia\('\(prefers-color-scheme: dark\)'\)/)
  assert.match(controllerSource, /colorScheme\.addEventListener\('change', applyTheme\)/)
  assert.match(controllerSource, /root\.dataset\.theme = resolvedTheme/)
})

test('theme switching fades and reduced motion remains respected', () => {
  assert.match(controllerSource, /root\.classList\.add\('nam-theme-switching'\)/)
  assert.match(cssSource, /\.nam-theme-switching \.app-shell \*/)
  assert.match(cssSource, /transition-duration: 320ms !important/)
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.nam-theme-switching/)
})

test('settings expose bilingual system, dark, and light choices with icons', () => {
  assert.match(settingsSource, /\{ id: 'system', Icon: Monitor \}/)
  assert.match(settingsSource, /\{ id: 'dark', Icon: Moon \}/)
  assert.match(settingsSource, /\{ id: 'light', Icon: Sun \}/)
  assert.match(settingsSource, /updateLauncherSettings\(\{ \.\.\.discordSettings, theme: id \}\)/)
  assert.match(textSource, /'settings\.appearance\.system': 'System'/)
  assert.match(textSource, /'settings\.appearance\.system': 'ตามอุปกรณ์'/)
})

test('light palette stays muted while preserving readable semantic colors', () => {
  assert.match(cssSource, /--nam-page: #cbd4dd/)
  assert.match(cssSource, /--nam-surface: #dce3e9/)
  assert.match(cssSource, /--nam-surface-secondary: #d5dde5/)
  assert.match(cssSource, /--nam-surface-tertiary: #cbd5df/)
  assert.doesNotMatch(cssSource, /--nam-surface: #e8edf2/)
  assert.match(cssSource, /--nam-text: #17243a/)
  assert.match(cssSource, /--nam-text-muted: #6a7b90/)
  assert.match(cssSource, /--nam-accent: #2563eb/)
  assert.match(cssSource, /button:disabled[\s\S]*opacity: 0\.68 !important/)
  assert.match(cssSource, /text-blue-300[\s\S]*#1e5da8 !important/)
  assert.match(cssSource, /text-indigo-200[\s\S]*#4338ca !important/)
  assert.match(cssSource, /class~='bg-indigo-500'[\s\S]*#ffffff !important/)
})

test('portal-mounted selector menus and every option follow the active theme', () => {
  assert.match(instanceSelectSource, /nam-instance-select-menu/)
  assert.match(instanceSelectSource, /nam-instance-select-option/)
  assert.match(instanceSelectSource, /data-active=\{activeIndex === index\}/)
  assert.match(cssSource, /\[data-theme='light'\] \.nam-instance-select-menu[\s\S]*background-color: var\(--nam-surface\) !important/)
  assert.match(cssSource, /\[data-theme='light'\] \.nam-instance-select-option\[data-active='true'\][\s\S]*background-color: #d7e5f5 !important/)
  assert.match(cssSource, /\.nam-theme-switching \.nam-instance-select-menu/)
})

test('NameMC library header uses a muted light palette instead of its dark gradient', () => {
  assert.match(cssSource, /\.nam-skin-library-header[\s\S]*linear-gradient\(125deg, #cad8e6 0%, #d9e3ec 48%, #e5eaf0 100%\) !important/)
  assert.match(cssSource, /\.nam-skin-library-subtitle[\s\S]*color: #52647b !important/)
  assert.match(cssSource, /\.nam-skin-library-close:hover[\s\S]*color: #17243a !important/)
})

test('skin workspace preview and selected cards follow the light theme', () => {
  assert.match(skinPageSource, /nam-skin-preview-panel/)
  assert.match(skinPageSource, /nam-skin-card-selected/)
  assert.match(skinPageSource, /nam-skin-editor-preview/)
  assert.match(cssSource, /\.nam-skin-preview-panel[\s\S]*linear-gradient\(180deg, #dce7f1, #cbd8e4\) !important/)
  assert.match(cssSource, /\.nam-skin-card-selected[\s\S]*rgba\(220, 228, 236, 0\.97\) 80%\) !important/)
  assert.match(cssSource, /\.nam-skin-editor-preview[\s\S]*#d4e0eb !important/)
})

test('selected account row keeps a visible glow in dark and light themes', () => {
  assert.match(controllerSource, /setActiveAccountId\(account\.id\)/)
  assert.match(cssSource, /\.nam-account-menu-item\[data-selected='true'\][\s\S]*0 0 22px rgba\(59, 130, 246, 0\.32\)/)
  assert.match(cssSource, /\[data-theme='light'\] \.app-shell \.nam-account-menu-item\[data-selected='true'\][\s\S]*border-color: #5f8fc7 !important/)
})
