<script setup lang="ts">
defineProps<{ data: any[] }>()

function fmt(n: any): string {
  const num = Number(n)
  if (!num) return '0'
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(0) + 'K'
  return num.toLocaleString()
}
</script>

<template>
  <div class="authors-table">
    <div v-if="!data?.length" class="empty">No data</div>
    <table v-else>
      <thead>
        <tr>
          <th>#</th>
          <th>Author</th>
          <th>Tweets</th>
          <th>Likes</th>
          <th>Views</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(a, i) in data?.slice(0, 12)" :key="a.author">
          <td class="rank">{{ i + 1 }}</td>
          <td class="author">
            <a :href="`https://x.com/${a.author}`" target="_blank" rel="noopener">@{{ a.author }}</a>
          </td>
          <td>{{ fmt(a.tweets) }}</td>
          <td>{{ fmt(a.likes) }}</td>
          <td class="views">{{ fmt(a.views) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.authors-table { overflow-x: auto; }
.empty { color: var(--text-muted); text-align: center; padding: 40px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { color: var(--text-muted); font-weight: 500; text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 11px; text-transform: uppercase; }
td { padding: 8px 10px; border-bottom: 1px solid rgba(46, 49, 72, 0.5); }
.rank { color: var(--text-muted); width: 30px; }
.author a { color: var(--primary-light); text-decoration: none; }
.author a:hover { text-decoration: underline; }
.views { font-weight: 600; }
</style>
