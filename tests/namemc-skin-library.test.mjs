// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  DEFAULT_NAME_MC_SKIN_TAG,
  NAME_MC_FAVICON_URL,
  normalizeNameMcTag,
  resolveNameMcCatalogSearch
} from '../shared/nameMcSkins.ts'
import {
  buildNameMcCatalogUrl,
  createNameMcCatalogService,
  normalizeNameMcCatalogResponse,
  parseNameMcCatalogHtml,
  parseNameMcSkinModelHtml
} from '../electron/skins/nameMcCatalogService.ts'

const nameMcLibrarySource = await readFile(new URL('../src/components/NameMcSkinLibrary.tsx', import.meta.url), 'utf8')
const skinPageSource = await readFile(new URL('../src/components/SkinPage.tsx', import.meta.url), 'utf8')
const libraryViewSource = await readFile(new URL('../src/views/LibraryView.tsx', import.meta.url), 'utf8')
const appTextSource = await readFile(new URL('../src/appText.ts', import.meta.url), 'utf8')

const card = (id, content, attributes = '') => (
  `<a href="/skin/${id}" ${attributes}>${content}</a>`
)

test('sanitizes invalid NameMC card names and uses contextual rank fallbacks', () => {
  const html = [
    card('0000000000000001', '<img alt="false"> #31 12 downloads'),
    card('0000000000000002', '<img alt="true"> #32'),
    card('0000000000000003', '<span>33 downloads</span>', 'title="#33"'),
    card('0000000000000004', '<span>45678</span>', 'title="45678"'),
    card('0000000000000005', '<span>metadata classic</span>', 'title="downloads"')
  ].join('')

  const tagged = parseNameMcCatalogHtml(html, 2, 'https://namemc.com/minecraft-skins/tag/cat?page=2', {
    mode: 'tagged',
    tag: 'cat'
  })
  assert.deepEqual(tagged.items.map((item) => item.name), [
    'Cat skin #31',
    'Cat skin #32',
    'Cat skin #33',
    'Cat skin #34',
    'Cat skin #35'
  ])
  assert.equal(tagged.items.every((item) => item.playerName === null), true)

  const trending = parseNameMcCatalogHtml(html, 2, 'https://namemc.com/minecraft-skins/trending/daily?page=2', {
    mode: 'trending'
  })
  assert.equal(trending.items[0].name, 'NameMC skin #31')
})

test('keeps valid player names while rejecting ranks, counts, booleans, and metadata words', () => {
  const html = [
    card('1000000000000001', '<span data-profile="/profile/Nattapat2871.abc">Nattapat2871</span>'),
    card('1000000000000002', '<img alt="false">'),
    card('1000000000000003', '<span>#3</span>'),
    card('1000000000000004', '<span>12 downloads</span>'),
    card('1000000000000005', '<span>classic metadata</span>')
  ].join('')
  const response = parseNameMcCatalogHtml(html, 1, 'https://namemc.com/minecraft-skins', { mode: 'trending' })
  assert.equal(response.items[0].name, 'Nattapat2871')
  assert.deepEqual(response.items.slice(1).map((item) => item.name), [
    'NameMC skin #2',
    'NameMC skin #3',
    'NameMC skin #4',
    'NameMC skin #5'
  ])
})

test('parses NameMC star totals without confusing rank, age, or download counts', () => {
  const html = [
    card('2000000000000001', '<span>koakumaris</span><div>#1</div><div>1,217</div><div>10d</div>'),
    card('2000000000000002', '<div>#2</div><div>709</div><div>5.1d</div>'),
    card('2000000000000003', '<div>#3 0 12s</div>'),
    card('2000000000000004', '<div>#4 12 downloads</div>')
  ].join('')
  const response = parseNameMcCatalogHtml(html, 1, 'https://namemc.com/minecraft-skins/trending', { mode: 'trending' })

  assert.deepEqual(response.items.map((item) => item.stars), [1217, 709, 0, null])
  assert.deepEqual(response.items.map((item) => item.rank), [1, 2, 3, 4])
})

