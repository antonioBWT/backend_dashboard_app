<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'
import { statsApi } from '../../api'

const props = defineProps<{ baseParams: Record<string, string> }>()

interface HashtagRow { tag: string; views: number; likes: number; retweets: number; count: number }

const metric = ref<'views' | 'count' | 'engagement'>('views')
const data = ref<HashtagRow[]>([])
const loading = ref(false)
const selectedNode = ref<HashtagRow | null>(null)
const tooltipStyle = ref({ left: '0px', top: '0px', opacity: 0 })

const svgRef = ref<SVGSVGElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

let simulation: d3.Simulation<any, any> | null = null

const COLORS = [
  '#6366F1', '#8B5CF6', '#06B6D4', '#10B981',
  '#F59E0B', '#EF4444', '#EC4899', '#F97316',
  '#14B8A6', '#0EA5E9',
]

async function load() {
  loading.value = true
  try {
    data.value = await statsApi.hashtags(props.baseParams)
  } catch (e) {
    console.error('Hashtags load failed:', e)
    data.value = []
  } finally {
    loading.value = false
  }
}

function fmt(v: number) {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K'
  return String(v)
}

const top10 = computed(() =>
  [...data.value]
    .map(d => ({
      ...d,
      value: metric.value === 'views' ? d.views
        : metric.value === 'count' ? d.count
        : d.likes + d.retweets,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
)

function truncateTag(tag: string, r: number, fontSize: number): string {
  // Approximate character width as 60% of font size for bold Inter
  const charW = fontSize * 0.6
  const maxChars = Math.floor((r * 1.6) / charW)
  if (tag.length <= maxChars) return tag
  return tag.slice(0, Math.max(1, maxChars - 1)) + '…'
}

function positionTooltip(d: any, W: number, H: number) {
  const ttW = 180
  const ttH = 130 // approximate tooltip height
  const left = Math.max(8, Math.min(d.x - ttW / 2, W - ttW - 8))
  // Flip above if near bottom
  const top = (d.y + d.r + 12 + ttH > H)
    ? d.y - d.r - ttH - 8
    : d.y + d.r + 12
  return { left: left + 'px', top: top + 'px', opacity: 1 }
}

function renderBubbles() {
  if (!svgRef.value || !containerRef.value) return
  if (simulation) { simulation.stop(); simulation = null }

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const nodes = top10.value
  if (!nodes.length) return

  const W = containerRef.value.clientWidth || 600
  const H = 380

  svg.attr('width', W).attr('height', H)

  const maxVal = d3.max(nodes, (d: any) => d.value) || 1
  const minVal = d3.min(nodes, (d: any) => d.value) || 0
  const rScale = d3.scaleSqrt()
    .domain([minVal, maxVal])
    .range([32, Math.min(W / 6, 78)])

  const nodesData = nodes.map((d, i) => ({
    ...d,
    r: rScale(d.value),
    color: COLORS[i % COLORS.length],
    x: W / 2 + (Math.random() - 0.5) * 80,
    y: H / 2 + (Math.random() - 0.5) * 80,
  }))

  const g = svg.append('g')

  const circles = g.selectAll('.bubble')
    .data(nodesData)
    .enter()
    .append('g')
    .attr('class', 'bubble')
    .style('cursor', 'pointer')
    .on('click', function(_event: MouseEvent, d: any) {
      const isSame = selectedNode.value?.tag === d.tag
      if (isSame) {
        selectedNode.value = null
        tooltipStyle.value = { ...tooltipStyle.value, opacity: 0 }
        svg.selectAll('.bubble-inner').style('opacity', 1).style('filter', '')
      } else {
        selectedNode.value = d
        svg.selectAll('.bubble-inner').style('opacity', 0.22).style('filter', 'blur(1.5px)')
        d3.select(this).select('.bubble-inner').style('opacity', 1).style('filter', 'none')
        tooltipStyle.value = positionTooltip(d, W, H)
      }
    })

  // Inner group — D3 owns outer translate, CSS owns inner scale/animation
  const inner = circles.append('g')
    .attr('class', (_, i) => `bubble-inner bubble-float-${i % 5}`)

  inner.append('circle')
    .attr('r', (d: any) => d.r)
    .attr('fill', (d: any) => d.color)
    .attr('fill-opacity', 0.85)
    .attr('stroke', (d: any) => d.color)
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.4)

  // Tag label — truncated to fit inside circle
  inner.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', (d: any) => d.r > 45 ? '-0.3em' : '0.35em')
    .attr('font-family', 'Inter, sans-serif')
    .attr('font-size', (d: any) => Math.max(10, Math.min(14, d.r / 3.5)) + 'px')
    .attr('font-weight', '700')
    .attr('fill', '#ffffff')
    .attr('pointer-events', 'none')
    .text((d: any) => {
      const fs = Math.max(10, Math.min(14, d.r / 3.5))
      return truncateTag(d.tag, d.r, fs)
    })

  // Value label (only for large enough bubbles)
  inner.filter((d: any) => d.r > 45)
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.1em')
    .attr('font-family', 'Inter, sans-serif')
    .attr('font-size', (d: any) => Math.max(9, Math.min(11, d.r / 5)) + 'px')
    .attr('font-weight', '500')
    .attr('fill', 'rgba(255,255,255,0.8)')
    .attr('pointer-events', 'none')
    .text((d: any) => fmt(d.value))

  // Click on background: deselect
  svg.on('click', function(event: MouseEvent) {
    if ((event.target as SVGElement).tagName === 'svg') {
      selectedNode.value = null
      tooltipStyle.value = { ...tooltipStyle.value, opacity: 0 }
      svg.selectAll('.bubble-inner').style('opacity', 1).style('filter', '')
    }
  })

  simulation = d3.forceSimulation(nodesData as any)
    .force('center', d3.forceCenter(W / 2, H / 2).strength(0.05))
    .force('charge', d3.forceManyBody().strength(8))
    .force('collision', d3.forceCollide((d: any) => d.r + 4).strength(0.9))
    .alphaDecay(0.02)
    .on('tick', () => {
      circles.attr('transform', (d: any) => {
        d.x = Math.max(d.r + 4, Math.min(W - d.r - 4, d.x))
        d.y = Math.max(d.r + 4, Math.min(H - d.r - 4, d.y))
        if (selectedNode.value?.tag === d.tag) {
          tooltipStyle.value = { ...positionTooltip(d, W, H) }
        }
        return `translate(${d.x},${d.y})`
      })
    })
}

watch(() => props.baseParams, () => {
  selectedNode.value = null
  tooltipStyle.value = { left: '0px', top: '0px', opacity: 0 }
  load()
}, { deep: true, immediate: true })

watch([top10], async () => {
  selectedNode.value = null
  tooltipStyle.value = { left: '0px', top: '0px', opacity: 0 }
  await nextTick()
  renderBubbles()
})

watch(metric, load)

onUnmounted(() => {
  if (simulation) { simulation.stop(); simulation = null }
})
</script>

<template>
  <div class="ht-wrap">
    <!-- Toolbar -->
    <div class="ht-toolbar">
      <div class="metric-tabs">
        <button :class="['mtab', { active: metric === 'views' }]"      @click="metric = 'views'">Views</button>
        <button :class="['mtab', { active: metric === 'count' }]"      @click="metric = 'count'">Posts</button>
        <button :class="['mtab', { active: metric === 'engagement' }]" @click="metric = 'engagement'">Likes + RT</button>
      </div>
      <span class="hint-label">Top 10 hashtags · bubble size = {{ metric === 'views' ? 'views' : metric === 'count' ? 'posts' : 'likes + retweets' }}</span>
      <span v-if="loading" class="loading-dot">●</span>
    </div>

    <div v-if="!data.length && !loading" class="empty">No hashtag data — sync tweet cache first</div>

    <div v-else ref="containerRef" class="bubble-container">
      <svg ref="svgRef" style="width:100%; display:block;"></svg>

      <!-- Tooltip -->
      <Transition name="tooltip-fade">
        <div v-if="selectedNode" class="bubble-tooltip" :style="tooltipStyle">
          <div class="tt-tag">{{ selectedNode.tag }}</div>
          <div class="tt-row"><span class="tt-k">Posts</span><span class="tt-v">{{ selectedNode.count.toLocaleString() }}</span></div>
          <div class="tt-row"><span class="tt-k">Views</span><span class="tt-v">{{ fmt(selectedNode.views) }}</span></div>
          <div class="tt-row"><span class="tt-k">Likes</span><span class="tt-v">{{ fmt(selectedNode.likes) }}</span></div>
          <div class="tt-row"><span class="tt-k">Retweets</span><span class="tt-v">{{ fmt(selectedNode.retweets) }}</span></div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.ht-wrap { display: flex; flex-direction: column; gap: 10px; }

.ht-toolbar {
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

.hint-label {
  font-size: 11px; color: var(--text-muted); margin-left: auto;
}

.loading-dot { font-size: 10px; color: var(--primary); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: .3 } 50% { opacity: 1 } }

.empty {
  height: 300px; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 13px;
}

.bubble-container {
  position: relative;
  height: 380px;
  background: var(--bg);
  border-radius: 10px;
  overflow: visible;
}

/* Inner group: CSS handles hover + float; D3 handles translate */
:deep(.bubble-inner) {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s ease, opacity 0.25s ease;
}
:deep(.bubble:hover .bubble-inner) {
  transform: scale(1.10);
  filter: drop-shadow(0 6px 18px rgba(99, 102, 241, 0.35));
}

/* Floating animation — 5 phase offsets so bubbles drift independently */
@keyframes bubble-float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-6px); }
}
:deep(.bubble-float-0) { animation: bubble-float 4.0s ease-in-out infinite; }
:deep(.bubble-float-1) { animation: bubble-float 4.7s ease-in-out infinite 0.8s; }
:deep(.bubble-float-2) { animation: bubble-float 3.8s ease-in-out infinite 1.6s; }
:deep(.bubble-float-3) { animation: bubble-float 5.1s ease-in-out infinite 0.4s; }
:deep(.bubble-float-4) { animation: bubble-float 4.3s ease-in-out infinite 2.1s; }

/* Pause float when hovered so scale doesn't fight with translateY */
:deep(.bubble:hover .bubble-inner) {
  animation-play-state: paused;
  transform: scale(1.10);
}

/* Tooltip */
.bubble-tooltip {
  position: absolute;
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 8px 24px rgba(99,102,241,0.15);
  min-width: 170px;
  pointer-events: none;
  z-index: 10;
}
.tt-tag {
  font-size: 14px; font-weight: 700; color: var(--primary);
  margin-bottom: 8px; padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.tt-row { display: flex; justify-content: space-between; gap: 16px; margin-top: 4px; }
.tt-k { font-size: 11px; color: var(--text-muted); }
.tt-v { font-size: 11px; font-weight: 700; color: var(--text); }

.tooltip-fade-enter-active, .tooltip-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.tooltip-fade-enter-from, .tooltip-fade-leave-to { opacity: 0; transform: translateY(4px); }
</style>
