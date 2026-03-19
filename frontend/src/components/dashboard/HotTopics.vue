<script setup lang="ts">
defineProps<{ data: any[] }>()

const trendIcon:  Record<string, string> = { rising: '↑', stable: '→', falling: '↓' }
const trendColor: Record<string, string> = { rising: '#10b981', stable: '#94a3b8', falling: '#ef4444' }

function fmt(n: any): string {
  const num = Number(n)
  if (!num) return '0'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(0) + 'K'
  return num.toLocaleString()
}

function pctLabel(pct: number | null): string {
  if (pct === null || pct === undefined) return 'new'
  return (pct > 0 ? '+' : '') + pct + '%'
}
</script>

<template>
  <div class="topics-wrap">
    <div v-if="!data?.length" class="empty-state">
      <div class="empty-icon">📊</div>
      <p>No theme data yet. Run a sync first.</p>
    </div>

    <div v-else class="topics-list">
      <div v-for="(t, i) in data" :key="i" class="topic-item">
        <div class="topic-rank">{{ i + 1 }}</div>

        <div class="topic-body">
          <div class="topic-name">{{ t.topic }}</div>
          <div class="topic-meta">
            <span>{{ fmt(t.count) }} posts</span>
            <span class="dot">·</span>
            <span>{{ fmt(t.views) }} views</span>
          </div>
        </div>

        <div class="topic-right">
          <span class="trend-badge" :style="{ color: trendColor[t.trend], borderColor: trendColor[t.trend] + '40', background: trendColor[t.trend] + '15' }">
            {{ trendIcon[t.trend] }} {{ pctLabel(t.changePct) }}
          </span>
          <span class="trend-label" :style="{ color: trendColor[t.trend] }">{{ t.trend }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topics-wrap { display: flex; flex-direction: column; }

.empty-state { text-align: center; padding: 32px 16px; color: var(--text-muted); }
.empty-icon { font-size: 28px; margin-bottom: 8px; }
.empty-state p { font-size: 13px; }

.topics-list { display: flex; flex-direction: column; gap: 6px; }

.topic-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface2);
  border-radius: 8px;
  border: 1px solid var(--border);
  transition: border-color 0.15s;
}
.topic-item:hover { border-color: var(--primary); }

.topic-rank {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  min-width: 18px;
  text-align: center;
}
.topic-body { flex: 1; min-width: 0; }
.topic-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topic-meta {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.dot { color: var(--border); }

.topic-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}
.trend-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  border: 1px solid;
  white-space: nowrap;
  letter-spacing: 0.02em;
}
.trend-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
</style>