test('parses real NameMC arm models from catalog cards and detail metadata', () => {
  const catalog = parseNameMcCatalogHtml(
    card('3000000000000001', '<img src="https://s.namemc.com/3d/skin/body.png?id=3000000000000001&amp;model=slim"> #1'),
    1,
    'https://namemc.com/minecraft-skins/trending',
    { mode: 'trending' }
  )
  assert.equal(catalog.items[0].model, 'slim')
  assert.equal(catalog.items[0].modelKnown, true)
  assert.equal(parseNameMcSkinModelHtml('<meta content="https://s.namemc.com/3d/skin/body.png?id=x&amp;model=slim&amp;width=320" property="og:image">'), 'slim')
  assert.equal(parseNameMcSkinModelHtml('<meta name="twitter:image" content="https://s.namemc.com/3d/skin/body.png?id=x&amp;model=default">'), 'classic')
  assert.equal(parseNameMcSkinModelHtml('<html><body>No model metadata</body></html>'), null)
})

const createServiceDependencies = (axios, overrides = {}) => ({
  axios,
  fs: {
    readFileSync: () => { throw new Error('cache miss') },
    writeFileSync: () => {},
    renameSync: () => {},
    existsSync: () => false,
    rmSync: () => {}
  },
  path,
  crypto,
  ensureDir: () => {},
  userDataPath: path.join(process.cwd(), '.namemc-test-cache'),
  HTTP_HEADERS: { 'User-Agent': 'NamLauncher test' },
  log: { debug: () => {} },
  saveSkinPreset: async (request) => request,
  importSkinByPlayerName: async (request) => request,
  ...overrides
})

test('retries a transient first catalog failure without a stale request race', async () => {
  let calls = 0
  const waits = []
  const axios = {
    get: async () => {
      calls += 1
      if (calls === 1) {
        const error = new Error('Forbidden')
        error.response = { status: 403 }
        throw error
      }
      return { data: card('4000000000000001', '<span>#1 12 1d</span>') }
    }
  }
  const service = createNameMcCatalogService(createServiceDependencies(axios, {
    waitForCatalogRetry: async (milliseconds) => { waits.push(milliseconds) }
  }))
  const result = await service.searchNameMcSkins({ mode: 'trending', period: 'all', page: 1 })
  assert.equal(result.success, true)
  assert.equal(result.items.length, 1)
  assert.equal(calls, 2)
  assert.deepEqual(waits, [650])
})

test('resolves an unknown catalog arm model from the NameMC skin detail before preview', async () => {
  const png = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png, 0)
  png.writeUInt32BE(64, 16)
  png.writeUInt32BE(64, 20)
  const requestedUrls = []
  const axios = {
    get: async (url, options) => {
      requestedUrls.push(url)
      if (options.responseType === 'text') {
        return { data: '<meta property="og:image" content="https://s.namemc.com/3d/skin/body.png?id=5000000000000001&amp;model=slim&amp;width=320">' }
      }
      return { data: png }
    }
  }
  const service = createNameMcCatalogService(createServiceDependencies(axios))
  const resolved = await service.resolveNameMcSkin({
    id: '5000000000000001',
    kind: 'namemc',
    name: 'Slim test skin',
    model: 'classic',
    modelKnown: false,
    previewUrl: 'https://s.namemc.com/3d/skin/body.png?id=5000000000000001&model=classic&width=220&height=280',
    sourceUrl: 'https://namemc.com/skin/5000000000000001'
  })
  assert.equal(resolved.model, 'slim')
  assert.equal(resolved.modelKnown, true)
  assert.match(resolved.previewUrl, /model=slim/)
  assert.deepEqual(requestedUrls, [
    'https://namemc.com/skin/5000000000000001',
    'https://s.namemc.com/i/5000000000000001.png'
  ])
})

