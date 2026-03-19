<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { useFiltersStore } from "../stores/filters";
import { statsApi } from "../api";
import PageLoader from "../components/common/PageLoader.vue";
import KpiCards from "../components/dashboard/KpiCards.vue";
import TimelineChart from "../components/charts/TimelineChart.vue";
import ShareOfVoiceChart from "../components/charts/ShareOfVoiceChart.vue";
import ThemeBarChart from "../components/charts/ThemeBarChart.vue";
import PostTypesChart from "../components/charts/PostTypesChart.vue";
import SentimentChart from "../components/charts/SentimentChart.vue";
import TopAuthorsTable from "../components/dashboard/TopAuthorsTable.vue";
import HotTopics from "../components/dashboard/HotTopics.vue";
import HashtagsChart from "../components/charts/HashtagsChart.vue";
import CountryChart from "../components/charts/CountryChart.vue";
import FilterScope from "../components/common/FilterScope.vue";

const auth = useAuthStore();
const filters = useFiltersStore();

const themes = ref<string[]>([]);
const countries = ref<string[]>([]);
const overview = ref<any>(null);
const byTheme = ref<any[]>([]);
const postTypes = ref<any[]>([]);
const topAuthors = ref<any[]>([]);
const hotTopics = ref<any[]>([]);
const loading = ref(false);

// Base params without granularity — passed to self-fetching charts
const baseParams = computed(() => filters.getParams());

// Active filter chips for UI feedback
const activeFilters = computed(() => {
  const chips: { label: string; value: string }[] = [];
  if (filters.country) chips.push({ label: "Country", value: filters.country });
  if (filters.theme) chips.push({ label: "Theme", value: filters.theme });
  if (filters.dateFrom) chips.push({ label: "From", value: filters.dateFrom });
  if (filters.dateTo) chips.push({ label: "To", value: filters.dateTo });
  return chips;
});
const hasFilters = computed(() => activeFilters.value.length > 0);

async function loadFilters() {
  const [t, c] = await Promise.all([statsApi.themes(), statsApi.countries()]);
  themes.value = t;
  countries.value = c;
}

async function loadData() {
  loading.value = true;
  const params = filters.getParams();
  try {
    const [ov, bt, pt, ta] = await Promise.all([
      statsApi.overview(params),
      statsApi.byTheme(params),
      statsApi.postTypes(params),
      statsApi.topAuthors(params),
    ]);
    overview.value = ov;
    byTheme.value = bt;
    postTypes.value = pt;
    topAuthors.value = ta;
  } finally {
    loading.value = false;
  }
}

async function loadInsights() {
  const params = filters.getParams();
  hotTopics.value = await statsApi.hotThemes(params).catch(() => []);
}

onMounted(async () => {
  await filters.loadDefaults(); // apply admin-configured defaults before first data fetch
  await loadFilters();
  await loadData();
  loadInsights();
});

watch(
  baseParams,
  () => {
    loadData();
    loadInsights();
  },
  { deep: true },
);
</script>

