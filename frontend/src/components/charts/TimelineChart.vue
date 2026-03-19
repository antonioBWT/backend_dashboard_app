<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Chart } from 'highcharts-vue'
import { statsApi } from '../../api'

const props = defineProps<{ baseParams: Record<string, string> }>()

const granularity = ref<'day' | 'week' | 'month'>('month')
const data = ref<any[]>([])
const loading = ref(false)

const maxVisible = computed(() => {
  if (granularity.value === 'day') return 365
  if (granularity.value === 'week') return 52
  return 12
})

async function load() {
  loading.value = true
  try {
    data.value = await statsApi.timeline({ ...props.baseParams, granularity: granularity.value })
  } finally {
    loading.value = false
  }
}

watch(() => props.baseParams, load, { deep: true, immediate: true })
watch(granularity, load)

function setGranularity(v: string) { granularity.value = v as 'day' | 'week' | 'month' }

const options = computed(() => {
  const all = data.value
  const len = all.length
  const showFrom = Math.max(0, len - maxVisible.value)

  function fmtPeriod(p: string): string {
    if (!p) return ''
    const parts = p.split('-')
    if (granularity.value === 'day' && parts.length === 3) {
      const d = new Date(p)
      return isNaN(d.getTime()) ? p : d.toLocaleString('en', { day: '2-digit', month: 'short' })
    }
    if (granularity.value === 'week' && parts.length === 2)
      return `W${parts[1]} '${parts[0].slice(2)}`
    if (granularity.value === 'month' && parts.length === 2) {
      const month = new Date(Number(parts[0]), Number(parts[1]) - 1).toLocaleString('en', { month: 'short' })
      return `${month} '${parts[0].slice(2)}`
    }
    return p
  }

  const displayPeriods = all.map(d => fmtPeriod(d.period))

  return {
    chart: {
      type: 'areaspline',
      backgroundColor: 'transparent',
      height: 320,
      style: { fontFamily: 'Inter, sans-serif' },
      marginBottom: 80,
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    rangeSelector: { enabled: false },
    scrollbar: { enabled: false },
    navigator: {
      enabled: true,
      height: 44,
      margin: 12,
      maskFill: 'rgba(99,102,241,0.12)',
      outlineColor: '#DDE3F5',
      outlineWidth: 1,
      handles: {
        backgroundColor: '#FFFFFF',
        borderColor: '#6366f1',
        width: 10,
        height: 18,
      },
      xAxis: {
        type: 'category' as any,
        categories: displayPeriods,
        gridLineColor: 'transparent',
        labels: { style: { color: '#94a3b8', fontSize: '10px', textOutline: 'none' } },
      },
      series: [
        {
          type: 'areaspline',
          color: '#6366f1',
          fillOpacity: 0.12,
          lineWidth: 1.5,
          data: all.map((d, i) => [i, Number(d.tweets)]),
        },
        {
          type: 'areaspline',
          color: '#10b981',
          fillOpacity: 0.08,
          lineWidth: 1,
          data: all.map((d, i) => {
            const maxV = Math.max(...all.map(x => Number(x.views)))
            const maxT = Math.max(...all.map(x => Number(x.tweets)))
            // Normalize views to tweets scale for navigator display
            return [i, maxT > 0 ? (Number(d.views) / (maxV || 1)) * maxT : 0]
          }),
        },
      ],
    },
    xAxis: {
      type: 'category' as any,
      categories: displayPeriods,
      min: showFrom,
      max: len - 1,
      labels: {
        style: { color: '#64748B', fontSize: '11px' },
        tickPixelInterval: 90,
      },
      tickPixelInterval: 90,
      lineColor: '#DDE3F5',
      tickColor: '#DDE3F5',
    },
    yAxis: [
      {
        title: { text: undefined },
        labels: {
          style: { color: '#64748B', fontSize: '11px' },
          formatter: function (this: any) {
            return this.value >= 1000 ? (this.value / 1000).toFixed(0) + 'K' : this.value
          },
        },
        gridLineColor: '#E0E7FF',
      },
      {
        title: { text: undefined },
        opposite: true,
        labels: {
          style: { color: '#64748B', fontSize: '11px' },
          formatter: function (this: any) {
            const v = this.value
            if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B'
            if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
            if (v >= 1000) return (v / 1000).toFixed(0) + 'K'
            return v
          },
        },
        gridLineColor: 'transparent',
      },
    ],
    tooltip: {
      shared: true,
      backgroundColor: '#FFFFFF',
      borderColor: '#DDE3F5',
      borderRadius: 8,
      shadow: { color: 'rgba(99,102,241,0.1)', offsetX: 0, offsetY: 4, width: 16 },
      style: { color: '#1E293B' },
      formatter: function (this: any) {
        const label = displayPeriods[this.x] ?? this.x
        let s = `<b>${label}</b><br/>`
        this.points.forEach((p: any) => {
          const v = p.y >= 1_000_000
            ? (p.y / 1_000_000).toFixed(1) + 'M'
            : p.y >= 1000 ? (p.y / 1000).toFixed(0) + 'K' : p.y
          s += `<span style="color:${p.color}">●</span> ${p.series.name}: <b>${v}</b><br/>`
        })
        return s
      },
    },
    plotOptions: {
      areaspline: { fillOpacity: 0.12, lineWidth: 2, marker: { enabled: false } },
    },
    series: [
      {
        name: 'Tweets',
        data: all.map(d => Number(d.tweets)),
        color: '#6366f1',
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, 'rgba(99,102,241,0.25)'], [1, 'rgba(99,102,241,0)']],
        },
        yAxis: 0,
      },
      {
        name: 'Views',
        data: all.map(d => Number(d.views)),
        color: '#10b981',
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, 'rgba(16,185,129,0.15)'], [1, 'rgba(16,185,129,0)']],
        },
        yAxis: 1,
      },
    ],
  }
})
</script>

<template>
  <div class="timeline-wrap">
    <div class="chart-toolbar">
      <div class="gran-group">
        <button
          v-for="opt in [{ label: 'Daily', value: 'day' }, { label: 'Weekly', value: 'week' }, { label: 'Monthly', value: 'month' }]"
          :key="opt.value"
          :class="['gran-btn', { active: granularity === opt.value }]"
          @click="setGranularity(opt.value)"
        >{{ opt.label }}</button>
      </div>
      <span v-if="loading" class="loading-dot">●</span>
    </div>

    <Chart
      v-if="data.length"
      :options="options"
      style="width: 100%; display: block"
      :key="granularity"
    />
    <div v-else-if="!loading" class="empty">No data available</div>
  </div>
</template>

<style scoped>
.timeline-wrap { display: flex; flex-direction: column; gap: 10px; }

.chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.gran-group { display: flex; gap: 3px; }
.gran-btn {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.03em;
}
.gran-btn:hover { color: var(--text); border-color: var(--primary); }
.gran-btn.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: var(--primary);
  color: var(--primary);
}

.loading-dot {
  font-size: 10px;
  color: var(--primary-light);
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

.empty {
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
