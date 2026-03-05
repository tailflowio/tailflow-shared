<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EventRow } from '../types/events'
import { typeColor, typeHex } from '../constants/colors'
import JsonView from './JsonView.vue'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  events: EventRow[]
  total?: number
  loading?: boolean
  hasMore?: boolean
  serverSide?: boolean
  eventTypes?: string[]
  initialSortAsc?: boolean
  showContext?: boolean
  fillHeight?: boolean
  executionLinkPrefix?: string
  showDateFilter?: boolean
  showExport?: boolean
  exportStatus?: 'idle' | 'processing' | 'ready' | 'failed'
}>(), {
  loading: false,
  hasMore: false,
  serverSide: false,
  initialSortAsc: false,
  showContext: false,
  fillHeight: false,
  executionLinkPrefix: '/executions/',
  showDateFilter: false,
  showExport: false,
  exportStatus: 'idle',
})

const emit = defineEmits<{
  'load-more': []
  'search': [query: string]
  'sort': [ascending: boolean]
  'filter': [types: string[]]
  'date-range': [from: string | null, to: string | null]
  'export': []
}>()

const search = ref('')
const sortAsc = ref(props.initialSortAsc)
const activeFilters = ref<Set<string>>(new Set())

const rootEl = ref<HTMLElement>()
const scrollEl = ref<HTMLElement>()
const maxH = ref('400px')
const rootH = ref('auto')

// --------------- column visibility ---------------

type ColumnKey = 'timestamp' | 'workflow' | 'execution' | 'type' | 'step' | 'message'

interface ColumnDef {
  key: ColumnKey
  label: string
  contextOnly?: boolean
}

const allColumns: ColumnDef[] = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'workflow', label: 'Workflow', contextOnly: true },
  { key: 'execution', label: 'Execution', contextOnly: true },
  { key: 'type', label: 'Type' },
  { key: 'step', label: 'Step' },
  { key: 'message', label: 'Message' },
]

const STORAGE_KEY = 'tailflow-event-columns'

function loadColumnPrefs(): Set<ColumnKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as ColumnKey[])
  } catch { /* ignore */ }
  return new Set<ColumnKey>(['timestamp', 'type', 'step', 'message'])
}

const visibleColumns = ref<Set<ColumnKey>>(loadColumnPrefs())
const showColumnMenu = ref(false)

function toggleColumn(key: ColumnKey) {
  const s = new Set(visibleColumns.value)
  if (s.has(key)) { if (s.size > 1) s.delete(key) }
  else s.add(key)
  visibleColumns.value = s
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
}

function isColVisible(key: ColumnKey): boolean {
  if (key === 'workflow' || key === 'execution') {
    return props.showContext && visibleColumns.value.has(key)
  }
  return visibleColumns.value.has(key)
}

const availableColumns = computed(() =>
  allColumns.filter(c => !c.contextOnly || props.showContext)
)

const firstVisibleCol = computed(() =>
  allColumns.find(c => isColVisible(c.key))?.key || 'timestamp'
)

function cellStyle(key: ColumnKey): Record<string, string> {
  return key === firstVisibleCol.value ? { paddingLeft: '1.25rem' } : {}
}

// Inline chip styles from typeHex — avoids Tailwind purge issues for violet/sky
function chipStyle(type: string): Record<string, string> {
  const hex = typeHex[type]
  if (!hex) return {}
  return { backgroundColor: hex + '26', color: hex, borderColor: hex + '4D' }
}

function chipStyleDimmed(type: string): Record<string, string> {
  const hex = typeHex[type]
  if (!hex) return { opacity: '0.4' }
  return { color: hex, opacity: '0.35' }
}

// Compact label for filter pills
function chipLabel(type: string): string {
  if (type.startsWith('workflow.')) return 'wf.' + type.slice(9)
  if (type.startsWith('step.')) return type.slice(5)
  return type
}

// SVG icon paths for event type pills
const typeIcon: Record<string, string> = {
  'workflow.started':   'M5 3l14 9-14 9V3z',                              // play
  'workflow.completed': 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3', // check-circle
  'step.started':       'M13 2L3 14h9l-1 8 10-12h-9l1-8z',               // zap
  'step.completed':     'M20 6L9 17l-5-5',                                // check
  'step.failed':        'M18 6L6 18M6 6l12 12',                           // x
  'step.skipped':       'M5 4l10 8-10 8V4zM19 5v14',                      // skip-forward
  'step.log':           'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 12.5A2.5 2.5 0 0 1 6.5 10H20M4 5.5A2.5 2.5 0 0 1 6.5 3H20', // list
  'step.waiting':       'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2', // clock
  'step.input':         'M12 5v14M5 12l7 7 7-7',                          // arrow-down
  'step.output':        'M12 19V5M5 12l7-7 7 7',                          // arrow-up
  'step.goto':          'M5 12h14M13 5l7 7-7 7',                          // arrow-right
  'metrics':            'M18 20V10M12 20V4M6 20v-6',                      // bar-chart
}

