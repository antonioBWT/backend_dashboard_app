<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usersApi, settingsApi, syncApi, aiAnalysisApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'

interface User { id: number; email: string; name: string; role: string; isActive: boolean; createdAt: string }
interface Prompt { id: number; key: string; label: string; systemPrompt: string; userPromptTemplate: string; model: string; maxTokens: number; updatedAt: string }

const auth = useAuthStore()
const router = useRouter()

const activeSection = ref('users')

const navItems = [
  { key: 'users',       icon: '👥', label: 'Users' },
  { key: 'sync',        icon: '🔄', label: 'Data Sync' },
  { key: 'ai-analysis', icon: '🤖', label: 'AI Analysis' },
]

// ── AI Analysis ─────────────────────────────────────────────────────────────
const aiStatus = ref<any>(null)
const aiThemeStats = ref<any[]>([])
const aiSubtopicStats = ref<any[]>([])
const aiBatching = ref(false)
const aiTestText = ref('')
const aiTestTheme = ref('')
const aiTestResult = ref<any>(null)
const aiTesting = ref(false)

async function loadAiStatus() {
  try { aiStatus.value = await aiAnalysisApi.status() } catch {}
}

async function loadAiStats() {
  try {
    const [ts, ss] = await Promise.all([
      aiAnalysisApi.themeStats(),
      aiAnalysisApi.subtopicStats(),
    ])
    aiThemeStats.value = ts
    aiSubtopicStats.value = ss
  } catch {}
}

async function startAiBatch() {
  aiBatching.value = true
  try {
    const r = await aiAnalysisApi.startBatch(500)
    if (r.started) {
      ElMessage.success(`AI batch started: ${r.queued} posts queued`)
      // Poll status
      const t = setInterval(async () => {
        await loadAiStatus()
        if (!aiStatus.value?.isRunning) { clearInterval(t); loadAiStats() }
      }, 2000)
    } else {
      ElMessage.info('Nothing to analyze or already running')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? 'Failed to start batch')
  } finally {
    aiBatching.value = false
  }
}

async function testAiAnalyze() {
  if (!aiTestText.value.trim()) return
  aiTesting.value = true
  aiTestResult.value = null
  try {
    aiTestResult.value = await aiAnalysisApi.testAnalyze(aiTestText.value, aiTestTheme.value || undefined)
  } catch (e: any) {
    ElMessage.error(e?.message ?? 'Analysis failed — is Jan.ai running?')
  } finally {
    aiTesting.value = false
  }
}

// ── Prompts ────────────────────────────────────────────────────────────────
const prompts = ref<Prompt[]>([])
const promptsLoading = ref(false)
const editingPrompt = ref<Prompt | null>(null)
const editForm = computed(() => editingPrompt.value as Prompt)
const savingPrompt = ref(false)

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']

async function loadPrompts() {
  promptsLoading.value = true
  try { prompts.value = await settingsApi.prompts() } finally { promptsLoading.value = false }
}

function startEdit(p: Prompt) {
  editingPrompt.value = { ...p }
}

async function savePrompt() {
  if (!editingPrompt.value) return
  savingPrompt.value = true
  try {
    const { key, systemPrompt, userPromptTemplate, model, maxTokens } = editingPrompt.value
    const updated = await settingsApi.updatePrompt(key, { systemPrompt, userPromptTemplate, model, maxTokens })
    const idx = prompts.value.findIndex(p => p.key === key)
    if (idx !== -1) prompts.value[idx] = updated
    editingPrompt.value = null
    ElMessage.success('Prompt saved')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? 'Error saving prompt')
  } finally {
    savingPrompt.value = false
  }
}

// ── Users ──────────────────────────────────────────────────────────────────
const users = ref<User[]>([])
const loading = ref(false)
const showForm = ref(false)
const form = ref({ email: '', password: '', name: '', role: 'viewer' })
const submitting = ref(false)

// Edit user
const userToEdit = ref<User | null>(null)
const userEditForm = ref({ name: '', role: 'viewer', isActive: true })
const savingUser = ref(false)

function startEditUser(user: User) {
  userToEdit.value = user
  userEditForm.value = { name: user.name, role: user.role, isActive: user.isActive }
}

