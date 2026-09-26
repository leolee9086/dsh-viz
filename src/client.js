// src/client.js —— dsh-viz 的浏览器侧。
//
// 这是**正常的 ESM 源码**，由 esbuild 打成 CJS，再套上 __ModuleLoader__ 外壳
// （見 scripts/build.mjs 的 banner/footer）。所以这里照常 import，不用手写外壳。
//
// 它认领 viz_show 这张工具卡，按这次调用的参数把图画出来。
//
// 数据来源：工具入参（block.argsRaw）。它是会话事件 tool/call 的 arguments 字段，
// 一个 JSON 字符串；流式期间逐字符累加、不完整，JSON.parse 会抛，
// 所以解析失败一律当"还没到"，安静跳过。
//
// 状态判别必须用 block.kind === 'tool-result'：没有 kind 就是"还在跑"。
// 只按"有没有内容"判断，会把进行中误报成失败。

import React from 'react'
import * as echarts from 'echarts'
import { Network } from 'vis-network'

export const inject = ['slots']

/** 本包认领的工具名。 */
const KEYS = ['viz_show']

const h = React.createElement

// 主题：跟随 DSH 的 CSS 变量，不写死颜色。
const T = {
  line: 'var(--dsw-alias-line-default, #e8e8e8)',
  fill: 'var(--dsw-alias-fill-secondary, #fff)',
  fillHead: 'var(--dsw-alias-fill-primary, #fff)',
  ink: 'var(--dsw-alias-label-primary, #1a1a1a)',
  ink2: 'var(--dsw-alias-label-secondary, #555)',
  ink3: 'var(--dsw-alias-label-tertiary, #888)',
  accent: '#056de8',
  error: 'var(--dsw-alias-state-error-primary, #c5221f)',
}

const PALETTE = [
  '#4a7ab8', '#b8544a', '#4a9a72', '#b8913a', '#7a5aa8',
  '#3f8fa0', '#a8553f', '#6b8f3a', '#a84a7a', '#5a6b8a',
]