// Close column menu on click outside
function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-col-menu]')) showColumnMenu.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

// --------------- auto-height ---------------

function recalcHeight() {
  if (props.fillHeight) {
    if (!rootEl.value) return
    const top = rootEl.value.getBoundingClientRect().top
    const h = window.innerHeight - top - 24
    rootH.value = `${Math.max(h, 400)}px`
  } else {
    if (!scrollEl.value) return
    const top = scrollEl.value.getBoundingClientRect().top
    const h = window.innerHeight - top - 24
    maxH.value = `${Math.max(h, 400)}px`
  }
}

onMounted(async () => {
  await nextTick()
  recalcHeight()
  window.addEventListener('resize', recalcHeight)
  // Initial fill check — watchers won't fire if data is already loaded before mount
  nextTick(checkFillNeeded)
})

onUnmounted(() => {
  window.removeEventListener('resize', recalcHeight)
})

watch(() => props.events.length, (n, o) => {
  if (o === 0 && n > 0) nextTick(recalcHeight)
})

// --------------- types / filters ---------------

const allTypes = computed(() => {
  if (props.serverSide && props.eventTypes) return [...props.eventTypes].sort()
  const s = new Set<string>()
  for (const e of props.events) s.add(e.event_type)
  return [...s].sort()
})

function toggleFilter(type: string) {
  const s = new Set(activeFilters.value)
  if (s.has(type)) s.delete(type)
  else s.add(type)
  activeFilters.value = s
  if (props.serverSide) emit('filter', [...s])
}

function clearFilters() {
  activeFilters.value = new Set()
  if (props.serverSide) emit('filter', [])
}

// --------------- date filter ---------------

type DatePreset = 'all' | '5m' | '15m' | '1h' | '6h' | '24h' | '7d' | 'custom'

const datePresets: { key: DatePreset; label: string; ms: number }[] = [
  { key: 'all', label: 'All', ms: 0 },
  { key: '5m', label: '5m', ms: 5 * 60_000 },
  { key: '15m', label: '15m', ms: 15 * 60_000 },
  { key: '1h', label: '1h', ms: 60 * 60_000 },
  { key: '6h', label: '6h', ms: 6 * 60 * 60_000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60_000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60_000 },
]

const activeDatePreset = ref<DatePreset>('all')
const showDateMenu = ref(false)
const customFrom = ref('')
const customTo = ref('')

function toLocalInput(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function selectDatePreset(key: DatePreset) {
  activeDatePreset.value = key
  showDateMenu.value = false
  if (key === 'custom') return
  emitDateRange()
}

function applyCustomRange() {
  activeDatePreset.value = 'custom'
  showDateMenu.value = false
  emitDateRange()
}

function emitDateRange() {
  if (!props.serverSide) return
  const range = computedDateRange.value
  emit('date-range', range.from?.toISOString() ?? null, range.to?.toISOString() ?? null)
}

const computedDateRange = computed<{ from: Date | null; to: Date | null }>(() => {
  if (activeDatePreset.value === 'all') return { from: null, to: null }
  if (activeDatePreset.value === 'custom') {
    return {
      from: customFrom.value ? new Date(customFrom.value) : null,
      to: customTo.value ? new Date(customTo.value) : null,
    }
  }
  const preset = datePresets.find(p => p.key === activeDatePreset.value)
  if (!preset) return { from: null, to: null }
  return { from: new Date(Date.now() - preset.ms), to: null }
})

const dateFilterLabel = computed(() => {
  if (activeDatePreset.value === 'all') return t('shared.events.dateAll')
  if (activeDatePreset.value === 'custom') return t('shared.events.dateCustom')
  return activeDatePreset.value
})

// Close date menu on outside click
function onDocClickDate(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-date-menu]')) showDateMenu.value = false
}
onMounted(() => document.addEventListener('click', onDocClickDate))
onUnmounted(() => document.removeEventListener('click', onDocClickDate))

// --------------- search / sort ---------------

function onSearchInput() {
  if (props.serverSide) emit('search', search.value)
}

