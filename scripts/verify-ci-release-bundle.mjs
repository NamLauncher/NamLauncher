#!/usr/bin/env node
// Author/creator: nattapat2871 (https://nattapat2871.me)

import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const argumentsMap = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  if (!key?.startsWith('--') || value === undefined) {
    throw new Error(`Invalid argument near ${key || 'end of command'}`)
  }
  argumentsMap.set(key.slice(2), value)
}

const bundleDirectory = path.resolve(argumentsMap.get('directory') || '')
const version = String(argumentsMap.get('version') || '').trim()
const sourceCommit = String(argumentsMap.get('source-commit') || '').trim().toLowerCase()
const windowsSignature = String(argumentsMap.get('windows-signature') || 'unsigned').trim()

if (!bundleDirectory || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('A stable x.y.z version and --directory are required')
}
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
  throw new Error('--source-commit must be a full Git commit SHA')
}
if (!['signpath', 'unsigned'].includes(windowsSignature)) {
  throw new Error('--windows-signature must be signpath or unsigned')
}

const artifactDefinitions = [
  {
    id: 'windows-x64', platform: 'windows', label: 'Windows', format: 'exe', arch: 'x64',
    fileName: `NamLauncher-${version}-Installer.exe`, recommended: true, signature: windowsSignature
  },
  {
    id: 'windows-app-x64', platform: 'windows', label: 'Windows application bundle', format: 'zip', arch: 'x64',
    fileName: `NamLauncher-${version}-Windows-x64.zip`, recommended: false, signature: 'checksum'
  },
  {
    id: 'macos-universal', platform: 'macos', label: 'macOS', format: 'dmg', arch: 'universal',
    fileName: `NamLauncher-${version}-macOS-universal.dmg`, recommended: false, signature: 'unsigned'
  },
  {
    id: 'linux-appimage-x64', platform: 'linux', label: 'Linux AppImage', format: 'AppImage', arch: 'x64',
    fileName: `NamLauncher-${version}-Linux-x64.AppImage`, recommended: true, signature: 'checksum'
  },
  {
    id: 'linux-deb-x64', platform: 'linux', label: 'Debian / Ubuntu', format: 'deb', arch: 'x64',
    fileName: `NamLauncher-${version}-Linux-x64.deb`, recommended: false, signature: 'checksum'
  },
  {
    id: 'linux-rpm-x64', platform: 'linux', label: 'Fedora / RHEL', format: 'rpm', arch: 'x64',
    fileName: `NamLauncher-${version}-Linux-x64.rpm`, recommended: false, signature: 'checksum'
  },
  {
    id: 'linux-flatpak-x64', platform: 'linux', label: 'Flatpak', format: 'flatpak', arch: 'x64',
    fileName: `NamLauncher-${version}-Linux-x64.flatpak`, recommended: false, signature: 'checksum'
  },
  {
    id: 'linux-arch-x64', platform: 'linux', label: 'Arch / AUR', format: 'pkg.tar.zst', arch: 'x64',
    fileName: `NamLauncher-${version}-Linux-x64.pkg.tar.zst`, recommended: false, signature: 'checksum'
  }
]

const sha256 = (filePath) => new Promise((resolve, reject) => {
  const digest = createHash('sha256')
  const input = createReadStream(filePath)
  input.once('error', reject)
  input.on('data', (chunk) => digest.update(chunk))
  input.once('end', () => resolve(digest.digest('hex')))
})

const verifiedArtifacts = []
for (const definition of artifactDefinitions) {
  const artifactPath = path.join(bundleDirectory, definition.fileName)
  const checksumPath = `${artifactPath}.sha256`
  const artifactInfo = await lstat(artifactPath)
  const checksumInfo = await lstat(checksumPath)
  if (artifactInfo.isSymbolicLink() || checksumInfo.isSymbolicLink()) {
    throw new Error(`Release bundle entries must not be symbolic links: ${definition.fileName}`)
  }
  if (!artifactInfo.isFile() || artifactInfo.size < 1024 || artifactInfo.size > 2 * 1024 * 1024 * 1024) {
    throw new Error(`Release artifact is missing or has an invalid size: ${definition.fileName}`)
  }
  if (!checksumInfo.isFile() || checksumInfo.size < 68 || checksumInfo.size > 4096) {
    throw new Error(`Checksum sidecar is missing or invalid: ${definition.fileName}.sha256`)
  }
  const checksumText = (await readFile(checksumPath, 'ascii')).trim()
  const checksumMatch = checksumText.match(/^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/)
  if (!checksumMatch || checksumMatch[2] !== definition.fileName) {
    throw new Error(`Checksum sidecar does not identify its exact artifact: ${definition.fileName}`)
  }
  const actualDigest = await sha256(artifactPath)
  if (actualDigest !== checksumMatch[1]) {
    throw new Error(`SHA-256 mismatch: ${definition.fileName}`)
  }
  verifiedArtifacts.push({
    ...definition,
    file_name: definition.fileName,
    url: `/download/${definition.fileName}`,
    sha256: actualDigest,
    size: artifactInfo.size
  })
}

const platformManifestDefinitions = {
  Windows: artifactDefinitions.filter(({ platform }) => platform === 'windows'),
  macOS: artifactDefinitions.filter(({ platform }) => platform === 'macos'),
  Linux: artifactDefinitions.filter(({ platform }) => platform === 'linux')
}

for (const [platformLabel, definitions] of Object.entries(platformManifestDefinitions)) {
  const manifestName = `NamLauncher-${version}-${platformLabel}-SHA256SUMS.txt`
  const manifestPath = path.join(bundleDirectory, manifestName)
  const manifestInfo = await lstat(manifestPath)
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) {
    throw new Error(`Platform checksum manifest must be a regular file: ${manifestName}`)
  }
  const actual = await readFile(manifestPath, 'ascii')
  const expected = `${definitions.map(({ fileName }) => {
    const artifact = verifiedArtifacts.find((item) => item.fileName === fileName)
    return `${artifact.sha256}  ${fileName}`
  }).join('\n')}\n`
  if (actual !== expected) {
    throw new Error(`Platform checksum manifest is incomplete or inconsistent: ${manifestName}`)
  }
}

const allowedNames = new Set()
for (const artifact of artifactDefinitions) {
  allowedNames.add(artifact.fileName)
  allowedNames.add(`${artifact.fileName}.sha256`)
}
for (const platformLabel of Object.keys(platformManifestDefinitions)) {
  allowedNames.add(`NamLauncher-${version}-${platformLabel}-SHA256SUMS.txt`)
}
const releaseManifestName = `NamLauncher-${version}-release-manifest.json`
allowedNames.add(releaseManifestName)
for (const entry of await readdir(bundleDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !allowedNames.has(entry.name)) {
    throw new Error(`Unexpected release bundle entry: ${entry.name}`)
  }
}

const releaseManifest = {
  schema_version: 1,
  project: 'NamLauncher',
  version,
  channel: 'stable',
  source_repository: 'https://github.com/NamLauncher/NamLauncher',
  source_commit: sourceCommit,
  generated_at: new Date().toISOString(),
  artifacts: verifiedArtifacts.map(({ fileName: _fileName, ...artifact }) => artifact)
}
const releaseManifestPath = path.join(bundleDirectory, releaseManifestName)
await writeFile(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
process.stdout.write(`Verified ${verifiedArtifacts.length} immutable release artifacts and wrote ${releaseManifestName}\n`)
