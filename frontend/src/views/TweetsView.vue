<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { tweetsApi, statsApi, aiAnalysisApi, settingsApi } from "../api";
import { ElMessage } from "element-plus";
import PageLoader from "../components/common/PageLoader.vue";

const router = useRouter();
const auth = useAuthStore();

interface Tweet {
  id: number;
  external_id: string;
  post_text: string;
  author: string;
  post_status: string;
  date_published: string;
  likes_count: number;
  retweets_count: number;
  replies_count: number;
  views_count: number;
  theme: string;
  policy: string;
  country: string;
}

interface PostAnalysis {
  sentiment: string | null;
  sentimentScore: number | null;
  sentimentConfidence: number | null;
  subtopic: string | null;
  emotion: string | null;
}

const tweets = ref<Tweet[]>([]);
const total = ref(0);
const pages = ref(0);
const capped = ref(false);
const loading = ref(false);
const aiCache = ref<Record<string, PostAnalysis>>({});

const themes = ref<string[]>([]);
const countries = ref<string[]>([]);

// Favorites (persisted in localStorage)
const favorites = ref<Set<string>>(
  new Set(JSON.parse(localStorage.getItem("pwc_favorites") || "[]")),
);
const showOnlyFavorites = ref(false);

function toggleFavorite(externalId: string, event?: MouseEvent) {
  event?.stopPropagation();
  const next = new Set(favorites.value);
  if (next.has(externalId)) {
    next.delete(externalId);
  } else {
    next.add(externalId);
  }
  favorites.value = next;
  localStorage.setItem("pwc_favorites", JSON.stringify([...next]));
}

// Filters
const filters = ref({
  country: "",
  theme: "",
  dateFrom: "",
  dateTo: "",
  postStatus: "",
  search: "",
  sortBy: "views" as "views" | "likes" | "retweets" | "date",
  page: 1,
  limit: 20,
});

// Displayed tweets (optionally filtered by favorites)
const displayedTweets = computed(() =>
  showOnlyFavorites.value
    ? tweets.value.filter((t) => favorites.value.has(t.external_id))
    : tweets.value,
);

// Preview modal
const previewTweet = ref<Tweet | null>(null);
const showPreview = ref(false);