function toggleSort() {
  sortAsc.value = !sortAsc.value
  if (props.serverSide) emit('sort', sortAsc.value)
}

// --------------- display ---------------

const CLIENT_PAGE_SIZE = 50
const clientLimit = ref(CLIENT_PAGE_SIZE)

const allFilteredEvents = computed(() => {
  if (props.serverSide) return props.events

  let list = props.events

  // Date filter (client-side)
  if (props.showDateFilter && activeDatePreset.value !== 'all') {
    const { from, to } = computedDateRange.value
    list = list.filter(e => {
      const ts = new Date(e.event_timestamp).getTime()
      if (from && ts < from.getTime()) return false
      if (to && ts > to.getTime()) return false
      return true
    })
  }

  if (activeFilters.value.size > 0) {
    list = list.filter(e => activeFilters.value.has(e.event_type))
  }

  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(e =>
      e.message.toLowerCase().includes(q) ||
      e.step_id.toLowerCase().includes(q) ||
      e.event_type.toLowerCase().includes(q) ||
      e.execution_id.toLowerCase().includes(q) ||
      (e.workflow_name && e.workflow_name.toLowerCase().includes(q))
    )
  }

  const hasSeq = list.length > 0 && list[0].seq != null
  const sorted = [...list].sort((a, b) => {
    if (hasSeq) {
      return (a.seq ?? 0) - (b.seq ?? 0)
    }
    return new Date(a.event_timestamp).getTime() - new Date(b.event_timestamp).getTime()
  })
  return sortAsc.value ? sorted : sorted.reverse()
})

const displayEvents = computed(() => {
  if (props.serverSide) return allFilteredEvents.value
  return allFilteredEvents.value.slice(0, clientLimit.value)
})

const clientHasMore = computed(() =>
  !props.serverSide && clientLimit.value < allFilteredEvents.value.length
)

// Reset client pagination on filter/sort/search changes
watch([search, sortAsc, activeFilters, activeDatePreset], () => {
  clientLimit.value = CLIENT_PAGE_SIZE
})

const displayCount = computed(() =>
  props.serverSide ? displayRows.value.length : displayRows.value.length
)

const displayTotal = computed(() => {
  if (props.serverSide && props.total != null) return props.total
  if (!props.serverSide) return allFilteredEvents.value.length
  return props.events.length
})

// --------------- infinite scroll ---------------

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
    if (props.serverSide && props.hasMore && !props.loading) {
      emit('load-more')
    } else if (clientHasMore.value) {
      clientLimit.value += CLIENT_PAGE_SIZE
    }
  }
}

function checkFillNeeded() {
  if (!scrollEl.value || !props.serverSide || !props.hasMore || props.loading) return
  // Wait for full DOM paint before measuring
  requestAnimationFrame(() => {
    if (!scrollEl.value || props.loading || !props.hasMore) return
    const el = scrollEl.value
    if (el.scrollHeight <= el.clientHeight + 50) {
      emit('load-more')
    }
  })
}

watch(() => props.events.length, () => {
  nextTick(checkFillNeeded)
})

watch(() => props.loading, (loading) => {
  if (!loading) nextTick(checkFillNeeded)
})


// --------------- expose for live-event auto-scroll ---------------

function scrollToBottom() {
  if (!scrollEl.value) return
  scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}

function isAtBottom(): boolean {
  if (!scrollEl.value) return false
  const el = scrollEl.value
  return el.scrollHeight - el.scrollTop - el.clientHeight < 50
}

defineExpose({ scrollToBottom, isAtBottom, recalcHeight })

// --------------- formatting ---------------

