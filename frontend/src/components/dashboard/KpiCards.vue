<script setup lang="ts">
defineProps<{ data: any }>()

function fmt(n: any, decimals = 0): string {
  const num = Number(n)
  if (!num || isNaN(num)) return '0'
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(decimals) + 'K'
  return num.toLocaleString()
}
</script>

<template>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="icon">📝</div>
      <div class="label">Total Tweets</div>
      <div class="value">{{ fmt(data?.totalTweets) }}</div>
      <div class="sub">{{ fmt(data?.originalPosts) }} original · {{ fmt(data?.replies) }} replies</div>
    </div>
    <div class="kpi-card">
      <div class="icon">❤️</div>
      <div class="label">Total Likes</div>
      <div class="value">{{ fmt(data?.totalLikes) }}</div>
      <div class="sub">Avg {{ fmt(data?.totalLikes / data?.totalTweets, 1) }} per tweet</div>
    </div>
    <div class="kpi-card">
      <div class="icon">👁️</div>
      <div class="label">Total Views</div>
      <div class="value">{{ fmt(data?.totalViews) }}</div>
      <div class="sub">{{ fmt(data?.totalRetweets) }} retweets</div>
    </div>
    <div class="kpi-card">
      <div class="icon">👤</div>
      <div class="label">Unique Authors</div>
      <div class="value">{{ fmt(data?.uniqueAuthors) }}</div>
      <div class="sub">{{ fmt(data?.quoteTweets) }} quote tweets</div>
    </div>
  </div>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 1000px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