// Hashtags extracted from preview post text
const previewHashtags = computed(() => {
  const text = previewTweet.value?.post_text ?? "";
  return [
    ...new Set((text.match(/#[\wА-яёЁ]+/g) ?? []).map((t) => t.toLowerCase())),
  ];
});

// Mini chart data for modal
const miniChartMetrics = computed(() => {
  if (!previewTweet.value) return [];
  const t = previewTweet.value;
  const maxVal =
    Math.max(
      t.views_count,
      t.likes_count,
      t.retweets_count,
      t.replies_count || 0,
    ) || 1;
  return [
    {
      label: "Views",
      value: t.views_count,
      color: "#6366F1",
      pct: (t.views_count / maxVal) * 100,
    },
    {
      label: "Likes",
      value: t.likes_count,
      color: "#EC4899",
      pct: (t.likes_count / maxVal) * 100,
    },
    {
      label: "Retweets",
      value: t.retweets_count,
      color: "#10B981",
      pct: (t.retweets_count / maxVal) * 100,
    },
    {
      label: "Replies",
      value: t.replies_count,
      color: "#F59E0B",
      pct: ((t.replies_count || 0) / maxVal) * 100,
    },
  ];
});

async function load() {
  loading.value = true;
  try {
    const params: any = { ...filters.value };
    // strip empty
    Object.keys(params).forEach((k) => {
      if (!params[k]) delete params[k];
    });
    const res = await tweetsApi.list(params);
    tweets.value = res.data;
    total.value = res.total;
    pages.value = res.pages;
    capped.value = res.capped ?? false;
    loadAiForTweets(res.data);
  } catch (e: any) {
    ElMessage.error("Failed to load posts");
  } finally {
    loading.value = false;
  }
}

function loadAiForTweets(list: Tweet[]) {
  list.forEach((t) => {
    if (aiCache.value[t.external_id]) return;
    aiAnalysisApi
      .forPost(t.external_id)
      .then((data: PostAnalysis) => {
        if (data?.sentiment) aiCache.value[t.external_id] = data;
      })
      .catch(() => {
        /* not yet analyzed — ignore */
      });
  });
}

function sentimentColor(s: string | null): string {
  if (s === "positive") return "#10b981";
  if (s === "negative") return "#ef4444";
  return "#8b5cf6";
}

const dateRange = ref<{ min: string; max: string } | null>(null);
const defaultDateFrom = ref('');

function disabledDate(time: Date): boolean {
  if (!dateRange.value) return false;
  const d = time.toISOString().slice(0, 10);
  return d < dateRange.value.min || d > dateRange.value.max;
}

function resetFilters() {
  filters.value = {
    country: "",
    theme: "",
    dateFrom: defaultDateFrom.value,
    dateTo: "",
    postStatus: "",
    search: "",
    sortBy: "views",
    page: 1,
    limit: 20,
  };
}

function onPageChange(p: number) {
  filters.value.page = p;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => ({ ...filters.value }),
  (n, o) => {
    if (n.page === o.page) filters.value.page = 1;
    if (debounceTimer) clearTimeout(debounceTimer);
    const delay = n.search !== o.search ? 500 : 300;
    debounceTimer = setTimeout(load, delay);
  },
  { deep: true },
);

function fmt(n: any): string {
  const num = Number(n);
  if (!num) return "0";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(0) + "K";
  return num.toLocaleString();
}

function tweetUrl(t: Tweet): string {
  return `https://x.com/i/web/status/${t.external_id}`;
}

function postStatusColor(s: string): string {
  if (s === "original post") return "success";
  if (s === "reply") return "info";
  if (s === "quote tweet") return "warning";
  return "";
}

onMounted(async () => {
  const [t, c, dr, appSettings] = await Promise.all([
    statsApi.themes(),
    statsApi.countries(),
    statsApi.dateRange().catch(() => null),
    settingsApi.getAppSettings().catch(() => ({})),
  ]);
  themes.value = t;
  countries.value = c;
  if (dr?.min && dr?.max) dateRange.value = dr;

  // Apply history_months from global settings relative to max DB date
  const months = Number(appSettings?.history_months ?? 0);
  if (months > 0 && dr?.max) {
    const d = new Date(dr.max);
    d.setMonth(d.getMonth() - months);
    defaultDateFrom.value = d.toISOString().slice(0, 10);
    filters.value.dateFrom = defaultDateFrom.value;
  }
  load();
});
</script>

<template>
  <div class="tweets-layout">
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
        <button class="nav-link" @click="router.push('/')">Dashboard</button>
        <button class="nav-link active">Posts</button>
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
        <el-button v-if="auth.isAdmin" @click="router.push('/admin')">
          <el-icon><Setting /></el-icon> <span class="ml-2">Admin</span>
        </el-button>
        <el-button
          @click="
            auth.logout();
            router.push('/login');
          "
          >Sign Out</el-button
        >
      </div>
    </header>

    <!-- Filters -->
    <div class="filters-bar">
      <div class="filters-row">
        <div class="filter-item">
          <label>Country</label>
          <el-select
            v-model="filters.country"
            placeholder="All"
            clearable
            style="width: 140px"
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
            style="min-width: 200px"
          >
            <el-option v-for="t in themes" :key="t" :label="t" :value="t" />
          </el-select>
        </div>
        <div class="filter-item">
          <label>Post Type</label>
          <el-select
            v-model="filters.postStatus"
            placeholder="All types"
            clearable
            style="width: 160px"
          >
            <el-option label="Original post" value="original post" />
            <el-option label="Reply" value="reply" />
            <el-option label="Quote tweet" value="quote tweet" />
          </el-select>
        </div>
        <div class="filter-item">
          <label>Date From</label>
          <el-date-picker
            v-model="filters.dateFrom"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 155px"
            :disabled-date="disabledDate"
          />
        </div>
        <div class="filter-item">
          <label>Date To</label>
          <el-date-picker
            v-model="filters.dateTo"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 155px"
            :disabled-date="disabledDate"
          />
        </div>
        <div class="filter-item">
          <label>Sort by</label>
          <el-select v-model="filters.sortBy" style="width: 130px">
            <el-option label="Most viewed" value="views" />
            <el-option label="Most liked" value="likes" />
            <el-option label="Most retweeted" value="retweets" />
            <el-option label="Newest" value="date" />
          </el-select>
        </div>
        <div class="filter-item search-item">
          <label>Search</label>
          <el-input
            v-model="filters.search"
            placeholder="Search in posts..."
            clearable
            style="width: 220px"
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>
        </div>
        <div class="filter-actions">
          <el-button @click="resetFilters">Reset</el-button>
        </div>
      </div>
    </div>

    <!-- Results bar -->
    <div class="results-bar">
      <span class="results-count">
        <b>{{ capped ? "50,000+" : total.toLocaleString() }}</b> posts found
        <span v-if="showOnlyFavorites" class="fav-count-note"
          >· showing {{ displayedTweets.length }} favorites from this page</span
        >
      </span>
      <div class="results-right">
        <button
          :class="['fav-toggle', { active: showOnlyFavorites }]"
          @click="showOnlyFavorites = !showOnlyFavorites"
          :title="showOnlyFavorites ? 'Show all posts' : 'Show favorites only'"
        >
          {{ showOnlyFavorites ? "★" : "☆" }} Favorites
          <span v-if="favorites.size" class="fav-badge">{{
            favorites.size
          }}</span>
        </button>
        <el-select
          v-model="filters.limit"
          style="width: 110px"
          @change="filters.page = 1"
        >
          <el-option label="20 / page" :value="20" />
          <el-option label="50 / page" :value="50" />
          <el-option label="100 / page" :value="100" />
        </el-select>
      </div>
    </div>

    <PageLoader :visible="loading" text="Loading posts…" />

    <!-- Tweet List -->
    <div class="tweets-container">
      <div v-if="!tweets.length && !loading" class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No posts found for the selected filters</p>
      </div>

      <div
        v-for="t in displayedTweets"
        :key="t.id"
        class="tweet-card"
        @click="
          previewTweet = t;
          showPreview = true;
        "
      >
        <div class="tweet-header">
          <div class="tweet-author-block">
            <span class="tweet-author">@{{ t.author }}</span>
            <el-tag
              :type="postStatusColor(t.post_status)"
              size="small"
              class="post-type-tag"
            >
              {{ t.post_status }}
            </el-tag>
          </div>
          <div class="tweet-meta-right">
            <span v-if="t.theme" class="theme-badge">{{ t.theme }}</span>
            <span class="tweet-date">{{
              new Date(t.date_published).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            }}</span>
            <button
              :class="['fav-btn', { active: favorites.has(t.external_id) }]"
              @click.stop="toggleFavorite(t.external_id)"
              title="Add to favorites"
            >
              {{ favorites.has(t.external_id) ? "★" : "☆" }}
            </button>
          </div>
        </div>

        <!-- AI sub-theme -->
        <div class="tweet-subtopic">
          <span class="subtopic-label">AI Sub-theme</span>
          <span
            v-if="aiCache[t.external_id]?.subtopic"
            class="subtopic-value subtopic-done"
          >
            {{ aiCache[t.external_id].subtopic }}
          </span>
          <span v-else class="subtopic-value">Analysis in progress…</span>
          <span
            v-if="aiCache[t.external_id]?.sentiment"
            class="sentiment-chip"
            :style="{
              background:
                sentimentColor(aiCache[t.external_id].sentiment) + '22',
              color: sentimentColor(aiCache[t.external_id].sentiment),
              borderColor:
                sentimentColor(aiCache[t.external_id].sentiment) + '55',
            }"
            >{{ aiCache[t.external_id].sentiment }}</span
          >
        </div>

        <div class="tweet-text">{{ t.post_text }}</div>

        <div class="tweet-stats">
          <span class="stat"
            ><span class="stat-icon">👁</span> {{ fmt(t.views_count) }}</span
          >
          <span class="stat"
            ><span class="stat-icon">❤️</span> {{ fmt(t.likes_count) }}</span
          >
          <span class="stat"
            ><span class="stat-icon">🔁</span> {{ fmt(t.retweets_count) }}</span
          >
          <span v-if="t.replies_count" class="stat"
            ><span class="stat-icon">💬</span> {{ fmt(t.replies_count) }}</span
          >
          <span v-if="t.country" class="stat country-stat"
            >📍 {{ t.country }}</span
          >
        </div>

        <!-- Post sentiment confidence bar -->
        <div v-if="aiCache[t.external_id]?.sentiment" class="replies-sentiment">
          <span class="rs-label">Sentiment</span>
          <div class="rs-bar">
            <div
              class="rs-seg"
              :style="{
                width:
                  Math.round(
                    (aiCache[t.external_id].sentimentConfidence ?? 0.7) * 100,
                  ) + '%',
                background: sentimentColor(aiCache[t.external_id].sentiment),
              }"
            ></div>
          </div>
          <span class="rs-hint"
            >{{
              Math.round(
                (aiCache[t.external_id].sentimentConfidence ?? 0.7) * 100,
              )
            }}% conf.</span
          >
        </div>
        <div v-else-if="t.replies_count" class="replies-sentiment">
          <span class="rs-label">Sentiment</span>
          <div class="rs-bar">
            <div class="rs-seg rs-neu" style="width: 100%; opacity: 0.2"></div>
          </div>
          <span class="rs-hint">Pending</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination-bar" v-if="pages > 1">
      <el-pagination
        :current-page="filters.page"
        :page-size="filters.limit"
        :total="total"
        layout="prev, pager, next, jumper"
        :pager-count="7"
        @current-change="onPageChange"
      />
    </div>

    <!-- Preview Modal -->
    <el-dialog
      v-model="showPreview"
      width="640px"
      class="tweet-preview-dialog"
      @close="previewTweet = null"
    >
      <template #header>
        <div class="preview-dialog-header">
          <div class="preview-author-block">
            <span class="preview-author">@{{ previewTweet?.author }}</span>
            <el-tag
              v-if="previewTweet"
              :type="postStatusColor(previewTweet.post_status)"
              size="small"
            >
              {{ previewTweet.post_status }}
            </el-tag>
          </div>
          <button
            v-if="previewTweet"
            :class="[
              'fav-btn fav-btn--lg',
              { active: favorites.has(previewTweet.external_id) },
            ]"
            @click="toggleFavorite(previewTweet.external_id)"
            :title="
              favorites.has(previewTweet.external_id)
                ? 'Remove from favorites'
                : 'Add to favorites'
            "
          >
            {{ favorites.has(previewTweet.external_id) ? "★" : "☆" }}
          </button>
        </div>
      </template>

      <template v-if="previewTweet">
        <!-- Meta row -->
        <div class="preview-meta">
          <span v-if="previewTweet.theme" class="theme-badge">{{
            previewTweet.theme
          }}</span>
          <span
            v-if="aiCache[previewTweet.external_id]?.subtopic"
            class="subtopic-value subtopic-done"
          >
            {{ aiCache[previewTweet.external_id].subtopic }}
          </span>
          <span
            v-if="aiCache[previewTweet.external_id]?.sentiment"
            class="sentiment-chip"
            :style="{
              background:
                sentimentColor(aiCache[previewTweet.external_id].sentiment) +
                '18',
              color: sentimentColor(
                aiCache[previewTweet.external_id].sentiment,
              ),
              borderColor:
                sentimentColor(aiCache[previewTweet.external_id].sentiment) +
                '44',
            }"
            >{{ aiCache[previewTweet.external_id].sentiment }}</span
          >
          <span class="tweet-date">{{
            new Date(previewTweet.date_published).toLocaleString("en-GB")
          }}</span>
          <span v-if="previewTweet.country" class="tweet-date"
            >📍 {{ previewTweet.country }}</span
          >
        </div>

        <!-- Post text (scrollable) -->
        <div class="preview-text">{{ previewTweet.post_text }}</div>

        <!-- Hashtags extracted from post -->
        <div v-if="previewHashtags.length" class="preview-tags">
          <span v-for="tag in previewHashtags" :key="tag" class="preview-tag">{{
            tag
          }}</span>
        </div>

        <!-- Engagement breakdown — stat grid -->
        <div class="preview-chart">
          <div class="preview-chart-title">Engagement breakdown</div>
          <div class="engage-grid">
            <div
              v-for="m in miniChartMetrics"
              :key="m.label"
              class="engage-stat"
            >
              <div class="engage-dot" :style="{ background: m.color }"></div>
              <div class="engage-value">{{ fmt(m.value) }}</div>
              <div class="engage-label">{{ m.label }}</div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="preview-actions">
          <a :href="tweetUrl(previewTweet)" target="_blank" rel="noopener">
            <el-button type="primary">Open on X (Twitter) ↗</el-button>
          </a>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tweets-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
}

