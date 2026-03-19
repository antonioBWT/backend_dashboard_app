import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api'

interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'viewer'
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(email: string, password: string) {
    const data = await authApi.login(email, password)
    token.value = data.accessToken
    user.value = data.user
    localStorage.setItem('token', data.accessToken)
  }

  async function fetchMe() {
    if (!token.value) return
    try {
      user.value = await authApi.me()
    } catch (e: any) {
      // Only logout on 401 (invalid/expired token), not on network errors
      if (e?.response?.status === 401) logout()
    }
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
  }

  return { user, token, isAuthenticated, isAdmin, login, fetchMe, logout }
})
