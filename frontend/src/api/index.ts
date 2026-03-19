import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'https://backenddashboardapp-production.up.railway.app/api'),
})

// Attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default api

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
}

// Stats
export const statsApi = {
  overview: (params?: Record<string, any>) =>
    api.get('/stats/overview', { params }).then((r) => r.data),
  timeline: (params?: Record<string, any>) =>
    api.get('/stats/timeline', { params }).then((r) => r.data),
  byTheme: (params?: Record<string, any>) =>
    api.get('/stats/by-theme', { params }).then((r) => r.data),
  postTypes: (params?: Record<string, any>) =>
    api.get('/stats/post-types', { params }).then((r) => r.data),
  topAuthors: (params?: Record<string, any>) =>
    api.get('/stats/top-authors', { params }).then((r) => r.data),
  themes: () => api.get('/stats/themes').then((r) => r.data),
  countries: () => api.get('/stats/countries').then((r) => r.data),
  dateRange: () => api.get('/stats/date-range').then((r) => r.data),
  shareOfVoice: (params?: Record<string, any>) =>
    api.get('/stats/share-of-voice', { params }).then((r) => r.data),
  hotThemes: (params?: Record<string, any>) =>
    api.get('/stats/hot-themes', { params }).then((r) => r.data),
  sentiment: (params?: Record<string, any>) =>
    api.get('/stats/sentiment', { params }).then((r) => r.data),
  hashtags: (params?: Record<string, any>) =>
    api.get('/stats/hashtags', { params }).then((r) => r.data),
  hashtagTimeline: (params?: Record<string, any>) =>
    api.get('/stats/hashtag-timeline', { params }).then((r) => r.data),
  byCountry: () =>
    api.get('/stats/by-country').then((r) => r.data),
}

// Tweets
export const tweetsApi = {
  list: (params?: Record<string, any>) =>
    api.get('/tweets', { params }).then((r) => r.data),
  top: (params?: Record<string, any>) =>
    api.get('/tweets/top', { params }).then((r) => r.data),
}

// AI
export const aiApi = {
  sentiment: (params?: Record<string, any>) =>
    api.get('/ai/sentiment', { params }).then((r) => r.data),
  chat: (question: string, filters?: Record<string, any>) =>
    api.post('/ai/chat', { question, ...filters }).then((r) => r.data),
}

// Topics
export const topicsApi = {
  hot: (params?: Record<string, any>) =>
    api.get('/topics/hot', { params }).then((r) => r.data),
  runPipeline: (body?: Record<string, any>) =>
    api.post('/topics/run-pipeline', body).then((r) => r.data),
}

// Admin sync
export const syncApi = {
  status: () => api.get('/admin/sync/status').then((r) => r.data),
  remoteStats: () => api.get('/admin/sync/remote-stats').then((r) => r.data),
  fullSync: () => api.post('/admin/sync/full').then((r) => r.data),
  incrementalSync: () => api.post('/admin/sync/incremental').then((r) => r.data),
  tweetCacheSync: () => api.post('/admin/sync/tweet-cache').then((r) => r.data),
}

// Users (admin)
export const usersApi = {
  list: () => api.get('/users').then((r) => r.data),
  create: (data: any) => api.post('/users', data).then((r) => r.data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/users/${id}`).then((r) => r.data),
}

// AI Analysis
export const aiAnalysisApi = {
  status: () => api.get('/ai-analysis/status').then((r) => r.data),
  themeStats: () => api.get('/ai-analysis/theme-stats').then((r) => r.data),
  subtopicStats: (theme?: string) =>
    api.get('/ai-analysis/subtopic-stats', { params: theme ? { theme } : {} }).then((r) => r.data),
  subtopicEngagement: () => api.get('/ai-analysis/subtopic-engagement').then((r) => r.data),
  forPost: (externalId: string) =>
    api.get(`/ai-analysis/post/${externalId}`).then((r) => r.data),
  analyzePost: (externalId: string) =>
    api.post(`/ai-analysis/analyze/${externalId}`).then((r) => r.data),
  startBatch: (limit?: number) =>
    api.post('/ai-analysis/batch/start', { limit }).then((r) => r.data),
  retryFailed: () =>
    api.post('/ai-analysis/batch/retry-failed').then((r) => r.data),
  testAnalyze: (text: string, theme?: string, platform?: string) =>
    api.post('/ai-analysis/test', { text, theme, platform }).then((r) => r.data),
}

// Settings / Prompts (admin)
export const settingsApi = {
  prompts: () => api.get('/admin/settings/prompts').then((r) => r.data),
  updatePrompt: (key: string, data: any) => api.put(`/admin/settings/prompts/${key}`, data).then((r) => r.data),
  getDashboardDefaults: () => api.get('/stats/dashboard-defaults').then((r) => r.data),
  updateDashboardDefaults: (data: any) => api.put('/admin/settings/defaults', data).then((r) => r.data),
}