async function saveUser() {
  if (!userToEdit.value) return
  savingUser.value = true
  try {
    const updated = await usersApi.update(userToEdit.value.id, userEditForm.value)
    const idx = users.value.findIndex(u => u.id === userToEdit.value!.id)
    if (idx !== -1) users.value[idx] = { ...users.value[idx], ...updated }
    ElMessage.success('User updated')
    userToEdit.value = null
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? 'Error updating user')
  } finally {
    savingUser.value = false
  }
}

async function load() {
  loading.value = true
  try { users.value = await usersApi.list() } finally { loading.value = false }
}

async function create() {
  if (!form.value.email || !form.value.password) return
  submitting.value = true
  try {
    await usersApi.create(form.value)
    ElMessage.success('User created')
    showForm.value = false
    form.value = { email: '', password: '', name: '', role: 'viewer' }
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? 'Error creating user')
  } finally {
    submitting.value = false
  }
}

async function remove(user: User) {
  await ElMessageBox.confirm(`Remove user ${user.email}?`, 'Confirm', { type: 'warning' })
  await usersApi.remove(user.id)
  ElMessage.success('User removed')
  await load()
}

// ── Sync ───────────────────────────────────────────────────────────────────
const syncStatus = ref<any>(null)
const remoteStats = ref<any>(null)
const syncing = ref(false)
const syncError = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadSyncStatus() {
  try { syncStatus.value = await syncApi.status() } catch {}
}

async function loadRemoteStats() {
  try { remoteStats.value = await syncApi.remoteStats() } catch {}
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await loadSyncStatus()
    const st = syncStatus.value?.statuses?.find((s: any) => s.key === 'agg_daily')
    if (st?.status !== 'running') stopPolling()
  }, 1500)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  syncing.value = false
}

async function doSync(type: 'full' | 'incremental' | 'tweet-cache') {
  syncing.value = true
  syncError.value = ''
  try {
    if (type === 'full') await syncApi.fullSync()
    else if (type === 'incremental') await syncApi.incrementalSync()
    else await syncApi.tweetCacheSync()
    startPolling()
  } catch (e: any) {
    syncError.value = e?.response?.data?.message ?? 'Sync failed'
    syncing.value = false
  }
}

function syncProgress(): number {
  const st = syncStatus.value?.statuses?.find((s: any) => s.key === 'agg_daily')
  return st?.progress ?? 0
}

function syncState(): string {
  const st = syncStatus.value?.statuses?.find((s: any) => s.key === 'agg_daily')
  return st?.status ?? 'idle'
}

// ── Historical data range ────────────────────────────────────────────────────
const historyOptions = [
  { label: '1 month',  months: 1  },
  { label: '3 months', months: 3  },
  { label: '6 months', months: 6  },
  { label: '1 year',   months: 12 },
  { label: '2 years',  months: 24 },
  { label: 'All data', months: 0  },
]

const HISTORY_KEY = 'pwc_history_months'
const historyRangeIdx = ref(
  Math.max(0, historyOptions.findIndex(
    o => o.months === Number(localStorage.getItem(HISTORY_KEY) ?? 12)
  )) || 3
)
const historyRangeLabel = computed(() => historyOptions[historyRangeIdx.value]?.label ?? '1 year')

function onHistoryRange(e: Event) {
  const idx = Number((e.target as HTMLInputElement).value)
  historyRangeIdx.value = idx
  const months = historyOptions[idx].months
  localStorage.setItem(HISTORY_KEY, String(months))
  // Update the filters store default dateFrom
  if (months > 0) {
    const d = new Date()
    d.setMonth(d.getMonth() - months)
    localStorage.setItem('pwc_default_date_from', d.toISOString().slice(0, 10))
  } else {
    localStorage.removeItem('pwc_default_date_from')
  }
  ElMessage.success(`Dashboard will show data from last ${historyRangeLabel.value}`)
}

function fmtNum(n: any): string {
  const v = Number(n)
  if (!v) return '0'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K'
  return v.toLocaleString()
}

onMounted(() => {
  load()
  loadPrompts()
  loadSyncStatus()
  loadRemoteStats()
  loadAiStatus()
  loadAiStats()
})

onUnmounted(() => stopPolling())
</script>

