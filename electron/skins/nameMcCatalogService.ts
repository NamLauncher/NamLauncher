// Author/creator: nattapat2871 (https://nattapat2871.me)
import type { SkinImportRequest, SkinSaveRequest } from '../main.ts'
import type {
  NameMcCatalogMode,
  NameMcCatalogRequest,
  NameMcCatalogResponse,
  NameMcSkinItem,
  NameMcTrendingPeriod
} from '../../shared/nameMcSkins.ts'
import { normalizeNameMcTag, resolveNameMcCatalogSearch } from '../../shared/nameMcSkins.ts'

type NameMcCatalogServiceDependencies = {
  [key: string]: any
  axios: typeof import('axios').default
  saveSkinPreset: (request: SkinSaveRequest) => Promise<any>
  importSkinByPlayerName: (request: SkinImportRequest) => Promise<any>
}

type CachedCatalog = {
  savedAt: number
  response: NameMcCatalogResponse
}

const NAME_MC_ORIGIN = 'https://namemc.com'
const NAME_MC_STATIC_ORIGIN = 'https://s.namemc.com'
const CATALOG_TIMEOUT_MS = 8_000
const DETAIL_TIMEOUT_MS = 8_000
const CATALOG_MAX_BYTES = 4 * 1024 * 1024
const DETAIL_MAX_BYTES = 1024 * 1024
const TEXTURE_MAX_BYTES = 2 * 1024 * 1024
const MEMORY_CACHE_TTL_MS = 5 * 60_000
const STALE_CACHE_TTL_MS = 7 * 24 * 60 * 60_000
const SKIN_MODEL_CACHE_TTL_MS = 24 * 60 * 60_000
const CATALOG_RETRY_DELAYS_MS = [650, 1_250] as const
const NAME_MC_SKIN_ID = /^[a-f0-9]{16}$/
const MINECRAFT_TEXTURE_ID = /^[a-f0-9]{64}$/
const PLAYER_UUID = /^[a-f0-9]{32}$/
const PLAYER_NAME = /^[A-Za-z0-9_]{3,16}$/

export const decodeNameMcHtmlEntities = (value: string) => value
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')

const stripHtml = (value: string) => decodeNameMcHtmlEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())

const normalizeNameMcSkinModel = (value: unknown): 'classic' | 'slim' | null => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'slim') return 'slim'
  if (normalized === 'classic' || normalized === 'default') return 'classic'
  return null
}

