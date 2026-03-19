<script setup lang="ts">
import { computed } from 'vue'
import { Chart } from 'highcharts-vue'

const props = defineProps<{ data: any[] }>()

const options = computed(() => ({
  chart: { type: 'pie', backgroundColor: 'transparent', height: null, style: { fontFamily: 'Inter, sans-serif' } },
  title: { text: undefined },
  credits: { enabled: false },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE3F5',
    borderRadius: 8,
    shadow: { color: 'rgba(99,102,241,0.1)', offsetX: 0, offsetY: 4, width: 16 },
    style: { color: '#1E293B' },
    pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> ({point.y:,.0f})',
    positioner: function (this: any, labelWidth: number, labelHeight: number, point: any) {
      const chart = this.chart
      let x = point.plotX + chart.plotLeft + 16
      let y = point.plotY + chart.plotTop - labelHeight / 2
      if (x + labelWidth > chart.chartWidth) x = point.plotX + chart.plotLeft - labelWidth - 16
      if (y < 0) y = 0
      if (y + labelHeight > chart.chartHeight) y = chart.chartHeight - labelHeight
      return { x, y }
    },
  },
  plotOptions: {
    pie: {
      allowPointSelect: true,
      cursor: 'pointer',
      dataLabels: {
        enabled: true,
        format: '<b>{point.name}</b><br>{point.percentage:.0f}%',
        style: { color: '#1E293B', fontSize: '11px', fontWeight: '500', textOutline: 'none' },
        distance: 15,
      },
      innerSize: '55%',
      borderWidth: 0,
    },
  },
  colors: ['#6366f1', '#10b981', '#f59e0b'],
  series: [{
    name: 'Count',
    data: (props.data ?? []).map((d) => ({
      name: d.type === 'original post' ? 'Original' : d.type === 'quote tweet' ? 'Quote' : d.type,
      y: Number(d.count),
    })),
  }],
}))
</script>

<template>
  <Chart :options="options" style="width:100%; height:100%; flex:1;" />
</template>
