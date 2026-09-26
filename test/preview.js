// 独立组件预览，不伪造 ctx、不启动替代 DSH，也不声称验证了宿主注册。
import React from 'react'
import { createRoot } from 'react-dom/client'
import * as echarts from 'echarts'
import { VizChart, VizView } from '../src/client.js'
import { CatalogPanel } from '../src/sidebar.js'
import { createCatalog } from '../src/catalog.js'

const h = React.createElement
const timeline = window.__VIZ_FIXTURE__ ?? {
  kind: 'timeline', title: '19 镜头测试', height: 360,
  items: Array.from({ length: 19 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, group: '场' + (Math.floor(i / 5) + 1), label: '镜头 ' + (i + 1), note: '5 秒分镜' })),
}
const comparison = { kind: 'echarts', title: '各场时长 · 对比测试', height: 300,
  option: { animation: false, tooltip: {}, xAxis: { type: 'category', data: ['教场', '营房', '营门', '山路'] }, yAxis: { type: 'value', name: '秒' }, series: [{ type: 'bar', data: [40, 25, 10, 20], itemStyle: { color: '#4a7ab8' } }] } }
const catalog = createCatalog('visual-preview-only')
let seq = 1
let entries = []
function emit(id, spec) {
  const events = [
    { type: 'durable', event: { seq: seq++, type: 'tool/call', data: { callId: id, name: 'viz_show', arguments: JSON.stringify(spec) } } },
    { type: 'durable', event: { seq: seq++, type: 'tool/result', data: { message: { source: { callId: id }, content: [{ type: 'text', text: spec.title }] } } } },
  ]
  entries = [...entries, ...events]
  catalog.update({ entries, hasMore: false, change: { kind: 'append', entries: events } }, true)
  catalog.select(id)
}
emit('storyboard', timeline)
emit('comparison', comparison)
const useVizCatalog = selector => selector(React.useSyncExternalStore(catalog.subscribe, catalog.getSnapshot))
function App() {
  const [inline, setInline] = React.useState(true)
  return h(React.Fragment, null,
    h('h1', { style: { fontSize: 18 } }, 'dsh-viz · 真实组件预览（不是宿主验收）'),
    h('button', { onClick: () => setInline(v => !v) }, inline ? '卸载原位工具卡' : '恢复原位工具卡'),
    h('main', { style: { display: 'grid', gridTemplateColumns: 'minmax(320px, .85fr) minmax(360px, 1.4fr)', gap: 20, marginTop: 16 } },
      h('section', { 'aria-label': '原位工具卡预览', style: { minWidth: 0 } },
        h('h2', { style: { fontSize: 14 } }, '会话工具卡 · 完整图表'),
        inline ? h(VizView, { callId: 'storyboard', openViz: id => catalog.select(id), block: { kind: 'tool-result', call: { argsRaw: JSON.stringify(timeline) }, content: [] } }) : h('p', null, '原位组件已卸载；右栏仍独立存在。')),
      h('aside', { style: { border: '1px solid #ddd', height: 900, minWidth: 0 } },
        h(CatalogPanel, { VizChart, useVizCatalog, selectChart: catalog.select, selectAllCharts: catalog.selectAll,
          setChartLayout: catalog.setLayout, loadChartHistory: async () => {} })),
    ))
}
createRoot(document.getElementById('root')).render(h(App))
window.vizPreview = { catalog, emit, echarts, timeline }
