<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Chart } from 'highcharts-vue'
import { aiAnalysisApi } from '../../api'

const props = defineProps<{ data: any[] }>()
const metric = ref<'tweets' | 'views' | 'likes'>('views')
const mode = ref<'themes' | 'subtopics'>('themes')
const subtopicData = ref<any[]>([])

onMounted(async () => {
  try {
    subtopicData.value = await aiAnalysisApi.subtopicEngagement()
  } catch {}
})

const activeData = computed(() => {
  if (mode.value === 'subtopics') {
    return [...subtopicData.value]
      .sort((a, b) => Number(b[metric.value]) - Number(a[metric.value]))
      .slice(0, 12)
  }
  return [...(props.data ?? [])]
    .sort((a, b) => Number(b[metric.value]) - Number(a[metric.value]))
    .slice(0, 8)
})

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const categories = computed(() =>
  activeData.value.map(d => {
    const raw = mode.value === 'subtopics' ? d.subtopic : d.theme
    return mode.value === 'subtopics' ? formatLabel(raw) : raw
  })
)

const options = computed(() => ({
  chart: {
    type: 'bar',
    backgroundColor: 'transparent',
    height: Math.max(300, activeData.value.length * 38 + 80),
    style: { fontFamily: 'Inter, sans-serif' },
    animation: { duration: 300 },
  },
  title: { text: undefined },
  credits: { enabled: false },
  legend: { enabled: false },
  xAxis: {
    type: 'category' as any,
    categories: categories.value,
    labels: { style: { color: '#1E293B', fontSize: '12px', fontWeight: '500', textOutline: 'none' } },
    lineColor: '#DDE3F5',
  },
  yAxis: {
    title: { text: undefined },
    gridLineColor: '#E0E7FF',
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
  },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE3F5',
    borderRadius: 8,
    shadow: { color: 'rgba(99,102,241,0.1)', offsetX: 0, offsetY: 4, width: 16 },
    style: { color: '#1E293B' },
    formatter: function (this: any) {
      const label = this.point.category ?? this.x
      const v = this.y
      const formatted = v >= 1_000_000_000 ? (v / 1_000_000_000).toFixed(2) + 'B'
        : v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M'
        : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v
      return `<b>${label}</b><br/>${metric.value}: <b>${formatted}</b>`
    },
  },
  plotOptions: {
    bar: { borderRadius: 4, dataLabels: { enabled: false }, colorByPoint: true },
  },
  colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316',
           '#ec4899', '#14b8a6', '#84cc16', '#fb923c'],
  series: [{
    name: metric.value,
    data: activeData.value.map(d => Number(d[metric.value]) || 0),
  }],
}))
</script>

<template>
  <div class="chart-wrap">
    <div class="toolbar">
      <div class="mode-tabs">
        <button :class="{ active: mode === 'themes' }" @click="mode = 'themes'">Global Themes</button>
        <button :class="{ active: mode === 'subtopics' }" @click="mode = 'subtopics'">
          🤖 AI Sub-topics
        </button>
      </div>
      <div class="metric-tabs">
        <button :class="{ active: metric === 'views' }"   @click="metric = 'views'">Views</button>
        <button :class="{ active: metric === 'tweets' }"  @click="metric = 'tweets'">Posts</button>
        <button :class="{ active: metric === 'likes' }"   @click="metric = 'likes'">Likes</button>
      </div>
    </div>
    <div v-if="mode === 'subtopics' && !subtopicData.length" class="no-ai">
      No AI sub-topic data yet — run batch analysis in Admin
    </div>
    <Chart v-else :options="options" style="width:100%; flex:1; min-height:0;" />
  </div>
</template>

<style scoped>
.chart-wrap { display: flex; flex-direction: column; height: 100%; }
.toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
}
.mode-tabs, .metric-tabs { display: flex; gap: 4px; }
.mode-tabs button, .metric-tabs button {
  padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border);
  background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer;
  transition: all 0.15s;
}
.mode-tabs button.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.metric-tabs button.active { background: rgba(99,102,241,0.1); border-color: var(--primary); color: var(--primary); }
.no-ai {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--text-muted); text-align: center;
}
</style>
