// Author/creator: nattapat2871 (https://nattapat2871.me)
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { shouldInstallForgeProfileDirectly } from '../minecraft/forgeProfile.ts'
import { getForgeArtifactCoordinates } from '../minecraft/index.ts'
import { parseNeoForgeMetadata, sortLoaderVersions } from '../loaderSupport.ts'
import { assertPathWithinRoot } from '../pathSafety.ts'
import { getMinecraftCrashDiagnosis } from '../../shared/minecraftCrashDiagnosis.ts'
import { redactLabeledPlayerNames as redactSensitiveText } from '../../shared/privacyRedaction.ts'
import type { CurseForgeFile, CurseForgeInstallRequest, LaunchRequest } from '../main.ts'

type LoaderServiceDependencies = {
  [key: string]: any
  downloadFile: (...args: any[]) => Promise<any>
  getCurseForgeCompatibleFiles: (...args: any[]) => Promise<CurseForgeFile[]>
  readJsonFile: <T>(filePath: string, fallback: T) => T
}

export const createLoaderService = (deps: LoaderServiceDependencies) => {
  const {
    ensureDir, log, getCompactErrorLog, downloadFile, getCurseForgeModId,
    normalizeCurseForgeProjectType, getCurseForgeModpackVersions, normalizeInstance,
    getCurseForgeCompatibleFiles, throwIfInstallCancelled, hashFile, sendProgress, writeJsonFile,
    readJsonFile, getZipEntryDataWithLimit, FABRIC_META_BASE, QUILT_META_BASE,
    QUILT_MAVEN_METADATA_URL, FORGE_PROMOTIONS_URL, FORGE_MAVEN_BASE,
    NEOFORGE_METADATA_URL, NEOFORGE_MAVEN_BASE, MOJANG_VERSION_MANIFEST_URL,
    HTTP_HEADERS, MAX_ZIP_METADATA_ENTRY_BYTES, LAUNCH_CANCELLED_MESSAGE
  } = deps

  const resolveFabricLoaderVersion = async (mcVersion: string, requestedLoaderVersion?: string) => {
    if (requestedLoaderVersion) return requestedLoaderVersion

    const versions = await listFabricLoaderVersions(mcVersion)
    const stable = versions.find((item) => item.type === 'stable')
    const selected = stable || versions[0]
    const version = selected?.id

    if (!version) throw new Error(`No Fabric loader version found for Minecraft ${mcVersion}.`)
    return version
  }

  const normalizeLoaderPathIdentifier = (value: unknown, label: string) => {
    const normalized = String(value || '').trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,119}$/.test(normalized)) {
      throw new Error(`${label} contains unsupported characters.`)
    }
    return normalized
  }

  const listFabricLoaderVersions = async (mcVersion: string) => {
    const response = await axios.get<any[]>(`${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(mcVersion)}`, {
      headers: HTTP_HEADERS
    })

    return response.data
      .map((item) => ({
        id: item.loader?.version || item.version,
        type: item.loader?.stable || item.stable ? 'stable' : 'unstable'
      }))
      .filter((item) => item.id)
  }

  const ensureFabricProfile = async (instanceRoot: string, mcVersion: string, requestedLoaderVersion?: string) => {
    const safeMinecraftVersion = normalizeLoaderPathIdentifier(mcVersion, 'Minecraft version')
    const loaderVersion = normalizeLoaderPathIdentifier(
      await resolveFabricLoaderVersion(safeMinecraftVersion, requestedLoaderVersion),
      'Fabric loader version'
    )
    const profileUrl = `${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(safeMinecraftVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
    const response = await axios.get<any>(profileUrl, { headers: HTTP_HEADERS })
    const customVersionId = normalizeLoaderPathIdentifier(
      response.data.id || `fabric-loader-${loaderVersion}-${safeMinecraftVersion}`,
      'Fabric profile ID'
    )
    const versionDir = path.join(instanceRoot, 'versions', customVersionId)
    assertPathWithinRoot(instanceRoot, versionDir)
    ensureDir(versionDir)
    const profilePath = path.join(versionDir, `${customVersionId}.json`)
    assertPathWithinRoot(versionDir, profilePath)
    fs.writeFileSync(profilePath, JSON.stringify(response.data, null, 2), 'utf8')

    log.info(`Fabric profile ready: ${customVersionId}`)
    return { customVersionId, loaderVersion }
  }

  const listQuiltLoaderVersions = async (mcVersion: string) => {
    const normalizedVersion = mcVersion.trim()
    const genericEndpoint = `${QUILT_META_BASE}/versions/loader`
    const preferredEndpoint = normalizedVersion
      ? `${genericEndpoint}/${encodeURIComponent(normalizedVersion)}`
      : genericEndpoint

    try {
      const response = await axios.get<any[]>(preferredEndpoint, {
        headers: HTTP_HEADERS,
        timeout: 30000
      })
      const versions = sortLoaderVersions(response.data.map((item) => String(item.loader?.version || item.version || '')))
      if (versions.length > 0) return versions
      log.warn(`Quilt metadata returned no loader versions for ${preferredEndpoint}; trying fallback indexes.`)
    } catch (preferredError) {
      log.warn(`Quilt metadata request failed for ${preferredEndpoint}; trying the generic loader index.`, getCompactErrorLog(preferredError))
    }

    if (preferredEndpoint !== genericEndpoint) {
      try {
        const response = await axios.get<any[]>(genericEndpoint, {
          headers: HTTP_HEADERS,
          timeout: 30000
        })
        const versions = sortLoaderVersions(response.data.map((item) => String(item.loader?.version || item.version || '')))
        if (versions.length > 0) return versions
      } catch (genericError) {
        log.warn(`Quilt generic metadata request failed for ${genericEndpoint}; trying Maven metadata.`, getCompactErrorLog(genericError))
      }
    }

    const mavenResponse = await axios.get<string>(QUILT_MAVEN_METADATA_URL, {
      headers: HTTP_HEADERS,
      timeout: 30000,
      responseType: 'text'
    })
    const mavenVersions = Array.from(
      mavenResponse.data.matchAll(/<version>([^<]+)<\/version>/g),
      (match) => match[1].trim()
    )
    const versions = sortLoaderVersions(mavenVersions)
    if (versions.length === 0) throw new Error('Quilt metadata did not contain any loader versions.')
    return versions
  }

  const getQuiltGameCompatibility = async (mcVersion: string) => {
    const requestedVersion = mcVersion.trim()
    try {
      const response = await axios.get<Array<{ version?: string; stable?: boolean }>>(
        `${QUILT_META_BASE}/versions/game`,
        { headers: HTTP_HEADERS, timeout: 30000 }
      )
      const gameVersions = Array.isArray(response.data) ? response.data : []
      const supported = gameVersions.some((item) => item.version === requestedVersion)
      const recommendedGameVersion = String(
        gameVersions.find((item) => item.stable && item.version)?.version || ''
      )
      return {
        supported,
        requestedGameVersion: requestedVersion,
        recommendedGameVersion: recommendedGameVersion || null
      }
    } catch (error) {
      log.warn('Could not verify Quilt Minecraft compatibility; allowing the metadata request to decide.', getCompactErrorLog(error))
      return {
        supported: true,
        requestedGameVersion: requestedVersion,
        recommendedGameVersion: null
      }
    }
  }

  const resolveQuiltLoaderVersion = async (mcVersion: string, requestedLoaderVersion?: string) => {
    if (requestedLoaderVersion) return requestedLoaderVersion
    const version = (await listQuiltLoaderVersions(mcVersion))[0]?.id
    if (!version) throw new Error(`No Quilt loader version found for Minecraft ${mcVersion}.`)
    return version
  }

  const ensureQuiltProfile = async (instanceRoot: string, mcVersion: string, requestedLoaderVersion?: string) => {
    const safeMinecraftVersion = normalizeLoaderPathIdentifier(mcVersion, 'Minecraft version')
    const compatibility = await getQuiltGameCompatibility(safeMinecraftVersion)
    if (!compatibility.supported) {
      const recommendation = compatibility.recommendedGameVersion
        ? ` Use Minecraft ${compatibility.recommendedGameVersion} or another supported version.`
        : ''
      throw new Error(`Quilt does not support Minecraft ${safeMinecraftVersion}.${recommendation}`)
    }
    const loaderVersion = normalizeLoaderPathIdentifier(
      await resolveQuiltLoaderVersion(safeMinecraftVersion, requestedLoaderVersion),
      'Quilt loader version'
    )
    const profileUrl = `${QUILT_META_BASE}/versions/loader/${encodeURIComponent(safeMinecraftVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
    const response = await axios.get<any>(profileUrl, { headers: HTTP_HEADERS })
    const customVersionId = normalizeLoaderPathIdentifier(
      response.data.id || `quilt-loader-${loaderVersion}-${safeMinecraftVersion}`,
      'Quilt profile ID'
    )
    const versionDir = path.join(instanceRoot, 'versions', customVersionId)
    assertPathWithinRoot(instanceRoot, versionDir)
    ensureDir(versionDir)
    const profilePath = path.join(versionDir, `${customVersionId}.json`)
    assertPathWithinRoot(versionDir, profilePath)
    fs.writeFileSync(profilePath, JSON.stringify(response.data, null, 2), 'utf8')
    log.info(`Quilt profile ready: ${customVersionId}`)
    return { customVersionId, loaderVersion }
  }

  const resolveForgeVersion = async (mcVersion: string, requestedForgeVersion?: string) => {
    if (requestedForgeVersion) {
      return requestedForgeVersion.startsWith(`${mcVersion}-`)
        ? requestedForgeVersion.slice(mcVersion.length + 1)
        : requestedForgeVersion
    }

    const versions = await listForgeVersions(mcVersion)
    const recommended = versions.find((item) => item.type === 'recommended')
    const latest = versions.find((item) => item.type === 'latest')
    const version = recommended?.id || latest?.id

    if (!version) throw new Error(`No Forge build found for Minecraft ${mcVersion}.`)
    return version
  }

  const listForgeVersions = async (mcVersion: string) => {
    const response = await axios.get<{ promos: Record<string, string> }>(FORGE_PROMOTIONS_URL, {
      headers: HTTP_HEADERS
    })
    const promos = response.data.promos || {}
    const versions = [
      promos[`${mcVersion}-recommended`] ? { id: promos[`${mcVersion}-recommended`], type: 'recommended' } : null,
      promos[`${mcVersion}-latest`] ? { id: promos[`${mcVersion}-latest`], type: 'latest' } : null
    ].filter(Boolean) as Array<{ id: string; type: string }>

    return versions.filter((item, index) => versions.findIndex((candidate) => candidate.id === item.id) === index)
  }

  const verifyMavenExecutableArtifact = async (artifactUrl: string, artifactPath: string, label: string) => {
    const checksumResponse = await axios.get<string>(`${artifactUrl}.sha1`, {
      headers: HTTP_HEADERS,
      timeout: 30000,
      responseType: 'text',
      maxContentLength: 1024
    })
    const expectedSha1 = String(checksumResponse.data || '').trim().split(/\s+/, 1)[0].toLowerCase()
    if (!/^[a-f0-9]{40}$/.test(expectedSha1)) {
      fs.rmSync(artifactPath, { force: true })
      throw new Error(`${label} did not provide a valid Maven SHA-1 checksum.`)
    }
    const actualSha1 = crypto.createHash('sha1').update(fs.readFileSync(artifactPath)).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(actualSha1, 'hex'), Buffer.from(expectedSha1, 'hex'))) {
      fs.rmSync(artifactPath, { force: true })
      throw new Error(`${label} failed Maven checksum verification.`)
    }
  }

  const ensureForgeInstaller = async (instanceRoot: string, mcVersion: string, requestedForgeVersion?: string) => {
    const safeMinecraftVersion = normalizeLoaderPathIdentifier(mcVersion, 'Minecraft version')
    const forgeVersion = normalizeLoaderPathIdentifier(
      await resolveForgeVersion(safeMinecraftVersion, requestedForgeVersion),
      'Forge loader version'
    )
    const loaderDir = path.join(instanceRoot, 'loaders', 'forge')
    assertPathWithinRoot(instanceRoot, loaderDir)
    let lastError: unknown = null

    for (const coordinate of getForgeArtifactCoordinates(safeMinecraftVersion, forgeVersion)) {
      for (const classifier of ['installer', 'universal'] as const) {
        const artifactName = `forge-${coordinate}-${classifier}.jar`
        const artifactPath = path.join(loaderDir, artifactName)
        assertPathWithinRoot(loaderDir, artifactPath)
        const artifactUrl = `${FORGE_MAVEN_BASE}/net/minecraftforge/forge/${coordinate}/${artifactName}`
        try {
          await downloadFile(artifactUrl, artifactPath, 'loader-download')
          await verifyMavenExecutableArtifact(
            artifactUrl,
            artifactPath,
            `Forge ${coordinate} ${classifier === 'installer' ? 'installer' : 'universal JAR'}`
          )
          log.info(`Forge ${classifier} ready: ${artifactPath}`)
          return { forgePath: artifactPath, loaderVersion: forgeVersion }
        } catch (error) {
          lastError = error
          fs.rmSync(artifactPath, { force: true })
          log.warn(
            `Forge ${classifier} artifact is unavailable; trying the next official Maven coordinate.`,
            getCompactErrorLog(error)
          )
        }
      }
    }

    throw lastError || new Error(`No verified Forge artifact was found for ${safeMinecraftVersion}-${forgeVersion}.`)
  }

  const getCurseForgeProjectVersions = async (request: CurseForgeInstallRequest) => {
    const project = request.project || {}
    const modId = getCurseForgeModId(project)
    const projectType = normalizeCurseForgeProjectType(project.project_type)
    if (!modId) throw new Error('Missing CurseForge project id.')
    if (projectType === 'modpack') return getCurseForgeModpackVersions(request)
    const instance = normalizeInstance({ instance: request.instance })
    const files = await getCurseForgeCompatibleFiles(modId, instance, projectType)
    return files.map((file) => ({
      id: String(file.id),
      name: file.displayName || file.fileName,
      version_number: file.displayName || file.fileName,
      version_type: file.releaseType === 2 ? 'beta' : file.releaseType === 3 ? 'alpha' : 'release',
      game_versions: (file.gameVersions || []).filter((version) => !/^(fabric|forge|neoforge|quilt)$/i.test(version)),
      loaders: (file.gameVersions || []).filter((version) => /^(fabric|forge|neoforge|quilt)$/i.test(version)).map((value) => value.toLowerCase()),
      date_published: file.fileDate || null
    }))
  }

  const listNeoForgeVersions = async (mcVersion: string) => {
    const response = await axios.get<string>(NEOFORGE_METADATA_URL, {
      headers: HTTP_HEADERS,
      responseType: 'text'
    })
    return parseNeoForgeMetadata(response.data, mcVersion)
  }

  const resolveNeoForgeVersion = async (mcVersion: string, requestedLoaderVersion?: string) => {
    if (requestedLoaderVersion) return requestedLoaderVersion.replace(/^neoforge-/i, '')
    const version = (await listNeoForgeVersions(mcVersion))[0]?.id
    if (!version) throw new Error(`No NeoForge build found for Minecraft ${mcVersion}. NeoForge requires a supported modern Minecraft version.`)
    return version
  }

  type MojangVersionMetadata = {
    id?: string
    downloads?: {
      client?: {
        url?: string
        sha1?: string
        size?: number
      }
    }
    [key: string]: unknown
  }

  const assertMojangMetadataUrl = (rawUrl: string, allowedHosts: Set<string>) => {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname.toLowerCase())) {
      throw new Error('Mojang returned an unexpected Minecraft download URL.')
    }
    return parsed.href
  }

  const getMojangVersionMetadata = async (mcVersion: string, signal?: AbortSignal): Promise<MojangVersionMetadata> => {
    const manifestResponse = await axios.get<any>(MOJANG_VERSION_MANIFEST_URL, {
      timeout: 30000,
      signal,
      headers: HTTP_HEADERS,
      maxContentLength: 16 * 1024 * 1024
    })
    const versionEntry = Array.isArray(manifestResponse.data?.versions)
      ? manifestResponse.data.versions.find((entry: any) => entry?.id === mcVersion)
      : null
    if (!versionEntry?.url) throw new Error(`Minecraft ${mcVersion} is missing from the Mojang version manifest.`)

    const metadataUrl = assertMojangMetadataUrl(String(versionEntry.url), new Set([
      'piston-meta.mojang.com',
      'launchermeta.mojang.com'
    ]))
    const versionResponse = await axios.get<MojangVersionMetadata>(metadataUrl, {
      timeout: 30000,
      signal,
      headers: HTTP_HEADERS,
      maxContentLength: 16 * 1024 * 1024
    })
    const metadata = versionResponse.data || {}
    const client = metadata.downloads?.client
    if (metadata.id !== mcVersion || !client?.url || !/^[a-f0-9]{40}$/i.test(String(client.sha1 || ''))) {
      throw new Error(`Mojang returned incomplete client metadata for Minecraft ${mcVersion}.`)
    }
    assertMojangMetadataUrl(String(client.url), new Set([
      'piston-data.mojang.com',
      'launcher.mojang.com'
    ]))
    return metadata
  }

  // Author/creator: nattapat2871 (https://nattapat2871.me)
  const ensureVerifiedMinecraftClient = async (instanceRoot: string, mcVersion: string, signal?: AbortSignal) => {
    throwIfInstallCancelled(signal)
    const metadata = await getMojangVersionMetadata(mcVersion, signal)
    const client = metadata.downloads!.client!
    const clientUrl = assertMojangMetadataUrl(String(client.url), new Set([
      'piston-data.mojang.com',
      'launcher.mojang.com'
    ]))
    const expectedSha1 = String(client.sha1).toLowerCase()
    const expectedSize = Number(client.size) || 0
    const versionDirectory = path.join(instanceRoot, 'versions', mcVersion)
    const clientPath = path.join(versionDirectory, `${mcVersion}.jar`)
    const versionJsonPath = path.join(versionDirectory, `${mcVersion}.json`)
    ensureDir(versionDirectory)

    const isValidClient = async () => {
      if (!fs.existsSync(clientPath)) return false
      if (expectedSize > 0 && fs.statSync(clientPath).size !== expectedSize) return false
      return (await hashFile(clientPath, 'sha1')).toLowerCase() === expectedSha1
    }

    if (!await isValidClient()) {
      fs.rmSync(clientPath, { force: true })
      let verified = false
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        throwIfInstallCancelled(signal)
        sendProgress({ type: 'loader-install', task: 12 + attempt, total: 100, detail: 'minecraft-client' })
        await downloadFile(
          clientUrl,
          clientPath,
          'loader-download',
          true,
          signal,
          undefined,
          expectedSize > 0 ? expectedSize : 512 * 1024 * 1024
        )
        if (await isValidClient()) {
          verified = true
          break
        }
        fs.rmSync(clientPath, { force: true })
        log.warn(`Minecraft ${mcVersion} client checksum mismatch; retrying verified download (${attempt}/3).`)
      }
      if (!verified) {
        throw new Error(`Minecraft ${mcVersion} client failed checksum verification after 3 downloads.`)
      }
    }

    writeJsonFile(versionJsonPath, metadata)
    log.info(`Verified Minecraft ${mcVersion} client before loader installation.`)
  }

  const runLoaderInstaller = (
    javaPath: string,
    installerPath: string,
    instanceRoot: string,
    signal?: AbortSignal,
    loaderName: 'NeoForge' | 'Forge' = 'NeoForge'
  ) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(LAUNCH_CANCELLED_MESSAGE))
      return
    }

    const launcherProfilesPath = path.join(instanceRoot, 'launcher_profiles.json')
    if (!fs.existsSync(launcherProfilesPath)) {
      fs.writeFileSync(launcherProfilesPath, JSON.stringify({ profiles: {} }, null, 2), 'utf8')
    }

    let output = ''
    let progress = 25
    let settled = false
    const installer = spawn(javaPath, [
      // This short-lived installer must not inherit the game's multi-GB heap policy.
      // Bound Java ergonomics on high-RAM machines; leave room for native allocations.
      '-Xms128m',
      '-Xmx2048m',
      '-Djava.awt.headless=true',
      '-jar',
      installerPath,
      loaderName === 'Forge' ? '--installClient' : '--install-client',
      instanceRoot
    ], {
      cwd: path.dirname(installerPath),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', cancel)
      if (error) reject(error)
      else resolve()
    }
    const appendOutput = (chunk: unknown) => {
      const text = redactSensitiveText(String(chunk || ''))
      output = `${output}${text}`.slice(-24000)
      progress = Math.min(90, progress + 2)
      sendProgress({ type: 'loader-install', task: progress, total: 100, detail: loaderName.toLowerCase() })
    }
    const cancel = () => {
      installer.kill()
      finish(new Error(LAUNCH_CANCELLED_MESSAGE))
    }
    const timeout = setTimeout(() => {
      installer.kill()
      finish(new Error(`${loaderName} installer timed out after 10 minutes.`))
    }, 10 * 60 * 1000)

    signal?.addEventListener('abort', cancel, { once: true })
    installer.stdout?.on('data', appendOutput)
    installer.stderr?.on('data', appendOutput)
    installer.once('error', (error) => finish(error))
    installer.once('close', (code) => {
      if (code === 0) {
        finish()
        return
      }
      const detail = output.trim().split(/\r?\n/).slice(-8).join('\n')
      // Keep a known memory cause even when later installer output pushes it out of the tail.
      const memoryHint = getMinecraftCrashDiagnosis(output)?.code === 'jvm-native-memory'
        ? ' Java native memory allocation failed (RAM / paging file).'
        : ''
      finish(new Error(`${loaderName} installer exited with code ${code}${memoryHint}${detail ? `:\n${detail}` : ''}`))
    })
  })

  const runNeoForgeInstaller = (javaPath: string, installerPath: string, instanceRoot: string, signal?: AbortSignal) => (
    runLoaderInstaller(javaPath, installerPath, instanceRoot, signal, 'NeoForge')
  )

  const ensureDirectForgeProfile = async (
    instanceRoot: string, minecraftVersion: string, javaPath: string,
    forge: { forgePath: string; loaderVersion: string }, signal?: AbortSignal
  ) => {
    const zip = new AdmZip(forge.forgePath)
    const entry = zip.getEntry('version.json')
    if (!entry || entry.isDirectory) return null // Legacy universal JARs use the existing path.
    const profile = JSON.parse(getZipEntryDataWithLimit(entry, MAX_ZIP_METADATA_ENTRY_BYTES, 'Forge version profile').toString('utf8'))
    if (!shouldInstallForgeProfileDirectly(profile, minecraftVersion)) return null
    const customVersionId = normalizeLoaderPathIdentifier(profile.id, 'Forge profile ID')
    const installedProfilePath = path.join(instanceRoot, 'versions', customVersionId, `${customVersionId}.json`)
    const markerPath = path.join(instanceRoot, 'loaders', 'forge', `${forge.loaderVersion}.direct-installed.json`)
    assertPathWithinRoot(instanceRoot, installedProfilePath)
    assertPathWithinRoot(instanceRoot, markerPath)
    const installerSha256 = await hashFile(forge.forgePath, 'sha256')
    const marker = readJsonFile<{ installerSha256?: string; profileSha256?: string }>(markerPath, {})
    if (!fs.existsSync(installedProfilePath) || marker.installerSha256 !== installerSha256
      || !marker.profileSha256 || await hashFile(installedProfilePath, 'sha256') !== marker.profileSha256) {
      await ensureVerifiedMinecraftClient(instanceRoot, minecraftVersion, signal)
      await runLoaderInstaller(javaPath, forge.forgePath, instanceRoot, signal, 'Forge')
      if (!fs.existsSync(installedProfilePath)) throw new Error(`Forge installer completed without creating ${customVersionId}.`)
      const installed = readJsonFile<unknown>(installedProfilePath, null)
      if (!shouldInstallForgeProfileDirectly(installed, minecraftVersion)) throw new Error('Forge created an unexpected launch profile.')
      writeJsonFile(markerPath, { installerSha256, profileSha256: await hashFile(installedProfilePath, 'sha256'),
        customVersionId, installedAt: new Date().toISOString() })
    }
    log.info(`Verified direct Forge profile ready: ${customVersionId}`)
    return {
      customVersionId, resolvedLoaderVersion: forge.loaderVersion, forgePath: undefined,
      javaArgs: resolveNeoForgeJvmArguments(instanceRoot, customVersionId, profile.arguments?.jvm || [])
    }
  }

  const ensureNeoForgeProfile = async (
    instanceRoot: string,
    mcVersion: string,
    javaPath: string,
    requestedLoaderVersion?: string,
    signal?: AbortSignal
  ) => {
    const safeMinecraftVersion = normalizeLoaderPathIdentifier(mcVersion, 'Minecraft version')
    const loaderVersion = normalizeLoaderPathIdentifier(
      await resolveNeoForgeVersion(safeMinecraftVersion, requestedLoaderVersion),
      'NeoForge loader version'
    )
    const loaderDir = path.join(instanceRoot, 'loaders', 'neoforge')
    assertPathWithinRoot(instanceRoot, loaderDir)
    const installerName = `neoforge-${loaderVersion}-installer.jar`
    const installerPath = path.join(loaderDir, installerName)
    assertPathWithinRoot(loaderDir, installerPath)
    const installerUrl = `${NEOFORGE_MAVEN_BASE}/net/neoforged/neoforge/${encodeURIComponent(loaderVersion)}/${installerName}`
    await downloadFile(installerUrl, installerPath, 'loader-download')
    await verifyMavenExecutableArtifact(installerUrl, installerPath, `NeoForge ${loaderVersion} installer`)

    const zip = new AdmZip(installerPath)
    const versionEntry = zip.getEntry('version.json')
    if (!versionEntry || versionEntry.isDirectory) throw new Error('The NeoForge installer is missing version.json.')
    const profile = JSON.parse(getZipEntryDataWithLimit(versionEntry, MAX_ZIP_METADATA_ENTRY_BYTES, 'NeoForge version profile').toString('utf8')) as {
      id?: string
      inheritsFrom?: string
      mainClass?: string
      libraries?: unknown[]
      arguments?: {
        jvm?: VersionProfileArgument[]
      }
    }
    if (!profile.id || profile.inheritsFrom !== safeMinecraftVersion || !profile.mainClass || !Array.isArray(profile.libraries)) {
      throw new Error(`The NeoForge ${loaderVersion} profile is not compatible with Minecraft ${safeMinecraftVersion}.`)
    }

    const customVersionId = normalizeLoaderPathIdentifier(profile.id, 'NeoForge profile ID')
    const versionDir = path.join(instanceRoot, 'versions', customVersionId)
    assertPathWithinRoot(instanceRoot, versionDir)
    const installedProfilePath = path.join(versionDir, `${customVersionId}.json`)
    const installMarkerPath = path.join(loaderDir, `${loaderVersion}.installed.json`)
    assertPathWithinRoot(versionDir, installedProfilePath)
    assertPathWithinRoot(loaderDir, installMarkerPath)
    if (!fs.existsSync(installedProfilePath) || !fs.existsSync(installMarkerPath)) {
      sendProgress({ type: 'loader-install', task: 20, total: 100, detail: 'neoforge' })
      await ensureVerifiedMinecraftClient(instanceRoot, safeMinecraftVersion, signal)
      await runNeoForgeInstaller(javaPath, installerPath, instanceRoot, signal)
      if (!fs.existsSync(installedProfilePath)) {
        throw new Error(`NeoForge installer completed without creating ${customVersionId}.`)
      }
      fs.writeFileSync(installMarkerPath, JSON.stringify({
        minecraftVersion: safeMinecraftVersion,
        loaderVersion,
        customVersionId,
        installedAt: new Date().toISOString()
      }, null, 2), 'utf8')
    }
    log.info(`NeoForge profile ready: ${customVersionId}`)
    return {
      customVersionId,
      loaderVersion,
      javaArgs: resolveNeoForgeJvmArguments(instanceRoot, customVersionId, profile.arguments?.jvm || [])
    }
  }

  type VersionProfileRule = {
    action?: 'allow' | 'disallow'
    os?: {
      name?: string
      arch?: string
    }
  }

  type VersionProfileArgument = string | number | {
    rules?: VersionProfileRule[]
    value?: string | string[]
  }

  const getMinecraftOsName = () => {
    if (process.platform === 'win32') return 'windows'
    if (process.platform === 'darwin') return 'osx'
    return 'linux'
  }

  const getMinecraftArchName = () => {
    if (process.arch === 'ia32') return 'x86'
    if (process.arch === 'arm64') return 'arm64'
    return 'x86_64'
  }

  const matchesVersionProfileRule = (rule: VersionProfileRule) => {
    if (!rule.os) return true
    if (rule.os.name && rule.os.name !== getMinecraftOsName()) return false
    if (rule.os.arch && rule.os.arch !== getMinecraftArchName()) return false
    return true
  }

  const shouldUseVersionProfileArgument = (argument: Exclude<VersionProfileArgument, string | number>) => {
    if (!Array.isArray(argument.rules) || argument.rules.length === 0) return true

    let allowed = false
    for (const rule of argument.rules) {
      if (!matchesVersionProfileRule(rule)) continue
      allowed = rule.action === 'allow'
    }
    return allowed
  }

  const resolveNeoForgeJvmArguments = (
    instanceRoot: string,
    customVersionId: string,
    args: VersionProfileArgument[]
  ) => {
    const separator = process.platform === 'win32' ? ';' : ':'
    const replacements: Record<string, string> = {
      '${library_directory}': path.join(instanceRoot, 'libraries'),
      '${classpath_separator}': separator,
      '${version_name}': customVersionId,
      '${launcher_name}': 'NamLauncher',
      '${launcher_version}': app.getVersion()
    }
    const replacePlaceholders = (value: string) => Object.entries(replacements)
      .reduce((text, [key, replacement]) => text.split(key).join(replacement), value)
    const resolved: string[] = []

    for (const arg of args) {
      if (typeof arg === 'string' || typeof arg === 'number') {
        resolved.push(replacePlaceholders(String(arg)))
        continue
      }

      if (!shouldUseVersionProfileArgument(arg)) continue
      const values = Array.isArray(arg.value) ? arg.value : [arg.value]
      values
        .filter((value): value is string => typeof value === 'string')
        .forEach((value) => resolved.push(replacePlaceholders(value)))
    }

    return resolved.filter(Boolean)
  }

  const prepareLoader = async (
    instanceRoot: string,
    instance: ReturnType<typeof normalizeInstance>,
    javaPath: string,
    signal?: AbortSignal
  ) => {
    if (instance.loader === 'fabric') {
      sendProgress({ type: 'loader-install', task: 10, total: 100, detail: 'fabric' })
      const fabric = await ensureFabricProfile(instanceRoot, instance.version, instance.loaderVersion)
      sendProgress({ type: 'loader-install', task: 100, total: 100, detail: 'fabric' })
      return {
        customVersionId: fabric.customVersionId,
        resolvedLoaderVersion: fabric.loaderVersion
      }
    }

    if (instance.loader === 'quilt') {
      sendProgress({ type: 'loader-install', task: 10, total: 100, detail: 'quilt' })
      const quilt = await ensureQuiltProfile(instanceRoot, instance.version, instance.loaderVersion)
      sendProgress({ type: 'loader-install', task: 100, total: 100, detail: 'quilt' })
      return {
        customVersionId: quilt.customVersionId,
        resolvedLoaderVersion: quilt.loaderVersion
      }
    }

    if (instance.loader === 'forge') {
      sendProgress({ type: 'loader-install', task: 10, total: 100, detail: 'forge' })
      const forge = await ensureForgeInstaller(instanceRoot, instance.version, instance.loaderVersion)
      const directProfile = await ensureDirectForgeProfile(instanceRoot, instance.version, javaPath, forge, signal)
      sendProgress({ type: 'loader-install', task: 100, total: 100, detail: 'forge' })
      if (directProfile) return directProfile
      return {
        forgePath: forge.forgePath,
        resolvedLoaderVersion: forge.loaderVersion
      }
    }

    if (instance.loader === 'neoforge') {
      sendProgress({ type: 'loader-install', task: 10, total: 100, detail: 'neoforge' })
      const neoForge = await ensureNeoForgeProfile(instanceRoot, instance.version, javaPath, instance.loaderVersion, signal)
      sendProgress({ type: 'loader-install', task: 100, total: 100, detail: 'neoforge' })
      return {
        customVersionId: neoForge.customVersionId,
        resolvedLoaderVersion: neoForge.loaderVersion,
        javaArgs: neoForge.javaArgs
      }
    }

    return {}
  }
  return {
    listFabricLoaderVersions,
    listForgeVersions,
    listQuiltLoaderVersions,
    listNeoForgeVersions,
    getQuiltGameCompatibility,
    getCurseForgeProjectVersions,
    prepareLoader
  }
}