const S = {
  shell: {
    display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0,
    borderRadius: 12, border: '1px solid ' + T.line, background: T.fill,
    overflow: 'hidden', boxSizing: 'border-box',
  },
  head: {
    display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 14px',
    minWidth: 0, background: T.fillHead, borderBottom: '1px solid ' + T.line,
  },
  icon: {
    width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flex: 'none', color: '#fff', background: T.accent,
    fontSize: 12, fontWeight: 800, lineHeight: '22px',
  },
  title: {
    fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 0,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  sub: {
    fontSize: 11, color: T.ink3, minWidth: 0,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  body: { padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  hint: { fontSize: 12, lineHeight: '18px', color: T.ink2 },
  err: { fontSize: 12, lineHeight: '18px', color: T.error, wordBreak: 'break-all' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 },
  img: { width: '100%', height: 'auto', borderRadius: 8, display: 'block', border: '1px solid ' + T.line },
}
/** 安全读入参：解析不出就当没有。
 *
 * 认两种形态：
 *   1) 直调 —— 参数就在顶层：{ kind, items, ... }
 *   2) 经 call_tool 转发 —— 真正的参数在 arguments 里：
 *      { tool_name: 'viz_show', arguments: { kind, items, ... } }
 * 第二种不是异常：本会话只暴露 find_tools / call_tool 这几个元工具，
 * 工具都是被转发调用的，卡片必须认得出转发形态，否则会渲染成一张空卡。
 */
function readArgs(block) {
  if (!block || typeof block.argsRaw !== 'string' || block.argsRaw === '') return null
  try {
    const parsed = JSON.parse(block.argsRaw)
    if (!parsed || typeof parsed !== 'object') return null
    const inner = parsed.arguments
    if (parsed.tool_name === 'viz_show' && inner && typeof inner === 'object') return inner
    return parsed
  } catch {
    return null
  }
}

/** 工具结果里的一句话摘要。 */
function readSummary(block) {
  if (!block || block.kind !== 'tool-result') return ''
  const content = Array.isArray(block.content) ? block.content : []
  for (const c of content) {
    if (c && c.type === 'text' && typeof c.text === 'string' && c.text.trim()) return c.text.trim()
  }
  return ''
}

/** 时间归一化成秒：数字当秒、"0:05"、"1:02:03"、ISO/日期串。 */
function toSeconds(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return NaN
  const s = v.trim()
  if (s === '') return NaN
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  if (/^\d+(:\d+){1,2}(\.\d+)?$/.test(s)) {
    let sec = 0
    for (const p of s.split(':')) sec = sec * 60 + Number(p)
    return sec
  }
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? NaN : ms / 1000
}

const isDateLike = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())

function fmtClock(sec) {
  if (!Number.isFinite(sec)) return ''
  const s = Math.max(0, Math.round(sec))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/** timeline -> 泳道甘特。 */
function timelineOption(spec) {
  const raw = Array.isArray(spec.items) ? spec.items : []
  const dates = raw.some((it) => isDateLike(it && (it.start || it.end)))
  const groups = []
  for (const it of raw) {
    const g = (it && it.group) || spec.group || '全部'
    if (!groups.includes(g)) groups.push(g)
  }
  const rows = []
  for (const it of raw) {
    const a = toSeconds(it && it.start)
    if (!Number.isFinite(a)) continue
    const b = toSeconds(it && it.end)
    rows.push({
      value: [groups.indexOf((it && it.group) || spec.group || '全部'), a, Number.isFinite(b) ? b : a + 5, (it && it.label) || ''],
      note: (it && it.note) || '',
    })
  }
  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { left: 8, right: 16, top: 12, bottom: 28, containLabel: true },
    tooltip: {
      formatter(p) {
        const v = p.value || []
        const span = dates
          ? new Date(v[1] * 1000).toLocaleString() + ' → ' + new Date(v[2] * 1000).toLocaleString()
          : fmtClock(v[1]) + ' → ' + fmtClock(v[2]) + '（' + (v[2] - v[1]).toFixed(2) + ' 秒）'
        return '<b>' + (v[3] || '') + '</b><br>' + span + (p.data && p.data.note ? '<br>' + p.data.note : '')
      },
    },
    xAxis: {
      type: 'value', min: 'dataMin', max: 'dataMax',
      axisLabel: dates
        ? { formatter: (v) => { const d = new Date(v * 1000); return (d.getMonth() + 1) + '/' + d.getDate() } }
        : { formatter: fmtClock },
      splitLine: { lineStyle: { color: T.line, type: 'dashed' } },
      axisLine: { lineStyle: { color: T.line } },
    },
    yAxis: {
      type: 'category', data: groups, inverse: true,
      axisLine: { lineStyle: { color: T.line } },
      axisTick: { show: false },
      axisLabel: { color: T.ink2, fontSize: 11 },
    },
    series: [{
      type: 'custom',
      encode: { x: [1, 2], y: 0 },
      data: rows,
      renderItem(params, api) {
        const cat = api.value(0)
        const start = api.coord([api.value(1), cat])
        const end = api.coord([api.value(2), cat])
        const bandH = api.size([0, 1])[1]
        const barH = Math.max(10, bandH * 0.42)
        const rect = echarts.graphic.clipRectByRect(
          { x: start[0], y: start[1] - barH / 2, width: Math.max(2, end[0] - start[0]), height: barH },
          { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height },
        )
        if (!rect) return null
        const children = [{
          type: 'rect', shape: rect,
          style: { fill: PALETTE[Math.abs(Math.round(cat)) % PALETTE.length], opacity: 0.88 },
        }]
        if (rect.width > 34) {
          children.push({
            type: 'text',
            style: {
              text: String(api.value(3)), x: rect.x + 6, y: rect.y + rect.height / 2,
              fill: '#fff', font: '11px sans-serif', verticalAlign: 'middle',
            },
          })
        }
        return { type: 'group', children }
      },
    }],
  }
}

/** calendar -> 日历热力。 */
function calendarOption(spec) {
  const items = Array.isArray(spec.items) ? spec.items : []
  const data = []
  let max = 0
  let minDate = ''
  for (const it of items) {
    const d = it && it.date
    const v = Number(it && it.value)
    if (typeof d !== 'string' || !Number.isFinite(v)) continue
    if (!minDate || d < minDate) minDate = d
    if (v > max) max = v
    data.push([d, v])
  }
  const year = minDate ? minDate.slice(0, 4) : String(new Date().getFullYear())
  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: { formatter: (p) => p.value[0] + '：' + p.value[1] },
    visualMap: {
      min: 0, max: max || 1, calculable: true, orient: 'horizontal',
      left: 'center', bottom: 0, itemWidth: 12, itemHeight: 80,
      textStyle: { color: T.ink3, fontSize: 11 },
      inRange: { color: ['#eef3fa', '#9dc0e8', '#4a7ab8', '#1f4e86'] },
    },
    calendar: {
      top: 30, left: 30, right: 20, bottom: 60,
      cellSize: ['auto', 14], range: year,
      itemStyle: { borderColor: T.line, borderWidth: 1, color: 'transparent' },
      splitLine: { lineStyle: { color: T.line } },
      dayLabel: { color: T.ink3, fontSize: 10 },
      monthLabel: { color: T.ink2, fontSize: 11 },
      yearLabel: { show: false },
    },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }],
  }
}

