// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const version = '9.8.7'
const sourceCommit = 'a'.repeat(40)
const platformFiles = {
  Windows: [`NamLauncher-${version}-Installer.exe`],
  macOS: [`NamLauncher-${version}-macOS-universal.dmg`],
  Linux: [
    `NamLauncher-${version}-Linux-x64.AppImage`,
    `NamLauncher-${version}-Linux-x64.deb`,
    `NamLauncher-${version}-Linux-x64.rpm`,
    `NamLauncher-${version}-Linux-x64.flatpak`,
    `NamLauncher-${version}-Linux-x64.pkg.tar.zst`
  ]
}

const runVerifier = (directory, signature = 'unsigned') => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    'scripts/verify-ci-release-bundle.mjs',
    '--directory', directory,
    '--version', version,
    '--source-commit', sourceCommit,
    '--windows-signature', signature
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.once('error', reject)
  child.once('exit', (code) => resolve({ code, stderr, stdout }))
})

const makeBundle = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'namlauncher-ci-release-'))
  for (const [platform, files] of Object.entries(platformFiles)) {
    const lines = []
    for (const [index, fileName] of files.entries()) {
      const bytes = Buffer.alloc(4096 + index, fileName.charCodeAt(0))
      const digest = createHash('sha256').update(bytes).digest('hex')
      await writeFile(path.join(directory, fileName), bytes)
      await writeFile(path.join(directory, `${fileName}.sha256`), `${digest}  ${fileName}\n`, 'ascii')
      lines.push(`${digest}  ${fileName}`)
    }
    await writeFile(
      path.join(directory, `NamLauncher-${version}-${platform}-SHA256SUMS.txt`),
      `${lines.join('\n')}\n`,
      'ascii'
    )
  }
  return directory
}

test('verifies all three operating-system bundles and writes deployment metadata', async (context) => {
  const directory = await makeBundle()
  context.after(() => rm(directory, { recursive: true, force: true }))
  const result = await runVerifier(directory, 'signpath')
  assert.equal(result.code, 0, result.stderr)
  const manifest = JSON.parse(await readFile(path.join(directory, `NamLauncher-${version}-release-manifest.json`), 'utf8'))
  assert.equal(manifest.version, version)
  assert.equal(manifest.source_commit, sourceCommit)
  assert.equal(manifest.artifacts.length, 7)
  assert.equal(manifest.artifacts.find(({ id }) => id === 'windows-x64').signature, 'signpath')
  assert.equal(manifest.artifacts.find(({ id }) => id === 'macos-universal').signature, 'unsigned')
})

test('fails closed when a platform artifact changes after checksums are generated', async (context) => {
  const directory = await makeBundle()
  context.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(path.join(directory, platformFiles.Linux[0]), Buffer.alloc(4096, 0x78))
  const result = await runVerifier(directory)
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /SHA-256 mismatch/)
})

test('fails closed when an artifact is replaced by a symbolic link', async (context) => {
  const directory = await makeBundle()
  context.after(() => rm(directory, { recursive: true, force: true }))
  const artifactPath = path.join(directory, platformFiles.Linux[0])
  const realArtifactPath = `${artifactPath}.real`
  await rename(artifactPath, realArtifactPath)
  try {
    await symlink(realArtifactPath, artifactPath, 'file')
  } catch (error) {
    if (error?.code === 'EPERM') {
      context.skip('Creating symbolic links requires Windows Developer Mode or elevation')
      return
    }
    throw error
  }
  const result = await runVerifier(directory)
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /must not be symbolic links/)
})
