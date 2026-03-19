<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Chart } from 'highcharts-vue'
import { statsApi } from '../../api'

const props = defineProps<{ baseParams: Record<string, string> }>()

const mode = ref<'percent' | 'absolute'>('percent')
const granularity = ref<'day' | 'week' | 'month'>('month')
const data = ref<any[]>([])
const loading = ref(false)

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  '#e11d48', '#7c3aed',
]

// Stable color map — assigned once from all themes in data, never changes on mode switch
const allThemes = computed(() =>
  [...new Set(data.value.map((r: any) => r.theme))].filter(Boolean).slice(0, 12)
)

const themeColor = computed(() => {
  const map: Record<string, string> = {}
  allThemes.value.forEach((t, i) => { map[t] = COLORS[i % COLORS.length] })
  return map
})

async function load() {
  loading.value = true
  try {
    data.value = await statsApi.shareOfVoice({ ...props.baseParams, granularity: granularity.value })
  } finally {
    loading.value = false
  }
}

watch(() => props.baseParams, load, { deep: true, immediate: true })
watch(granularity, load)

function setGranularity(v: string) { granularity.value = v as 'day' | 'week' | 'month' }

const chartOptions = computed(() => {
  if (!data.value?.length) return {}

  const periods = [...new Set(data.value.map((r: any) => r.period))].sort()
  const themes = allThemes.value
  const lookup = new Map(data.value.map((r: any) => [`${r.period}__${r.theme}`, Number(r.tweets)]))

  // Format period string based on current granularity
  function fmtPeriod(p: string): string {
    if (!p) return ''
    const parts = p.split('-')
    if (granularity.value === 'day' && parts.length === 3) {
      // YYYY-MM-DD → '07 Jan'
      const d = new Date(p)
      return isNaN(d.getTime()) ? p : d.toLocaleString('en', { day: '2-digit', month: 'short' })
    }
    if (granularity.value === 'week' && parts.length === 2) {
      // YYYY-WW → 'W02 '26'
      return `W${parts[1]} '${parts[0].slice(2)}`
    }
    if (granularity.value === 'month' && parts.length === 2) {
      // YYYY-MM → 'Jan '26'
      const month = new Date(Number(parts[0]), Number(parts[1]) - 1).toLocaleString('en', { month: 'short' })
      return `${month} '${parts[0].slice(2)}`
    }
    return p
  }

  const displayPeriods = periods.map(fmtPeriod)

  const series = themes.map((theme) => ({
    name: theme,
    type: 'area',
    color: themeColor.value[theme],
    data: periods.map((p) => lookup.get(`${p}__${theme}`) ?? 0),
    fillOpacity: 0.85,
    lineWidth: 1.5,
    marker: { enabled: false },
  }))

  const yearPoints = granularity.value === 'day' ? 365 : granularity.value === 'week' ? 52 : 12
  const showFrom = Math.max(0, periods.length - yearPoints)

  return {
    chart: {
      type: 'area',
      backgroundColor: 'transparent',
      height: 380,
      style: { fontFamily: 'Inter, sans-serif' },
      animation: { duration: 600 },
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
      series: themes.map((theme) => ({
        type: 'areaspline',
        color: themeColor.value[theme],
        fillOpacity: 0.06,
        lineWidth: 1,
        data: periods.map((p) => lookup.get(`${p}__${theme}`) ?? 0),
      })),
    },
    xAxis: {
      type: 'category' as any,
      categories: displayPeriods,
      min: showFrom,
      max: periods.length - 1,
      tickPixelInterval: 90,
      labels: { style: { color: '#64748B', fontSize: '11px' } },
      lineColor: '#DDE3F5',
      tickColor: '#DDE3F5',
    },
    yAxis: {
      title: { text: undefined },
      labels: {
        style: { color: '#64748B', fontSize: '11px' },
        formatter:
          mode.value === 'percent'
            ? function (this: any) { return this.value + '%' }
            : undefined,
      },
      gridLineColor: '#E0E7FF',
    },
    tooltip: {
      backgroundColor: '#FFFFFF',
      borderColor: '#DDE3F5',
      borderRadius: 8,
      shadow: { color: 'rgba(99,102,241,0.1)', offsetX: 0, offsetY: 4, width: 16 },
      style: { color: '#1E293B', fontSize: '12px' },
      shared: true,
      formatter:
        mode.value === 'percent'
          ? function (this: any) {
              const label = displayPeriods[this.x as number] ?? this.x
              const lines = this.points
                .filter((p: any) => p.y > 0)
                .sort((a: any, b: any) => b.percentage - a.percentage)
                .map((p: any) =>
                  `<span style="color:${p.color}">●</span> <b>${p.series.name}</b>: ${p.percentage.toFixed(1)}%`
                )
              return `<b>${label}</b><br>${lines.join('<br>')}`
            }
          : function (this: any) {
              const label = displayPeriods[this.x as number] ?? this.x
              const lines = this.points
                .filter((p: any) => p.y > 0)
                .sort((a: any, b: any) => b.y - a.y)
                .map((p: any) => {
                  const val = p.y >= 1000 ? (p.y / 1000).toFixed(0) + 'K' : p.y
                  return `<span style="color:${p.color}">●</span> <b>${p.series.name}</b>: ${val}`
                })
              return `<b>${label}</b><br>${lines.join('<br>')}`
            },
    },
    plotOptions: {
      area: {
        stacking: (mode.value === 'percent' ? 'percent' : 'normal') as 'percent' | 'normal',
        lineWidth: 1.5,
        pointPlacement: 'on',
        marker: { enabled: false, states: { hover: { enabled: true, radius: 4 } } },
      },
    },
    series,
  }
})
</script>

