// NamLauncher Microsoft Store build helper.
// Author/creator: nattapat2871 (https://nattapat2871.me)

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const powershellCommand = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
const outputDirectory = process.env.NAMLAUNCHER_STORE_OUTPUT
  || path.join(os.tmpdir(), `NamLauncher-${packageVersion}-store-msix`)
const storeIdentityName = process.env.NAMLAUNCHER_STORE_IDENTITY_NAME || 'Nattapat2871.NamLauncher'
const storePublisher = process.env.NAMLAUNCHER_STORE_PUBLISHER || 'CN=1D87CE2F-D8CB-4D34-8B9A-CD416F0DDBD6'
const result = spawnSync(npmCommand, ['run', 'prepare:game-bridge'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
if (result.status !== 0) process.exit(result.status || 1)

const buildResult = spawnSync(npmCommand, ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
if (buildResult.status !== 0) process.exit(buildResult.status || 1)

const assetsResult = spawnSync(powershellCommand, [
  '-NoProfile', '-NonInteractive', '-File', 'scripts/prepare-store-assets.ps1'
], { stdio: 'inherit', shell: false })
if (assetsResult.status !== 0) process.exit(assetsResult.status || 1)

const builderCli = path.resolve('node_modules', 'electron-builder', 'cli.js')
const packageResult = spawnSync(process.execPath, [
  builderCli,
  '--config', 'packaging/store-appx.cjs',
  '--win', 'appx',
  '--x64',
  '--publish', 'never'
], {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    NAMLAUNCHER_STORE_OUTPUT: outputDirectory,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  }
})
if (packageResult.status !== 0) process.exit(packageResult.status || 1)

const appxPath = path.join(outputDirectory, `NamLauncher-${packageVersion}-Microsoft-Store.appx`)
const validationResult = spawnSync(powershellCommand, [
  '-NoProfile', '-NonInteractive', '-File', 'scripts/validate-store-package.ps1',
  '-PackagePath', appxPath,
  '-ExpectedIdentity', storeIdentityName,
  '-ExpectedPublisher', storePublisher,
  '-OutputDirectory', outputDirectory
], { stdio: 'inherit', shell: false })
process.exit(validationResult.status || 0)