/* ── Header (shared with Dashboard) ── */
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
}
.user-name {
  font-size: 13px;
  color: var(--text-muted);
}

/* ── Filters ── */
.filters-bar {
  background: var(--surface-bar);
  border-bottom: 1px solid var(--border);
  padding: 14px 28px;
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

/* ── Results bar ── */
.results-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.results-count {
  color: var(--text-muted);
}
.results-count b {
  color: var(--text);
  font-weight: 600;
}
.fav-count-note {
  color: var(--primary);
  font-size: 12px;
  margin-left: 4px;
}
.results-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Favorites toggle */
.fav-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.fav-toggle:hover {
  border-color: #f59e0b;
  color: #d97706;
}
.fav-toggle.active {
  background: rgba(245, 158, 11, 0.08);
  border-color: #f59e0b;
  color: #d97706;
}
.fav-badge {
  background: #f59e0b;
  color: #fff;
  border-radius: 10px;
  font-size: 10px;
  padding: 1px 5px;
  font-weight: 700;
}

/* Favorite heart button on cards */
.fav-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 16px;
  color: var(--border);
  transition: all 0.15s;
  line-height: 1;
  border-radius: 4px;
  flex-shrink: 0;
}
.fav-btn:hover {
  color: #f59e0b;
  transform: scale(1.15);
}
.fav-btn.active {
  color: #f59e0b;
}
.fav-btn--lg {
  font-size: 20px;
  padding: 4px 6px;
}