<template>
  <div class="sov-wrap">
    <!-- Toolbar -->
    <div class="sov-toolbar">
      <div class="gran-group">
        <button
          v-for="opt in [{ label: 'Daily', value: 'day' }, { label: 'Weekly', value: 'week' }, { label: 'Monthly', value: 'month' }]"
          :key="opt.value"
          :class="['gran-btn', { active: granularity === opt.value }]"
          @click="setGranularity(opt.value)"
        >{{ opt.label }}</button>
      </div>
      <div class="mode-group">
        <button :class="['mode-btn', { active: mode === 'percent' }]" @click="mode = 'percent'">% Share</button>
        <button :class="['mode-btn', { active: mode === 'absolute' }]" @click="mode = 'absolute'">Volume</button>
      </div>
      <span v-if="loading" class="loading-dot">●</span>
    </div>

    <!-- Chart -->
    <div class="chart-wrap">
      <div v-if="!data?.length && !loading" class="empty">No data available</div>
      <Chart
        v-else-if="data?.length"
        :options="chartOptions"
        :key="`${granularity}-${mode}`"
        style="width: 100%; display: block;"
      />
    </div>

    <!-- Custom Legend -->
    <div class="sov-legend">
      <div
        v-for="theme in allThemes"
        :key="theme"
        class="legend-item"
        :title="theme"
      >
        <span class="legend-dot" :style="{ background: themeColor[theme] }"></span>
        <span class="legend-label">{{ theme }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sov-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sov-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gran-group,
.mode-group {
  display: flex;
  gap: 3px;
}

/* Separator between groups */
.mode-group { margin-left: auto; }

.gran-btn,
.mode-btn {
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
.gran-btn:hover,
.mode-btn:hover {
  color: var(--text);
  border-color: var(--primary);
}
.gran-btn.active,
.mode-btn.active {
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

.chart-wrap {
  min-height: 380px;
  display: flex;
  flex-direction: column;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Legend */
.sov-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 10px 4px 4px;
  border-top: 1px solid var(--border);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: default;
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-label {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.legend-item:hover .legend-label { color: var(--text); }
</style>
