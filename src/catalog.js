// 图表目录只投影会话事件，不依赖 React、DOM 或某张工具卡是否被折叠。
// 数据始终归原始调用所有；这里的 selected/layout 只是本次查看状态。
export const KINDS = new Set(['timeline', 'calendar', 'echarts', 'network', 'gallery'])
export function parseArgsText(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value.tool_name === 'viz_show' ? parseArgsText(value.arguments) : value
  } catch { return null }
}
export function readArgs(block) {
  return parseArgsText(block?.argsRaw ?? block?.call?.argsRaw)
}
export function readSummary(block) {
  return (block?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')
}

// 仅接收真实 viz_show 身份，不把 call_tool 外层重复算成另一张图。
// PTC 的完成事件自己携带 arguments，即使窗口里没有 start 也能还原。
const RELEVANT = new Set(['tool/call', 'tool/result', 'tool/ptc-dispatch-start', 'tool/ptc-dispatch'])
export function createCatalog(sessionId) {
  const listeners = new Set()
  const calls = new Map()
  const results = new Map()
  let selected = new Set()
  let selectionTouched = false
  let snapshot = { records: [], selected: [], hasMore: false, loading: false, error: '', layout: 'auto' }
  function publish(patch) {
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }
  function accept(event) {
    if (!event || !RELEVANT.has(event.type)) return false
    const d = event.data
    if (event.type === 'tool/result') {
      const message = d.message
      const id = message?.source?.callId
      // 不缓存其它工具的结果正文。历史补页会按顺序重建，再自然配对。
      if (!id || !calls.has(id)) return false
      results.set(id, { seq: event.seq, content: message.content, isError: message.isError === true })
      return true
    }
    const child = event.type.startsWith('tool/ptc-dispatch')
    if (d.name !== 'viz_show') return false
    const id = child ? d.subCallId : d.callId
    if (typeof id !== 'string' || !id) throw new Error('viz_show record is missing its call identity')
    const previous = calls.get(id)
    const spec = parseArgsText(d.arguments)
    calls.set(id, {
      sessionId, callId: id, sourceSeq: previous?.sourceSeq ?? event.seq,
      time: previous?.time ?? event.time, turn: d.turn ?? previous?.turn,
      rootCallId: child ? d.rootCallId : id,
      spec, invalid: !spec || !KINDS.has(spec.kind),
    })
    if (event.type === 'tool/ptc-dispatch') results.set(id, {
      seq: event.seq, content: d.content ?? [], isError: d.isError === true,
    })
    return true
  }
  function refresh(hasMore) {
    const records = [...calls.values()].map(call => {
      const result = results.get(call.callId)
      return { ...call, status: result ? (result.isError ? 'error' : 'complete') : 'running',
        resultSeq: result?.seq, summary: result ? readSummary(result) : '' }
    }).sort((a, b) => a.sourceSeq - b.sourceSeq || a.callId.localeCompare(b.callId))
    const ids = new Set(records.map(r => r.callId))
    selected = new Set([...selected].filter(id => ids.has(id)))
    if (!selectionTouched && records.length) selected.add(records.at(-1).callId)
    publish({ records, selected: [...selected], hasMore })
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    // seed / prepend / replace are reconstruction, never news. Only append can auto-open.
    update(window, live = false) {
      const change = window.change
      // assistant 流式结算只替换文本行，图表事实不变，避免每个 token 扫描历史。
      if (live && change.kind === 'settle-assistant') return []
      const append = live && change.kind === 'append'
      const before = new Set(snapshot.records.filter(r => r.status === 'complete').map(r => r.callId))
      let changed = false
      if (!append) { calls.clear(); results.clear() }
      const entries = append ? change.entries : window.entries
      for (const entry of entries) changed = accept(entry.event) || changed
      if (!append || changed || window.hasMore !== snapshot.hasMore) refresh(window.hasMore)
      return append ? snapshot.records.filter(r => r.status === 'complete' && !r.invalid && !before.has(r.callId)) : []
    },
    select(id, checked = true) {
      if (!calls.has(id)) throw new Error('Chart is no longer in the loaded session window')
      selectionTouched = true
      if (checked) selected.add(id); else selected.delete(id)
      publish({ selected: [...selected] })
    },
    selectAll(checked) {
      selectionTouched = true
      selected = new Set(checked ? snapshot.records.map(r => r.callId) : [])
      publish({ selected: [...selected] })
    },
    setLayout(layout) { publish({ layout }) },
    setLoading(loading, error = '') { publish({ loading, error }) },
    dispose() { listeners.clear(); calls.clear(); results.clear() },
  }
}