/* ── Tweet cards ── */
.tweets-container {
  flex: 1;
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tweet-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 20px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.tweet-card:hover {
  border-color: var(--primary);
  background: var(--surface2);
}

.tweet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 12px;
}
.tweet-author-block {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tweet-author {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
}
.post-type-tag {
  flex-shrink: 0;
}
.tweet-meta-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.theme-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.08);
  color: var(--primary);
  white-space: nowrap;
}
.tweet-date {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.tweet-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
}

.tweet-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}
.stat-icon {
  font-size: 13px;
}
.country-stat {
  margin-left: auto;
}

/* ── Pagination ── */
.pagination-bar {
  display: flex;
  justify-content: center;
  padding: 20px 28px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}

/* ── Preview Dialog ── */
:deep(.tweet-preview-dialog .el-dialog__body) {
  padding: 0 20px 20px;
  max-height: 70vh;
  overflow-y: auto;
}
:deep(.tweet-preview-dialog .el-dialog__header) {
  padding: 16px 20px 14px !important;
}

.preview-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.preview-author-block {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-author {
  font-size: 15px;
  font-weight: 700;
  color: var(--primary);
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-top: 4px;
}
.preview-text {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  white-space: pre-wrap;
  max-height: 240px;
  overflow-y: auto;
}

/* Hashtag chips */
.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.preview-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 20px;
  padding: 2px 10px;
}

