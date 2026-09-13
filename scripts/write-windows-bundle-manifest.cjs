// Author/creator: nattapat2871 (https://nattapat2871.me)
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const MANIFEST_NAME = 'namlauncher-bundle.json'

const hashFile = (filePath) => {
  const digest = crypto.createHash('sha256')
  const descriptor = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let offset = 0
    while (true) {
      const read = fs.readSync(descriptor, buffer, 0, buffer.length, offset)
      if (!read) break
      offset += read
      digest.update(buffer.subarray(0, read))
    }
    return digest.digest('hex')
  } finally {
    fs.closeSync(descriptor)
  }
}

const collectFiles = (root, directory = root, output = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const absolute = path.join(directory, entry.name)
    const info = fs.lstatSync(absolute)
    if (info.isSymbolicLink()) throw new Error(`Windows bundle cannot include a symbolic link: ${absolute}`)
    if (entry.isDirectory()) {
      collectFiles(root, absolute, output)
      continue
    }
    if (!entry.isFile()) throw new Error(`Windows bundle contains an unsupported entry: ${absolute}`)
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    if (relative === MANIFEST_NAME) continue
    output.push({ path: relative, size: info.size, sha256: hashFile(absolute) })
  }
  return output
}

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return
  const appOutDir = path.resolve(context.appOutDir)
  const launcherPath = path.join(appOutDir, 'NamLauncher.exe')
  const launcherInfo = fs.lstatSync(launcherPath)
  if (!launcherInfo.isFile() || launcherInfo.isSymbolicLink()) {
    throw new Error('Windows bundle entrypoint is missing or unsafe.')
  }
  const version = String(context.packager.appInfo.version || '')
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error('Windows bundle version is invalid.')
  }
  const manifestPath = path.join(appOutDir, MANIFEST_NAME)
  fs.rmSync(manifestPath, { force: true })
  const files = collectFiles(appOutDir)
  const manifest = {
    schemaVersion: 1,
    version,
    platform: 'win32',
    arch: 'x64',
    entrypoint: 'NamLauncher.exe',
    createdAt: new Date().toISOString(),
    files
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
}
