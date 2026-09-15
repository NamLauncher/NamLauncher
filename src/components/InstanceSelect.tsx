// Author/creator: nattapat2871 (https://nattapat2871.me)
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type InstanceSelectOption = {
  value: string
  label: string
  detail?: string
}

type InstanceSelectProps = {
  label: string
  value: string
  options: readonly InstanceSelectOption[]
  onChange: (value: string) => void
  onOpen?: () => void
  renderIcon?: (value: string) => ReactNode
  disabled?: boolean
  testId?: string
  compact?: boolean
  className?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
}

const getDetailTone = (detail?: string) => {
  const normalized = String(detail || '').trim().toLowerCase()
  if (normalized === 'stable' || normalized === 'recommended') return 'stable'
  if (normalized === 'unstable' || normalized === 'beta' || normalized === 'snapshot') return 'unstable'
  if (normalized === 'installed' || normalized === 'latest') return 'installed'
  return 'neutral'
}

const getDetailToneClass = (tone: ReturnType<typeof getDetailTone>) => {
  if (tone === 'stable') return 'border-emerald-300/35 bg-emerald-400/12 text-emerald-200'
  if (tone === 'unstable') return 'border-amber-300/40 bg-amber-400/14 text-amber-200'
  if (tone === 'installed') return 'border-sky-300/35 bg-sky-400/12 text-sky-200'
  return 'border-slate-600/70 bg-slate-800/75 text-slate-400'
}

const MENU_GAP = 6
const MENU_MARGIN = 8
const MENU_MAX_HEIGHT = 320
const MENU_MIN_HEIGHT = 132

