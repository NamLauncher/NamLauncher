// Author/creator: nattapat2871 (https://nattapat2871.me)
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  ExternalLink,
  Flame,
  Library,
  Loader2,
  Rotate3D,
  Search,
  ShieldAlert,
  Shuffle,
  Sparkles,
  Star,
  Tag,
  X
} from 'lucide-react'
import type {
  NameMcCatalogMode,
  NameMcCatalogResponse,
  NameMcResolvedSkin,
  NameMcSkinItem,
  NameMcTrendingPeriod
} from '../../shared/nameMcSkins'
import {
  DEFAULT_NAME_MC_SKIN_TAG,
  NAME_MC_FAVICON_URL,
  resolveNameMcCatalogSearch
} from '../../shared/nameMcSkins'
import type { SkinLibraryData } from './SkinPage'
import SkinViewer from './SkinViewer'
import StaticSkinPreview from './StaticSkinPreview'

type NameMcSkinLibraryProps = {
  open: boolean
  accountId: string
  language: 'en' | 'th'
  onClose: () => void
  onApplied: (library: SkinLibraryData) => void
  onStatus: (message: string) => void
}

const EMPTY_RESULT: NameMcCatalogResponse = {
  success: false,
  items: [],
  page: 1,
  hasNext: false,
  stale: false,
  blocked: false,
  sourceUrl: 'https://namemc.com/minecraft-skins',
  warning: null
}

const SEARCH_DEBOUNCE_MS = 650

const TAGS = [DEFAULT_NAME_MC_SKIN_TAG, 'girl', 'boy', 'cute', 'anime', 'red', 'blue', 'dark', 'hoodie', 'pink-hair', 'white-hair', 'suit'] as const

const copy = {
  en: {
    title: 'NameMC Skin Library',
    subtitle: 'Browse the public catalog or find an exact player by name, UUID, or NameMC profile URL.',
    searchPlaceholder: 'Skin tag, player name, UUID, NameMC profile or skin URL',
    search: 'Find skin',
    clearSearch: 'Back to catalog',
    trending: 'Trending',
    tagged: 'Tagged',
    new: 'New',
    random: 'Random',
    all: 'Overall',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    top: 'Top',
    loading: 'Loading skins',
    empty: 'No skins are available for this view.',
    page: 'Page',
    previous: 'Previous page',
    next: 'Next page',
    preview: 'Skin preview',
    rotate: 'Drag to rotate the skin',
    apply: 'Use and save skin',
    applying: 'Applying skin',
    back: 'Back to library',
    source: 'Open on NameMC',
    stars: 'stars',
    fallbackTitle: 'NameMC catalog is temporarily unavailable',
    fallbackBody: 'NameMC may block automated catalog requests. Exact player-name and UUID search still uses the official Minecraft profile service.',
    applied: 'Skin saved and equipped',
    tagLabel: 'Skin tag',
    allTags: 'All skins',
    classicArms: 'Classic arms',
    slimArms: 'Slim arms',
    checkingArms: 'Check in preview'
  },
  th: {
    title: 'ไลบรารี่สกิน NameMC',
    subtitle: 'เลือกดูสกินสาธารณะ หรือค้นหาผู้เล่นด้วยชื่อ UUID และลิงก์โปรไฟล์ NameMC ได้โดยตรง',
    searchPlaceholder: 'แท็กสกิน ชื่อผู้เล่น UUID ลิงก์โปรไฟล์หรือลิงก์สกิน NameMC',
    search: 'ค้นหาสกิน',
    clearSearch: 'กลับไปหน้าแค็ตตาล็อก',
    trending: 'กำลังนิยม',
    tagged: 'แท็ก',
    new: 'มาใหม่',
    random: 'สุ่ม',
    all: 'ภาพรวม',
    daily: 'รายวัน',
    weekly: 'รายสัปดาห์',
    monthly: 'รายเดือน',
    top: 'ยอดนิยมทั้งหมด',
    loading: 'กำลังโหลดสกิน',
    empty: 'ยังไม่มีสกินสำหรับหน้านี้',
    page: 'หน้า',
    previous: 'หน้าก่อน',
    next: 'หน้าถัดไป',
    preview: 'พรีวิวสกิน',
    rotate: 'ลากเพื่อหมุนดูสกิน',
    apply: 'ใช้และบันทึกสกิน',
    applying: 'กำลังใช้สกิน',
    back: 'กลับไปไลบรารี่',
    source: 'เปิดใน NameMC',
    stars: 'ดาว',
    fallbackTitle: 'แค็ตตาล็อก NameMC ใช้งานไม่ได้ชั่วคราว',
    fallbackBody: 'NameMC อาจบล็อกคำขอแค็ตตาล็อกจากโปรแกรม แต่ยังค้นหาด้วยชื่อผู้เล่นหรือ UUID ผ่านบริการโปรไฟล์ Minecraft อย่างเป็นทางการได้',
    applied: 'บันทึกและใช้สกินแล้ว',
    tagLabel: 'แท็กสกิน',
    allTags: 'ทั้งหมด',
    classicArms: 'แขนกว้าง',
    slimArms: 'แขนเล็ก',
    checkingArms: 'ตรวจในพรีวิว'
  }
}