<template>
  <div class="admin-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-brand" @click="router.push('/')">
        <span class="brand-icon">📊</span>
        <span class="brand-text">PwC Analytics</span>
      </div>

      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          :class="['nav-item', { active: activeSection === item.key }]"
          @click="activeSection = item.key"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user">
          <span class="user-avatar">{{ auth.user?.name?.[0] ?? auth.user?.email?.[0] ?? 'A' }}</span>
          <div class="user-info">
            <div class="user-name">{{ auth.user?.name || auth.user?.email }}</div>
            <div class="user-role">Administrator</div>
          </div>
        </div>
        <button class="nav-item" @click="router.push('/')">
          <span class="nav-icon">🏠</span>
          <span class="nav-label">Dashboard</span>
        </button>
        <button class="nav-item logout" @click="auth.logout(); router.push('/login')">
          <span class="nav-icon">🚪</span>
          <span class="nav-label">Sign Out</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="admin-main">

      <!-- ── Users Section ── -->
      <div v-if="activeSection === 'users'" class="section">
        <div class="section-header">
          <div>
            <h1>User Management</h1>
            <p>Control who has access to the dashboard</p>
          </div>
          <el-button type="primary" @click="showForm = !showForm">
            + Add User
          </el-button>
        </div>

        <!-- New user form -->
        <div v-if="showForm" class="card form-card">
          <div class="form-title">New User</div>
          <div class="form-grid">
            <div class="field">
              <label>Email *</label>
              <el-input v-model="form.email" type="email" placeholder="user@pwc.com" />
            </div>
            <div class="field">
              <label>Password *</label>
              <el-input v-model="form.password" type="password" placeholder="Min. 6 chars" show-password />
            </div>
            <div class="field">
              <label>Full Name</label>
              <el-input v-model="form.name" placeholder="John Smith" />
            </div>
            <div class="field">
              <label>Role</label>
              <el-select v-model="form.role" style="width:100%">
                <el-option label="Viewer" value="viewer" />
                <el-option label="Admin" value="admin" />
              </el-select>
            </div>
          </div>
          <div class="form-actions">
            <el-button @click="showForm = false">Cancel</el-button>
            <el-button type="primary" :loading="submitting" @click="create">Create User</el-button>
          </div>
        </div>

        <!-- Users table -->
        <div class="card">
          <el-table :data="users" v-loading="loading" stripe style="width:100%">
            <el-table-column prop="email" label="Email" min-width="220" />
            <el-table-column prop="name" label="Name" min-width="150" />
            <el-table-column prop="role" label="Role" width="110">
              <template #default="{ row }">
                <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">{{ row.role }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="isActive" label="Status" width="100">
              <template #default="{ row }">
                <el-tag :type="row.isActive ? 'success' : 'warning'" size="small">
                  {{ row.isActive ? 'Active' : 'Inactive' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="Created" width="130">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleDateString() }}</template>
            </el-table-column>
            <el-table-column label="" width="160" align="right">
              <template #default="{ row }">
                <div style="display:flex;gap:6px;justify-content:flex-end">
                  <el-button size="small" plain @click.stop="startEditUser(row)">Edit</el-button>
                  <el-button type="danger" size="small" plain @click.stop="remove(row)">Remove</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- ── Edit User Dialog ── -->
      <el-dialog v-model="userToEdit" :title="`Edit user: ${userToEdit?.email ?? ''}`" width="440px" @close="userToEdit = null">
        <template v-if="userToEdit">
          <div class="form-grid" style="grid-template-columns:1fr">
            <div class="field">
              <label>Full Name</label>
              <el-input v-model="userEditForm.name" placeholder="John Smith" />
            </div>
            <div class="field">
              <label>Role</label>
              <el-select v-model="userEditForm.role" style="width:100%">
                <el-option label="Viewer" value="viewer" />
                <el-option label="Admin" value="admin" />
              </el-select>
            </div>
            <div class="field">
              <label>Status</label>
              <el-select v-model="userEditForm.isActive" style="width:100%">
                <el-option label="Active" :value="true" />
                <el-option label="Inactive" :value="false" />
              </el-select>
            </div>
          </div>
          <div class="form-actions" style="margin-top:20px">
            <el-button @click="userToEdit = null">Cancel</el-button>
            <el-button type="primary" :loading="savingUser" @click="saveUser">Save Changes</el-button>
          </div>
        </template>
      </el-dialog>

      <!-- ── Prompts Section ── -->
      <div v-if="activeSection === 'prompts'" class="section">
        <div class="section-header">
          <div>
            <h1>AI Prompts</h1>
            <p>Edit the prompts used for topic discovery, classification, sentiment and chat</p>
          </div>
        </div>

        <div v-loading="promptsLoading" class="prompts-list">
          <div v-for="p in prompts" :key="p.key" class="card prompt-card">
            <!-- View mode -->
            <div v-if="editForm.key !== p.key">
              <div class="prompt-header">
                <div>
                  <div class="prompt-label">{{ p.label }}</div>
                  <div class="prompt-meta">
                    <span class="badge">{{ p.model }}</span>
                    <span class="badge">max {{ p.maxTokens }} tokens</span>
                    <span class="updated">Updated {{ new Date(p.updatedAt).toLocaleDateString() }}</span>
                  </div>
                </div>
                <el-button size="small" @click="startEdit(p)">Edit</el-button>
              </div>
              <div class="prompt-preview">
                <div class="prompt-section-label">System prompt</div>
                <div class="prompt-text">{{ p.systemPrompt }}</div>
              </div>
              <div class="prompt-preview" style="margin-top:10px">
                <div class="prompt-section-label">User prompt template</div>
                <div class="prompt-text">{{ p.userPromptTemplate }}</div>
              </div>
            </div>

            <!-- Edit mode -->
            <div v-else>
              <div class="prompt-header">
                <div class="prompt-label">{{ p.label }}</div>
                <div style="display:flex;gap:8px">
                  <el-button size="small" @click="editingPrompt = null">Cancel</el-button>
                  <el-button size="small" type="primary" :loading="savingPrompt" @click="savePrompt">Save</el-button>
                </div>
              </div>

              <div class="edit-row">
                <div class="field">
                  <label>Model</label>
                  <el-select v-model="editForm.model" style="width:200px">
                    <el-option v-for="m in MODELS" :key="m" :label="m" :value="m" />
                  </el-select>
                </div>
                <div class="field">
                  <label>Max tokens</label>
                  <el-input-number v-model="editForm.maxTokens" :min="100" :max="4000" :step="100" style="width:140px" />
                </div>
              </div>

              <div class="field" style="margin-top:14px">
                <label>System Prompt</label>
                <el-input
                  v-model="editForm.systemPrompt"
                  type="textarea"
                  :rows="4"
                  placeholder="System instructions for the AI..."
                />
              </div>
              <div class="field" style="margin-top:12px">
                <label>User Prompt Template <span class="hint-inline" v-pre>(use {{variable}} for dynamic values)</span></label>
                <el-input
                  v-model="editForm.userPromptTemplate"
                  type="textarea"
                  :rows="8"
                  placeholder="User prompt with {{variables}}..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Sync Section ── -->
      <div v-if="activeSection === 'sync'" class="section">
        <div class="section-header">
          <div>
            <h1>Data Sync</h1>
            <p>Local analytics cache synced from remote MySQL database</p>
          </div>
        </div>

        <!-- Remote DB card -->
        <div class="card remote-card">
          <div class="remote-header">
            <div class="remote-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>
            </div>
            <div>
              <div class="remote-title">Remote Database</div>
              <div class="remote-sub">Read-only MySQL source</div>
            </div>
            <div class="remote-badge">LIVE</div>
          </div>
          <div v-if="remoteStats" class="remote-stats">
            <div class="remote-stat">
              <div class="remote-stat-value">{{ fmtNum(remoteStats.totalTweets) }}</div>
              <div class="remote-stat-label">Total tweets</div>
            </div>
            <div class="remote-stat">
              <div class="remote-stat-value">{{ fmtNum(remoteStats.uniqueAuthors) }}</div>
              <div class="remote-stat-label">Unique authors</div>
            </div>
            <div class="remote-stat">
              <div class="remote-stat-value">{{ remoteStats.minDate ? new Date(remoteStats.minDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }}</div>
              <div class="remote-stat-label">Data from</div>
            </div>
            <div class="remote-stat">
              <div class="remote-stat-value">{{ remoteStats.maxDate ? new Date(remoteStats.maxDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }}</div>
              <div class="remote-stat-label">Last record</div>
            </div>
          </div>
          <div v-else class="remote-loading">
            <span class="dot-pulse"></span>
            <span>Connecting to remote database…</span>
          </div>
        </div>

        <!-- Historical data range -->
        <div class="card history-range-card">
          <div class="history-range-header">
            <div>
              <div class="history-range-title">📅 Historical Data Range</div>
              <div class="history-range-sub">Controls how far back data is loaded by default in the dashboard</div>
            </div>
            <div class="history-range-value">{{ historyRangeLabel }}</div>
          </div>
          <input type="range" class="history-slider" :min="0" :max="historyOptions.length - 1" :value="historyRangeIdx" @input="onHistoryRange" />
          <div class="history-ticks">
            <span v-for="opt in historyOptions" :key="opt.label">{{ opt.label }}</span>
          </div>
        </div>

        <!-- Local cache stats -->
        <div class="sync-stats-grid">
          <div class="sync-stat-card">
            <div class="sync-stat-icon">📊</div>
            <div class="sync-stat-value">{{ syncStatus ? fmtNum(syncStatus.aggDailyRows) : '—' }}</div>
            <div class="sync-stat-label">Daily aggregation rows</div>
          </div>
          <div class="sync-stat-card">
            <div class="sync-stat-icon">👤</div>
            <div class="sync-stat-value">{{ syncStatus ? fmtNum(syncStatus.aggAuthorRows) : '—' }}</div>
            <div class="sync-stat-label">Author aggregation rows</div>
          </div>
        </div>

        <!-- Progress bar (visible when running) -->
        <Transition name="fade">
          <div v-if="syncState() === 'running'" class="sync-progress-card card">
            <div class="progress-header">
              <div class="progress-spinner"></div>
              <div>
                <div class="progress-title">Sync in progress…</div>
                <div class="progress-sub">Aggregating data from remote database</div>
              </div>
              <div class="progress-pct">{{ syncProgress() }}%</div>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: syncProgress() + '%' }"></div>
            </div>
            <div class="progress-steps">
              <span :class="['step', syncProgress() >= 5 ? 'done' : '']">Query</span>
              <span :class="['step', syncProgress() >= 40 ? 'done' : '']">Fetched</span>
              <span :class="['step', syncProgress() >= 90 ? 'done' : '']">Inserted</span>
              <span :class="['step', syncProgress() >= 100 ? 'done' : '']">Complete</span>
            </div>
          </div>
        </Transition>

        <!-- Error -->
        <div v-if="syncError" class="sync-error">⚠️ {{ syncError }}</div>

        <!-- Actions -->
        <div class="sync-actions-grid sync-actions-2">
          <div class="card sync-action-card">
            <div class="action-icon">⚡</div>
            <div class="action-body">
              <div class="action-title">Incremental Update</div>
              <div class="action-desc">Fetches only new data since the last sync. Fast — a few seconds. Run this daily.</div>
            </div>
            <el-button :loading="syncing" :disabled="syncState() === 'running'" @click="doSync('incremental')">
              Run Update
            </el-button>
          </div>
          <div class="card sync-action-card">
            <div class="action-icon">🔄</div>
            <div class="action-body">
              <div class="action-title">Full Re-sync</div>
              <div class="action-desc">Re-aggregates all history from scratch. Use after schema changes. Takes ~1–2 min.</div>
            </div>
            <el-button :loading="syncing" :disabled="syncState() === 'running'" type="warning" plain @click="doSync('full')">
              Full Re-sync
            </el-button>
          </div>
        </div>
      </div>

      <!-- ── AI Analysis Section ── -->
      <div v-if="activeSection === 'ai-analysis'" class="section ai-section">
        <div class="section-header">
          <div>
            <h1>AI Analysis</h1>
            <p>Local AI sentiment, sub-topic and entity analysis via Jan.ai · Qwen2.5</p>
          </div>
          <el-button type="primary" :loading="aiBatching" @click="startAiBatch">
            ▶ Run Batch Analysis
          </el-button>
        </div>

        <!-- Connection / Status card -->
        <div class="card ai-status-card">
          <div class="ai-status-header">
            <div class="ai-status-icon">🤖</div>
            <div>
              <div class="ai-status-title">Jan.ai · {{ aiStatus?.model ?? '—' }}</div>
              <div class="ai-status-url">{{ aiStatus?.modelUrl ?? 'http://localhost:1337/v1' }}</div>
            </div>
            <div :class="['ai-conn-badge', aiStatus ? 'connected' : 'disconnected']">
              {{ aiStatus ? 'CONNECTED' : 'CHECK JAN.AI' }}
            </div>
          </div>

          <!-- Progress bar -->
          <div v-if="aiStatus" class="ai-progress-wrap">
            <div class="ai-progress-labels">
              <span>Analyzed</span>
              <span>{{ fmtNum(aiStatus.analyzed) }} / {{ fmtNum(aiStatus.total) }}</span>
            </div>
            <div class="ai-progress-track">
              <div
                class="ai-progress-fill"
                :style="{ width: aiStatus.total ? (aiStatus.analyzed / aiStatus.total * 100).toFixed(1) + '%' : '0%' }"
              />
            </div>
            <div class="ai-progress-sub">
              <span class="ai-stat pending">{{ fmtNum(aiStatus.pending) }} pending</span>
              <span v-if="aiStatus.isRunning" class="ai-stat running">● Running…</span>
            </div>
          </div>
        </div>

        <!-- Theme sentiment stats -->
        <div v-if="aiThemeStats.length" class="card">
          <div class="card-title">Sentiment by Theme</div>
          <div class="ai-theme-list">
            <div v-for="row in aiThemeStats" :key="row.theme" class="ai-theme-row">
              <div class="ai-theme-name" :title="row.theme">{{ row.theme }}</div>
              <div class="ai-theme-bar">
                <div class="ai-bar-seg ai-bar-pos" :style="{ width: (row.positive / row.total * 100).toFixed(1) + '%' }" />
                <div class="ai-bar-seg ai-bar-neu" :style="{ width: (row.neutral  / row.total * 100).toFixed(1) + '%' }" />
                <div class="ai-bar-seg ai-bar-neg" :style="{ width: (row.negative / row.total * 100).toFixed(1) + '%' }" />
              </div>
              <div class="ai-theme-score">
                <span class="ai-pos">{{ row.positive }}</span>
                <span class="ai-neg">{{ row.negative }}</span>
                <span class="ai-total">/ {{ row.total }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top sub-topics -->
        <div v-if="aiSubtopicStats.length" class="card">
          <div class="card-title">Top Sub-topics detected</div>
          <div class="subtopic-grid">
            <div v-for="s in aiSubtopicStats.slice(0,12)" :key="s.subtopic" class="subtopic-chip">
              <span class="subtopic-name">{{ s.subtopic }}</span>
              <span class="subtopic-count">{{ fmtNum(s.total) }}</span>
              <span :class="['subtopic-score', Number(s.avgScore) >= 0 ? 'pos' : 'neg']">
                {{ Number(s.avgScore).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>

      </div>

    </main>
  </div>
</template>

<style scoped lang="scss">
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

/* ── Sidebar ── */
.sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--surface-bar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.brand-icon { font-size: 20px; }
.brand-text { font-size: 13px; font-weight: 700; color: var(--text); }

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  width: 100%;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}
.nav-item:hover { background: var(--surface2); color: var(--text); }
.nav-item.active { background: rgba(99, 102, 241, 0.15); color: var(--primary-light); }
.nav-item.logout:hover { background: rgba(239, 68, 68, 0.1); color: var(--danger); }

.nav-icon { font-size: 16px; width: 20px; text-align: center; }
.nav-label { font-size: 13px; }

.sidebar-footer {
  padding: 12px 8px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 4px;
}
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
}
.user-info .user-name { font-size: 12px; font-weight: 600; color: var(--text); }
.user-info .user-role { font-size: 11px; color: var(--text-muted); }

/* ── Main ── */
.admin-main {
  flex: 1;
  padding: 32px 36px;
  overflow-y: auto;
}

.section { display: flex; flex-direction: column; gap: 20px; max-width: 940px; }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.section-header h1 { font-size: 22px; font-weight: 700; color: var(--text); }
.section-header p { font-size: 13px; color: var(--text-muted); margin-top: 4px; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }

.form-card { padding: 24px; }
.form-title { font-size: 15px; font-weight: 600; margin-bottom: 20px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

.info-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.info-icon { font-size: 28px; line-height: 1; margin-top: 2px; }
.info-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
.info-desc { font-size: 13px; color: var(--text-muted); line-height: 1.6; }

.coming-soon {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 24px;
  background: var(--surface2);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-muted);
}

/* ── Prompts ── */
.prompts-list { display: flex; flex-direction: column; gap: 16px; }
.prompt-card { padding: 20px 24px; }
.prompt-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.prompt-label { font-size: 15px; font-weight: 600; }
.prompt-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.badge {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: rgba(99,102,241,0.08); color: var(--primary);
}
.updated { font-size: 11px; color: var(--text-muted); }
.prompt-preview { background: var(--surface2); border-radius: 6px; padding: 10px 12px; }
.prompt-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 6px; }
.prompt-text { font-size: 12px; color: var(--text); line-height: 1.6; white-space: pre-wrap; max-height: 80px; overflow: hidden; }
.edit-row { display: flex; gap: 24px; flex-wrap: wrap; }
.hint-inline { font-size: 11px; color: var(--text-muted); text-transform: none; font-weight: 400; letter-spacing: 0; }

/* ── Sync ── */
.sync-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.sync-stat-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 22px 24px;
  display: flex; flex-direction: column; gap: 6px;
}
.sync-stat-icon { font-size: 22px; margin-bottom: 4px; }
.sync-stat-value { font-size: 32px; font-weight: 700; color: var(--primary); line-height: 1; letter-spacing: -0.02em; }
.sync-stat-label { font-size: 12px; color: var(--text-muted); }