export function InstanceSelect({
  label,
  value,
  options,
  onChange,
  onOpen,
  renderIcon,
  disabled = false,
  testId,
  compact = false,
  className = ''
}: InstanceSelectProps) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeaheadRef = useRef({ value: '', at: 0 })
  const shouldScrollActiveRef = useRef(true)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selectedOption = options[selectedIndex]
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)

  const positionMenu = () => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const optionHeight = compact ? 40 : 46
    const desiredHeight = Math.min(MENU_MAX_HEIGHT, Math.max(MENU_MIN_HEIGHT, options.length * optionHeight + 8))
    const below = Math.max(0, window.innerHeight - rect.bottom - MENU_MARGIN - MENU_GAP)
    const above = Math.max(0, rect.top - MENU_MARGIN - MENU_GAP)
    const openAbove = below < Math.min(desiredHeight, 200) && above > below
    const availableHeight = openAbove ? above : below
    const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(desiredHeight, availableHeight))
    const top = openAbove
      ? Math.max(MENU_MARGIN, rect.top - maxHeight - MENU_GAP)
      : Math.min(window.innerHeight - MENU_MARGIN - maxHeight, rect.bottom + MENU_GAP)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const measuredTextWidth = options.reduce((largest, option) => {
      if (!context) return largest
      context.font = '900 14px system-ui, sans-serif'
      const labelWidth = context.measureText(option.label).width
      context.font = '600 10px system-ui, sans-serif'
      const detailWidth = option.detail ? context.measureText(option.detail).width : 0
      return Math.max(largest, labelWidth, detailWidth)
    }, 0)
    const decorationWidth = 32 + (renderIcon ? 36 : 0) + 22
    const viewportWidth = Math.max(1, window.innerWidth - MENU_MARGIN * 2)
    const width = Math.min(viewportWidth, Math.max(rect.width, Math.ceil(measuredTextWidth + decorationWidth)))
    const left = Math.max(MENU_MARGIN, Math.min(rect.left, window.innerWidth - width - MENU_MARGIN))
    setMenuPosition({
      top: Math.max(MENU_MARGIN, top),
      left,
      width,
      maxHeight
    })
  }

  useEffect(() => {
    if (!open) return
    positionMenu()
    const reposition = () => positionMenu()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!shouldScrollActiveRef.current) return
    const option = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
    if (!option) return
    shouldScrollActiveRef.current = false
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, menuPosition])

  useEffect(() => {
    if (!open) setActiveIndex(selectedIndex)
  }, [open, selectedIndex])

  const showMenu = () => {
    if (disabled || options.length === 0) return
    onOpen?.()
    shouldScrollActiveRef.current = true
    setActiveIndex(selectedIndex)
    setOpen(true)
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    setOpen(false)
    if (option.value !== value) onChange(option.value)
    window.requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const moveActive = (index: number, ensureVisible = true) => {
    if (options.length === 0) return
    shouldScrollActiveRef.current = ensureVisible
    setActiveIndex(Math.max(0, Math.min(options.length - 1, index)))
  }

  const moveActiveFromPointer = (index: number) => {
    moveActive(index, false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
      }
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(activeIndex)
      else showMenu()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        showMenu()
        moveActive(selectedIndex + (event.key === 'ArrowDown' ? 1 : -1))
      } else {
        moveActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1))
      }
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!open) showMenu()
      moveActive(event.key === 'Home' ? 0 : options.length - 1)
      return
    }
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault()
      if (!open) showMenu()
      moveActive(activeIndex + (event.key === 'PageDown' ? 8 : -8))
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      const prefix = now - typeaheadRef.current.at < 650
        ? `${typeaheadRef.current.value}${event.key}`
        : event.key
      typeaheadRef.current = { value: prefix.toLocaleLowerCase(), at: now }
      const match = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(typeaheadRef.current.value))
      if (match >= 0) {
        event.preventDefault()
        if (!open) showMenu()
        moveActive(match)
      }
    }
  }

  const menu = open && menuPosition && createPortal(
    <div
      ref={listRef}
      id={`${id}-list`}
      role="listbox"
      aria-labelledby={`${id}-label`}
      data-testid={testId ? `${testId}-listbox` : undefined}
      className="nam-instance-select-menu fixed z-[90] overscroll-contain overflow-y-auto rounded-xl border border-slate-600/80 bg-[#101a2c] p-1.5 shadow-2xl shadow-black/60 outline-none"
      style={menuPosition}
    >
      {options.map((option, index) => {
        const detailTone = getDetailTone(option.detail)
        return (
        <button
          key={option.value}
          id={`${id}-option-${index}`}
          type="button"
          role="option"
          tabIndex={-1}
          aria-selected={selectedIndex === index}
          data-option-index={index}
          data-active={activeIndex === index}
          onPointerDown={(event) => event.preventDefault()}
          onPointerMove={() => moveActiveFromPointer(index)}
          onClick={() => choose(index)}
          className={`nam-instance-select-option flex w-full items-center gap-3 rounded-lg px-2.5 text-left outline-none transition-colors ${compact ? 'min-h-10 py-1.5' : 'min-h-11 py-2'} ${
            activeIndex === index ? 'bg-blue-500/20 text-white' : 'text-slate-300 hover:bg-slate-800/80'
          }`}
        >
          {renderIcon && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
              {renderIcon(option.value)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block whitespace-normal break-words text-sm font-black">{option.label}</span>
            {option.detail && (
              <span
                data-tone={detailTone}
                className={`nam-instance-select-detail mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${getDetailToneClass(detailTone)}`}
              >
                {option.detail}
              </span>
            )}
          </span>
          {selectedIndex === index && <Check size={16} aria-hidden="true" className="nam-instance-select-check shrink-0 text-blue-300" />}
        </button>
        )
      })}
    </div>,
    document.body
  )

  return (
    <div className={`min-w-0 ${compact ? 'space-y-1' : 'space-y-2'} ${className}`.trim()}>
      <span id={`${id}-label`} className={`block font-black uppercase text-slate-500 ${compact ? 'text-[10px] tracking-[0.12em]' : 'text-xs tracking-[0.16em]'}`}>
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        disabled={disabled || options.length === 0}
        data-testid={testId}
        onClick={() => open ? setOpen(false) : showMenu()}
        onKeyDown={onKeyDown}
        className={`flex min-h-10 w-full items-center gap-3 border border-slate-700 bg-slate-950/55 px-3 py-2 text-left font-black text-slate-100 outline-none transition-colors hover:border-slate-500 hover:bg-slate-950/75 focus-visible:border-blue-400/70 focus-visible:ring-2 focus-visible:ring-blue-400/40 disabled:cursor-not-allowed disabled:opacity-55 ${compact ? 'rounded-md text-xs' : 'rounded-lg text-sm'}`}
      >
        {renderIcon && selectedOption && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
            {renderIcon(selectedOption.value)}
          </span>
        )}
        <span id={`${id}-value`} className="min-w-0 flex-1 whitespace-normal break-words">{selectedOption?.label || value || '—'}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {menu}
    </div>
  )
}