function buildOption(spec) {
  if (!spec || typeof spec !== 'object') return null
  if (spec.kind === 'timeline') return timelineOption(spec)
  if (spec.kind === 'calendar') return calendarOption(spec)
  if (spec.kind === 'echarts') return spec.option && typeof spec.option === 'object' ? spec.option : null
  return null
}

/** ECharts 容器：跟随容器与窗口 resize，卸载时 dispose。 */
function ChartHost({ option, height, dep }) {
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!ref.current) return undefined
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption(option, true)
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => chart.resize())
      ro.observe(ref.current)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      if (ro) ro.disconnect()
      chart.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep])
  return h('div', { ref, style: { width: '100%', height: (height || 360) + 'px' } })
}

/** vis-network 容器。 */
function NetworkHost({ nodes, edges, height, dep }) {
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!ref.current) return undefined
    const net = new Network(
      ref.current,
      { nodes: nodes || [], edges: edges || [] },
      {
        autoResize: true,
        physics: { stabilization: { iterations: 200 } },
        nodes: { shape: 'dot', size: 14, font: { size: 12, color: T.ink } },
        edges: { arrows: 'to', font: { size: 10, color: T.ink3, strokeWidth: 0 }, smooth: { type: 'continuous' } },
        interaction: { hover: true },
      },
    )
    return () => net.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep])
  return h('div', { ref, style: { width: '100%', height: (height || 360) + 'px' } })
}

/** 卡片主体：按 kind 分支。 */
export function VizView(props) {
  const block = props && props.block
  const settled = !!(block && block.kind === 'tool-result')
  const args = readArgs(block)
  const summary = readSummary(block)
  const kind = args && args.kind ? String(args.kind) : ''
  const title = (args && args.title) || ''
  const subtitle = (args && args.subtitle) || ''
  const height = args && Number(args.height) ? Number(args.height) : 360
  const dep = args
    ? JSON.stringify([kind, args.items || null, args.nodes || null, args.edges || null, args.option || null, args.images || null, height])
    : ''

  let body = null
  let headExtra = null

  if (!args) {
    body = h('div', { style: S.hint }, settled ? (summary || '没有可画的数据。') : '正在接收数据…')
  } else if (kind === 'timeline' || kind === 'calendar' || kind === 'echarts') {
    const option = buildOption(args)
    if (!option) {
      body = h('div', { style: S.err }, '这个 kind 没有可用的数据：' + kind)
    } else {
      headExtra = kind === 'timeline' && Array.isArray(args.items) ? args.items.length + ' 项' : null
      body = h(ChartHost, { option, height, dep })
    }
  } else if (kind === 'network') {
    const n = Array.isArray(args.nodes) ? args.nodes.length : 0
    const m = Array.isArray(args.edges) ? args.edges.length : 0
    headExtra = n + ' 点 · ' + m + ' 边'
    body = h(NetworkHost, { nodes: args.nodes, edges: args.edges, height, dep })
  } else if (kind === 'gallery') {
    const imgs = Array.isArray(args.images) ? args.images : []
    headExtra = imgs.length + ' 张'
    body = h('div', { style: S.grid }, imgs.map((src, i) => h('img', { key: i, src, style: S.img, alt: '' })))
  } else {
    body = h('div', { style: S.err }, '还不认识的 kind：' + kind)
  }

  return h('div', { style: S.shell },
    h('div', { style: S.head },
      h('span', { style: S.icon }, '图'),
      h('span', { style: S.title }, title || '可视化'),
      subtitle ? h('span', { style: S.sub }, subtitle) : null,
      headExtra ? h('span', { style: { ...S.sub, marginLeft: 'auto', flex: 'none' } }, headExtra) : null,
    ),
    h('div', { style: S.body }, body),
  )
}

/** 给每个认领的工具名挂同一张卡。 */
export function apply(ctx) {
  const stops = []
  for (const key of KEYS) {
    stops.push(ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key }, VizView)))
  }
  return function dispose() {
    for (const stop of stops) { if (typeof stop === 'function') stop() }
  }
}