function formatDateTime(ts: string): string {
  const d = new Date(ts)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

// --------------- execution id avatar ---------------

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function execColors(id: string): [string, string] {
  const h1 = hashCode(id) % 360
  const h2 = (h1 + 40 + (hashCode(id + 'x') % 80)) % 360
  return [`hsl(${h1}, 70%, 60%)`, `hsl(${h2}, 70%, 50%)`]
}

// --------------- stream grouping ---------------

interface DisplayRow {
  event: EventRow
  streamBlock?: string   // combined messages for stream groups (monospace)
  streamCount?: number   // how many lines were merged
}

function isStreamEvent(e: EventRow): boolean {
  if (e.event_type !== 'step.log') return false
  // Check stream flag in data
  if (e.data) {
    try {
      const d = JSON.parse(e.data)
      if (d?.stream) return true
    } catch { /* ignore */ }
  }
  // Fallback: detect ASCII table lines (borders or data rows)
  const m = e.message
  return /^[+|][-+|]/.test(m)
}

const displayRows = computed<DisplayRow[]>(() => {
  const events = displayEvents.value
  const rows: DisplayRow[] = []
  let i = 0

  while (i < events.length) {
    const ev = events[i]

    if (isStreamEvent(ev)) {
      const lines: string[] = [ev.message]
      let j = i + 1
      while (j < events.length) {
        const next = events[j]
        if (next.step_id === ev.step_id && isStreamEvent(next)) {
          lines.push(next.message)
          j++
        } else {
          break
        }
      }

      if (lines.length > 1) {
        // If sorted DESC, lines are reversed — restore natural order
        const block = sortAsc.value ? lines.join('\n') : lines.reverse().join('\n')
        const anchor = sortAsc.value ? ev : events[j - 1]
        rows.push({ event: anchor, streamBlock: block, streamCount: lines.length })
      } else {
        rows.push({ event: ev })
      }
      i = j
    } else {
      rows.push({ event: ev })
      i++
    }
  }

  return rows
})

// Re-check when stream grouping reduces visible rows
watch(() => displayRows.value.length, () => {
  nextTick(checkFillNeeded)
})

// --------------- intelligent data rendering ---------------

interface ParsedData {
  kind: 'goto' | 'waiting' | 'failed' | 'log-level' | 'completed' | 'json' | 'empty'
  label?: string
  labelStyle?: Record<string, string>
  badgeStyle?: Record<string, string>
  json?: string
  parsed?: Record<string, unknown>
}

function badgeStyleFromHex(hex: string): Record<string, string> {
  return { backgroundColor: hex + '26', color: hex }
}

function parseEventData(event: EventRow): ParsedData {
  if (!event.data || event.data === '' || event.data === '{}' || event.data === 'null') {
    return { kind: 'empty' }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(event.data)
  } catch {
    return { kind: 'empty' }
  }

  if (event.event_type === 'step.goto') {
    const target = parsed.target as string || '?'
    const iteration = parsed.iteration as number || 0
    const maxIterations = parsed.max_iterations as number || 0
    return {
      kind: 'goto',
      label: `${target} ${iteration}/${maxIterations}`,
      badgeStyle: badgeStyleFromHex(typeHex['step.goto'] || '#fbbf24'),
      parsed,
    }
  }

  if (event.event_type === 'step.waiting') {
    const waitType = parsed.wait_type as string || 'unknown'
    return {
      kind: 'waiting',
      label: `\u23f3 ${waitType}`,
      badgeStyle: badgeStyleFromHex(typeHex['step.waiting'] || '#fbbf24'),
      parsed,
    }
  }

  if (event.event_type === 'step.failed') {
    const error = parsed.error as string | undefined
    if (error) {
      return { kind: 'failed', label: error, labelStyle: { color: typeHex['step.failed'] || '#f87171' }, parsed }
    }
  }

  if (event.event_type === 'step.log' && parsed.level) {
    const level = (parsed.level as string).toLowerCase()
    const hex = level === 'error' ? '#f87171' : level === 'warn' ? '#fbbf24' : '#38bdf8'
    return { kind: 'log-level', label: level.toUpperCase(), badgeStyle: badgeStyleFromHex(hex), parsed }
  }

  if (event.event_type === 'workflow.completed') {
    const status = parsed.status as string || 'unknown'
    const isSuccess = status === 'success'
    const hex = isSuccess ? (typeHex['step.completed'] || '#34d399') : (typeHex['step.failed'] || '#f87171')
    return {
      kind: 'completed',
      label: isSuccess ? '\u2713 success' : '\u2717 ' + status,
      badgeStyle: badgeStyleFromHex(hex),
      parsed,
    }
  }

  return { kind: 'json', json: event.data, parsed }
}

// --------------- slide-over detail panel ---------------

const selectedEvent = ref<EventRow | null>(null)
const selectedParsed = ref<ParsedData | null>(null)
const selectedStreamBlock = ref<string | null>(null)

function openDetail(event: EventRow, streamBlock?: string) {
  selectedEvent.value = event
  selectedParsed.value = parseEventData(event)
  selectedStreamBlock.value = streamBlock || null
}

function closeDetail() {
  selectedEvent.value = null
  selectedParsed.value = null
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeDetail()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

const copiedDetail = ref(false)
async function copyDetailJson() {
  if (!selectedParsed.value?.parsed) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(selectedParsed.value.parsed, null, 2))
    copiedDetail.value = true
    setTimeout(() => { copiedDetail.value = false }, 1500)
  } catch { /* ignore */ }
}

