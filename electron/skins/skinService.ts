// Author/creator: nattapat2871 (https://nattapat2871.me)
import type { Server } from 'http'
import { DEFAULT_MINECRAFT_SKIN_HEAD } from '../discord'
import type {
  SkinActionRequest,
  SkinDefaultRequest,
  SkinImportRequest,
  SkinModel,
  SkinSaveRequest,
  StoredAccount,
  StoredMinecraftProfileCache,
  StoredMinecraftProfileCape,
  StoredSkinAccount,
  StoredSkinLibrary,
  StoredSkinPreset
} from '../main.ts'

type SkinServiceDependencies = {
  [key: string]: any
  axios: typeof import('axios').default
  createServer: typeof import('http').createServer
  readAccounts: () => StoredAccount[]
  readJsonFile: <T>(filePath: string, fallback: T) => T
  refreshAccountIfNeeded: (account: StoredAccount) => Promise<any>
  readonly downloadFile: (...args: any[]) => Promise<any>
}

export const createSkinService = (deps: SkinServiceDependencies) => {
  const {
    path, readJsonFile, skinsLibraryPath, normalizeMinecraftTextureId, ensureDir, skinsDirectory,
    writeJsonFile, fs, crypto, log, axios, HTTP_HEADERS, readAccounts, refreshAccountIfNeeded,
    userDataPath, app, createServer, verifyMinecraftTextureFile, AUTHLIB_INJECTOR_FILE,
    AUTHLIB_INJECTOR_SHA256, AUTHLIB_INJECTOR_URL
  } = deps

  const normalizeSkinModel = (value?: string): SkinModel => {
    const normalized = String(value || '').toLowerCase()
    return normalized === 'slim' ? 'slim' : 'classic'
  }

  const SAFE_SKIN_LIBRARY_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,180}$/

  const isSafeSkinLibraryFileName = (value: unknown): value is string => {
    if (typeof value !== 'string' || value !== value.trim()) return false
    if (!value || value === '.' || value === '..') return false
    return SAFE_SKIN_LIBRARY_FILE_NAME_PATTERN.test(value) && path.basename(value) === value
  }

  const readSkinLibrary = (): StoredSkinLibrary => {
    const stored = readJsonFile<Partial<StoredSkinLibrary>>(skinsLibraryPath, {})
    const accounts = stored.accounts && typeof stored.accounts === 'object'
      ? stored.accounts
      : {}

    return {
      version: 1,
      accounts: Object.fromEntries(
        Object.entries(accounts).map(([accountId, value]) => {
          const account = value && typeof value === 'object' ? value as Partial<StoredSkinAccount> : {}
          const skins = (Array.isArray(account.skins)
            ? account.skins.filter((skin): skin is StoredSkinPreset => Boolean(
              skin
              && typeof skin.id === 'string'
              && isSafeSkinLibraryFileName(skin.fileName)
            ))
            : []).map((skin) => ({
              ...skin,
              capeFileName: isSafeSkinLibraryFileName(skin.capeFileName) ? skin.capeFileName : null,
              sourceTextureId: normalizeMinecraftTextureId(skin.sourceTextureId)
            }))
          const rawProfileCache = account.profileCache && typeof account.profileCache === 'object'
            ? account.profileCache as Partial<StoredMinecraftProfileCache>
            : null
          const cachedCapes = Array.isArray(rawProfileCache?.capes)
            ? rawProfileCache.capes.filter((cape): cape is StoredMinecraftProfileCape => Boolean(
                cape
                && typeof cape.id === 'string'
                && typeof cape.name === 'string'
                && isSafeSkinLibraryFileName(cape.fileName)
              ))
            : []
          const profileCache = rawProfileCache
            && typeof rawProfileCache.id === 'string'
            && typeof rawProfileCache.name === 'string'
            && isSafeSkinLibraryFileName(rawProfileCache.fileName)
            ? {
                id: rawProfileCache.id,
                name: rawProfileCache.name,
                model: normalizeSkinModel(rawProfileCache.model),
                fileName: rawProfileCache.fileName,
                textureId: normalizeMinecraftTextureId(rawProfileCache.textureId),
                capes: cachedCapes,
                activeCapeId: typeof rawProfileCache.activeCapeId === 'string' ? rawProfileCache.activeCapeId : null,
                refreshedAt: typeof rawProfileCache.refreshedAt === 'string' ? rawProfileCache.refreshedAt : ''
              }
            : null
          return [accountId, {
            activeSkinId: typeof account.activeSkinId === 'string' ? account.activeSkinId : null,
            activeDefaultSkinId: typeof account.activeDefaultSkinId === 'string' ? account.activeDefaultSkinId : null,
            skins,
            profileCache
          }]
        })
      )
    }
  }

  const writeSkinLibrary = (library: StoredSkinLibrary) => {
    ensureDir(skinsDirectory)
    writeJsonFile(skinsLibraryPath, library)
  }

  const getSkinAccountStore = (library: StoredSkinLibrary, accountId: string) => {
    if (!library.accounts[accountId]) {
      library.accounts[accountId] = { activeSkinId: null, activeDefaultSkinId: null, skins: [], profileCache: null }
    }
    return library.accounts[accountId]
  }

  const getSkinPresetPath = (preset: StoredSkinPreset) => {
    if (!isSafeSkinLibraryFileName(preset.fileName)) {
      throw new Error('Stored skin path is invalid.')
    }
    return path.join(skinsDirectory, preset.fileName)
  }

  const getSkinPresetCapePath = (preset: StoredSkinPreset) => {
    if (!isSafeSkinLibraryFileName(preset.capeFileName)) return null
    return path.join(skinsDirectory, preset.capeFileName)
  }

  const readSkinPresetBuffer = (preset: StoredSkinPreset) => {
    const filePath = getSkinPresetPath(preset)
    if (!fs.existsSync(filePath)) throw new Error('The saved skin texture could not be found.')
    const buffer = fs.readFileSync(filePath)
    if (buffer.length <= 0 || buffer.length > 2 * 1024 * 1024) {
      throw new Error('The saved skin texture is invalid.')
    }
    return buffer
  }

  const skinBufferToDataUrl = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`

  // Author/creator: nattapat2871 (https://nattapat2871.me)
  const getMinecraftProfileCachePrefix = (accountId: string) => (
    `minecraft-profile-${crypto.createHash('sha256').update(accountId).digest('hex').slice(0, 24)}`
  )

  const readCachedMinecraftProfile = (accountStore: StoredSkinAccount) => {
    const profileCache = accountStore.profileCache
    if (!profileCache) return null

    const skinPath = path.join(skinsDirectory, profileCache.fileName)
    if (!fs.existsSync(skinPath)) {
      accountStore.profileCache = null
      return null
    }

    try {
      const skinBuffer = decodeSkinDataUrl(skinBufferToDataUrl(fs.readFileSync(skinPath)))
      const capes = profileCache.capes.flatMap((cape) => {
        const capePath = path.join(skinsDirectory, cape.fileName)
        if (!fs.existsSync(capePath)) return []
        const buffer = fs.readFileSync(capePath)
        if (buffer.length <= 0 || buffer.length > 2 * 1024 * 1024) return []
        return [{
          id: cape.id,
          name: cape.name,
          textureDataUrl: skinBufferToDataUrl(buffer),
          active: cape.active
        }]
      })
      return {
        currentSkin: {
          id: profileCache.id,
          name: profileCache.name,
          model: profileCache.model,
          textureId: normalizeMinecraftTextureId(profileCache.textureId),
          textureDataUrl: skinBufferToDataUrl(skinBuffer),
          source: 'minecraft'
        },
        capes,
        activeCapeId: profileCache.activeCapeId || capes.find((cape) => cape.active)?.id || null
      }
    } catch (err) {
      log.debug('Could not read the cached Minecraft skin profile.', err)
      accountStore.profileCache = null
      return null
    }
  }

  const cacheMinecraftProfile = (
    account: StoredAccount,
    accountStore: StoredSkinAccount,
    currentSkin: { id: string; name: string; model: SkinModel; textureId?: string | null; textureDataUrl: string } | null,
    capes: Array<{ id: string; name: string; textureDataUrl: string; active: boolean }>,
    activeCapeId: string | null
  ) => {
    if (!currentSkin?.textureDataUrl) return

    ensureDir(skinsDirectory)
    const prefix = getMinecraftProfileCachePrefix(account.id)
    const skinFileName = `${prefix}.png`
    fs.writeFileSync(path.join(skinsDirectory, skinFileName), decodeSkinDataUrl(currentSkin.textureDataUrl))

    const cachedCapes = capes.map((cape) => {
      const capeKey = crypto.createHash('sha256').update(cape.id).digest('hex').slice(0, 16)
      const fileName = `${prefix}-cape-${capeKey}.png`
      fs.writeFileSync(path.join(skinsDirectory, fileName), decodeSkinDataUrl(cape.textureDataUrl))
      return { id: cape.id, name: cape.name, fileName, active: cape.active }
    })
    const retainedFiles = new Set([skinFileName, ...cachedCapes.map((cape) => cape.fileName)])
    for (const entry of fs.readdirSync(skinsDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith(prefix) || retainedFiles.has(entry.name)) continue
      fs.rmSync(path.join(skinsDirectory, entry.name), { force: true })
    }

    accountStore.profileCache = {
      id: currentSkin.id,
      name: currentSkin.name,
      model: currentSkin.model,
      fileName: skinFileName,
      textureId: normalizeMinecraftTextureId(currentSkin.textureId),
      capes: cachedCapes,
      activeCapeId,
      refreshedAt: new Date().toISOString()
    }
  }

  const DEFAULT_SKIN_ASSET_REVISION = '15b0c1e447cc2fff34ca54d735aaa596a0aab2b0'
  const getDefaultSkinTextureUrl = (name: string, model: SkinModel) => (
    `https://raw.githubusercontent.com/PixiGeko/Minecraft-default-assets/${DEFAULT_SKIN_ASSET_REVISION}/assets/minecraft/textures/entity/player/${model === 'slim' ? 'slim' : 'wide'}/${name.toLowerCase()}.png`
  )
  const DEFAULT_SKIN_PRESETS = [
    { id: 'steve', name: 'Steve', model: 'classic' as SkinModel },
    { id: 'alex', name: 'Alex', model: 'slim' as SkinModel },
    { id: 'noor', name: 'Noor', model: 'classic' as SkinModel },
    { id: 'sunny', name: 'Sunny', model: 'slim' as SkinModel },
    { id: 'ari', name: 'Ari', model: 'slim' as SkinModel },
    { id: 'zuri', name: 'Zuri', model: 'classic' as SkinModel },
    { id: 'makena', name: 'Makena', model: 'classic' as SkinModel },
    { id: 'kai', name: 'Kai', model: 'classic' as SkinModel },
    { id: 'efe', name: 'Efe', model: 'slim' as SkinModel }
  ].map((skin) => ({
    ...skin,
    textureUrl: getDefaultSkinTextureUrl(skin.name, skin.model)
  }))

  const getDefaultSkinPreset = (defaultSkinId?: string) => {
    const id = String(defaultSkinId || '').trim().toLowerCase()
    const preset = DEFAULT_SKIN_PRESETS.find((item) => item.id === id)
    if (!preset) throw new Error('Choose a valid default skin.')
    return preset
  }

  const getDefaultSkinCacheFileName = (defaultSkinId: string) => `default-${defaultSkinId}.png`

  const getDefaultSkinCachePath = (defaultSkinId: string) => {
    const fileName = getDefaultSkinCacheFileName(defaultSkinId)
    if (!isSafeSkinLibraryFileName(fileName)) throw new Error('Default skin path is invalid.')
    return path.join(skinsDirectory, fileName)
  }

  const downloadDefaultSkinBuffer = async (defaultSkin: ReturnType<typeof getDefaultSkinPreset>) => {
    const cachePath = getDefaultSkinCachePath(defaultSkin.id)
    if (fs.existsSync(cachePath)) {
      return decodeSkinDataUrl(skinBufferToDataUrl(fs.readFileSync(cachePath)))
    }

    try {
      const response = await axios.get<ArrayBuffer>(defaultSkin.textureUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: HTTP_HEADERS,
        maxContentLength: 2 * 1024 * 1024
      })
      const buffer = decodeSkinDataUrl(skinBufferToDataUrl(Buffer.from(response.data)))
      ensureDir(skinsDirectory)
      fs.writeFileSync(cachePath, buffer)
      return buffer
    } catch (err) {
      throw new Error(getSkinApiError(err, 'Could not download the default skin.'))
    }
  }

  const decodeSkinDataUrl = (rawDataUrl?: string) => {
    const dataUrl = String(rawDataUrl || '')
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl)
    if (!match) throw new Error('Skin texture must be a PNG file.')

    const buffer = Buffer.from(match[1], 'base64')
    if (buffer.length <= 0 || buffer.length > 2 * 1024 * 1024) {
      throw new Error('Skin texture must be smaller than 2 MB.')
    }

    const pngSignature = '89504e470d0a1a0a'
    if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
      throw new Error('Skin texture is not a valid PNG file.')
    }

    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    if (width !== 64 || (height !== 64 && height !== 32)) {
      throw new Error('Minecraft skins must be 64x64 or legacy 64x32 pixels.')
    }

    return buffer
  }

  const getSkinAccount = (accountId?: string) => {
    const cleanAccountId = String(accountId || '').trim()
    const account = readAccounts().find((item) => item.id === cleanAccountId)
    if (!account) throw new Error('Select a valid player profile before changing skins.')
    return account
  }

  const getSkinApiError = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err)) {
      const responseMessage = typeof err.response?.data === 'object' && err.response?.data
        ? String((err.response.data as any).errorMessage || (err.response.data as any).error || '')
        : ''
      if (err.response?.status === 401 || err.response?.status === 403) {
        return 'Your Microsoft session expired. Sign in again before changing the skin.'
      }
      if (responseMessage) return responseMessage
    }
    return err instanceof Error && err.message ? err.message : fallback
  }

  const normalizeMinecraftTextureUrl = (rawUrl?: string | null) => {
    const value = String(rawUrl || '').trim()
    if (!value) return ''

    try {
      const parsed = new URL(value)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname.toLowerCase() !== 'textures.minecraft.net') {
        return ''
      }
      parsed.protocol = 'https:'
      parsed.port = ''
      parsed.username = ''
      parsed.password = ''
      parsed.search = ''
      parsed.hash = ''
      return parsed.href
    } catch {
      return ''
    }
  }

  const getMinecraftTextureIdFromUrl = (rawUrl?: string | null) => {
    const normalizedUrl = normalizeMinecraftTextureUrl(rawUrl)
    if (!normalizedUrl) return null

    try {
      const texturePath = new URL(normalizedUrl).pathname
      const match = texturePath.match(/^\/texture\/([a-f0-9]{64})\/?$/i)
      return normalizeMinecraftTextureId(match?.[1])
    } catch {
      return null
    }
  }

  const getMinecraftProfile = async (account: StoredAccount) => {
    const auth = await refreshAccountIfNeeded(account)
    try {
      const response = await axios.get<any>('https://api.minecraftservices.com/minecraft/profile', {
        timeout: 20000,
        headers: {
          ...HTTP_HEADERS,
          Authorization: `Bearer ${auth.access_token}`
        }
      })
      return { auth, profile: response.data || {} }
    } catch (err) {
      throw new Error(getSkinApiError(err, 'Could not load the Minecraft skin profile.'))
    }
  }

  const downloadMinecraftTextureBuffer = async (rawUrl?: string | null) => {
    const url = normalizeMinecraftTextureUrl(rawUrl)
    if (!url) return null

    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: HTTP_HEADERS,
        maxContentLength: 2 * 1024 * 1024
      })
      const buffer = Buffer.from(response.data)
      return buffer.length > 0 && buffer.length <= 2 * 1024 * 1024 ? buffer : null
    } catch (err) {
      log.debug('Could not download Minecraft texture for preview.', err)
      return null
    }
  }

  const downloadMinecraftTexture = async (rawUrl?: string | null) => {
    const buffer = await downloadMinecraftTextureBuffer(rawUrl)
    return buffer ? skinBufferToDataUrl(buffer) : null
  }

  const parseMinecraftProfileInput = (rawInput?: string) => {
    const input = String(rawInput || '').trim()
    if (!input) return ''

    try {
      const urlInput = /^(?:www\.)?namemc\.com\//i.test(input) ? `https://${input}` : input
      const parsed = new URL(urlInput)
      if (!['namemc.com', 'www.namemc.com'].includes(parsed.hostname.toLowerCase())) return ''
      const parts = parsed.pathname.split('/').filter(Boolean)
      const profileIndex = parts.findIndex((part) => part.toLowerCase() === 'profile')
      return decodeURIComponent(profileIndex >= 0 ? parts[profileIndex + 1] || '' : '').split('.')[0].trim()
    } catch {
      return input
    }
  }

  const resolvePublicMinecraftProfile = async (rawInput?: string) => {
    const requestedProfile = parseMinecraftProfileInput(rawInput)
    const compactUuid = requestedProfile.replace(/-/g, '')

    if (/^[a-f0-9]{32}$/i.test(compactUuid)) {
      return { uuid: compactUuid.toLowerCase(), name: requestedProfile }
    }

    if (!/^[A-Za-z0-9_]{3,16}$/.test(requestedProfile)) {
      throw new Error('Enter a Minecraft player name or a valid NameMC profile link.')
    }

    const profileResponse = await axios.get<any>(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(requestedProfile)}`,
      { timeout: 20000, headers: HTTP_HEADERS }
    )
    const uuid = String(profileResponse.data?.id || '').replace(/-/g, '')
    const name = String(profileResponse.data?.name || requestedProfile)
    if (!/^[a-f0-9]{32}$/i.test(uuid)) throw new Error('Minecraft player profile was not found.')
    return { uuid: uuid.toLowerCase(), name }
  }

  const getPublicMinecraftTextures = async (profileUuid: string, fallbackName = '') => {
    const compactUuid = String(profileUuid || '').replace(/-/g, '')
    if (!/^[a-f0-9]{32}$/i.test(compactUuid)) {
      throw new Error('Minecraft player profile was not found.')
    }

    const sessionResponse = await axios.get<any>(
      `https://sessionserver.mojang.com/session/minecraft/profile/${compactUuid}?unsigned=false`,
      { timeout: 20000, headers: HTTP_HEADERS }
    )
    const textureProperty = Array.isArray(sessionResponse.data?.properties)
      ? sessionResponse.data.properties.find((property: any) => property?.name === 'textures')
      : null
    if (!textureProperty?.value) throw new Error('This Minecraft profile does not have a skin texture.')

    const texturePayload = JSON.parse(Buffer.from(String(textureProperty.value), 'base64').toString('utf8'))
    const skinUrl = normalizeMinecraftTextureUrl(texturePayload?.textures?.SKIN?.url)
    const capeUrl = normalizeMinecraftTextureUrl(texturePayload?.textures?.CAPE?.url)
    if (!skinUrl) throw new Error('This Minecraft profile does not have a skin texture.')

    return {
      uuid: compactUuid.toLowerCase(),
      name: String(sessionResponse.data?.name || fallbackName || compactUuid),
      skinUrl,
      textureId: getMinecraftTextureIdFromUrl(skinUrl),
      capeUrl,
      model: normalizeSkinModel(texturePayload?.textures?.SKIN?.metadata?.model)
    }
  }

  const setMinecraftCape = async (auth: any, capeId?: string | null) => {
    const headers = {
      ...HTTP_HEADERS,
      Authorization: `Bearer ${auth.access_token}`
    }

    try {
      if (capeId) {
        await axios.put(
          'https://api.minecraftservices.com/minecraft/profile/capes/active',
          { capeId },
          { timeout: 20000, headers }
        )
      } else {
        await axios.delete('https://api.minecraftservices.com/minecraft/profile/capes/active', {
          timeout: 20000,
          headers
        })
      }
    } catch (err) {
      throw new Error(getSkinApiError(err, 'Could not update the active cape.'))
    }
  }

  const uploadMinecraftSkin = async (
    account: StoredAccount,
    buffer: Buffer,
    model: SkinModel,
    capeId?: string | null,
    updateCape = true
  ) => {
    const auth = await refreshAccountIfNeeded(account)
    const form = new FormData()
    form.append('variant', model)
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), 'namlauncher-skin.png')

    try {
      await axios.post('https://api.minecraftservices.com/minecraft/profile/skins', form, {
        timeout: 30000,
        maxBodyLength: 3 * 1024 * 1024,
        headers: {
          ...HTTP_HEADERS,
          Authorization: `Bearer ${auth.access_token}`
        }
      })
      if (updateCape) await setMinecraftCape(auth, capeId)
    } catch (err) {
      throw new Error(getSkinApiError(err, 'Could not upload the Minecraft skin.'))
    }
  }

  const resetMinecraftSkin = async (account: StoredAccount) => {
    const auth = await refreshAccountIfNeeded(account)
    try {
      await axios.delete('https://api.minecraftservices.com/minecraft/profile/skins/active', {
        timeout: 20000,
        headers: {
          ...HTTP_HEADERS,
          Authorization: `Bearer ${auth.access_token}`
        }
      })
    } catch (err) {
      throw new Error(getSkinApiError(err, 'Could not reset the Minecraft skin.'))
    }
  }

  const getPublicSkinLibrary = async (accountId?: string, refreshRemote = true) => {
    const account = getSkinAccount(accountId)
    const library = readSkinLibrary()
    const accountStore = getSkinAccountStore(library, account.id)
    accountStore.skins = accountStore.skins.filter((preset) => fs.existsSync(getSkinPresetPath(preset)))
    if (account.type === 'offline' && !accountStore.activeSkinId && !accountStore.activeDefaultSkinId) {
      accountStore.activeDefaultSkinId = 'steve'
    }

    const savedSkins = accountStore.skins.map((preset) => ({
      id: preset.id,
      name: preset.name,
      model: preset.model,
      capeId: preset.capeId ?? null,
      capeTextureDataUrl: (() => {
        const capePath = getSkinPresetCapePath(preset)
        return capePath && fs.existsSync(capePath) ? skinBufferToDataUrl(fs.readFileSync(capePath)) : null
      })(),
      sourceProfileUuid: preset.sourceProfileUuid ?? null,
      sourceProfileName: preset.sourceProfileName ?? null,
      sourceTextureId: normalizeMinecraftTextureId(preset.sourceTextureId),
      textureDataUrl: skinBufferToDataUrl(readSkinPresetBuffer(preset)),
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt
    }))

    let currentSkin: any = null
    let capes: any[] = []
    let activeCapeId: string | null = null
    let warning: string | null = null
    const useCurrentSkin = (id: string, model: SkinModel, textureDataUrl: string, textureId?: string | null) => {
      currentSkin = {
        id,
        name: 'Minecraft profile',
        model,
        textureId: normalizeMinecraftTextureId(textureId),
        textureDataUrl,
        source: 'minecraft'
      }

      const currentHash = crypto.createHash('sha256').update(textureDataUrl).digest('hex')
      const matchingPreset = savedSkins.find((skin) => (
        crypto.createHash('sha256').update(skin.textureDataUrl).digest('hex') === currentHash
      ))
      const selectedPreset = savedSkins.find((skin) => skin.id === accountStore.activeSkinId)
      const selectedAt = selectedPreset?.updatedAt ? Date.parse(selectedPreset.updatedAt) : 0
      const recentlySelected = Boolean(selectedPreset && Number.isFinite(selectedAt) && Date.now() - selectedAt < 120000)

      if (account.type === 'msa' && accountStore.activeDefaultSkinId) {
        try {
          const defaultSkin = getDefaultSkinPreset(accountStore.activeDefaultSkinId)
          const cachePath = getDefaultSkinCachePath(defaultSkin.id)
          const defaultTextureDataUrl = fs.existsSync(cachePath)
            ? skinBufferToDataUrl(fs.readFileSync(cachePath))
            : ''
          const defaultHash = defaultTextureDataUrl
            ? crypto.createHash('sha256').update(defaultTextureDataUrl).digest('hex')
            : ''
          if (!defaultHash || defaultHash !== currentHash) accountStore.activeDefaultSkinId = null
        } catch {
          accountStore.activeDefaultSkinId = null
        }
      }

      if (!accountStore.activeDefaultSkinId) {
        accountStore.activeSkinId = matchingPreset?.id || (recentlySelected ? selectedPreset!.id : id)
      }
    }

    const cachedProfile = readCachedMinecraftProfile(accountStore)
    if (cachedProfile) {
      useCurrentSkin(
        cachedProfile.currentSkin.id,
        cachedProfile.currentSkin.model,
        cachedProfile.currentSkin.textureDataUrl,
        cachedProfile.currentSkin.textureId
      )
      currentSkin.name = cachedProfile.currentSkin.name
      capes = cachedProfile.capes
      activeCapeId = cachedProfile.activeCapeId
    }

    if (account.type === 'msa' && refreshRemote) {
      try {
        const { profile } = await getMinecraftProfile(account)
        const profileSkins = Array.isArray(profile.skins) ? profile.skins : []
        const activeSkin = profileSkins.find((skin: any) => skin?.state === 'ACTIVE') || profileSkins[0]
        const profileCapes = Array.isArray(profile.capes) ? profile.capes : []
        const [textureDataUrl, downloadedCapes] = await Promise.all([
          downloadMinecraftTexture(activeSkin?.url),
          Promise.all(profileCapes.map(async (cape: any) => ({
            id: String(cape.id || ''),
            name: String(cape.alias || cape.name || 'Minecraft cape'),
            textureDataUrl: await downloadMinecraftTexture(cape.url),
            active: cape.state === 'ACTIVE'
          })))
        ])

        if (activeSkin && textureDataUrl) {
          useCurrentSkin(
            `minecraft:${String(activeSkin.id || crypto.createHash('sha1').update(activeSkin.url || '').digest('hex'))}`,
            normalizeSkinModel(activeSkin.variant),
            textureDataUrl,
            getMinecraftTextureIdFromUrl(activeSkin.url)
          )
        }

        capes = downloadedCapes
        capes = capes.filter((cape) => cape.id && cape.textureDataUrl)
        activeCapeId = capes.find((cape) => cape.active)?.id || null

        if (!currentSkin) {
          const publicTextures = await getPublicMinecraftTextures(account.uuid, account.name)
          const publicTextureDataUrl = await downloadMinecraftTexture(publicTextures.skinUrl)
          if (publicTextureDataUrl) {
            useCurrentSkin(
              `minecraft-public:${publicTextures.uuid}`,
              publicTextures.model,
              publicTextureDataUrl,
              publicTextures.textureId
            )
          }
        }
        cacheMinecraftProfile(account, accountStore, currentSkin, capes, activeCapeId)
      } catch (err) {
        warning = getSkinApiError(err, 'Could not refresh the Microsoft skin profile.')
        try {
          const publicTextures = await getPublicMinecraftTextures(account.uuid, account.name)
          const publicTextureDataUrl = await downloadMinecraftTexture(publicTextures.skinUrl)
          if (publicTextureDataUrl) {
            useCurrentSkin(
              `minecraft-public:${publicTextures.uuid}`,
              publicTextures.model,
              publicTextureDataUrl,
              publicTextures.textureId
            )
            cacheMinecraftProfile(account, accountStore, currentSkin, capes, activeCapeId)
          }
        } catch (publicErr) {
          log.debug(`Could not load public skin fallback for ${account.name}.`, publicErr)
        }
      }
    }

    if (account.type === 'offline' && accountStore.activeSkinId) {
      const activePreset = savedSkins.find((skin) => skin.id === accountStore.activeSkinId)
      if (!activePreset) accountStore.activeSkinId = null
    }

    let effectiveSkin: any = currentSkin
    if (accountStore.activeDefaultSkinId) {
      try {
        const defaultSkin = getDefaultSkinPreset(accountStore.activeDefaultSkinId)
        const cachePath = getDefaultSkinCachePath(defaultSkin.id)
        effectiveSkin = {
          id: `default:${defaultSkin.id}`,
          name: defaultSkin.name,
          model: defaultSkin.model,
          textureDataUrl: fs.existsSync(cachePath)
            ? skinBufferToDataUrl(fs.readFileSync(cachePath))
            : defaultSkin.textureUrl,
          source: 'default'
        }
        accountStore.activeSkinId = null
      } catch {
        accountStore.activeDefaultSkinId = null
      }
    }

    if (!accountStore.activeDefaultSkinId && accountStore.activeSkinId) {
      const activePreset = savedSkins.find((skin) => skin.id === accountStore.activeSkinId)
      if (activePreset) effectiveSkin = activePreset
    }

    if (account.type === 'offline' && !effectiveSkin) {
      const steve = getDefaultSkinPreset('steve')
      effectiveSkin = {
        id: 'default:steve',
        name: steve.name,
        model: steve.model,
        textureDataUrl: steve.textureUrl,
        source: 'default'
      }
      accountStore.activeDefaultSkinId = 'steve'
    }

    writeSkinLibrary(library)
    return {
      accountId: account.id,
      accountUuid: account.uuid,
      accountName: account.name,
      accountType: account.type,
      selectedSkinId: accountStore.activeDefaultSkinId ? `default:${accountStore.activeDefaultSkinId}` : (accountStore.activeSkinId || currentSkin?.id || null),
      activeDefaultSkinId: accountStore.activeDefaultSkinId || null,
      currentSkin,
      effectiveSkin,
      savedSkins,
      capes,
      activeCapeId,
      warning,
      offlineOnly: account.type === 'offline'
    }
  }

  const saveSkinPreset = async (request: SkinSaveRequest) => {
    const account = getSkinAccount(request.accountId)
    const buffer = decodeSkinDataUrl(request.textureDataUrl)
    const model = normalizeSkinModel(request.model)
    const name = String(request.name || 'Imported skin').trim().slice(0, 48) || 'Imported skin'
    const library = readSkinLibrary()
    const accountStore = getSkinAccountStore(library, account.id)
    const now = new Date().toISOString()
    const requestedId = String(request.skinId || '').trim()
    const existingIndex = requestedId
      ? accountStore.skins.findIndex((skin) => skin.id === requestedId && skin.accountId === account.id)
      : -1

    let preset: StoredSkinPreset
    if (existingIndex >= 0) {
      const existing = accountStore.skins[existingIndex]
      preset = {
        ...existing,
        name,
        model,
        capeId: request.capeId ?? null,
        sourceProfileUuid: null,
        sourceProfileName: null,
        sourceTextureId: null,
        updatedAt: now
      }
      fs.writeFileSync(getSkinPresetPath(preset), buffer)
      accountStore.skins[existingIndex] = preset
    } else {
      const id = crypto.randomUUID()
      preset = {
        id,
        accountId: account.id,
        name,
        model,
        fileName: `${id}.png`,
        capeId: request.capeId ?? null,
        createdAt: now,
        updatedAt: now
      }
      ensureDir(skinsDirectory)
      fs.writeFileSync(getSkinPresetPath(preset), buffer)
      accountStore.skins.unshift(preset)
    }

    writeSkinLibrary(library)
    if (request.activate !== false) {
      if (account.type === 'msa') {
        await uploadMinecraftSkin(account, buffer, model, preset.capeId)
      }
      accountStore.activeDefaultSkinId = null
      accountStore.activeSkinId = preset.id
    }

    writeSkinLibrary(library)
    return getPublicSkinLibrary(account.id)
  }

  const saveDefaultSkinPreset = async (request: SkinDefaultRequest) => {
    const account = getSkinAccount(request.accountId)
    const defaultSkin = getDefaultSkinPreset(request.defaultSkinId)
    const library = readSkinLibrary()
    const accountStore = getSkinAccountStore(library, account.id)
    if (accountStore.activeDefaultSkinId === defaultSkin.id) {
      accountStore.activeSkinId = null
      writeSkinLibrary(library)
      return getPublicSkinLibrary(account.id)
    }

    const defaultSkinBuffer = await downloadDefaultSkinBuffer(defaultSkin)
    if (account.type === 'msa') {
      await uploadMinecraftSkin(account, defaultSkinBuffer, defaultSkin.model, null, false)
    }
    accountStore.activeDefaultSkinId = defaultSkin.id
    accountStore.activeSkinId = null
    writeSkinLibrary(library)
    return getPublicSkinLibrary(account.id)
  }

  const importSkinByPlayerName = async (request: SkinImportRequest) => {
    const account = getSkinAccount(request.accountId)

    try {
      const resolved = await resolvePublicMinecraftProfile(request.playerName)
      const textures = await getPublicMinecraftTextures(resolved.uuid, resolved.name)
      const skinBuffer = await downloadMinecraftTextureBuffer(textures.skinUrl)
      if (!skinBuffer) throw new Error('Could not download this player skin from Mojang.')
      decodeSkinDataUrl(skinBufferToDataUrl(skinBuffer))
      const capeBuffer = account.type === 'offline'
        ? await downloadMinecraftTextureBuffer(textures.capeUrl)
        : null

      const library = readSkinLibrary()
      const accountStore = getSkinAccountStore(library, account.id)
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const preset: StoredSkinPreset = {
        id,
        accountId: account.id,
        name: `${textures.name} skin`,
        model: textures.model,
        fileName: `${id}.png`,
        capeFileName: capeBuffer ? `${id}-cape.png` : null,
        capeId: null,
        sourceProfileUuid: textures.uuid,
        sourceProfileName: textures.name,
        sourceTextureId: textures.textureId,
        createdAt: now,
        updatedAt: now
      }

      ensureDir(skinsDirectory)
      fs.writeFileSync(getSkinPresetPath(preset), skinBuffer)
      const capePath = getSkinPresetCapePath(preset)
      if (capeBuffer && capePath) fs.writeFileSync(capePath, capeBuffer)
      accountStore.skins.unshift(preset)

      if (account.type === 'msa') {
        await uploadMinecraftSkin(account, skinBuffer, textures.model, null, false)
      }

      accountStore.activeDefaultSkinId = null
      accountStore.activeSkinId = preset.id
      writeSkinLibrary(library)
      log.info(`Imported Minecraft skin for ${account.name} from public profile ${textures.name}.`)
      return getPublicSkinLibrary(account.id)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        throw new Error(`Minecraft player "${parseMinecraftProfileInput(request.playerName)}" was not found.`)
      }
      throw new Error(getSkinApiError(err, 'Could not import the skin from this Minecraft player.'))
    }
  }

  const activateSkinPreset = async (request: SkinActionRequest) => {
    const account = getSkinAccount(request.accountId)
    const library = readSkinLibrary()
    const accountStore = getSkinAccountStore(library, account.id)
    const skinId = String(request.skinId || '').trim()
    const preset = accountStore.skins.find((skin) => skin.id === skinId && skin.accountId === account.id)
    if (!preset && account.type === 'msa' && /^minecraft(?:-public)?:/.test(skinId)) {
      if (accountStore.activeSkinId === skinId && !accountStore.activeDefaultSkinId) {
        return getPublicSkinLibrary(account.id)
      }
      accountStore.activeDefaultSkinId = null
      accountStore.activeSkinId = skinId
      writeSkinLibrary(library)
      return getPublicSkinLibrary(account.id)
    }
    if (!preset) throw new Error('The selected skin does not belong to this player profile.')
    if (accountStore.activeSkinId === preset.id && !accountStore.activeDefaultSkinId) {
      return getPublicSkinLibrary(account.id)
    }

    if (account.type === 'msa') {
      await uploadMinecraftSkin(account, readSkinPresetBuffer(preset), preset.model, preset.capeId)
    }

    preset.updatedAt = new Date().toISOString()
    accountStore.activeDefaultSkinId = null
    accountStore.activeSkinId = preset.id
    writeSkinLibrary(library)
    return getPublicSkinLibrary(account.id)
  }

  const deleteSkinPreset = async (request: SkinActionRequest) => {
    const account = getSkinAccount(request.accountId)
    const library = readSkinLibrary()
    const accountStore = getSkinAccountStore(library, account.id)
    const skinId = String(request.skinId || '').trim()
    const preset = accountStore.skins.find((skin) => skin.id === skinId && skin.accountId === account.id)
    if (!preset) throw new Error('The selected skin does not belong to this player profile.')

    const filePath = getSkinPresetPath(preset)
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true })
    const capePath = getSkinPresetCapePath(preset)
    if (capePath && fs.existsSync(capePath)) fs.rmSync(capePath, { force: true })
    accountStore.skins = accountStore.skins.filter((skin) => skin.id !== skinId)
    if (accountStore.activeSkinId === skinId) accountStore.activeSkinId = null
    writeSkinLibrary(library)
    return getPublicSkinLibrary(account.id)
  }

  const resetActiveSkin = async (request: SkinActionRequest) => {
    const account = getSkinAccount(request.accountId)
    const library = readSkinLibrary()
    const
accountStore = getSkinAccountStore(library, account.id)

    if (account.type === 'msa') {
      await resetMinecraftSkin(account)
    }

    accountStore.activeDefaultSkinId = null
    accountStore.activeSkinId = null
    writeSkinLibrary(library)
    return getPublicSkinLibrary(account.id)
  }

  let offlineSkinServer: Server | null = null
  let offlineSkinServerPort = 0
  const offlineSkinServerToken = crypto.randomBytes(24).toString('hex')

  const getOfflineSkinSigningKeys = () => {
    const injectorDirectory = path.join(userDataPath, 'offline-skin-loader')
    const privateKeyPath = path.join(injectorDirectory, 'texture-signing-private.pem')
    const publicKeyPath = path.join(injectorDirectory, 'texture-signing-public.pem')
    ensureDir(injectorDirectory)

    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      })
      fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 })
      fs.writeFileSync(publicKeyPath, publicKey, 'utf8')
    }

    return {
      privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
      publicKey: fs.readFileSync(publicKeyPath, 'utf8')
    }
  }

  const getOfflineSkinMetadata = () => ({
    meta: {
      serverName: 'NamLauncher Offline Skins',
      implementationName: 'NamLauncher',
      implementationVersion: app.getVersion(),
      'feature.no_mojang_namespace': true,
      'feature.legacy_skin_api': true,
      'feature.enable_mojang_anti_features': true,
      'feature.enable_profile_key': false,
      'feature.username_check': true
    },
    skinDomains: ['127.0.0.1'],
    signaturePublickey: getOfflineSkinSigningKeys().publicKey
  })

  const getActiveOfflineSkin = (accountId: string) => {
    const account = readAccounts().find((item) => item.id === accountId && item.type === 'offline')
    if (!account) return null
    const accountStore = readSkinLibrary().accounts[account.id]
    if (accountStore?.activeDefaultSkinId) {
      try {
        const defaultSkin = getDefaultSkinPreset(accountStore.activeDefaultSkinId)
        const fileName = getDefaultSkinCacheFileName(defaultSkin.id)
        const filePath = getDefaultSkinCachePath(defaultSkin.id)
        if (fs.existsSync(filePath)) {
          return {
            account,
            preset: {
              id: `default:${defaultSkin.id}`,
              accountId: account.id,
              name: defaultSkin.name,
              model: defaultSkin.model,
              fileName,
              capeId: null,
              createdAt: new Date(0).toISOString(),
              updatedAt: new Date(0).toISOString()
            }
          }
        }
      } catch {
        return null
      }
    }
    const preset = accountStore?.skins.find((skin) => skin.id === accountStore.activeSkinId)
    if (!preset || !fs.existsSync(getSkinPresetPath(preset))) return null
    return { account, preset }
  }

  const getOfflineTexturePayload = (account: StoredAccount, preset: StoredSkinPreset, port: number) => {
    const skinBuffer = readSkinPresetBuffer(preset)
    const skinHash = crypto.createHash('sha256').update(skinBuffer).digest('hex')
    const capePath = getSkinPresetCapePath(preset)
    const capeBuffer = capePath && fs.existsSync(capePath) ? fs.readFileSync(capePath) : null
    const capeHash = capeBuffer ? crypto.createHash('sha256').update(capeBuffer).digest('hex') : null
    const textureBase = `http://127.0.0.1:${port}/textures/${offlineSkinServerToken}/${encodeURIComponent(account.id)}`
    const payload = {
      timestamp: Date.now(),
      profileId: account.uuid.replace(/-/g, ''),
      profileName: account.name,
      textures: {
        SKIN: {
          url: `${textureBase}/${skinHash}.png`,
          ...(preset.model === 'slim' ? { metadata: { model: 'slim' } } : {})
        },
        ...(capeHash ? { CAPE: { url: `${textureBase}/${capeHash}.png` } } : {})
      }
    }
    const value = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    const signature = crypto.createSign('RSA-SHA1')
      .update(value, 'utf8')
      .sign(getOfflineSkinSigningKeys().privateKey, 'base64')
    return { value, signature, skinHash, capeHash }
  }

  const sendOfflineSkinJson = (response: any, status: number, body?: unknown) => {
    if (body === undefined) {
      response.writeHead(status, { 'Cache-Control': 'no-store' })
      response.end()
      return
    }
    const encoded = Buffer.from(JSON.stringify(body), 'utf8')
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(encoded.length),
      'Cache-Control': 'no-store'
    })
    response.end(encoded)
  }

  const ensureOfflineSkinServer = async () => {
    if (offlineSkinServer && offlineSkinServerPort) return offlineSkinServerPort

    offlineSkinServer = createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
        const parts = requestUrl.pathname.split('/').filter(Boolean)
        const serveTexture = (accountId: string, requestedHash?: string) => {
          const active = getActiveOfflineSkin(accountId)
          if (!active) return false
          const texture = getOfflineTexturePayload(active.account, active.preset, offlineSkinServerPort)
          const skinPath = getSkinPresetPath(active.preset)
          const capePath = getSkinPresetCapePath(active.preset)
          const isCape = Boolean(requestedHash && texture.capeHash && requestedHash === texture.capeHash)
          const isSkin = !requestedHash || requestedHash === texture.skinHash
          const texturePath = isCape ? capePath : isSkin ? skinPath : null
          if (!texturePath || !fs.existsSync(texturePath)) return false
          const buffer = fs.readFileSync(texturePath)
          response.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': String(buffer.length),
            'Cache-Control': 'no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff'
          })
          response.end(buffer)
          return true
        }

        // Backward-compatible texture endpoints used by beta.11 launch metadata.
        if (parts.length === 3 && ['skin', 'cape'].includes(parts[0]) && parts[1] === offlineSkinServerToken) {
          const accountId = decodeURIComponent(parts[2].replace(/\.png$/i, ''))
          if (parts[0] === 'skin' && serveTexture(accountId)) return
          const active = getActiveOfflineSkin(accountId)
          const capePath = active ? getSkinPresetCapePath(active.preset) : null
          if (capePath && fs.existsSync(capePath)) {
            const buffer = fs.readFileSync(capePath)
            response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(buffer.length), 'Cache-Control': 'no-store' })
            response.end(buffer)
            return
          }
        }

        if (parts[0] === 'textures' && parts[1] === offlineSkinServerToken && parts.length === 4) {
          const accountId = decodeURIComponent(parts[2])
          const requestedHash = parts[3].replace(/\.png$/i, '')
          if (serveTexture(accountId, requestedHash)) return
        }

        if (parts[0] === 'yggdrasil' && parts[1] === offlineSkinServerToken && parts.length >= 3) {
          const accountId = decodeURIComponent(parts[2])
          const active = getActiveOfflineSkin(accountId)
          if (!active) {
            sendOfflineSkinJson(response, 204)
            return
          }

          if (parts.length === 3) {
            sendOfflineSkinJson(response, 200, getOfflineSkinMetadata())
            return
          }

          if (
            parts.length === 8
            && parts.slice(3, 7).join('/') === 'sessionserver/session/minecraft/profile'
          ) {
            const requestedUuid = String(parts[7] || '').replace(/-/g, '').toLowerCase()
            if (requestedUuid !== active.account.uuid.replace(/-/g, '').toLowerCase()) {
              sendOfflineSkinJson(response, 204)
              return
            }
            const texture = getOfflineTexturePayload(active.account, active.preset, offlineSkinServerPort)
            sendOfflineSkinJson(response, 200, {
              id: requestedUuid,
              name: active.account.name,
              properties: [{ name: 'textures', value: texture.value, signature: texture.signature }]
            })
            return
          }

          if (parts.length === 6 && parts.slice(3, 5).join('/') === 'skins/MinecraftSkins') {
            if (serveTexture(accountId)) return
          }

          if (parts.slice(3).join('/') === 'sessionserver/session/minecraft/join') {
            sendOfflineSkinJson(response, 204)
            return
          }
        }

        response.writeHead(404).end()
      } catch {
        response.writeHead(500).end()
      }
    })

    await new Promise<void>((resolve, reject) => {
      const server = offlineSkinServer
      if (!server) {
        reject(new Error('Could not create the offline skin server.'))
        return
      }
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        const address = server.address()
        offlineSkinServerPort = typeof address === 'object' && address ? address.port : 0
        resolve()
      })
    })

    return offlineSkinServerPort
  }

  const getFileSha256 = (filePath: string) => {
    if (!fs.existsSync(filePath)) return ''
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  }

  const getDiscordPlayerTextureIdForLaunch = (accountId?: string) => {
    try {
      const cleanAccountId = String(accountId || '').trim()
      if (!cleanAccountId) return null

      const account = readAccounts().find((item) => item.id === cleanAccountId)
      if (!account) return null

      const accountStore = readSkinLibrary().accounts[cleanAccountId]
      // A new offline account may launch before the skin page creates its
      // library entry. Discord still receives the same default Steve head.
      if (!accountStore) {
        return account.type === 'offline' ? DEFAULT_MINECRAFT_SKIN_HEAD : null
      }

      if (account.type === 'offline') {
        if (accountStore.activeDefaultSkinId) {
          try {
            return `default:${getDefaultSkinPreset(accountStore.activeDefaultSkinId).id}`
          } catch {
            return DEFAULT_MINECRAFT_SKIN_HEAD
          }
        }
        if (!accountStore.activeSkinId) return DEFAULT_MINECRAFT_SKIN_HEAD
        const activePreset = accountStore.skins.find((skin) => skin.id === accountStore.activeSkinId)
        if (!activePreset) return DEFAULT_MINECRAFT_SKIN_HEAD
        return verifyMinecraftTextureFile({
          rootDirectory: skinsDirectory,
          fileName: activePreset.fileName,
          textureId: activePreset.sourceTextureId
        }) || DEFAULT_MINECRAFT_SKIN_HEAD
      }

      const profileCache = accountStore.profileCache
      if (!profileCache) return null
      const textureId = verifyMinecraftTextureFile({
        rootDirectory: skinsDirectory,
        fileName: profileCache.fileName,
        textureId: profileCache.textureId
      })
      if (!textureId) return null

      let selectedSkinFileName = ''
      if (accountStore.activeDefaultSkinId) {
        selectedSkinFileName = getDefaultSkinCacheFileName(
          getDefaultSkinPreset(accountStore.activeDefaultSkinId).id
        )
      } else if (accountStore.activeSkinId) {
        const activePreset = accountStore.skins.find((skin) => skin.id === accountStore.activeSkinId)
        if (activePreset) {
          selectedSkinFileName = activePreset.fileName
        } else if (!/^minecraft(?:-public)?:/.test(accountStore.activeSkinId)) {
          return null
        }
      }

      if (selectedSkinFileName && !verifyMinecraftTextureFile({
        rootDirectory: skinsDirectory,
        fileName: selectedSkinFileName,
        textureId
      })) return null

      return textureId
    } catch {
      // Discord artwork is optional and must never prevent the game from starting.
      return null
    }
  }

  const ensureAuthlibInjector = async () => {
    const injectorDirectory = path.join(userDataPath, 'offline-skin-loader')
    const cachedPath = path.join(injectorDirectory, AUTHLIB_INJECTOR_FILE)
    ensureDir(injectorDirectory)
    if (getFileSha256(cachedPath) === AUTHLIB_INJECTOR_SHA256) return cachedPath
    if (fs.existsSync(cachedPath)) fs.rmSync(cachedPath, { force: true })

    const bundledCandidates = [
      path.join(process.resourcesPath, 'authlib-injector.jar'),
      path.join(app.getAppPath(), 'build', AUTHLIB_INJECTOR_FILE)
    ]
    const bundledPath = bundledCandidates.find((candidate) => getFileSha256(candidate) === AUTHLIB_INJECTOR_SHA256)
    if (bundledPath) {
      fs.copyFileSync(bundledPath, cachedPath)
      return cachedPath
    }

    await deps.downloadFile(AUTHLIB_INJECTOR_URL, cachedPath, 'offline-skin-loader', true)
    if (getFileSha256(cachedPath) !== AUTHLIB_INJECTOR_SHA256) {
      fs.rmSync(cachedPath, { force: true })
      throw new Error('Offline skin loader integrity check failed.')
    }
    return cachedPath
  }

  const prepareOfflineSkinLaunch = async (authorization: any, accountId?: string) => {
    const account = readAccounts().find((item) => item.id === accountId && item.type === 'offline')
    if (!account) return { authorization, javaArgs: [] as string[] }

    let active = getActiveOfflineSkin(account.id)
    if (!active) {
      const library = readSkinLibrary()
      const accountStore = getSkinAccountStore(library, account.id)
      if (accountStore.activeSkinId) {
        const storedPreset = accountStore.skins.find((skin) => skin.id === accountStore.activeSkinId)
        if (!storedPreset || !fs.existsSync(getSkinPresetPath(storedPreset))) accountStore.activeSkinId = null
      }

      if (!accountStore.activeSkinId) {
        let defaultSkin
        try {
          defaultSkin = getDefaultSkinPreset(accountStore.activeDefaultSkinId || 'steve')
        } catch {
          defaultSkin = getDefaultSkinPreset('steve')
        }
        await downloadDefaultSkinBuffer(defaultSkin)
        accountStore.activeDefaultSkinId = defaultSkin.id
        writeSkinLibrary(library)
        active = getActiveOfflineSkin(account.id)
      }
    }
    if (!active) return { authorization, javaArgs: [] as string[] }
    const preset = active.preset as StoredSkinPreset

    const [port, injectorPath] = await Promise.all([
      ensureOfflineSkinServer(),
      ensureAuthlibInjector()
    ])
    if (!port) return { authorization, javaArgs: [] as string[] }

    const apiRoot = `http://127.0.0.1:${port}/yggdrasil/${offlineSkinServerToken}/${encodeURIComponent(account.id)}/`
    const prefetchedMetadata = Buffer.from(JSON.stringify(getOfflineSkinMetadata()), 'utf8').toString('base64')
    log.info(`Offline skin loader prepared for ${account.name} (${preset.model}).`)
    return {
      authorization: {
        ...authorization,
        meta: {
          ...(authorization.meta || {}),
          type: 'mojang',
          skinProfileUuid: preset.sourceProfileUuid || null,
          skinProfileName: preset.sourceProfileName || null,
          skinPresetName: preset.name
        },
        user_properties: '{}'
      },
      javaArgs: [
        `-javaagent:${injectorPath}=${apiRoot}`,
        `-Dauthlibinjector.yggdrasil.prefetched=${prefetchedMetadata}`,
        '-Dauthlibinjector.noShowServerName',
        '-Dauthlibinjector.mojangNamespace=disabled',
        '-Dauthlibinjector.profileKey=disabled'
      ]
    }
  }
  const closeOfflineSkinServer = () => {
    offlineSkinServer?.close()
    offlineSkinServer = null
    offlineSkinServerPort = 0
  }

  return {
    getPublicSkinLibrary,
    saveSkinPreset,
    saveDefaultSkinPreset,
    importSkinByPlayerName,
    activateSkinPreset,
    deleteSkinPreset,
    resetActiveSkin,
    prepareOfflineSkinLaunch,
    getDiscordPlayerTextureIdForLaunch,
    getFileSha256,
    closeOfflineSkinServer
  }
}
