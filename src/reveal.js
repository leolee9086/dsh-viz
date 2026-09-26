// 0.1.7-rc.2 兼容桥：只读查询宿主标记，展开交给原生 beforematch handler。
// 不写 hidden/class/style，不搬节点，不接触 React fiber，也不持有后台 DOM 观察器。
export function sourceLoadSeq(record, entries) {
  const root = record.rootCallId || record.callId
  const call = entries.find(({ event }) => event.type === 'tool/call' && event.data.callId === root)
  const seq = call?.event.seq ?? record.sourceSeq
  if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('来源记录缺少有效的事件序号。')
  return seq
}

/** 一次点击一个有上限的任务；新点击、换会话或卸载都让旧任务失效。 */
export function createSourceRevealer({ binding, isCurrent, document: doc = globalThis.document }) {
  let generation = 0
  let disposed = false
  const pending = new Map()
  function cancel() {
    generation++
    for (const [timer, resolve] of pending) { clearTimeout(timer); resolve() }
    pending.clear()
  }
  const pause = () => new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(timer); resolve() }, 50)
    pending.set(timer, resolve)
  })
  function rootForSession() {
    // 不拼接不可信 callId/sessionId 到 CSS selector；只作完整字符串匹配。
    const roots = [...doc.querySelectorAll('[data-conversation-session][data-conversation-region="chat"]')]
      .filter(el => el.getAttribute('data-conversation-session') === binding.sessionId && el.getClientRects().length)
    if (roots.length !== 1) throw new Error('请先打开此会话的聊天视图，再点击回到工具卡。')
    return roots[0]
  }
  return {
    cancel,
    dispose() { disposed = true; cancel() },
    async reveal(record) {
      cancel()
      const ticket = generation
      const check = () => {
        if (disposed || generation !== ticket || !isCurrent()) throw new Error('回跳已取消：会话已切换或有新的定位请求。')
      }
      check()
      // 先确认当前会话，绝不为了一个后台来源抢焦点。
      rootForSession()
      let entries = binding.eventSource.getSnapshot().entries
      let seq = sourceLoadSeq(record, entries)
      await binding.session.loadThrough(seq)
      check()
      // PTC 子调用必须连同根调用载入；若窗口还不含根，使用正式分页接口补齐。
      entries = binding.eventSource.getSnapshot().entries
      if (record.rootCallId && record.rootCallId !== record.callId &&
          !entries.some(({ event }) => event.type === 'tool/call' && event.data.callId === record.rootCallId)) {
        await binding.session.loadThrough(0)
        check()
      }
      // 宿主投影/React commit 是异步的；最多等待两秒，不持续监听整条时间线。
      let found = false
      for (let attempt = 0; attempt < 40; attempt++) {
        check()
        const root = rootForSession()
        const card = [...root.querySelectorAll('[data-chat-call-id]')]
          .find(el => el.getAttribute('data-chat-call-id') === record.callId)
        if (card) {
          found = true
          const hidden = []
          for (let el = card; el && el !== root; el = el.parentElement) {
            if (el.hasAttribute('hidden')) hidden.push(el)
          }
          if (hidden.length) {
            // 从最外层逐级展开，每次等宿主提交；避免外层复位再次关掉内层。
            const outer = hidden.at(-1)
            if (outer.getAttribute('hidden') !== 'until-found')
              throw new Error('来源被当前视图隐藏，宿主未提供可用的原生展开入口。')
            outer.dispatchEvent(new doc.defaultView.Event('beforematch', { bubbles: false }))
          } else if (card.getClientRects().length) {
            card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
            await pause()
            check()
            // 只确认当前仍是同一个可见工具卡；不把匹配到根调用冒充精确定位。
            if (!card.isConnected || card.closest('[hidden]')) continue
            const r = card.getBoundingClientRect()
            if (r.bottom <= 0 || r.top >= doc.defaultView.innerHeight)
              throw new Error('已展开来源，但宿主未完成滚动，请再次点击定位。')
            return { callId: record.callId }
          }
        }
        await pause()
      }
      throw new Error(found ? '已找到来源，但原生折叠组未展开；请手动展开后重试。' : '当前聊天窗口未找到对应工具卡，可能仍在加载历史或宿主标记已变化；请稍后重试。')
    },
  }
}
