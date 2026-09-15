// Author/creator: nattapat2871 (https://nattapat2871.me)
export type NameMcCatalogMode = 'trending' | 'tagged' | 'new' | 'random'
export type NameMcTrendingPeriod = 'all' | 'daily' | 'weekly' | 'monthly' | 'top'

export const NAME_MC_FAVICON_URL = 'https://s.namemc.com/img/favicon.svg'
export const DEFAULT_NAME_MC_SKIN_TAG = 'cat'

const NAME_MC_SKIN_TAGS = new Set([
  'girl', 'boy', 'cute', 'anime', 'red', 'blue', 'dark', 'hoodie',
  DEFAULT_NAME_MC_SKIN_TAG, 'pink-hair', 'white-hair', 'suit'
])

export const normalizeNameMcTag = (value: unknown) => {
  const tag = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/^tag\s*:/, '')
    .trim()
  return /^[a-z0-9-]{1,32}$/.test(tag) ? tag : ''
}

export const resolveNameMcCatalogSearch = (value: unknown):
  | { kind: 'tag'; tag: string }
  | { kind: 'player'; query: string }
  | { kind: 'catalog' } => {
  const query = String(value || '').trim()
  if (!query) return { kind: 'catalog' }
  const tag = normalizeNameMcTag(query)
  if (/^(?:#|tag\s*:)/i.test(query) || NAME_MC_SKIN_TAGS.has(tag)) {
    return tag ? { kind: 'tag', tag } : { kind: 'catalog' }
  }
  return { kind: 'player', query }
}

export type NameMcSkinItem = {
  id: string
  kind: 'namemc' | 'player'
  name: string
  model: 'classic' | 'slim'
  modelKnown?: boolean
  previewUrl: string
  sourceUrl: string
  rank?: number | null
  stars?: number | null
  playerName?: string | null
  playerUuid?: string | null
}

export type NameMcResolvedSkin = NameMcSkinItem & {
  textureDataUrl: string
}

export type NameMcCatalogRequest = {
  mode?: NameMcCatalogMode
  period?: NameMcTrendingPeriod
  page?: number
  tag?: string
  query?: string
}

export type NameMcCatalogResponse = {
  success: boolean
  items: NameMcSkinItem[]
  page: number
  hasNext: boolean
  stale: boolean
  blocked: boolean
  sourceUrl: string
  warning?: string | null
}
