// Author/creator: nattapat2871 (https://nattapat2871.me)
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const packageJson = require('../package.json')

const MANIFEST_NAME = 'namlauncher-bundle.json'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

const normalizeEntryName = (entryName, isDirectory = false) => {
  if (typeof entryName !== 'string' || !entryName || entryName.includes('\\') || entryName.includes('\0')) {
    throw new Error('Windows bundle contains an invalid archive path.')
  }
  const candidate = isDirectory && entryName.endsWith('/') ? entryName.slice(0, -1) : entryName
  if (!candidate || candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) {
    throw new Error(`Windows bundle contains an unsafe archive path: ${entryName}`)
  }
  const parts = candidate.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Windows bundle contains an unsafe archive path: ${entryName}`)
  }
  return parts.join('/')
}

const isSymbolicLinkEntry = (entry) => {
  const unixMode = (Number(entry.attr || 0) >>> 16) & 0xffff
  return (unixMode & 0o170000) === 0o120000
}

const parseManifest = (entry, expectedVersion) => {
  let manifest
  try {
    manifest = JSON.parse(entry.getData().toString('utf8'))
  } catch {
    throw new Error('Windows bundle manifest is not valid JSON.')
  }
  if (!manifest || manifest.schemaVersion !== 1 || manifest.platform !== 'win32' || manifest.arch !== 'x64') {
    throw new Error('Windows bundle manifest metadata is invalid.')
  }
  if (!VERSION_PATTERN.test(manifest.version) || manifest.version !== expectedVersion) {
    throw new Error(`Windows bundle manifest version does not match ${expectedVersion}.`)
  }
  if (manifest.entrypoint !== 'NamLauncher.exe' || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Windows bundle manifest inventory is invalid.')
  }
  return manifest
}

export const verifyWindowsBundleZip = (archivePath, expectedVersion = String(packageJson.version || '')) => {
  const resolvedArchive = path.resolve(archivePath)
  const archiveInfo = fs.lstatSync(resolvedArchive)
  if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink()) {
    throw new Error('Windows bundle archive must be a regular file.')
  }
  if (!VERSION_PATTERN.test(expectedVersion)) {
    throw new Error('Expected Windows bundle version is invalid.')
  }

  let archive
  try {
    archive = new AdmZip(resolvedArchive)
  } catch {
    throw new Error('Windows bundle archive is not a readable ZIP file.')
  }

  const files = new Map()
  const directories = new Set()
  for (const entry of archive.getEntries()) {
    const normalized = normalizeEntryName(entry.entryName, entry.isDirectory)
    if (isSymbolicLinkEntry(entry)) {
      throw new Error(`Windows bundle cannot contain a symbolic link: ${normalized}`)
    }
    if (entry.isDirectory) {
      if (directories.has(normalized) || files.has(normalized)) {
        throw new Error(`Windows bundle contains a duplicate archive path: ${normalized}`)
      }
      directories.add(normalized)
      continue
    }
    if (files.has(normalized) || directories.has(normalized)) {
      throw new Error(`Windows bundle contains a duplicate archive path: ${normalized}`)
    }
    files.set(normalized, entry)
  }

  const manifestEntry = files.get(MANIFEST_NAME)
  if (!manifestEntry) throw new Error('Windows bundle manifest is missing from the ZIP archive.')
  const manifest = parseManifest(manifestEntry, expectedVersion)
  const expectedFiles = new Map()

  for (const item of manifest.files) {
    if (!item || typeof item.path !== 'string' || item.path === MANIFEST_NAME) {
      throw new Error('Windows bundle manifest contains an invalid file record.')
    }
    const normalized = normalizeEntryName(item.path)
    if (normalized !== item.path || expectedFiles.has(normalized)) {
      throw new Error(`Windows bundle manifest contains a duplicate or non-canonical path: ${item.path}`)
    }
    if (!Number.isSafeInteger(item.size) || item.size < 0 || !SHA256_PATTERN.test(item.sha256)) {
      throw new Error(`Windows bundle manifest contains invalid integrity metadata: ${item.path}`)
    }
    expectedFiles.set(normalized, item)
  }

  const actualPaths = [...files.keys()].filter((entryName) => entryName !== MANIFEST_NAME).sort()
  const expectedPaths = [...expectedFiles.keys()].sort()
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((entryName, index) => entryName !== expectedPaths[index])) {
    throw new Error('Windows bundle ZIP inventory does not exactly match its manifest.')
  }
  if (!expectedFiles.has(manifest.entrypoint)) {
    throw new Error('Windows bundle entrypoint is not covered by the manifest.')
  }

  for (const entryName of expectedPaths) {
    const data = files.get(entryName).getData()
    const expected = expectedFiles.get(entryName)
    if (data.length !== expected.size || sha256(data) !== expected.sha256) {
      throw new Error(`Windows bundle ZIP integrity verification failed: ${entryName}`)
    }
  }

  return { archivePath: resolvedArchive, manifest, fileCount: expectedPaths.length }
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  const expectedVersion = String(process.argv[3] || packageJson.version || '')
  const archivePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'release', `NamLauncher-${expectedVersion}-Windows-x64.zip`)
  const result = verifyWindowsBundleZip(archivePath, expectedVersion)
  console.log(`Verified ${result.fileCount} files in ${path.basename(result.archivePath)} for NamLauncher ${result.manifest.version}.`)
}