const modeOptions: Array<{ id: NameMcCatalogMode; icon: typeof Flame }> = [
  { id: 'trending', icon: Flame },
  { id: 'tagged', icon: Tag },
  { id: 'new', icon: Clock3 },
  { id: 'random', icon: Shuffle }
]

const periods: NameMcTrendingPeriod[] = ['all', 'daily', 'weekly', 'monthly', 'top']

const friendlyTag = (value: string) => value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

const formatStarCount = (value: number, language: 'en' | 'th') => value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')

export default function NameMcSkinLibrary({
  open,
  accountId,
  language,
  onClose,
  onApplied,
  onStatus
}: NameMcSkinLibraryProps) {
  const text = copy[language]
  const armModelLabel = (model: 'classic' | 'slim') => model === 'slim' ? text.slimArms : text.classicArms
  const [mode, setMode] = useState<NameMcCatalogMode>('trending')
  const [period, setPeriod] = useState<NameMcTrendingPeriod>('all')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [searchComposing, setSearchComposing] = useState(false)
  const [result, setResult] = useState<NameMcCatalogResponse>(EMPTY_RESULT)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<NameMcSkinItem | null>(null)
  const [resolved, setResolved] = useState<NameMcResolvedSkin | null>(null)
  const [resolving, setResolving] = useState(false)
  const [applying, setApplying] = useState(false)
  const requestIdRef = useRef(0)
  const skinRequestIdRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || applying) return
      if (selected) {
        skinRequestIdRef.current += 1
        setSelected(null)
        setResolved(null)
        setResolving(false)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, selected, applying, onClose])

  const submitSearch = () => {
    const nextQuery = query.trim()
    if (!nextQuery) {
      setActiveQuery('')
      setPage(1)
      return
    }
    const resolvedSearch = resolveNameMcCatalogSearch(query)
    setPage(1)
    if (resolvedSearch.kind === 'tag') {
      setMode('tagged')
      setTag(resolvedSearch.tag)
      setActiveQuery('')
      return
    }
    setActiveQuery(resolvedSearch.kind === 'player' ? resolvedSearch.query : nextQuery)
  }

  useEffect(() => {
    if (!open) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    setSelected(null)
    setResolved(null)
    void window.electron.searchNameMcSkins({ mode, period, page, tag, query: activeQuery }).then((next) => {
      if (requestId !== requestIdRef.current) return
      setResult(next)
      if (next.warning) onStatus(next.warning)
    }).catch((error: any) => {
      if (requestId !== requestIdRef.current) return
      setResult({
        ...EMPTY_RESULT,
        page,
        sourceUrl: activeQuery
          ? `https://namemc.com/search?q=${encodeURIComponent(activeQuery)}`
          : 'https://namemc.com/minecraft-skins',
        warning: error?.message || 'Could not load the skin library.'
      })
    }).finally(() => {
      if (requestId === requestIdRef.current) setLoading(false)
    })
  }, [open, mode, period, page, tag, activeQuery])

  useEffect(() => {
    if (!open || searchComposing) return
    if (!query.trim()) {
      if (activeQuery) {
        setActiveQuery('')
        setPage(1)
      }
      return
    }
    const timer = window.setTimeout(() => submitSearch(), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [open, query, searchComposing])

  if (!open) return null

  const changeMode = (nextMode: NameMcCatalogMode) => {
    setMode(nextMode)
    setPage(1)
    setActiveQuery('')
    setQuery('')
  }

  const clearSearch = () => {
    setQuery('')
    setActiveQuery('')
    setPage(1)
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const openSkin = async (item: NameMcSkinItem) => {
    const skinRequestId = ++skinRequestIdRef.current
    setSelected(item)
    setResolved(null)
    setResolving(true)
    try {
      const next = await window.electron.resolveNameMcSkin(item)
      if (skinRequestId !== skinRequestIdRef.current) return
      setSelected(next)
      setResolved(next)
      setResult((current) => ({
        ...current,
        items: current.items.map((candidate) => candidate.id === next.id
          ? { ...candidate, model: next.model, modelKnown: next.modelKnown, previewUrl: next.previewUrl }
          : candidate)
      }))
    } catch (error: any) {
      if (skinRequestId !== skinRequestIdRef.current) return
      onStatus(`Error: ${error?.message || 'Could not load this skin.'}`)
    } finally {
      if (skinRequestId === skinRequestIdRef.current) setResolving(false)
    }
  }

  const applySkin = async () => {
    if (!selected || applying) return
    setApplying(true)
    try {
      const next = await window.electron.applyNameMcSkin({ accountId, item: selected })
      onApplied(next)
      onStatus(next.warning || text.applied)
      onClose()
    } catch (error: any) {
      onStatus(`Error: ${error?.message || 'Could not apply this skin.'}`)
    } finally {
      setApplying(false)
    }
  }

  const openSource = () => window.electron.openExternal(selected?.sourceUrl || result.sourceUrl)

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !applying) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="namemc-library-title"
        data-testid="namemc-skin-library"
        className="nam-skin-library-dialog flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-blue-400/25 bg-[#091221] shadow-2xl shadow-blue-950/40"
      >
        <header className="nam-skin-library-header flex items-start gap-3 border-b border-slate-800 bg-[linear-gradient(120deg,rgba(37,99,235,0.18),rgba(9,18,33,0.96)_55%)] p-4 sm:p-5">
          <div className="nam-skin-library-mark flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-300/25 bg-blue-500/15 p-2 text-blue-100">
            <img src={NAME_MC_FAVICON_URL} alt="" className="h-full w-full object-contain outline-0" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="namemc-library-title" className="flex flex-wrap items-center gap-2 text-xl font-black text-white sm:text-2xl">
              {text.title}
              <span className="rounded-full border border-red-300/60 bg-red-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-red-950/30">BETA</span>
            </h2>
            <p className="nam-skin-library-subtitle mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-400 sm:text-sm">{text.subtitle}</p>
          </div>
          <button
            type="button"
            disabled={applying}
            onClick={onClose}
            aria-label={language === 'th' ? 'ปิดไลบรารี่สกิน' : 'Close skin library'}
            className="nam-skin-library-close flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>

        {selected ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid min-h-[560px] gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(300px,1.1fr)]">
              <div className="relative min-h-[460px] overflow-hidden rounded-2xl border border-blue-400/20 bg-[radial-gradient(circle_at_50%_28%,rgba(59,130,246,0.23),transparent_42%),#0d1728]">
                {resolving ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-blue-200">
                    <Loader2 size={32} className="animate-spin" />
                    <p className="text-sm font-black">{text.loading}</p>
                  </div>
                ) : resolved?.textureDataUrl ? (
                  <SkinViewer
                    skin={resolved.textureDataUrl}
                    model={resolved.model}
                    controls
                    autoRotate={false}
                    zoom={0.8}
                    className="absolute inset-0"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm font-bold text-slate-500">
                    {result.warning || text.empty}
                  </div>
                )}
                <div className="pointer-events-none absolute bottom-4 left-4">
                  <span className="nam-skin-rotate-badge inline-flex items-center gap-2 rounded-full border border-slate-600/70 bg-slate-950/75 px-3 py-1.5 text-[11px] font-black text-slate-300 backdrop-blur">
                    <Rotate3D size={14} aria-hidden="true" />
                    {text.rotate}
                  </span>
                </div>
                {selected.stars != null && (
                  <span
                    className="nam-skin-star-badge pointer-events-none absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-slate-950/85 px-2.5 py-1.5 text-[11px] font-black text-amber-200 shadow-lg backdrop-blur"
                    aria-label={`${formatStarCount(selected.stars, language)} ${text.stars}`}
                  >
                    <Star size={13} fill="currentColor" aria-hidden="true" />
                    {formatStarCount(selected.stars, language)}
                  </span>
                )}
              </div>

              <div className="flex flex-col justify-center rounded-2xl border border-slate-800 bg-slate-950/30 p-5 sm:p-7">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-blue-400/25 bg-blue-500/10 p-2.5 text-blue-200">
                  <img src={NAME_MC_FAVICON_URL} alt="" className="h-full w-full object-contain outline-0" />
                </div>
                <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">{text.preview}</p>
                <h3 className="mt-2 break-words text-2xl font-black text-white">{selected.name}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase text-slate-300">
                    <Tag size={12} />
                    {selected.kind === 'player' ? 'Minecraft Profile' : 'NameMC'}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase text-slate-300">
                    {selected.modelKnown ? armModelLabel(selected.model) : text.checkingArms}
                  </span>
                  {selected.rank && <span className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-amber-200">#{selected.rank}</span>}
                </div>
                {selected.playerUuid && <p className="mt-4 break-all font-mono text-xs font-semibold text-slate-500">UUID: {selected.playerUuid}</p>}
                <div className="mt-8 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={applying}
                    onClick={() => {
                      skinRequestIdRef.current += 1
                      setSelected(null)
                      setResolved(null)
                      setResolving(false)
                    }}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-4 text-sm font-black text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <ArrowLeft size={16} />
                    {text.back}
                  </button>
                  <button
                    type="button"
                    disabled={applying || resolving || !resolved?.textureDataUrl}
                    onClick={() => void applySkin()}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-black text-white transition-colors hover:bg-blue-400 disabled:cursor-wait disabled:opacity-50"
                  >
                    {applying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {applying ? text.applying : text.apply}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={openSource}
                  className="mt-3 flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-black text-slate-500 transition-colors hover:bg-slate-900 hover:text-blue-200"
                >
                  <ExternalLink size={14} />
                  {text.source}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800 p-4 sm:p-5">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    ref={searchInputRef}
                    data-testid="namemc-skin-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onCompositionStart={() => setSearchComposing(true)}
                    onCompositionEnd={() => setSearchComposing(false)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitSearch()
                    }}
                    maxLength={180}
                    placeholder={text.searchPlaceholder}
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950/55 pl-10 pr-3 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-blue-400/65 focus:ring-2 focus:ring-blue-500/15"
                  />
                </div>
                <button
                  type="button"
                  disabled={loading || !query.trim()}
                  onClick={submitSearch}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-500 px-4 text-xs font-black text-white hover:bg-blue-400 disabled:cursor-wait disabled:opacity-45 sm:text-sm"
                >
                  {loading && query.trim() ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  <span className="hidden sm:inline">{text.search}</span>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={text.title}>
                {modeOptions.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={!activeQuery && mode === id}
                    onClick={() => changeMode(id)}
                    className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-black transition-colors ${!activeQuery && mode === id
                      ? 'border-blue-400/45 bg-blue-500/15 text-blue-100'
                      : 'border-slate-800 bg-slate-950/30 text-slate-500 hover:border-slate-600 hover:text-slate-200'}`}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {text[id]}
                  </button>
                ))}
                {activeQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 text-xs font-black text-emerald-200 hover:bg-emerald-500/15"
                  >
                    <ArrowLeft size={14} />
                    {text.clearSearch}
                  </button>
                )}
              </div>

              {!activeQuery && mode === 'trending' && (
                <div className="mt-3 flex flex-wrap gap-1.5 pl-1">
                  {periods.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setPeriod(item)
                        setPage(1)
                      }}
                      className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${period === item
                        ? 'bg-amber-500/15 text-amber-200'
                        : 'text-slate-600 hover:bg-slate-800 hover:text-slate-300'}`}
                    >
                      {text[item]}
                    </button>
                  ))}
                </div>
              )}

              {!activeQuery && mode === 'tagged' && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600"><Tag size={12} />{text.tagLabel}</span>
                  <button
                    type="button"
                    aria-pressed={!tag}
                    onClick={() => {
                      setTag('')
                      setPage(1)
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black transition-colors ${!tag
                      ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
                      : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-200'}`}
                  >
                    {text.allTags}
                  </button>
                  {TAGS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={tag === item}
                      onClick={() => {
                        setTag((current) => current === item ? '' : item)
                        setPage(1)
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-black transition-colors ${tag === item
                        ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
                        : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-200'}`}
                    >
                      {friendlyTag(item)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {loading ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-blue-200" aria-live="polite">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10">
                    <Loader2 size={30} className="animate-spin" />
                    <Sparkles size={14} className="absolute right-2 top-2 text-violet-300" />
                  </div>
                  <p className="text-sm font-black">{text.loading}</p>
                </div>
              ) : result.items.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {result.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openSkin(item)}
                      className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-950/35 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400/45 hover:bg-blue-500/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(59,130,246,0.18),transparent_48%),#111a2c]">
                        {item.kind === 'player' ? (
                          <StaticSkinPreview
                            skin={item.previewUrl}
                            model={item.model}
                            alt={item.name}
                            className="h-full w-full transition-transform duration-200 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <img
                            src={item.previewUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                          />
                        )}
                        {item.rank && (
                          <span className="absolute left-2 top-2 rounded-md border border-amber-300/25 bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-black text-amber-200 backdrop-blur">#{item.rank}</span>
                        )}
                        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-500/80 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          <Rotate3D size={14} />
                        </span>
                        {item.stars != null && (
                          <span
                            className="nam-skin-star-badge pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md border border-amber-300/30 bg-slate-950/85 px-1.5 py-1 text-[9px] font-black text-amber-200 shadow-lg backdrop-blur"
                            aria-label={`${formatStarCount(item.stars, language)} ${text.stars}`}
                          >
                            <Star size={10} fill="currentColor" aria-hidden="true" />
                            {formatStarCount(item.stars, language)}
                          </span>
                        )}
                        <span className="nam-skin-model-badge pointer-events-none absolute bottom-2 left-2 rounded-md border border-blue-300/25 bg-slate-950/85 px-1.5 py-1 text-[9px] font-black text-blue-100 shadow-lg backdrop-blur">
                          {item.modelKnown ? armModelLabel(item.model) : text.checkingArms}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="break-words text-xs font-black text-slate-100">{item.name}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-blue-300">
                          {item.kind === 'player'
                            ? <Tag size={10} />
                            : <img src={NAME_MC_FAVICON_URL} alt="" className="h-3 w-3 object-contain outline-0" />}
                          {item.kind === 'player' ? 'Minecraft' : 'NameMC'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center p-6 text-center">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${result.blocked ? 'border-amber-400/25 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-500'}`}>
                    {result.blocked ? <ShieldAlert size={25} /> : <Search size={25} />}
                  </div>
                  <h3 className="mt-4 text-lg font-black text-slate-100">{result.blocked ? text.fallbackTitle : text.empty}</h3>
                  <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">{result.warning || (result.blocked ? text.fallbackBody : text.empty)}</p>
                  {result.blocked && <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-blue-300">{text.fallbackBody}</p>}
                  <button
                    type="button"
                    onClick={() => window.electron.openExternal(result.sourceUrl)}
                    className="mt-5 flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-black text-slate-200 hover:border-blue-400/45 hover:text-blue-200"
                  >
                    <ExternalLink size={14} />
                    {text.source}
                  </button>
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/25 px-4 py-3 sm:px-5">
              <button
                type="button"
                disabled={loading || page <= 1 || Boolean(activeQuery)}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-black text-slate-300 hover:border-blue-400/45 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ArrowLeft size={14} />
                <span className="hidden sm:inline">{text.previous}</span>
              </button>
              <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-[11px] font-black text-slate-400">{text.page} {page}</span>
              <button
                type="button"
                disabled={loading || !result.hasNext || Boolean(activeQuery)}
                onClick={() => setPage((value) => Math.min(100, value + 1))}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-black text-slate-300 hover:border-blue-400/45 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <span className="hidden sm:inline">{text.next}</span>
                <ArrowRight size={14} />
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