<template>
  <div class="dashboard-layout">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="header-brand">
          <div class="header-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z"
                fill="currentColor"
                opacity=".9"
              />
            </svg>
          </div>
          <div>
            <div class="header-title">PwC Social Analytics</div>
            <div class="header-sub">
              Middle East · X (Twitter) · Real-time Intelligence
            </div>
          </div>
        </div>
      </div>

      <nav class="header-nav">
        <button class="nav-link active" @click="$router.push('/')">
          Dashboard
        </button>
        <button class="nav-link" @click="$router.push('/tweets')">Posts</button>
      </nav>

      <div class="header-right">
        <div class="header-user">
          <span class="user-avatar">{{
            (auth.user?.name || auth.user?.email || "U")[0].toUpperCase()
          }}</span>
          <span class="user-name">{{
            auth.user?.name || auth.user?.email
          }}</span>
        </div>
        <el-button v-if="auth.isAdmin" @click="$router.push('/admin')">
          <el-icon><Setting /></el-icon> <span class="ml-2">Admin</span>
        </el-button>
        <el-button
          @click="
            auth.logout();
            $router.push('/login');
          "
          >Sign Out</el-button
        >
      </div>
    </header>

    <!-- Filters Bar -->
    <div class="filters-bar">
      <div class="filters-row">
        <div class="filter-item">
          <label>Country</label>
          <el-select
            v-model="filters.country"
            placeholder="All countries"
            clearable
            style="width: 150px"
          >
            <el-option v-for="c in countries" :key="c" :label="c" :value="c" />
          </el-select>
        </div>
        <div class="filter-item">
          <label>Theme</label>
          <el-select
            v-model="filters.theme"
            placeholder="All themes"
            clearable
            style="min-width: 220px"
          >
            <el-option v-for="t in themes" :key="t" :label="t" :value="t" />
          </el-select>
        </div>
        <div class="filter-item">
          <label>Date From</label>
          <el-date-picker
            v-model="filters.dateFrom"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 160px"
          />
        </div>
        <div class="filter-item">
          <label>Date To</label>
          <el-date-picker
            v-model="filters.dateTo"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 160px"
          />
        </div>
        <div class="filter-actions">
          <el-button
            @click="
              filters.reset();
              loadData();
            "
            >Reset</el-button
          >
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <PageLoader :visible="loading" text="Loading analytics…" />
    <div class="main-content">
      <!-- ── Filtered section ─────────────────────────────── -->
      <div class="group-label">
        <span class="group-label-line"></span>
        <span class="group-label-text">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="currentColor"
            style="opacity: 0.7"
          >
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
          Filtered by selection above
        </span>
        <span class="group-label-line"></span>
        <template v-if="hasFilters">
          <span
            v-for="chip in activeFilters"
            :key="chip.label"
            class="filter-chip"
          >
            {{ chip.label }}: <b>{{ chip.value }}</b>
          </span>
        </template>
        <span v-else class="filter-chip filter-chip--none"
          >No filters active · showing all data</span
        >
      </div>

      <!-- KPI Cards -->
      <KpiCards :data="overview" />

      <!-- Tweet Volume — full width -->
      <div class="card" :class="{ 'card--filtered': hasFilters }">
        <div class="section-title">
          📈 Tweet Volume Over Time
          <FilterScope :country="true" :theme="true" :date="true" />
        </div>
        <TimelineChart :base-params="baseParams" />
      </div>

      <!-- Share of Voice — full width -->
      <div class="card" :class="{ 'card--filtered': hasFilters }">
        <div class="section-title">
          📡 Share of Voice by Theme
          <FilterScope :country="true" :date="true" />
          <span class="sov-hint"
            >How topics compete for conversation over time</span
          >
        </div>
        <ShareOfVoiceChart :base-params="baseParams" />
      </div>

      <!-- Row: Post Types + Top Authors -->
      <div class="grid-1-1 grid-stretch">
        <div
          class="card card-stretch"
          :class="{ 'card--filtered': hasFilters }"
        >
          <div class="section-title">
            🔄 Post Types
            <FilterScope :country="true" :theme="true" :date="true" />
          </div>
          <div class="post-types-fill">
            <PostTypesChart :data="postTypes" />
          </div>
        </div>
        <div class="card">
          <div class="section-title">
            👥 Top Authors by Views
            <FilterScope :country="true" :theme="true" :date="true" />
          </div>
          <TopAuthorsTable :data="topAuthors" />
        </div>
      </div>

      <!-- Engagement by Theme — full width -->
      <div class="card card-stretch" :class="{ 'card--filtered': hasFilters }">
        <div class="section-title">
          📊 Engagement by Theme
          <FilterScope :country="true" :date="true" />
        </div>
        <ThemeBarChart :data="byTheme" />
      </div>

      <!-- Row: Hot Topics -->
      <div class="card" :class="{ 'card--filtered': hasFilters }">
        <div class="section-title">
          🔥 Hot Topics This Week
          <FilterScope :country="true" :date="true" />
        </div>
        <HotTopics :data="hotTopics" />
      </div>

      <!-- Hashtags — full width -->
      <div class="card" :class="{ 'card--filtered': hasFilters }">
        <div class="section-title">
          # Top Hashtags
          <FilterScope :country="true" :theme="true" :date="true" />
        </div>
        <HashtagsChart :base-params="baseParams" />
      </div>

      <!-- ── General insights (not affected by filters) ──── -->
      <div class="group-label group-label--insights">
        <span class="group-label-line"></span>
        <span class="group-label-text"
          >General insights · not affected by filters above</span
        >
        <span class="group-label-line"></span>
      </div>

      <!-- Post Volume by Country — full width, unfiltered -->
      <div class="card">
        <div class="section-title">
          🌍 Post Volume by Country
          <FilterScope />
        </div>
        <CountryChart />
      </div>

      <!-- Sentiment Analysis — full width, unfiltered -->
      <div class="card">
        <div class="section-title">
          💬 Sentiment Analysis
          <FilterScope />
        </div>
        <SentimentChart />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  height: 64px;
  background: var(--surface-bar);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  gap: 24px;
}

.header-left {
  flex-shrink: 0;
}
.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-logo {
  width: 36px;
  height: 36px;
  background: var(--primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.header-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}
.header-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 1px;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: center;
}
.nav-link {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  transition: all 0.15s;
}
.nav-link:hover {
  background: var(--surface2);
  color: var(--text);
}
.nav-link.active {
  background: rgba(99, 102, 241, 0.08);
  color: var(--primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.header-user {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 4px;
}
.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.user-name {
  font-size: 13px;
  color: var(--text-muted);
}

.filters-bar {
  background: var(--surface-bar);
  border-bottom: 1px solid var(--border);
  padding: 12px 24px;
}
.filters-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-item label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 1px;
}

.main-content {
  flex: 1;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.grid-2-1 {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}
.grid-1-2 {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 20px;
}

.grid-1-1 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.grid-stretch {
  align-items: stretch;
}
.card-stretch {
  display: flex;
  flex-direction: column;
}
.card-stretch > :last-child {
  flex: 1;
}

.section-title {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  overflow: hidden;
}
.sov-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 4px;
}

/* Section group dividers */
.group-label {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 -4px;
}
.group-label-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}
.group-label-text {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
}
.group-label--insights .group-label-text {
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.06);
}

/* Active filter chips shown in the section divider */
.filter-chip {
  font-size: 10px;
  font-weight: 500;
  color: var(--primary);
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 20px;
  padding: 2px 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.filter-chip b {
  font-weight: 700;
}
.filter-chip--none {
  color: var(--text-muted);
  background: transparent;
  border-color: var(--border);
}

.post-types-fill {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 280px;
}
.post-types-fill :deep(.highcharts-container),
.post-types-fill :deep(.highcharts-root) {
  height: 100% !important;
}

/* Subtle left accent on cards that respond to current filters */
.card--filtered {
  box-shadow:
    var(--shadow),
    inset 3px 0 0 rgba(99, 102, 241, 0.4);
}
</style>