/* Remote card */
.remote-card { border-color: rgba(99,102,241,0.3); }
.remote-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
.remote-icon-wrap {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(99,102,241,0.08); color: var(--primary);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.remote-title { font-size: 15px; font-weight: 600; }
.remote-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.remote-badge {
  margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  padding: 3px 8px; border-radius: 20px;
  background: rgba(16,185,129,0.15); color: #10b981;
  border: 1px solid rgba(16,185,129,0.3);
  animation: pulse-badge 2s ease-in-out infinite;
}
@keyframes pulse-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.remote-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.remote-stat {
  background: var(--surface2); border-radius: 8px; padding: 14px 16px;
}
.remote-stat-value { font-size: 20px; font-weight: 700; color: var(--text); line-height: 1; }
.remote-stat-label { font-size: 11px; color: var(--text-muted); margin-top: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
.remote-loading {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: var(--text-muted); padding: 8px 0;
}

/* Dot pulse loader */
.dot-pulse {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--primary-light);
  animation: dot-pulse-anim 1.2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes dot-pulse-anim {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* Progress card */
.sync-progress-card { border-color: rgba(99,102,241,0.4); }
.progress-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.progress-spinner {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
  border: 3px solid rgba(99,102,241,0.2);
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.progress-title { font-size: 14px; font-weight: 600; }
.progress-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.progress-pct {
  margin-left: auto; font-size: 24px; font-weight: 700;
  color: var(--primary-light); letter-spacing: -0.02em;
  min-width: 56px; text-align: right;
}
.progress-track {
  height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; margin-bottom: 14px;
}
.progress-fill {
  height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, var(--primary), var(--primary-light));
  transition: width 0.4s ease;
  box-shadow: 0 0 8px rgba(99,102,241,0.6);
}
.progress-steps { display: flex; gap: 0; }
.step {
  flex: 1; text-align: center; font-size: 11px; color: var(--text-muted);
  padding: 4px 0; border-top: 2px solid var(--border); margin-right: 4px;
  transition: all 0.3s;
}
.step.done { color: var(--primary-light); border-top-color: var(--primary); }

/* Error */
.sync-error {
  padding: 12px 16px; border-radius: 8px; font-size: 13px;
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); color: var(--danger);
}

/* Action cards */
.sync-actions-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.sync-actions-2 { grid-template-columns: 1fr 1fr !important; }
.sync-action-card { display: flex; align-items: flex-start; gap: 14px; }
.action-icon { font-size: 28px; line-height: 1; margin-top: 2px; flex-shrink: 0; }
.action-body { flex: 1; }
.action-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.action-desc { font-size: 12px; color: var(--text-muted); line-height: 1.6; }

/* Fade transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── History range slider ── */
.history-range-card { padding: 20px 24px; }
.history-range-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.history-range-title { font-size: 14px; font-weight: 600; }
.history-range-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.history-range-value {
  font-size: 18px; font-weight: 700; color: var(--primary-light);
  background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.25);
  border-radius: 8px; padding: 4px 14px; white-space: nowrap;
}
.history-slider {
  width: 100%; -webkit-appearance: none; appearance: none;
  height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--primary) 0%, var(--primary) calc(v-bind(historyRangeIdx) / 5 * 100%), var(--surface2) calc(v-bind(historyRangeIdx) / 5 * 100%));
  outline: none; cursor: pointer; margin-bottom: 8px;
}
.history-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
  background: var(--primary); border: 3px solid var(--primary-light); cursor: pointer;
}
.history-ticks {
  display: flex; justify-content: space-between;
  font-size: 10px; color: var(--text-muted);
}