export const parseNameMcSkinModelHtml = (html: string): 'classic' | 'slim' | null => {
  const decoded = decodeNameMcHtmlEntities(String(html || ''))
  const metadataImages = Array.from(decoded.matchAll(/<meta\b[^>]*>/gi))
    .map((match) => match[0])
    .filter((tag) => /(?:property|name)=["'](?:og:image|twitter:image)["']/i.test(tag))
    .map((tag) => /content=["']([^"']+)["']/i.exec(tag)?.[1] || '')
    .filter(Boolean)
  const candidates = [...metadataImages, decoded]
  for (const candidate of candidates) {
    const match = /(?:[?&]model=|data-model=["'])(slim|classic|default)\b/i.exec(candidate)
    const model = normalizeNameMcSkinModel(match?.[1])
    if (model) return model
  }
  return null
}

export const normalizeNameMcSkinId = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  return NAME_MC_SKIN_ID.test(normalized) ? normalized : ''
}

export const isAllowedNameMcResourceUrl = (value: unknown) => {
  try {
    const url = new URL(String(value || ''))
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    if (host === 'namemc.com' || host === 'www.namemc.com') return true
    if (host === 's.namemc.com') return /^\/i\/[a-f0-9]{16}\.png$/i.test(url.pathname)
    if (host === 'textures.minecraft.net') return /^\/texture\/[a-f0-9]{64}\/?$/i.test(url.pathname)
    return false
  } catch {
    return false
  }
}

const normalizePage = (value: unknown) => {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 && page <= 100 ? page : 1
}

const normalizeMode = (value: unknown): NameMcCatalogMode => (
  ['trending', 'tagged', 'new', 'random'].includes(String(value))
    ? String(value) as NameMcCatalogMode
    : 'trending'
)

const normalizePeriod = (value: unknown): NameMcTrendingPeriod => (
  ['all', 'daily', 'weekly', 'monthly', 'top'].includes(String(value))
    ? String(value) as NameMcTrendingPeriod
    : 'all'
)

export const buildNameMcCatalogUrl = (request: NameMcCatalogRequest = {}) => {
  const mode = normalizeMode(request.mode)
  const period = normalizePeriod(request.period)
  const page = normalizePage(request.page)
  const tag = normalizeNameMcTag(request.tag)
  const trendingPath = period === 'all'
    ? '/minecraft-skins/trending'
    : `/minecraft-skins/trending/${period}`
  const pathname = mode === 'trending'
    ? trendingPath
    : mode === 'tagged'
      ? (tag ? `/minecraft-skins/tag/${tag}` : trendingPath)
      : `/minecraft-skins/${mode}`
  const url = new URL(pathname, NAME_MC_ORIGIN)
  if (page > 1) url.searchParams.set('page', String(page))
  return url.href
}

const getAttribute = (html: string, name: string) => {
  const match = new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(html)
  return match ? decodeNameMcHtmlEntities(match[1]) : ''
}

const INVALID_CARD_NAME = /^(?:true|false|null|undefined|downloads?|download|metadata|classic|default|slim|skin|namemc)$/i

const normalizeCardPlayerName = (value: unknown) => {
  const candidate = String(value || '').trim()
  if (!PLAYER_NAME.test(candidate)) return ''
  if (INVALID_CARD_NAME.test(candidate) || /^\d+$/.test(candidate) || /^#\d+$/.test(candidate)) return ''
  return candidate
}

const normalizeNameMcStars = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value
  const stars = Number(normalized)
  return Number.isSafeInteger(stars) && stars >= 0 ? stars : null
}

const catalogLabel = (request: NameMcCatalogRequest) => {
  const tag = normalizeNameMcTag(request.tag)
  if (normalizeMode(request.mode) !== 'tagged' || !tag) return 'NameMC'
  return tag.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export const normalizeNameMcCatalogResponse = (
  input: NameMcCatalogResponse,
  request: NameMcCatalogRequest = {}
): NameMcCatalogResponse => {
  const page = normalizePage(request.page ?? input?.page)
  const label = catalogLabel(request)
  const sourceItems = Array.isArray(input?.items) ? input.items : []
  const items = sourceItems.slice(0, 30).map((item, index) => {
    const rank = ((page - 1) * 30) + index + 1
    const playerName = normalizeCardPlayerName(item?.playerName)
    const existingName = normalizeCardPlayerName(item?.name)
    const name = playerName || existingName || `${label} skin #${rank}`
    const model = normalizeNameMcSkinModel(item?.model) || 'classic'
    const modelKnown = item?.modelKnown === true || item?.kind === 'player'
    return {
      ...item,
      name,
      model,
      modelKnown,
      rank,
      stars: normalizeNameMcStars(item?.stars),
      playerName: playerName || null
    }
  })
  return {
    ...input,
    success: items.length > 0,
    items,
    page,
    hasNext: items.length === 30 && page < 100
  }
}

export const parseNameMcCatalogHtml = (
  html: string,
  page: number,
  sourceUrl: string,
  request: NameMcCatalogRequest = {}
): NameMcCatalogResponse => {
  const items: NameMcSkinItem[] = []
  const seen = new Set<string>()
  const cardPattern = /<a\b([^>]*href=["'](?:https:\/\/(?:www\.)?namemc\.com)?\/skin\/([a-f0-9]{16})["'][^>]*)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = cardPattern.exec(html)) !== null && items.length < 30) {
    const id = normalizeNameMcSkinId(match[2])
    if (!id || seen.has(id)) continue
    seen.add(id)
    const attributes = match[1]
    const body = match[3]
    const profileMatch = /\/profile\/([A-Za-z0-9_]{3,16})(?:\.[a-f0-9-]+)?/i.exec(body)
    const title = normalizeCardPlayerName(getAttribute(attributes, 'title') || getAttribute(body, 'alt'))
    const visibleName = normalizeCardPlayerName(stripHtml(body).match(/(?:^|\s)([A-Za-z0-9_]{3,16})(?=\s|#|$)/)?.[1])
    const playerName = normalizeCardPlayerName(profileMatch?.[1]) || title || visibleName
    const modelMatch = /(?:[?&]model=|data-model=["'])(slim|classic|default)/i.exec(decodeNameMcHtmlEntities(`${attributes} ${body}`))
    const model = normalizeNameMcSkinModel(modelMatch?.[1]) || 'classic'
    const cardText = stripHtml(body)
    const rankMatch = /#\s*(\d{1,6})/.exec(cardText)
    const starsMatch = /#\s*\d{1,6}\s+(\d{1,3}(?:,\d{3})*|\d+)\s+\d+(?:\.\d+)?\s*[smhdwy]\b/i.exec(cardText)
    items.push({
      id,
      kind: 'namemc',
      name: playerName,
      model,
      modelKnown: Boolean(modelMatch),
      previewUrl: `${NAME_MC_STATIC_ORIGIN}/3d/skin/body.png?id=${id}&model=${model}&width=220&height=280`,
      sourceUrl: `${NAME_MC_ORIGIN}/skin/${id}`,
      rank: rankMatch ? Number(rankMatch[1]) : ((page - 1) * 30) + items.length + 1,
      stars: normalizeNameMcStars(starsMatch?.[1]),
      playerName: playerName || null,
      playerUuid: null
    })
  }

  return normalizeNameMcCatalogResponse(
    { success: items.length > 0, items, page, hasNext: false, stale: false, blocked: false, sourceUrl, warning: null },
    { ...request, page }
  )
}

const parseProfileInput = (value: unknown) => {
  const input = String(value || '').trim()
  if (!input) return ''
  try {
    const candidate = /^(?:www\.)?namemc\.com\//i.test(input) ? `https://${input}` : input
    const url = new URL(candidate)
    if (!['namemc.com', 'www.namemc.com'].includes(url.hostname.toLowerCase())) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0]?.toLowerCase() === 'skin') return normalizeNameMcSkinId(parts[1])
    if (parts[0]?.toLowerCase() !== 'profile') return ''
    return decodeURIComponent(parts[1] || '').split('.')[0].trim()
  } catch {
    return input
  }
}

export const createNameMcCatalogService = (deps: NameMcCatalogServiceDependencies) => {
  const {
    axios, fs, path, crypto, ensureDir, userDataPath, HTTP_HEADERS, log,
    saveSkinPreset, importSkinByPlayerName
  } = deps
  const cacheDirectory = path.join(userDataPath, 'cache', 'namemc-skins')
  const textureCacheDirectory = path.join(cacheDirectory, 'textures')
  const memoryCache = new Map<string, CachedCatalog>()
  const pendingCatalogRequests = new Map<string, Promise<NameMcCatalogResponse>>()
  const pendingTextureRequests = new Map<string, Promise<Buffer>>()
  const skinModelCache = new Map<string, { savedAt: number; model: 'classic' | 'slim' }>()
  const pendingSkinModelRequests = new Map<string, Promise<'classic' | 'slim' | null>>()
  const waitForCatalogRetry = typeof deps.waitForCatalogRetry === 'function'
    ? deps.waitForCatalogRetry as (milliseconds: number) => Promise<void>
    : (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

  const cachePathForUrl = (url: string) => path.join(cacheDirectory, `${crypto.createHash('sha256').update(url).digest('hex')}.json`)
  const readDiskCache = (url: string): CachedCatalog | null => {
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePathForUrl(url), 'utf8')) as CachedCatalog
      if (!Number.isFinite(parsed.savedAt) || !Array.isArray(parsed.response?.items)) return null
      return parsed
    } catch {
      return null
    }
  }
  const writeDiskCache = (url: string, cached: CachedCatalog) => {
    try {
      ensureDir(cacheDirectory)
      const target = cachePathForUrl(url)
      const temporary = `${target}.${process.pid}.tmp`
      fs.writeFileSync(temporary, JSON.stringify(cached), 'utf8')
      fs.renameSync(temporary, target)
    } catch (error) {
      log.debug('Could not write the NameMC skin catalog cache.', error)
    }
  }

  const resolvePublicPlayer = async (rawInput: unknown): Promise<NameMcSkinItem> => {
    const parsedInput = parseProfileInput(rawInput)
    const directSkinId = normalizeNameMcSkinId(parsedInput)
    if (directSkinId) {
      return {
        id: directSkinId,
        kind: 'namemc',
        name: `NameMC skin ${directSkinId}`,
        model: 'classic',
        modelKnown: false,
        previewUrl: `${NAME_MC_STATIC_ORIGIN}/3d/skin/body.png?id=${directSkinId}&model=classic&width=220&height=280`,
        sourceUrl: `${NAME_MC_ORIGIN}/skin/${directSkinId}`,
        playerName: null,
        playerUuid: null
      }
    }

    const compactUuid = parsedInput.replace(/-/g, '').toLowerCase()
    let profile: { id?: string; name?: string }
    if (PLAYER_UUID.test(compactUuid)) {
      profile = { id: compactUuid, name: parsedInput }
    } else {
      if (!PLAYER_NAME.test(parsedInput)) {
        throw new Error('Enter a Minecraft player name, UUID, NameMC profile URL, or NameMC skin URL.')
      }
      const response = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(parsedInput)}`, {
        timeout: CATALOG_TIMEOUT_MS,
        headers: HTTP_HEADERS,
        maxContentLength: 128 * 1024,
        withCredentials: false
      })
      profile = response.data || {}
    }
    const uuid = String(profile.id || '').replace(/-/g, '').toLowerCase()
    if (!PLAYER_UUID.test(uuid)) throw new Error('Minecraft player was not found.')
    const session = await axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, {
      timeout: CATALOG_TIMEOUT_MS,
      headers: HTTP_HEADERS,
      maxContentLength: 512 * 1024,
      withCredentials: false
    })
    const textureProperty = Array.isArray(session.data?.properties)
      ? session.data.properties.find((property: any) => property?.name === 'textures')
      : null
    const decoded = JSON.parse(Buffer.from(String(textureProperty?.value || ''), 'base64').toString('utf8'))
    const skin = decoded?.textures?.SKIN || {}
    const textureUrl = String(skin.url || '').replace(/^http:/i, 'https:')
    if (!isAllowedNameMcResourceUrl(textureUrl) || new URL(textureUrl).hostname !== 'textures.minecraft.net') {
      throw new Error('This Minecraft profile does not expose a valid public skin.')
    }
    const textureId = new URL(textureUrl).pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() || ''
    if (!MINECRAFT_TEXTURE_ID.test(textureId)) throw new Error('Minecraft returned an invalid skin texture.')
    const playerName = String(session.data?.name || profile.name || parsedInput).trim()
    return {
      id: `player:${uuid}`,
      kind: 'player',
      name: PLAYER_NAME.test(playerName) ? playerName : `Player ${uuid.slice(0, 8)}`,
      model: String(skin?.metadata?.model || '').toLowerCase() === 'slim' ? 'slim' : 'classic',
      modelKnown: true,
      previewUrl: textureUrl,
      sourceUrl: `${NAME_MC_ORIGIN}/profile/${encodeURIComponent(PLAYER_NAME.test(playerName) ? playerName : uuid)}`,
      playerName: PLAYER_NAME.test(playerName) ? playerName : null,
      playerUuid: uuid
    }
  }

  const searchNameMcSkins = async (request: NameMcCatalogRequest = {}): Promise<NameMcCatalogResponse> => {
    const query = String(request.query || '').trim().slice(0, 180)
    const resolvedSearch = resolveNameMcCatalogSearch(query)
    if (resolvedSearch.kind === 'player') {
      try {
        const item = await resolvePublicPlayer(resolvedSearch.query)
        return { success: true, items: [item], page: 1, hasNext: false, stale: false, blocked: false, sourceUrl: item.sourceUrl, warning: null }
      } catch (error) {
        return {
          success: false,
          items: [],
          page: 1,
          hasNext: false,
          stale: false,
          blocked: false,
          sourceUrl: `${NAME_MC_ORIGIN}/search?q=${encodeURIComponent(resolvedSearch.query)}`,
          warning: error instanceof Error ? error.message : 'Could not find this Minecraft player.'
        }
      }
    }

    const catalogRequest: NameMcCatalogRequest = resolvedSearch.kind === 'tag'
      ? { ...request, query: '', mode: 'tagged', tag: resolvedSearch.tag }
      : { ...request, query: '' }
    const page = normalizePage(catalogRequest.page)
    const sourceUrl = buildNameMcCatalogUrl({ ...catalogRequest, page })
    const now = Date.now()
    const memory = memoryCache.get(sourceUrl)
    if (memory && now - memory.savedAt < MEMORY_CACHE_TTL_MS) {
      return normalizeNameMcCatalogResponse(memory.response, { ...catalogRequest, page })
    }
    const disk = readDiskCache(sourceUrl)
    if (disk && now - disk.savedAt < MEMORY_CACHE_TTL_MS) {
      const normalized = normalizeNameMcCatalogResponse(disk.response, { ...catalogRequest, page })
      memoryCache.set(sourceUrl, { ...disk, response: normalized })
      return normalized
    }
    const existing = pendingCatalogRequests.get(sourceUrl)
    if (existing) return existing

    const requestPromise = (async () => {
      const stale = disk && now - disk.savedAt < STALE_CACHE_TTL_MS ? disk : null
      let error: any = null
      try {
        for (let attempt = 0; attempt <= CATALOG_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
            const response = await axios.get<string>(sourceUrl, {
              responseType: 'text',
              timeout: CATALOG_TIMEOUT_MS,
              maxContentLength: CATALOG_MAX_BYTES,
              maxBodyLength: CATALOG_MAX_BYTES,
              withCredentials: false,
              headers: {
                ...HTTP_HEADERS,
                Accept: 'text/html,application/xhtml+xml',
                Referer: `${NAME_MC_ORIGIN}/minecraft-skins`
              },
              transformResponse: [(value: unknown) => value]
            })
            const html = String(response.data || '')
            if (Buffer.byteLength(html, 'utf8') > CATALOG_MAX_BYTES) throw new Error('NameMC returned a catalog page that is too large.')
            const parsed = parseNameMcCatalogHtml(html, page, sourceUrl, catalogRequest)
            if (!parsed.items.length) throw new Error('NameMC returned no readable skin cards.')
            const cached = { savedAt: Date.now(), response: parsed }
            memoryCache.set(sourceUrl, cached)
            writeDiskCache(sourceUrl, cached)
            return parsed
          } catch (attemptError: any) {
            error = attemptError
            const status = Number(attemptError?.response?.status || 0)
            const message = String(attemptError?.message || '')
            const retryable = status === 403
              || status === 429
              || status >= 500
              || /cloudflare|forbidden|blocked|timed?\s*out|econn|no readable skin cards/i.test(message)
            const retryDelay = CATALOG_RETRY_DELAYS_MS[attempt]
            if (stale || !retryable || retryDelay === undefined) throw attemptError
            log.debug(`NameMC catalog request was transiently unavailable; retrying in ${retryDelay}ms.`)
            await waitForCatalogRetry(retryDelay)
          }
        }
        throw error || new Error('Could not load the NameMC skin catalog.')
      } catch (finalError: any) {
        error = finalError
        const status = Number(error?.response?.status || 0)
        const blocked = status === 403 || status === 429 || /cloudflare|forbidden|blocked|no readable skin cards/i.test(String(error?.message || ''))
        if (stale) {
          const response = normalizeNameMcCatalogResponse({
            ...stale.response,
            stale: true,
            blocked,
            warning: blocked
              ? 'NameMC is temporarily blocking catalog refresh. Showing the latest cached skins.'
              : 'NameMC could not be refreshed. Showing the latest cached skins.'
          }, { ...catalogRequest, page })
          memoryCache.set(sourceUrl, { savedAt: stale.savedAt, response })
          return response
        }
        return {
          success: false,
          items: [],
          page,
          hasNext: false,
          stale: false,
          blocked,
          sourceUrl,
          warning: blocked
            ? 'NameMC is temporarily blocking catalog access from the launcher. Player name and UUID search still work.'
            : (error instanceof Error ? error.message : 'Could not load the NameMC skin catalog.')
        }
      } finally {
        pendingCatalogRequests.delete(sourceUrl)
      }
    })()
    pendingCatalogRequests.set(sourceUrl, requestPromise)
    return requestPromise
  }

  const resolveCatalogSkinModel = async (item: NameMcSkinItem): Promise<NameMcSkinItem> => {
    if (item.kind !== 'namemc') return { ...item, modelKnown: true }
    const skinId = normalizeNameMcSkinId(item.id)
    if (!skinId || item.modelKnown === true) return item
    const cached = skinModelCache.get(skinId)
    if (cached && Date.now() - cached.savedAt < SKIN_MODEL_CACHE_TTL_MS) {
      return {
        ...item,
        model: cached.model,
        modelKnown: true,
        previewUrl: `${NAME_MC_STATIC_ORIGIN}/3d/skin/body.png?id=${skinId}&model=${cached.model}&width=220&height=280`
      }
    }
    const pending = pendingSkinModelRequests.get(skinId)
    const promise = pending || (async () => {
      try {
        const detailUrl = `${NAME_MC_ORIGIN}/skin/${skinId}`
        const response = await axios.get<string>(detailUrl, {
          responseType: 'text',
          timeout: DETAIL_TIMEOUT_MS,
          maxContentLength: DETAIL_MAX_BYTES,
          maxBodyLength: DETAIL_MAX_BYTES,
          withCredentials: false,
          headers: {
            ...HTTP_HEADERS,
            Accept: 'text/html,application/xhtml+xml',
            Referer: item.sourceUrl || `${NAME_MC_ORIGIN}/minecraft-skins`
          },
          transformResponse: [(value: unknown) => value]
        })
        const html = String(response.data || '')
        if (Buffer.byteLength(html, 'utf8') > DETAIL_MAX_BYTES) throw new Error('NameMC returned a skin detail page that is too large.')
        const model = parseNameMcSkinModelHtml(html)
        if (model) skinModelCache.set(skinId, { savedAt: Date.now(), model })
        return model
      } catch (error) {
        log.debug(`Could not resolve the NameMC arm model for skin ${skinId}.`, error)
        return null
      } finally {
        pendingSkinModelRequests.delete(skinId)
      }
    })()
    if (!pending) pendingSkinModelRequests.set(skinId, promise)
    const model = await promise
    if (!model) return item
    return {
      ...item,
      model,
      modelKnown: true,
      previewUrl: `${NAME_MC_STATIC_ORIGIN}/3d/skin/body.png?id=${skinId}&model=${model}&width=220&height=280`
    }
  }

  const validatePng = (buffer: Buffer) => {
    if (buffer.length <= 0 || buffer.length > TEXTURE_MAX_BYTES) throw new Error('Skin texture must be smaller than 2 MB.')
    if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Skin texture is not a valid PNG file.')
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    if (width !== 64 || (height !== 64 && height !== 32)) throw new Error('Minecraft skins must be 64x64 or legacy 64x32 pixels.')
    return buffer
  }

  const downloadTexture = async (item: NameMcSkinItem) => {
    let textureUrl = ''
    let cacheId = ''
    const skinId = normalizeNameMcSkinId(item.id)
    if (item.kind === 'namemc' && skinId) {
      textureUrl = `${NAME_MC_STATIC_ORIGIN}/i/${skinId}.png`
      cacheId = skinId
    } else {
      const player = await resolvePublicPlayer(item.playerName || item.playerUuid || item.name)
      textureUrl = player.previewUrl
      const textureId = new URL(textureUrl).pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() || ''
      if (!MINECRAFT_TEXTURE_ID.test(textureId)) throw new Error('Minecraft returned an invalid skin texture.')
      cacheId = textureId
    }
    if (!isAllowedNameMcResourceUrl(textureUrl)) throw new Error('Skin source is not allowlisted.')
    const cachePath = path.join(textureCacheDirectory, `${cacheId}.png`)
    try {
      if (fs.existsSync(cachePath)) return validatePng(fs.readFileSync(cachePath))
    } catch {
      try { fs.rmSync(cachePath, { force: true }) } catch { /* ignore unreadable cache */ }
    }
    const pending = pendingTextureRequests.get(textureUrl)
    if (pending) return pending
    const promise = (async () => {
      try {
        const response = await axios.get<ArrayBuffer>(textureUrl, {
          responseType: 'arraybuffer',
          timeout: CATALOG_TIMEOUT_MS,
          maxContentLength: TEXTURE_MAX_BYTES,
          maxBodyLength: TEXTURE_MAX_BYTES,
          withCredentials: false,
          headers: { ...HTTP_HEADERS, Accept: 'image/png,image/*;q=0.8' }
        })
        const buffer = validatePng(Buffer.from(response.data))
        ensureDir(textureCacheDirectory)
        fs.writeFileSync(cachePath, buffer)
        return buffer
      } finally {
        pendingTextureRequests.delete(textureUrl)
      }
    })()
    pendingTextureRequests.set(textureUrl, promise)
    return promise
  }

  const resolveNameMcSkin = async (request: NameMcSkinItem | { query?: string }) => {
    const unresolvedItem = 'query' in request && request.query
      ? await resolvePublicPlayer(request.query)
      : request as NameMcSkinItem
    const item = await resolveCatalogSkinModel(unresolvedItem)
    const buffer = await downloadTexture(item)
    return { ...item, textureDataUrl: `data:image/png;base64,${buffer.toString('base64')}` }
  }

  const applyNameMcSkin = async (request: { accountId?: string; item?: NameMcSkinItem }) => {
    const accountId = String(request.accountId || '').trim()
    const item = request.item
    if (!accountId || !item) throw new Error('Select a player and a skin before applying it.')
    if (item.kind === 'player') {
      return importSkinByPlayerName({ accountId, playerName: item.playerName || item.playerUuid || item.name })
    }
    const resolved = await resolveNameMcSkin(item)
    return saveSkinPreset({
      accountId,
      name: `${String(item.name || 'NameMC skin').slice(0, 38)} (NameMC)`,
      model: resolved.model,
      textureDataUrl: resolved.textureDataUrl,
      activate: true
    })
  }

  return { searchNameMcSkins, resolveNameMcSkin, applyNameMcSkin }
}
