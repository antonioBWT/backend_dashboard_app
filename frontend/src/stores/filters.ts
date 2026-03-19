import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsApi } from '../api'

export const useFiltersStore = defineStore('filters', () => {
  const theme = ref<string>('')
  const country = ref<string>('')
  const dateFrom = ref<string>('')
  const dateTo = ref<string>('')
  const granularity = ref<'day' | 'week' | 'month'>('month')

  // Load defaults from admin settings (called once on app mount)
  async function loadDefaults() {
    try {
      const d = await settingsApi.getDashboardDefaults()
      if (d.country  !== undefined) country.value  = d.country
      if (d.theme    !== undefined) theme.value    = d.theme
      if (d.dateFrom !== undefined) dateFrom.value = d.dateFrom
      if (d.dateTo   !== undefined) dateTo.value   = d.dateTo
    } catch {
      // If backend unreachable, leave empty (show all data)
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
