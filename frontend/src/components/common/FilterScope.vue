<script setup lang="ts">
import { computed } from 'vue'
import { useFiltersStore } from '../../stores/filters'

const props = defineProps<{
  country?: boolean
  theme?: boolean
  date?: boolean
}>()

const filters = useFiltersStore()

const chips = computed(() => {
  const list: { key: string; label: string; icon: string; active: boolean; applies: boolean }[] = []

  list.push({
    key: 'country',
    label: filters.country || 'Country',
    icon: '🌍',
    active: !!filters.country,
    applies: !!props.country,
  })
  list.push({
    key: 'theme',
    label: filters.theme || 'Theme',
    icon: '🏷️',
    active: !!filters.theme,
    applies: !!props.theme,
  })

  const hasDate = !!(filters.dateFrom || filters.dateTo)
  const dateLabel = filters.dateFrom && filters.dateTo
    ? `${filters.dateFrom} → ${filters.dateTo}`
    : filters.dateFrom ? `From ${filters.dateFrom}`
    : filters.dateTo   ? `To ${filters.dateTo}`
    : 'Date'
  list.push({
    key: 'date',
    label: dateLabel,
    icon: '📅',
    active: hasDate,
    applies: !!props.date,
  })

  return list
})
</script>

<template>
  <div class="fs-wrap">
    <template v-for="chip in chips">
      <span
        v-if="chip.applies"
        :key="chip.key"
        class="fs-chip"
        :class="{
          'fs-chip--active': chip.active,
          'fs-chip--idle': !chip.active,
        }"
        :title="chip.applies ? (chip.active ? `Filtered by: ${chip.label}` : `Can filter by ${chip.key}`) : ''"
      >
        <span class="fs-icon">{{ chip.icon }}</span>
        <span v-if="chip.active" class="fs-label">{{ chip.label }}</span>
      </span>
    </template>
    <span v-if="!country && !theme && !date" class="fs-chip fs-chip--none" title="This chart always shows all data regardless of filters">
      <span class="fs-icon">🔒</span>
      <span class="fs-label">All data</span>
    </span>
  </div>
</template>

<style scoped>
.fs-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  flex-wrap: nowrap;
}

.fs-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 600;
  padding: 0px 6px 0px 4px;
  line-height: 18px;
  border-radius: 20px;
  border: 1px solid transparent;
  white-space: nowrap;
  transition: all 0.15s;
  cursor: default;
  vertical-align: middle;
}

/* Active: filter is set and this dimension applies */
.fs-chip--active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.4);
  color: #818cf8;
}

/* Idle: filter not set, but dimension applies — shows icon only, dimmed */
.fs-chip--idle {
  background: transparent;
  border-color: transparent;
  color: var(--text-muted);
  opacity: 0.4;
  padding: 0 3px;
}

/* None: not filter-aware at all */
.fs-chip--none {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.25);
  color: #f59e0b;
  opacity: 0.8;
}

.fs-icon { font-size: 11px; line-height: 1; }
.fs-label { letter-spacing: 0.01em; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
