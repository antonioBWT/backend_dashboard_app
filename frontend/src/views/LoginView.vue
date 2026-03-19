<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const form = ref({ email: '', password: '' })
const loading = ref(false)

async function handleLogin() {
  if (!form.value.email || !form.value.password) return
  loading.value = true
  try {
    await auth.login(form.value.email, form.value.password)
    router.push('/')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message ?? 'Invalid credentials')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo-area">
        <div class="logo-icon">📊</div>
        <h1>PwC Social Analytics</h1>
        <p>Middle East Twitter Intelligence Dashboard</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="field">
          <label>Email</label>
          <el-input
            v-model="form.email"
            type="email"
            placeholder="admin@pwc.com"
            size="large"
            autocomplete="email"
          />
        </div>
        <div class="field">
          <label>Password</label>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="••••••••"
            size="large"
            show-password
            autocomplete="current-password"
          />
        </div>
        <el-button
          type="primary"
          native-type="submit"
          size="large"
          :loading="loading"
          style="width: 100%; margin-top: 8px"
        >
          Sign In
        </el-button>
      </form>

      <p class="footer-note">Access restricted. Contact admin to request access.</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  background-image: radial-gradient(ellipse at 50% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 60%);
}

.login-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 48px 40px;
  width: 100%;
  max-width: 400px;
}

.logo-area {
  text-align: center;
  margin-bottom: 36px;
}
.logo-icon { font-size: 40px; margin-bottom: 12px; }
h1 { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
p { color: var(--text-muted); font-size: 13px; }

.login-form { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; font-weight: 500; color: var(--text-muted); }

.footer-note { text-align: center; margin-top: 24px; font-size: 12px; color: var(--text-muted); }
</style>