test('builds bounded pageable catalog URLs through page 100', () => {
  assert.equal(buildNameMcCatalogUrl({ mode: 'trending', page: 1 }), 'https://namemc.com/minecraft-skins/trending')
  assert.equal(buildNameMcCatalogUrl({ mode: 'trending', period: 'all', page: 2 }), 'https://namemc.com/minecraft-skins/trending?page=2')
  assert.equal(buildNameMcCatalogUrl({ mode: 'trending', period: 'weekly', page: 2 }), 'https://namemc.com/minecraft-skins/trending/weekly?page=2')
  assert.equal(buildNameMcCatalogUrl({ mode: 'tagged', tag: 'cat', page: 100 }), 'https://namemc.com/minecraft-skins/tag/cat?page=100')
  assert.equal(buildNameMcCatalogUrl({ mode: 'tagged', tag: 'cat', page: 101 }), 'https://namemc.com/minecraft-skins/tag/cat')
})

test('uses full-page cardinality for pagination and caps it at page 100', () => {
  const html = Array.from({ length: 30 }, (_, index) => card(
    (index + 1).toString(16).padStart(16, '0'),
    `<img alt="false"> #${index + 1}`
  )).join('')
  assert.equal(parseNameMcCatalogHtml(html, 1, 'https://namemc.com/minecraft-skins', { mode: 'trending' }).hasNext, true)
  assert.equal(parseNameMcCatalogHtml(html, 100, 'https://namemc.com/minecraft-skins?page=100', { mode: 'trending' }).hasNext, false)
})

test('routes known and explicit tag searches without breaking exact player lookup', () => {
  assert.equal(DEFAULT_NAME_MC_SKIN_TAG, 'cat')
  assert.equal(normalizeNameMcTag(' Cat '), 'cat')
  assert.deepEqual(resolveNameMcCatalogSearch('cat'), { kind: 'tag', tag: 'cat' })
  assert.deepEqual(resolveNameMcCatalogSearch('#cat'), { kind: 'tag', tag: 'cat' })
  assert.deepEqual(resolveNameMcCatalogSearch('tag:cat'), { kind: 'tag', tag: 'cat' })
  assert.deepEqual(resolveNameMcCatalogSearch('Nattapat2871'), { kind: 'player', query: 'Nattapat2871' })
})

test('normalizes stale beta1 cache names and recalculates pagination', () => {
  const response = normalizeNameMcCatalogResponse({
    success: true,
    page: 2,
    hasNext: false,
    stale: false,
    blocked: false,
    sourceUrl: 'https://namemc.com/minecraft-skins/tag/cat?page=2',
    items: Array.from({ length: 30 }, (_, index) => ({
      id: (index + 1).toString(16).padStart(16, '0'),
      kind: 'namemc',
      name: index === 0 ? 'false' : `${index + 1000}`,
      model: 'classic',
      previewUrl: '',
      sourceUrl: '',
      stars: index === 0 ? '1,234' : index === 1 ? 'downloads' : undefined
    }))
  }, { mode: 'tagged', tag: 'cat', page: 2 })

  assert.equal(response.items[0].name, 'Cat skin #31')
  assert.equal(response.items[1].name, 'Cat skin #32')
  assert.equal(response.items[0].stars, 1234)
  assert.equal(response.items[1].stars, null)
  assert.equal(response.hasNext, true)
})

test('skin library UI supports tag search, 3D player cards, favicon branding, and red beta badges', () => {
  assert.match(nameMcLibrarySource, /resolveNameMcCatalogSearch\(query\)/)
  assert.match(nameMcLibrarySource, /DEFAULT_NAME_MC_SKIN_TAG/)
  assert.match(nameMcLibrarySource, /StaticSkinPreview/)
  assert.match(nameMcLibrarySource, /item\.kind === 'player'/)
  assert.match(nameMcLibrarySource, /NAME_MC_FAVICON_URL/)
  assert.match(nameMcLibrarySource, /bg-red-500/)
  assert.match(nameMcLibrarySource, /selected\.stars != null/)
  assert.match(nameMcLibrarySource, /item\.stars != null/)
  assert.match(nameMcLibrarySource, /<Star size=\{10\} fill="currentColor"/)
  assert.match(nameMcLibrarySource, /nam-skin-star-badge/)
  assert.match(nameMcLibrarySource, /nam-skin-model-badge/)
  assert.match(nameMcLibrarySource, /classicArms: 'แขนกว้าง'/)
  assert.match(nameMcLibrarySource, /slimArms: 'แขนเล็ก'/)
  assert.match(nameMcLibrarySource, /setSelected\(next\)/)
  assert.equal(NAME_MC_FAVICON_URL, 'https://s.namemc.com/img/favicon.svg')
})

