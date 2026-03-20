<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Chart } from 'highcharts-vue'
import { statsApi } from '../../api'

const data = ref<{ period: string; country: string; tweets: number; views: number }[]>([])
const loading = ref(false)
const metric = ref<'tweets' | 'views'>('tweets')

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  '#e11d48', '#7c3aed',
]

async function load() {
  loading.value = true
  try {
    const rows = await statsApi.byCountry()
    data.value = rows.map((r: any) => ({
      period: r.period,
      country: r.country,
      tweets: Number(r.tweets),
      views: Number(r.views),
    }))
  } catch (e) {
    console.error('CountryChart load failed:', e)
    data.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

const countries = computed(() =>
  [...new Set(data.value.map((r) => r.country))].filter(Boolean)
)

const countryColor = computed(() => {
  const map: Record<string, string> = {}
  countries.value.forEach((c, i) => { map[c] = COLORS[i % COLORS.length] })
  return map
})

const chartOptions = computed(() => {
  if (!data.value.length) return {}

  const periods = [...new Set(data.value.map((r) => r.period))].sort()
  const lookup = new Map(
    data.value.map((r) => [`${r.period}__${r.country}`, metric.value === 'tweets' ? r.tweets : r.views])
  )

  const series = countries.value.map((country) => ({
    name: country,
    type: 'areaspline',
    color: countryColor.value[country],
    fillOpacity: 0.15,
    lineWidth: 2,
    marker: { enabled: false, states: { hover: { enabled: true, radius: 4 } } },
    data: periods.map((p) => lookup.get(`${p}__${country}`) ?? 0),
  }))

  const showFrom = Math.max(0, periods.length - 12)

  function fmtPeriod(p: string) {
    if (!p || !p.includes('-')) return p ?? ''
    const [y, m] = p.split('-')
    if (!y || !m) return p
    const month = new Date(Number(y), Number(m) - 1).toLocaleString('en', { month: 'short' })
    return `${month} '${y.slice(2)}`
  }

  // Pre-formatted labels used directly as categories — avoids formatter issues
  const displayPeriods = periods.map(fmtPeriod)

  return {
    chart: {
      type: 'areaspline',
      backgroundColor: 'transparent',
      height: 340,
      style: { fontFamily: 'Inter, sans-serif' },
      animation: { duration: 600 },
      marginBottom: 80,
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: {
      enabled: true,
      align: 'left' as const,
      verticalAlign: 'bottom' as const,
      itemStyle: { color: '#64748B', fontSize: '11px', fontWeight: '500' },
      itemHoverStyle: { color: '#1E293B' },
    },
    rangeSelector: { enabled: false },
    scrollbar: { enabled: false },
    navigator: {
      enabled: true,
      height: 40,
      margin: 30,
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
      series: countries.value.map((country) => ({
        type: 'areaspline',
        color: countryColor.value[country],
        fillOpacity: 0.06,
        lineWidth: 1,
        data: periods.map((p) => lookup.get(`${p}__${country}`) ?? 0),
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
        formatter: metric.value === 'views'
          ? function (this: any) {
              if (this.value >= 1_000_000) return (this.value / 1_000_000).toFixed(0) + 'M'
              if (this.value >= 1_000) return (this.value / 1_000).toFixed(0) + 'K'
              return this.value
            }
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
      formatter: function (this: any) {
        const label = displayPeriods[this.x as number] ?? this.x
        const lines = this.points
          .filter((p: any) => p.y > 0)
          .sort((a: any, b: any) => b.y - a.y)
          .map((p: any) => {
            const v = p.y
            const val = v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M'
              : v >= 1_000 ? (v / 1_000).toFixed(0) + 'K'
              : v
            return `<span style="color:${p.color}">●</span> <b>${p.series.name}</b>: ${val}`
          })
        return `<b>${label}</b><br>${lines.join('<br>')}`
      },
    },
    plotOptions: {
      areaspline: {
        stacking: 'normal' as const,
        pointPlacement: 'on',
      },
    },
    series,
  }
})
</script>

<template>
  <div class="cc-wrap">
    <div class="cc-toolbar">
      <div class="metric-tabs">
        <button :class="['mtab', { active: metric === 'tweets' }]" @click="metric = 'tweets'">Posts</button>
        <button :class="['mtab', { active: metric === 'views' }]"  @click="metric = 'views'">Views</button>
      </div>
      <span class="cc-hint">All historical data · not affected by filters</span>
      <span v-if="loading" class="loading-dot">●</span>
    </div>

    <div v-if="!data.length && !loading" class="empty">No country data available</div>
    <div v-else class="chart-wrap">
      <Chart :options="chartOptions" :key="metric" style="width:100%; display:block;" />
    </div>
  </div>
</template>

<style scoped>
.cc-wrap { display: flex; flex-direction: column; gap: 10px; }

.cc-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}

.metric-tabs { display: flex; gap: 3px; }
.mtab {
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text-muted); font-size: 11px; font-weight: 600;
  padding: 4px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s;
}
.mtab:hover { color: var(--text); border-color: var(--primary); }
.mtab.active {
  background: rgba(99,102,241,0.1); border-color: var(--primary); color: var(--primary);
}

.cc-hint {
  font-size: 11px; color: var(--text-muted); margin-left: auto;
}

.loading-dot { font-size: 10px; color: var(--primary); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: .3 } 50% { opacity: 1 } }

.chart-wrap {
  min-height: 340px;
  display: flex;
  flex-direction: column;
}

.empty {
  height: 280px; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 13px;
}
</style>
