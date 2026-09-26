import React from 'react'
import { createCatalog } from './catalog.js'
import { createSourceRevealer } from './reveal.js'

const h = React.createElement
const TAB = 'dsh-viz:catalog'
const ENTRY = 'dsh-viz.catalog'
const buttonStyle = { padding: '5px 9px', border: '1px solid var(--dsw-alias-line-default, #ddd)', borderRadius: 6,
  color: 'inherit', background: 'transparent', cursor: 'pointer', fontSize: 12 }
function button(label, onClick, extra = {}) {
  return h('button', { type: 'button', style: buttonStyle, onClick, ...extra }, label)
}

/** 正式插槽承载 UI；来源回跳只读查询 Chat 标记并触发原生展开，不改 DOM。 */
export function registerCatalogUI(ctx, { VizChart, VizView, toolKeys }) {
  const states = new Map() // 用 binding 对象而非 sessionId，避免重连复用已销毁的会话代。
  let disposed = false
  function open(binding, id) {
    const state = stateFor(binding)
    if (id) state.catalog.select(id)
    if (ctx.sidebarRight.mounted.getSnapshot() !== binding.sessionId) return
    ctx.sidebarRight.openTab(TAB)
    if (!ctx.sidebarRight.isExpanded()) ctx.layout.openRightbar(false, false)
  }
  function stateFor(binding) {
    if (!binding) throw new Error('dsh-viz: Session binding is unavailable')
    if (disposed) throw new Error('dsh-viz: Plugin has been disposed')
    const existing = states.get(binding)
    if (existing) return existing
    const catalog = createCatalog(binding.sessionId)
    catalog.update(binding.eventSource.getSnapshot())
    const revealer = createSourceRevealer({ binding,
      isCurrent: () => !disposed && ctx.sessions.binding(binding.sessionId) === binding &&
        ctx.sidebarRight.mounted.getSnapshot() === binding.sessionId })
    const stopMounted = ctx.sidebarRight.mounted.subscribe(() => {
      if (ctx.sidebarRight.mounted.getSnapshot() !== binding.sessionId) revealer.cancel()
    })
    const state = { catalog, revealer, stop: null }
    states.set(binding, state)
    const stopEvents = binding.eventSource.subscribe(() => {
      const news = catalog.update(binding.eventSource.getSnapshot(), true)
      // 历史恢复不打开；只在该会话仍是当前右栏上下文时处理新的成功调用。
      if (news.length && ctx.sidebarRight.mounted.getSnapshot() === binding.sessionId) {
        for (const record of news) catalog.select(record.callId)
        open(binding)
      }
    })
    let released = false
    const release = () => {
      if (released) return
      released = true
      stopEvents()
      stopMounted()
      revealer.dispose()
      catalog.dispose()
      states.delete(binding)
    }
    state.stop = binding.ctx.effect(() => release, 'dsh-viz: event index lifetime')
    return state
  }
  function injected(sessionId) {
    const binding = ctx.sessions.binding(sessionId)
    const { catalog, revealer } = stateFor(binding)
    return {
      hooks: { vizCatalog: catalog },
      openViz: id => open(binding, id),
      revealChart: id => {
        const record = catalog.getSnapshot().records.find(r => r.callId === id)
        if (!record) return Promise.reject(new Error('图表已不在当前会话记录中。'))
        return revealer.reveal(record)
      },
      selectChart: (id, checked) => catalog.select(id, checked),
      selectAllCharts: checked => catalog.selectAll(checked),
      setChartLayout: value => catalog.setLayout(value),
      loadChartHistory: async () => {
        if (catalog.getSnapshot().loading) return
        catalog.setLoading(true)
        try {
          // 这是正式会话分页接口，只加载客户端记录，不向模型注入新消息。
          await binding.session.loadThrough(0)
          catalog.update(binding.eventSource.getSnapshot())
          const incomplete = binding.eventSource.getSnapshot().hasMore
          catalog.setLoading(false, incomplete ? '尚有历史未载入，可能正在分页或连接中，请稍后重试。' : '')
        } catch (error) {
          catalog.setLoading(false, String(error.message ?? error))
        }
      },
    }
  }

  function Header({ useVizCatalog, openViz }) {
    const count = useVizCatalog(s => s.records.length)
    return button('图表 ' + count, () => openViz(), { title: '打开当前会话的图表集合与对比面板' })
  }
  const Panel = props => h(CatalogPanel, { ...props, VizChart })
  const stops = []
  // Provider 与 Session surface 一起存在，尚未打开侧栏/工具卡时也会收集新调用。
  stops.push(ctx.uiSession.provide({ hooks: ['dshViz'], resolve: binding => ({ hooks: { dshViz: stateFor(binding).catalog } }) }))
  stops.push(ctx.sidebarRightTabs.register({ id: ENTRY, kind: TAB, title: () => '图表对比' }))
  stops.push(ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ENTRY, inject: injected }, Panel)))
  stops.push(ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register({ name: 'conversation.session.header.utilities', id: ENTRY, order: 15, inject: injected }, Header)))
  for (const key of toolKeys) stops.push(ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key, inject: injected }, VizView)))
  return () => {
    for (const stop of stops.reverse()) if (typeof stop === 'function') stop()
    disposed = true
    for (const state of [...states.values()]) state.stop()
  }
}

