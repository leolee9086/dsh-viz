import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { sourceLoadSeq } from '../src/reveal.js'

const call = (id, seq) => ({ event: { type: 'tool/call', seq, data: { callId: id } } })
test('直调来源加载真实工具开始序号', () => {
  assert.equal(sourceLoadSeq({ callId: 'viz', sourceSeq: 20 }, [call('viz', 12)]), 12)
})
test('PTC 定位载入根调用，但卡片身份保持真实子调用', () => {
  const record = { callId: 'child', rootCallId: 'root', sourceSeq: 30 }
  assert.equal(sourceLoadSeq(record, [call('other', 1), call('root', 9)]), 9)
  assert.equal(record.callId, 'child')
})
test('历史窗口缺根调用时从记录序号开始，非法序号不发分页请求', () => {
  assert.equal(sourceLoadSeq({ callId: 'child', rootCallId: 'root', sourceSeq: 30 }, []), 30)
  for (const seq of [undefined, -1, 1.5, NaN]) assert.throws(() => sourceLoadSeq({ callId: 'x', sourceSeq: seq }, []))
})
test('回跳兼容桥不含 DOM 改写、样式补丁、观察器或 Fiber 访问', async () => {
  const source = await readFile(new URL('../src/reveal.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.(?:setAttribute|removeAttribute|appendChild|removeChild|replaceChild|insertBefore)\s*\(/)
  assert.doesNotMatch(source, /\.(?:innerHTML|outerHTML|className|textContent)\s*=|\.style[.\[]|new MutationObserver|__reactFiber/)
  assert.match(source, /dispatchEvent\(new doc\.defaultView\.Event\('beforematch'/)
  assert.match(source, /getAttribute\('data-chat-call-id'\) === record\.callId/)
})
