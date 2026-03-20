import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsApi, statsApi } from '../api'

export const useFiltersStore = defineStore('filters', () => {
  const theme = ref<string>('')
  const country = ref<string>('')
  const dateFrom = ref<string>('')
  const dateTo = ref<string>('')
  const granularity = ref<'day' | 'week' | 'month'>('month')

  // Load defaults from admin settings (called once on app mount)
  async function loadDefaults() {
    try {
      const [appSettings, dateRange] = await Promise.all([
        settingsApi.getAppSettings().catch(() => ({})),
        statsApi.dateRange().catch(() => null),
      ])

      const months = Number(appSettings?.history_months ?? 0)
      if (months > 0 && dateRange?.max) {
        // Compute dateFrom relative to max date in dataset (not today)
        const d = new Date(dateRange.max)
        d.setMonth(d.getMonth() - months)
        dateFrom.value = d.toISOString().slice(0, 10)
      }
    } catch {
      // If backend unreachable, show all data
    }
  }

  function getParams() {
    const p: Record<string, string> = {}
    if (theme.value)   p.theme   = theme.value
    if (country.value) p.country = country.value
    if (dateFrom.value) p.dateFrom = dateFrom.value
    if (dateTo.value)   p.dateTo   = dateTo.value
    return p
  }

  function getParamsWithGranularity(gran?: string) {
    return { ...getParams(), granularity: gran ?? granularity.value }
  }

  function reset() {
    theme.value    = ''
    country.value  = ''
    dateFrom.value = ''
    dateTo.value   = ''
    granularity.value = 'month'
  }

  return { theme, country, dateFrom, dateTo, granularity, loadDefaults, getParams, getParamsWithGranularity, reset }
})