test('skin search runs automatically after typing stops and remains IME safe', () => {
  assert.match(nameMcLibrarySource, /const SEARCH_DEBOUNCE_MS = 650/)
  assert.match(nameMcLibrarySource, /window\.setTimeout\(\(\) => submitSearch\(\), SEARCH_DEBOUNCE_MS\)/)
  assert.match(nameMcLibrarySource, /\[open, query, searchComposing\]/)
  assert.match(nameMcLibrarySource, /onCompositionStart=\{\(\) => setSearchComposing\(true\)\}/)
  assert.match(nameMcLibrarySource, /onCompositionEnd=\{\(\) => setSearchComposing\(false\)\}/)
  assert.match(nameMcLibrarySource, /data-testid="namemc-skin-search"/)
})

test('NameMC dialog header has dedicated light-theme colors and readable secondary text', () => {
  assert.match(nameMcLibrarySource, /nam-skin-library-dialog/)
  assert.match(nameMcLibrarySource, /nam-skin-library-header/)
  assert.match(nameMcLibrarySource, /nam-skin-library-subtitle/)
})

test('tagged mode starts with the working all-skins view and lets every tag be toggled off', () => {
  assert.match(nameMcLibrarySource, /const \[tag, setTag\] = useState\(''\)/)
  assert.doesNotMatch(nameMcLibrarySource, /nextMode === 'tagged'[\s\S]*setTag\(DEFAULT_NAME_MC_SKIN_TAG\)/)
  assert.match(nameMcLibrarySource, /aria-pressed=\{!tag\}/)
  assert.match(nameMcLibrarySource, /setTag\(\(current\) => current === item \? '' : item\)/)
  assert.equal(buildNameMcCatalogUrl({ mode: 'tagged', tag: '', page: 1 }), 'https://namemc.com/minecraft-skins/trending')
})

test('skin library defaults to the main NameMC trending catalog', () => {
  assert.match(nameMcLibrarySource, /const \[period, setPeriod\] = useState<NameMcTrendingPeriod>\('all'\)/)
  assert.match(nameMcLibrarySource, /const periods: NameMcTrendingPeriod\[\] = \['all', 'daily', 'weekly', 'monthly', 'top'\]/)
})

test('Library offers Skin after shader without widening provider project types', () => {
  assert.match(libraryViewSource, /libraryTypes\.map[\s\S]*t\('nav\.skins'\)/)
  assert.match(libraryViewSource, /const TypeIcon = type\.Icon[\s\S]*<TypeIcon size=\{14\}/)
  assert.match(libraryViewSource, /loadSkinPageModule\(\)[\s\S]*setActiveView\('skins'\)/)
  assert.match(libraryViewSource, /bg-red-500[\s\S]*BETA/)
})

test('skin page removes duplicate player-name import and promotes the library entry point', () => {
  assert.doesNotMatch(skinPageSource, /restoreName/)
  assert.doesNotMatch(skinPageSource, /importPlayerSkin/)
  assert.match(skinPageSource, /setNameMcLibraryOpen\(true\)/)
  assert.match(skinPageSource, /bg-blue-500[\s\S]*BETA/)
})

test('Thai resource-pack wording stays consistent in the launcher', () => {
  assert.doesNotMatch(appTextSource, /แพ็กทรัพยากร/)
  assert.match(appTextSource, /รีซอร์สแพ็ก/)
})
