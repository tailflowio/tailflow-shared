<script setup lang="ts">
import { ref, computed } from 'vue'
import type { HistogramBucket } from '../types/histogram'
import { typeHex } from '../constants/colors'

const props = defineProps<{
  buckets: HistogramBucket[]
  intervalSeconds: number
  minTimestamp: string
  maxTimestamp: string
  activeTimeRange?: { from: string; to: string } | null
  activeEventTypes?: string[]
}>()

const emit = defineEmits<{
  'select-range': [range: { from: string; to: string }]
  'clear-range': []
}>()

function colorFor(type: string): string {
  return typeHex[type] || '#9ca3af'
}

// Filter buckets by active event types
const filteredBuckets = computed(() => {
  if (!props.activeEventTypes || props.activeEventTypes.length === 0) return props.buckets
  const allowed = new Set(props.activeEventTypes)
  return props.buckets.filter(b => allowed.has(b.event_type))
})

// Group flat buckets into Map<timestamp_ms, Map<event_type, count>>
const grouped = computed(() => {
  const map = new Map<number, Map<string, number>>()
  for (const b of filteredBuckets.value) {
    const ms = new Date(b.bucket).getTime()
    if (!map.has(ms)) map.set(ms, new Map())
    map.get(ms)!.set(b.event_type, (map.get(ms)!.get(b.event_type) || 0) + b.count)
  }
  return map
})

// Sorted unique timestamps
const timestamps = computed(() => [...grouped.value.keys()].sort((a, b) => a - b))

// All event types (sorted) for consistent stacking order
const allTypes = computed(() => {
  const s = new Set<string>()
  for (const b of filteredBuckets.value) s.add(b.event_type)
  return [...s].sort()
})

// Max total count in any single bucket
const maxTotal = computed(() => {
  let max = 0
  for (const m of grouped.value.values()) {
    let total = 0
    for (const c of m.values()) total += c
    if (total > max) max = total
  }
  return max || 1
})

// --------------- Y-axis nice ticks ---------------

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range))
  const frac = range / Math.pow(10, exp)
  let nice: number
  if (round) {
    if (frac < 1.5) nice = 1
    else if (frac < 3) nice = 2
    else if (frac < 7) nice = 5
    else nice = 10
  } else {
    if (frac <= 1) nice = 1
    else if (frac <= 2) nice = 2
    else if (frac <= 5) nice = 5
    else nice = 10
  }
  return nice * Math.pow(10, exp)
}

const yTicks = computed(() => {
  const max = maxTotal.value
  if (max <= 1) return [{ value: 0 }, { value: 1 }]

  const targetTicks = 4
  const roughStep = max / targetTicks
  const step = niceNum(roughStep, true)
  const niceMax = Math.ceil(max / step) * step

  const ticks: { value: number }[] = []
  for (let v = 0; v <= niceMax; v += step) {
    ticks.push({ value: v })
  }
  return ticks
})

const yMax = computed(() => {
  const ticks = yTicks.value
  return ticks.length > 0 ? ticks[ticks.length - 1].value : maxTotal.value
})

// --------------- SVG dimensions ---------------

const W = 900
const H = 140
const PAD = { left: 30, right: 2, top: 8, bottom: 24 }
const chartW = W - PAD.left - PAD.right
const chartH = H - PAD.top - PAD.bottom

function yPos(value: number): number {
  return PAD.top + chartH - (value / yMax.value) * chartH
}

// Bar geometry
const barData = computed(() => {
  const n = timestamps.value.length
  if (n === 0) return []

  const slotW = chartW / n
  const gap = Math.min(1.5, slotW * 0.15)
  const barW = Math.max(1, slotW - gap)
  const offset = gap / 2

  return timestamps.value.map((ts, i) => {
    const counts = grouped.value.get(ts)!
    let total = 0
    for (const c of counts.values()) total += c

    const x = PAD.left + i * slotW + offset

    // Build stacked rects bottom-up
    const rects: { y: number; h: number; color: string; type: string; count: number }[] = []
    let yOffset = yPos(0) // bottom of chart
    for (const type of allTypes.value) {
      const count = counts.get(type) || 0
      if (count === 0) continue
      const h = (count / yMax.value) * chartH
      yOffset -= h
      rects.push({ y: yOffset, h, color: colorFor(type), type, count })
    }

    return { ts, x, w: barW, rects, total }
  })
})

// Active range highlight
const activeRangeMs = computed(() => {
  if (!props.activeTimeRange) return null
  return {
    from: new Date(props.activeTimeRange.from).getTime(),
    to: new Date(props.activeTimeRange.to).getTime(),
  }
})

function isBarInRange(ts: number): boolean {
  if (!activeRangeMs.value) return true
  return ts >= activeRangeMs.value.from && ts < activeRangeMs.value.to
}

// X-axis labels (adaptive time ticks, ~7-8 labels)
const xTicks = computed(() => {
  const tss = timestamps.value
  if (tss.length < 2) return []

  const range = tss[tss.length - 1] - tss[0]
  if (range === 0) return []

  const count = Math.min(7, tss.length - 1)
  const slotW = chartW / tss.length
  const ticks: { x: number; label: string }[] = []
  const seen = new Set<number>()

  for (let i = 0; i <= count; i++) {
    const idx = Math.round((i / count) * (tss.length - 1))
    if (seen.has(idx)) continue
    seen.add(idx)
    const x = PAD.left + idx * slotW + slotW / 2
    ticks.push({ x, label: formatTimeTick(tss[idx], range) })
  }
  return ticks
})