/* Engagement stat grid */
.preview-chart {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.preview-chart-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.engage-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.engage-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 8px;
}
.engage-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.engage-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}
.engage-label {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  text-align: center;
  padding: 60px;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

/* AI sub-theme */
.tweet-subtopic {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.subtopic-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  flex-shrink: 0;
}
.subtopic-value {
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  background: rgba(99, 102, 241, 0.06);
  border: 1px dashed rgba(99, 102, 241, 0.25);
  border-radius: 10px;
  padding: 1px 8px;
}
.subtopic-done {
  color: var(--primary);
  font-style: normal;
  background: rgba(99, 102, 241, 0.08);
  border-style: solid;
}
.sentiment-chip {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 10px;
  border: 1px solid;
  padding: 1px 7px;
  flex-shrink: 0;
}

/* Replies sentiment mini-bar */
.replies-sentiment {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.rs-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.rs-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  background: var(--surface2);
  max-width: 180px;
}
.rs-seg {
  height: 100%;
}
.rs-pos {
  background: #10b981;
}
.rs-neu {
  background: #8b5cf6;
}
.rs-neg {
  background: #ef4444;
}
.rs-hint {
  font-size: 10px;
  color: var(--text-muted);
  font-style: italic;
  flex-shrink: 0;
}
</style>