function isSelectedRow(event: EventRow): boolean {
  return selectedEvent.value === event
}
</script>

<template>
  <div
    ref="rootEl"
    class="bg-g-2 border border-g-5 rounded-lg relative overflow-hidden"
    :class="fillHeight ? 'flex flex-col' : ''"
    :style="fillHeight ? { height: rootH } : {}"
  >
    <!-- Toolbar -->
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-g-5 flex-wrap shrink-0">
      <div class="relative flex items-center">
        <svg class="absolute left-2.5 w-3.5 h-3.5 text-g-7 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          v-model="search"
          @input="onSearchInput"
          type="text"
          :placeholder="t('shared.events.searchPlaceholder')"
          maxlength="200"
          class="pl-8 pr-3 py-1.5 text-xs bg-g-3 border border-g-5 rounded-md text-g-12 placeholder:text-g-7 focus:outline-none focus:border-g-8 w-52"
        />
      </div>
      <button
        @click="toggleSort"
        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-g-9 bg-g-3 border border-g-5 rounded-md hover:border-g-7 transition-colors cursor-pointer"
      >
        <svg class="w-3 h-3" :class="sortAsc ? '' : 'rotate-180'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
        {{ sortAsc ? t('shared.events.oldestFirst') : t('shared.events.newestFirst') }}
      </button>

      <!-- Date filter -->
      <div v-if="showDateFilter" class="relative" data-date-menu>
        <button
          @click.stop="showDateMenu = !showDateMenu"
          class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-g-9 bg-g-3 border border-g-5 rounded-md hover:border-g-7 transition-colors cursor-pointer"
          :class="activeDatePreset !== 'all' ? 'border-sky-500/50 text-sky-400' : ''"
        >
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {{ dateFilterLabel }}
        </button>
        <div
          v-if="showDateMenu"
          class="absolute top-full left-0 mt-1 bg-g-3 border border-g-5 rounded-md shadow-lg z-50 py-1 min-w-[200px]"
        >
          <!-- Presets -->
          <button
            v-for="preset in datePresets"
            :key="preset.key"
            @click="selectDatePreset(preset.key)"
            class="w-full text-left px-3 py-1.5 text-xs hover:bg-g-4 cursor-pointer transition-colors"
            :class="activeDatePreset === preset.key ? 'text-sky-400' : 'text-g-11'"
          >{{ preset.label === 'All' ? t('shared.events.dateAll') : preset.label }}</button>
          <!-- Custom separator -->
          <div class="border-t border-g-5 my-1" />
          <button
            @click="activeDatePreset = 'custom'"
            class="w-full text-left px-3 py-1.5 text-xs hover:bg-g-4 cursor-pointer transition-colors"
            :class="activeDatePreset === 'custom' ? 'text-sky-400' : 'text-g-11'"
          >{{ t('shared.events.dateCustom') }}</button>
          <!-- Custom inputs -->
          <div v-if="activeDatePreset === 'custom'" class="px-3 py-2 flex flex-col gap-2">
            <div>
              <label class="text-[10px] text-g-7 uppercase tracking-wider">{{ t('shared.events.dateFrom') }}</label>
              <input
                v-model="customFrom"
                type="datetime-local"
                class="mt-0.5 w-full px-2 py-1 text-xs bg-g-4 border border-g-5 rounded text-g-12 focus:outline-none focus:border-g-8"
              />
            </div>
            <div>
              <label class="text-[10px] text-g-7 uppercase tracking-wider">{{ t('shared.events.dateTo') }}</label>
              <input
                v-model="customTo"
                type="datetime-local"
                class="mt-0.5 w-full px-2 py-1 text-xs bg-g-4 border border-g-5 rounded text-g-12 focus:outline-none focus:border-g-8"
              />
            </div>
            <button
              @click="applyCustomRange"
              class="px-2 py-1 text-xs bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30 transition-colors cursor-pointer"
            >{{ t('shared.events.dateApply') }}</button>
          </div>
        </div>
      </div>

      <!-- Column toggle menu -->
      <div class="relative" data-col-menu>
        <button
          @click.stop="showColumnMenu = !showColumnMenu"
          class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-g-9 bg-g-3 border border-g-5 rounded-md hover:border-g-7 transition-colors cursor-pointer"
          title="Toggle columns"
        >
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          {{ t('shared.events.columns') }}
        </button>
        <div
          v-if="showColumnMenu"
          class="absolute top-full left-0 mt-1 bg-g-3 border border-g-5 rounded-md shadow-lg z-50 py-1 min-w-[140px]"
        >
          <label
            v-for="col in availableColumns"
            :key="col.key"
            class="flex items-center gap-2 px-3 py-1.5 text-xs text-g-11 hover:bg-g-4 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              :checked="visibleColumns.has(col.key)"
              @change="toggleColumn(col.key)"
              class="rounded border-g-6 bg-g-4 text-sky-500 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer"
            />
            {{ col.label }}
          </label>
        </div>
      </div>

      <span class="text-[11px] font-mono text-g-8 ml-auto">{{ formatNumber(displayCount) }}<span v-if="displayCount !== displayTotal"> / {{ formatNumber(displayTotal) }}</span> {{ t('shared.events.events') }}</span>

      <!-- Export button -->
      <button
        v-if="showExport"
        @click="emit('export')"
        :disabled="exportStatus === 'processing'"
        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-g-9 bg-g-3 border border-g-5 rounded-md hover:border-g-7 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg v-if="exportStatus === 'processing'" class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" class="opacity-25"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="opacity-75"/></svg>
        <svg v-else class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        {{ exportStatus === 'processing' ? t('shared.events.exporting') : 'CSV' }}
      </button>
    </div>

    <!-- Filters -->
    <div v-if="allTypes.length > 1" class="flex items-center gap-1.5 px-3 py-2 border-b border-g-5 flex-wrap shrink-0">
      <button
        v-for="type in allTypes"
        :key="type"
        @click="toggleFilter(type)"
        class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono rounded-full transition-all cursor-pointer"
        :style="activeFilters.size === 0 || activeFilters.has(type) ? chipStyle(type) : chipStyleDimmed(type)"
      >
        <svg v-if="typeIcon[type]" class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="typeIcon[type]" /></svg>
        {{ chipLabel(type) }}
      </button>
      <button
        v-if="activeFilters.size > 0"
        @click="clearFilters"
        class="px-2 py-0.5 text-[11px] text-g-8 hover:text-g-11 transition-colors cursor-pointer"
      >{{ t('shared.events.clear') }}</button>
    </div>

    <!-- Slot between filters and log lines (e.g. histogram) -->
    <div class="shrink-0">
      <slot name="before-logs" />
    </div>

    <!-- Log lines -->
    <div
      ref="scrollEl"
      class="overflow-y-auto"
      :class="fillHeight ? 'flex-1 min-h-0' : ''"
      :style="fillHeight ? {} : { maxHeight: maxH }"
      @scroll="onScroll"
    >
      <table class="w-full table-fixed">
        <colgroup>
          <col style="width: 3px" />
          <col v-if="isColVisible('timestamp')" style="width: 210px" />
          <col v-if="isColVisible('workflow')" style="width: 130px" />
          <col v-if="isColVisible('execution')" style="width: 90px" />
          <col v-if="isColVisible('type')" style="width: 145px" />
          <col v-if="isColVisible('step')" style="width: 120px" />
          <col v-if="isColVisible('message')" />
        </colgroup>
        <thead class="sticky top-0 z-10" style="background: var(--g-2)">
          <tr style="box-shadow: 0 1px 0 var(--g-5)">
            <th class="!p-0" aria-hidden="true" />
            <th v-if="isColVisible('timestamp')" :style="cellStyle('timestamp')" class="px-2 py-2 pr-2 text-[11px] text-g-8 font-medium text-left uppercase tracking-wider">{{ t('shared.events.timestamp') }}</th>
            <th v-if="isColVisible('workflow')" :style="cellStyle('workflow')" class="px-2 py-2 pr-2 text-[11px] text-g-8 font-medium text-left uppercase tracking-wider">{{ t('shared.events.workflow') }}</th>
            <th v-if="isColVisible('execution')" :style="cellStyle('execution')" class="px-2 py-2 pr-2 text-[11px] text-g-8 font-medium text-left uppercase tracking-wider">{{ t('shared.events.execution') }}</th>
            <th v-if="isColVisible('type')" :style="cellStyle('type')" class="px-2 py-2 pr-2 text-[11px] text-g-8 font-medium text-left uppercase tracking-wider">{{ t('shared.events.type') }}</th>
            <th v-if="isColVisible('step')" :style="cellStyle('step')" class="px-2 py-2 pr-2 text-[11px] text-g-8 font-medium text-left uppercase tracking-wider">{{ t('shared.events.step') }}</th>
            <th v-if="isColVisible('message')" :style="cellStyle('message')" class="px-2 py-2 pr-2 text-[11px] text-g-8 font-medium text-left uppercase tracking-wider">{{ t('shared.events.message') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in displayRows"
            :key="i"
            class="transition-colors cursor-pointer"
            :class="isSelectedRow(row.event) ? 'bg-sky-500/8' : 'hover:bg-g-3/50'"
            @click="openDetail(row.event, row.streamBlock)"
          >
            <td class="w-[3px] !p-0 relative" aria-hidden="true"><span class="absolute inset-0" :style="{ backgroundColor: typeHex[row.event.event_type] || 'var(--g-6)' }" /></td>
            <td v-if="isColVisible('timestamp')" :style="cellStyle('timestamp')" class="px-2 py-1.5 pr-2 text-[11px] font-mono text-g-7 truncate">{{ formatDateTime(row.event.event_timestamp) }}</td>
            <td v-if="isColVisible('workflow')" :style="cellStyle('workflow')" class="px-2 py-1.5 pr-2 text-[11px] font-mono text-g-9 truncate">{{ row.event.workflow_name || '-' }}</td>
            <td v-if="isColVisible('execution')" :style="cellStyle('execution')" class="px-2 py-1.5 pr-2 text-[11px] font-mono text-g-9 truncate">
              <span v-if="row.event.execution_id" class="inline-flex items-center gap-1.5">
                <span class="inline-block w-3 h-3 rounded-sm shrink-0" :style="{ background: `linear-gradient(135deg, ${execColors(row.event.execution_id)[0]}, ${execColors(row.event.execution_id)[1]})` }" />
                {{ row.event.execution_id.slice(0, 8) }}
              </span>
              <span v-else>-</span>
            </td>
            <td v-if="isColVisible('type')" :style="{ ...cellStyle('type'), color: typeHex[row.event.event_type] || undefined }" class="px-2 py-1.5 pr-2 text-[11px] font-mono truncate text-g-9">
              {{ row.event.event_type }}
              <span v-if="row.streamCount" class="text-[10px] text-g-7 ml-1">({{ row.streamCount }})</span>
            </td>
            <td v-if="isColVisible('step')" :style="cellStyle('step')" class="px-2 py-1.5 pr-2 text-[11px] font-mono text-g-9 truncate">{{ row.event.step_id || '' }}</td>
            <td v-if="isColVisible('message')" :style="cellStyle('message')" class="px-2 py-1.5 pr-2 text-sm text-g-12" :class="row.streamBlock ? '' : 'truncate'">
              <pre v-if="row.streamBlock" class="text-[11px] font-mono text-g-12 whitespace-pre overflow-x-auto leading-snug my-0.5">{{ row.streamBlock }}</pre>
              <span v-else>{{ row.event.message }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="flex items-center justify-center py-4">
        <svg class="animate-spin h-4 w-4 text-g-8" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75"/></svg>
        <span class="text-xs text-g-8 ml-2">{{ t('shared.events.loadingMore') }}</span>
      </div>
      <p v-if="!loading && displayEvents.length === 0 && events.length > 0" class="text-xs text-g-7 text-center py-6">{{ t('shared.events.noMatch') }}</p>
      <p v-if="!loading && events.length === 0" class="text-sm text-g-8 text-center py-4">{{ t('shared.events.noEvents') }}</p>
    </div>

    <!-- Slide-over backdrop -->
    <div
      v-if="selectedEvent"
      class="fixed inset-0 z-40 bg-black/30"
      @click="closeDetail"
    />

    <!-- Slide-over detail panel -->
    <div
      class="fixed top-0 right-0 z-50 h-full bg-g-2 shadow-2xl flex flex-col overflow-hidden transition-transform duration-200 ease-out"
      :style="{ width: 'clamp(320px, 30vw, 500px)', borderLeft: '1px solid var(--g-5)', transform: selectedEvent ? 'translateX(0)' : 'translateX(100%)' }"
    >
      <template v-if="selectedEvent">
        <!-- Panel header -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-g-5 shrink-0">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" :style="chipStyle(selectedEvent.event_type)">{{ selectedEvent.event_type }}</span>
          <span v-if="selectedEvent.step_id" class="text-xs text-g-8 truncate max-w-[100px]">{{ selectedEvent.step_id }}</span>
          <button @click="closeDetail" class="ml-auto text-g-7 hover:text-g-12 transition-colors cursor-pointer">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Panel body -->
        <div class="flex-1 overflow-y-auto min-h-0">
          <!-- Timestamp -->
          <div class="px-4 py-2.5 border-b border-g-5">
            <p class="text-[10px] text-g-7 uppercase tracking-wider mb-0.5">{{ t('shared.events.timestamp') }}</p>
            <p class="text-xs font-mono text-g-10">{{ formatDateTime(selectedEvent.event_timestamp) }}</p>
          </div>

          <!-- Message -->
          <div v-if="selectedStreamBlock || selectedEvent.message" class="px-4 py-2.5 border-b border-g-5">
            <p class="text-[10px] text-g-7 uppercase tracking-wider mb-0.5">{{ t('shared.events.message') }}</p>
            <pre v-if="selectedStreamBlock" class="text-[11px] font-mono text-g-12 whitespace-pre overflow-x-auto leading-snug">{{ selectedStreamBlock }}</pre>
            <p v-else class="text-sm text-g-12 leading-relaxed">{{ selectedEvent.message }}</p>
          </div>

          <!-- Context info -->
          <div class="px-4 py-2.5 border-b border-g-5 grid grid-cols-2 gap-x-4 gap-y-2">
            <div v-if="selectedEvent.execution_id" class="min-w-0">
              <p class="text-[10px] text-g-7 uppercase tracking-wider mb-0.5">{{ t('shared.events.execution') }}</p>
              <a :href="`${executionLinkPrefix}${selectedEvent.execution_id}`" class="inline-flex items-center gap-1.5 text-xs font-mono text-g-11 hover:text-g-13 transition-colors" @click.stop>
                <span class="inline-block w-3 h-3 rounded-sm shrink-0" :style="{ background: `linear-gradient(135deg, ${execColors(selectedEvent.execution_id)[0]}, ${execColors(selectedEvent.execution_id)[1]})` }" />
                {{ selectedEvent.execution_id.slice(0, 12) }}
              </a>
            </div>
            <div v-if="selectedEvent.workflow_name" class="min-w-0">
              <p class="text-[10px] text-g-7 uppercase tracking-wider mb-0.5">{{ t('shared.events.workflow') }}</p>
              <p class="text-xs text-g-11 truncate">{{ selectedEvent.workflow_name }}</p>
            </div>
            <div v-if="selectedEvent.agent_id" class="min-w-0">
              <p class="text-[10px] text-g-7 uppercase tracking-wider mb-0.5">{{ t('shared.events.agent') }}</p>
              <p class="text-xs font-mono text-g-11 truncate">{{ selectedEvent.agent_id.slice(0, 12) }}</p>
            </div>
            <div v-if="selectedEvent.session_id" class="min-w-0">
              <p class="text-[10px] text-g-7 uppercase tracking-wider mb-0.5">{{ t('shared.events.session') }}</p>
              <p class="text-xs font-mono text-g-11 truncate">{{ selectedEvent.session_id.slice(0, 12) }}</p>
            </div>
          </div>

          <!-- Smart badge (for goto, waiting, completed, etc.) -->
          <div v-if="selectedParsed && (selectedParsed.kind === 'goto' || selectedParsed.kind === 'waiting' || selectedParsed.kind === 'completed' || selectedParsed.kind === 'log-level')" class="px-4 py-2.5 border-b border-g-5">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" :style="selectedParsed.badgeStyle">{{ selectedParsed.label }}</span>
          </div>
          <div v-if="selectedParsed && selectedParsed.kind === 'failed'" class="px-4 py-2.5 border-b border-g-5">
            <p class="text-[10px] text-g-7 uppercase tracking-wider mb-0.5">{{ t('shared.events.error') }}</p>
            <p class="text-xs font-mono leading-relaxed" :style="selectedParsed.labelStyle">{{ selectedParsed.label }}</p>
          </div>

          <!-- JSON Data via JsonView -->
          <div v-if="selectedParsed && selectedParsed.parsed" class="px-4 py-2.5">
            <div class="flex items-center justify-between mb-2">
              <p class="text-[10px] text-g-7 uppercase tracking-wider">{{ t('shared.events.data') }}</p>
              <button
                @click="copyDetailJson"
                class="flex items-center gap-1 text-[10px] text-g-8 hover:text-g-12 transition-colors cursor-pointer"
              >
                <svg v-if="!copiedDetail" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else class="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {{ copiedDetail ? t('shared.common.copied') : t('shared.common.copy') }}
              </button>
            </div>
            <JsonView :data="selectedParsed.parsed" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