function formatTimeTick(ms: number, rangeMs: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')

  if (rangeMs < 10 * 60_000) return `${hh}:${mm}:${ss}`
  if (rangeMs < 24 * 3_600_000) return `${hh}:${mm}`
  const dd = String(d.getDate()).padStart(2, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  if (rangeMs > 3 * 24 * 3_600_000) return `${dd}/${mo}`
  return `${dd}/${mo} ${hh}:${mm}`
}

function formatYLabel(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + ' M'
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + ' K'
  return String(n)
}

function onBarClick(ts: number) {
  const from = new Date(ts).toISOString()
  const to = new Date(ts + props.intervalSeconds * 1000).toISOString()
  emit('select-range', { from, to })
}

// --------------- custom tooltip ---------------

const tooltipBar = ref<typeof barData.value[0] | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
const containerRef = ref<HTMLElement>()

function onBarEnter(bar: typeof barData.value[0], e: MouseEvent) {
  tooltipBar.value = bar
  updateTooltipPos(e)
}

function onBarMove(e: MouseEvent) {
  updateTooltipPos(e)
}

function onBarLeave() {
  tooltipBar.value = null
}

function updateTooltipPos(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  tooltipX.value = e.clientX - rect.left + 12
  tooltipY.value = e.clientY - rect.top - 8
}

function formatTooltipTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
</script>

<template>
  <div v-if="barData.length > 0" ref="containerRef" class="relative">
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-[10px] font-mono text-g-8 uppercase tracking-wider">Event density</span>
      <button
        v-if="activeTimeRange"
        @click="emit('clear-range')"
        class="px-2 py-0.5 text-[10px] font-mono text-g-8 hover:text-g-12 bg-g-3 border border-g-5 rounded transition-colors cursor-pointer"
      >Clear time filter</button>
    </div>
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full rounded" :style="{ aspectRatio: `${W}/${H}`, display: 'block' }">
      <!-- Y-axis grid lines -->
      <g v-for="tick in yTicks" :key="'yg-' + tick.value">
        <line
          :x1="PAD.left"
          :y1="yPos(tick.value)"
          :x2="W - PAD.right"
          :y2="yPos(tick.value)"
          stroke="var(--g-4)"
          stroke-width="0.5"
          :stroke-dasharray="tick.value === 0 ? 'none' : '3,3'"
        />
      </g>

      <!-- Y-axis labels -->
      <text
        v-for="tick in yTicks"
        :key="'yl-' + tick.value"
        :x="PAD.left - 4"
        :y="yPos(tick.value) + 2"
        text-anchor="end"
        fill="var(--g-7)"
        font-size="6"
        font-family="monospace"
      >{{ formatYLabel(tick.value) }}</text>

      <!-- Bars -->
      <g
        v-for="bar in barData"
        :key="bar.ts"
        class="cursor-pointer"
        :opacity="activeTimeRange && !isBarInRange(bar.ts) ? 0.25 : 1"
        @click="onBarClick(bar.ts)"
        @mouseenter="onBarEnter(bar, $event)"
        @mousemove="onBarMove"
        @mouseleave="onBarLeave"
      >
        <!-- Hover hit area (full height, invisible) -->
        <rect
          :x="bar.x"
          :y="PAD.top"
          :width="bar.w"
          :height="chartH"
          fill="transparent"
        />
        <rect
          v-for="(rect, ri) in bar.rects"
          :key="ri"
          :x="bar.x"
          :y="rect.y"
          :width="bar.w"
          :height="Math.max(rect.h, 0.5)"
          :fill="rect.color"
          rx="0.5"
        />
      </g>

      <!-- X-axis labels -->
      <text
        v-for="tick in xTicks"
        :key="tick.x"
        :x="tick.x"
        :y="H - 4"
        text-anchor="middle"
        fill="var(--g-7)"
        font-size="7"
        font-family="monospace"
      >{{ tick.label }}</text>
    </svg>

    <!-- Custom tooltip -->
    <div
      v-if="tooltipBar"
      class="absolute z-50 pointer-events-none"
      :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
    >
      <div style="background: var(--g-1); border: 1px solid var(--g-5); border-radius: 8px; padding: 8px 10px; min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
        <div style="font-size: 11px; font-family: monospace; color: var(--g-12); font-weight: 500; margin-bottom: 6px;">
          {{ formatTooltipTime(tooltipBar.ts) }}
        </div>
        <div
          v-for="rect in tooltipBar.rects"
          :key="rect.type"
          style="display: flex; align-items: center; gap: 6px; padding: 1.5px 0; font-size: 11px; font-family: monospace;"
        >
          <span style="width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0;" :style="{ backgroundColor: rect.color }" />
          <span style="color: var(--g-9); flex: 1;">{{ rect.type }}</span>
          <span style="color: var(--g-12); font-weight: 500;">{{ formatCount(rect.count) }}</span>
        </div>
        <div style="border-top: 1px solid var(--g-5); margin-top: 5px; padding-top: 5px; display: flex; justify-content: space-between; font-size: 11px; font-family: monospace;">
          <span style="color: var(--g-8);">Total</span>
          <span style="color: var(--g-12); font-weight: 600;">{{ formatCount(tooltipBar.total) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