/* ── AI Analysis ── */
.ai-section { max-width: 900px; }
.card-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 16px; }

.ai-status-card { border-color: rgba(99,102,241,0.3); }
.ai-status-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
.ai-status-icon { font-size: 28px; line-height: 1; }
.ai-status-title { font-size: 15px; font-weight: 600; }
.ai-status-url { font-size: 12px; color: var(--text-muted); margin-top: 2px; font-family: monospace; }
.ai-conn-badge {
  margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  padding: 3px 10px; border-radius: 20px;
}
.ai-conn-badge.connected { background: rgba(16,185,129,0.1); color: #059669; border: 1px solid rgba(16,185,129,0.3); }
.ai-conn-badge.disconnected { background: rgba(239,68,68,0.1); color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }

.ai-progress-wrap { display: flex; flex-direction: column; gap: 6px; }
.ai-progress-labels { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); }
.ai-progress-track { height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
.ai-progress-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--primary), var(--primary-light)); transition: width 0.5s ease; }
.ai-progress-sub { display: flex; gap: 12px; font-size: 11px; }
.ai-stat.pending { color: var(--text-muted); }
.ai-stat.running { color: var(--primary-light); animation: pulse-badge 1.5s ease-in-out infinite; }

.ai-theme-list { display: flex; flex-direction: column; gap: 8px; }
.ai-theme-row { display: flex; align-items: center; gap: 10px; }
.ai-theme-name { font-size: 11px; color: var(--text-muted); width: 200px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-theme-bar { flex: 1; height: 10px; border-radius: 5px; overflow: hidden; display: flex; background: var(--surface2); }
.ai-bar-seg { height: 100%; transition: width 0.4s ease; }
.ai-bar-pos { background: #10b981; }
.ai-bar-neu { background: #8b5cf6; }
.ai-bar-neg { background: #ef4444; }
.ai-theme-score { display: flex; gap: 6px; font-size: 11px; font-weight: 600; flex-shrink: 0; min-width: 90px; justify-content: flex-end; }
.ai-pos { color: #10b981; }
.ai-neg { color: #ef4444; }
.ai-total { color: var(--text-muted); }

.subtopic-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.subtopic-chip {
  display: flex; align-items: center; gap: 6px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: 20px; padding: 4px 12px; font-size: 11px;
}
.subtopic-name { color: var(--text); font-weight: 500; }
.subtopic-count { color: var(--text-muted); }
.subtopic-score { font-weight: 700; }
.subtopic-score.pos { color: #10b981; }
.subtopic-score.neg { color: #ef4444; }

.test-result {
  margin-top: 20px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 10px; padding: 16px;
}
.test-result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.test-kv { display: flex; flex-direction: column; gap: 3px; }
.test-k { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.test-v { font-size: 13px; color: var(--text); }
.sentiment-positive { color: #10b981 !important; font-weight: 700; }
.sentiment-negative { color: #ef4444 !important; font-weight: 700; }
.sentiment-neutral  { color: #8b5cf6 !important; }
</style>