/** 纯视图：生产插槽和视觉测试共用，不需要伪造宿主服务。 */
export function CatalogPanel({ VizChart, useVizCatalog, selectChart, selectAllCharts, setChartLayout, loadChartHistory, revealChart }) {
    const state = useVizCatalog(s => s)
    const [jump, setJump] = React.useState({ id: null, busy: false, error: '', message: '' })
    const request = React.useRef(0)
    React.useEffect(() => () => { request.current++ }, [])
    async function reveal(id) {
      const token = ++request.current
      setJump({ id, busy: true, error: '', message: '' })
      try {
        await revealChart(id)
        if (token === request.current) setJump({ id, busy: false, error: '', message: '已定位到原位工具卡。' })
      } catch (error) {
        if (token === request.current) setJump({ id, busy: false, error: String(error.message ?? error), message: '' })
      }
    }
    const selected = new Set(state.selected)
    const shown = state.records.filter(r => selected.has(r.callId))
    const columns = state.layout === 'one' ? 'minmax(0, 1fr)' : state.layout === 'two'
      ? 'repeat(2, minmax(280px, 1fr))' : 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))'
    return h('section', {
      'data-dsh-viz-catalog': '', 'aria-label': '会话图表集合',
      style: { height: '100%', overflow: 'auto', padding: 14, boxSizing: 'border-box',
        color: 'var(--dsw-alias-label-primary, #222)', background: 'var(--dsw-alias-bg-base, #fff)' },
    },
    h('header', { style: { marginBottom: 12 } },
      h('h2', { style: { fontSize: 16, margin: '0 0 6px' } }, '会话图表'),
      h('p', { style: { fontSize: 12, margin: '0 0 10px', opacity: .7 } },
        '原位图表保留在工具卡中；这里选择多张进行对比。'),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        h('span', { role: 'status', style: { fontSize: 12 } }, `${state.records.length} 张 · 已选 ${shown.length}`),
        button('全选', () => selectAllCharts(true)), button('清空选择', () => selectAllCharts(false)),
        h('label', { style: { fontSize: 12 } }, '布局 ', h('select', {
          value: state.layout, onChange: e => setChartLayout(e.target.value), 'aria-label': '图表对比布局',
          style: buttonStyle,
        }, h('option', { value: 'auto' }, '自适应'), h('option', { value: 'one' }, '上下对比'), h('option', { value: 'two' }, '并排对比'))),
        state.hasMore ? button(state.loading ? '正在载入…' : '载入更早的图表', loadChartHistory, { disabled: state.loading }) : null,
      ),
      state.hasMore ? h('p', { style: { fontSize: 12, opacity: .7 } }, '当前集合来自已载入的会话窗口；更早的记录尚未载入。') : null,
      state.error ? h('p', { role: 'alert' }, state.error) : null,
    ),
    state.records.length ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 } },
      state.records.map((record, i) => h('label', {
        key: record.callId, style: { ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' },
      }, h('input', { type: 'checkbox', checked: selected.has(record.callId),
        onChange: e => selectChart(record.callId, e.target.checked) }),
      h('span', { style: { overflowWrap: 'anywhere' } }, `${i + 1}. ${record.spec?.title || record.spec?.kind || '无效图表'}`),
      record.status !== 'complete' ? h('small', null, record.status === 'error' ? '失败' : '进行中') : null)),
    ) : h('p', null, '这个会话窗口还没有 viz_show 图表。新的图表完成后会自动出现在这里。'),
    state.records.length && !shown.length ? h('p', null, '请选择要查看或对比的图表。') : null,
    h('div', { style: { display: 'grid', gridTemplateColumns: columns, gap: 14, alignItems: 'start' } },
      shown.map(record => h('article', { key: record.callId, 'data-dsh-viz-chart': record.callId, style: { minWidth: 0 } },
        h(VizChart, { spec: record.spec, settled: record.status !== 'running', summary: record.summary }),
        revealChart ? button(jump.id === record.callId && jump.busy ? '正在定位…' : '回到工具卡',
          () => reveal(record.callId), { disabled: jump.id === record.callId && jump.busy,
            style: { ...buttonStyle, marginTop: 6 } }) : null,
        jump.id === record.callId && (jump.error || jump.message) ? h('p', {
          role: jump.error ? 'alert' : 'status', style: { fontSize: 12, margin: '6px 0' },
        }, jump.error || jump.message) : null,
        record.status === 'error' ? h('p', { role: 'alert', style: { fontSize: 12 } }, '调用失败，以上仅显示其输入数据：' + record.summary) : null,
        h('details', { style: { marginTop: 6, fontSize: 12 } },
          h('summary', { style: { cursor: 'pointer' } }, `来源记录 · #${record.sourceSeq}`),
          h('p', null, '调用 ID：', h('code', null, record.callId)),
          record.rootCallId && record.rootCallId !== record.callId ? h('p', null, '根调用：', h('code', null, record.rootCallId)) : null,
          h('p', null, '回跳只读定位当前会话的工具卡，并调用宿主原生折叠展开与滚动；不会跳到轨迹页。'),
          h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto' } }, JSON.stringify(record.spec, null, 2)),
        ),
      )),
    ))
}
