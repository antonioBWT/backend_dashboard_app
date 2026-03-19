<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { statsApi } from '../../api'

const topN = ref<number>(10)
const rawData = ref<any>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    rawData.value = await statsApi.sentiment({ limit: topN.value })
  } catch (e) {
    console.error('Sentiment load failed:', e)
  } finally {
    loading.value = false
  }
}

watch(topN, load, { immediate: true })

const filtered = computed(() => rawData.value?.byTheme ?? [])

const overall = computed(() => {
  const src = filtered.value
  if (!src.length) return { positive: 0, neutral: 0, negative: 0 }
  let pos = 0, neu = 0, neg = 0, tot = 0
  for (const t of src) {
    pos += t.positive * t.total
    neu += t.neutral  * t.total
    neg += t.negative * t.total
    tot += t.total
  }
  return {
    positive: tot ? Math.round(pos / tot) : 0,
    neutral:  tot ? Math.round(neu / tot) : 0,
    negative: tot ? Math.round(neg / tot) : 0,
  }
})
</script>

<template>
  <div class="sentiment-wrap">
    <div v-if="loading && !rawData" class="loading-state">
      <div class="pulse-ring"></div>
      <span>Computing sentiment…</span>
    </div>

    <template v-else>
      <!-- Filter -->
      <div class="filters-row">
        <div class="filter-group">
          <label>Show top themes</label>
          <el-select v-model="topN" style="width: 130px" :loading="loading">
            <el-option label="Top 5"  :value="5" />
            <el-option label="Top 10" :value="10" />
            <el-option label="Top 20" :value="20" />
            <el-option label="All"    :value="9999" />
          </el-select>
        </div>
        <span v-if="loading" class="loading-dot">●</span>
      </div>

      <!-- Overall summary -->
      <div class="overall-row">
        <div class="overall-item positive">
          <div class="overall-value">{{ overall.positive }}%</div>
          <div class="overall-label">Positive</div>
        </div>
        <div class="overall-divider"></div>
        <div class="overall-item neutral">
          <div class="overall-value">{{ overall.neutral }}%</div>
          <div class="overall-label">Neutral</div>
        </div>
        <div class="overall-divider"></div>
        <div class="overall-item negative">
          <div class="overall-value">{{ overall.negative }}%</div>
          <div class="overall-label">Negative</div>
        </div>
      </div>

      <!-- Per-theme bars -->
      <div class="theme-list">
        <div v-for="t in filtered" :key="t.theme" class="theme-row">
          <div class="theme-name" :title="t.theme">{{ t.theme }}</div>
          <div class="bar-wrap">
            <div class="bar-seg seg-positive" :style="{ width: t.positive + '%' }" />
            <div class="bar-seg seg-neutral"  :style="{ width: t.neutral  + '%' }" />
            <div class="bar-seg seg-negative" :style="{ width: t.negative + '%' }" />
          </div>
          <div class="theme-pct">
            <span class="pct-pos">{{ t.positive }}%</span>
            <span class="pct-neg">{{ t.negative }}%</span>
          </div>
        </div>

        <div v-if="!filtered.length && !loading" class="no-data">No AI analysis data yet</div>
      </div>

      <!-- Legend -->
      <div class="legend">
        <span class="leg-item"><span class="leg-dot positive"></span>Positive</span>
        <span class="leg-item"><span class="leg-dot neutral"></span>Neutral</span>
        <span class="leg-item"><span class="leg-dot negative"></span>Negative</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sentiment-wrap { display: flex; flex-direction: column; gap: 12px; }

/* Loading */
.loading-state {
  height: 200px; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: var(--text-muted); font-size: 13px;
}
.pulse-ring {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid rgba(99,102,241,0.2);
  border-top-color: var(--primary);
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Filter */
.filters-row { display: flex; gap: 16px; align-items: center; }
.filter-group { display: flex; align-items: center; gap: 8px; }
.filter-group label {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
}
.loading-dot { font-size: 10px; color: var(--primary-light); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity:.3 } 50% { opacity:1 } }

/* Overall row */
.overall-row {
  display: flex; align-items: center;
  background: var(--surface2); border-radius: 10px; padding: 10px 8px;
}
.overall-item { flex: 1; text-align: center; }
.overall-value { font-size: 20px; font-weight: 700; line-height: 1; }
.overall-label { font-size: 11px; color: var(--text-muted); margin-top: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
.overall-item.positive .overall-value { color: #10b981; }
.overall-item.neutral  .overall-value { color: #8b5cf6; }
.overall-item.negative .overall-value { color: #ef4444; }
.overall-divider { width: 1px; height: 32px; background: var(--border); }

/* Bars */
.theme-list { display: flex; flex-direction: column; gap: 7px; }
.theme-row { display: flex; align-items: center; gap: 8px; }
.theme-name {
  font-size: 11px; color: var(--text-muted); width: 130px;
  flex-shrink: 0; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; font-weight: 500;
}
.bar-wrap {
  flex: 1; height: 10px; border-radius: 5px;
  overflow: hidden; display: flex; background: var(--surface2);
}
.bar-seg { height: 100%; transition: width 0.4s ease; }
.seg-positive { background: #10b981; }
.seg-neutral  { background: #8b5cf6; }
.seg-negative { background: #ef4444; }
.theme-pct { display: flex; gap: 6px; font-size: 10px; font-weight: 600; flex-shrink: 0; min-width: 72px; }
.pct-pos { color: #10b981; }
.pct-neg { color: #ef4444; }
.no-data { font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px; }

/* Legend */
.legend { display: flex; gap: 16px; justify-content: center; }
.leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); }
.leg-dot { width: 8px; height: 8px; border-radius: 50%; }
.leg-dot.positive { background: #10b981; }
.leg-dot.neutral  { background: #8b5cf6; }
.leg-dot.negative { background: #ef4444; }
</style>
