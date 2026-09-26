// Run this function with Playwright's page after loading artifacts/preview.html.
// This checks real components only; it deliberately does not mock Cordis services.
async (page) => {
  const passed = []
  function check(value, message) { if (!value) throw new Error(message); passed.push(message) }
  const state = () => page.evaluate(() => {
    const { echarts } = window.vizPreview
    const get = selector => {
      const el = document.querySelector(selector + ' [_echarts_instance_]')
      return el ? echarts.getInstanceByDom(el) : null
    }
    const inline = get('[data-dsh-viz-inline]'), side = get('[data-dsh-viz-chart="storyboard"]')
    return { canvas: document.querySelectorAll('canvas').length,
      inlineId: inline?.id, sideId: side?.id,
      inlineCount: inline?.getOption().series[0].data.length,
      sideCount: side?.getOption().series[0].data.length,
      inlineZoom: inline?.getOption().dataZoom[0].end,
      sideZoom: side?.getOption().dataZoom[0].end }
  })
  await page.locator('[data-dsh-viz-chart="storyboard"] canvas').waitFor()
  const initial = await state()
  check(initial.inlineCount === 19 && initial.sideCount === 19, '19 actual storyboard shots render in both surfaces')
  check(initial.inlineId !== initial.sideId && initial.canvas === 3, 'inline and sidebar own independent ECharts instances')
  await page.evaluate(() => {
    const node = document.querySelector('[data-dsh-viz-chart="storyboard"] [_echarts_instance_]')
    window.vizPreview.echarts.getInstanceByDom(node).dispatchAction({ type: 'dataZoom', start: 0, end: 35 })
  })
  const zoomed = await state()
  check(zoomed.sideZoom === 35 && zoomed.inlineZoom === 100, 'sidebar zoom does not change inline chart')
  await page.getByRole('button', { name: '卸载原位工具卡', exact: true }).click()
  const detached = await state()
  check(detached.canvas === 2 && detached.sideId === initial.sideId, 'unmounting inline tool leaves sidebar chart intact')
  await page.getByRole('button', { name: '恢复原位工具卡', exact: true }).click()
  await page.locator('[data-dsh-viz-inline] canvas').waitFor()
  const restored = await state()
  check(restored.inlineId !== initial.inlineId && restored.sideId === initial.sideId, 'inline remount creates new chart without resetting sidebar')
  await page.getByRole('button', { name: '清空选择', exact: true }).click()
  check(await page.locator('[data-dsh-viz-chart]').count() === 0 && await page.locator('[data-dsh-viz-inline] canvas').count() === 1, 'clearing sidebar selection keeps full inline visualization')
  await page.getByRole('checkbox').first().check()
  check(await page.locator('[data-dsh-viz-chart]').count() === 1, 'checkbox selects one chart')
  await page.getByRole('button', { name: '全选', exact: true }).click()
  await page.getByRole('combobox', { name: '图表对比布局' }).selectOption('one')
  const rects = await page.locator('[data-dsh-viz-chart]').evaluateAll(nodes => nodes.map(el => ({ top: el.getBoundingClientRect().top, left: el.getBoundingClientRect().left })))
  check(rects.length === 2 && rects[1].top > rects[0].top && rects[1].left === rects[0].left, 'vertical comparison layout works')
  await page.getByRole('combobox', { name: '图表对比布局' }).selectOption('two')
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-dsh-viz-chart="storyboard"] [_echarts_instance_]')
    return Math.abs(window.vizPreview.echarts.getInstanceByDom(node).getWidth() - node.clientWidth) < 2
  })
  check(await page.locator('[data-dsh-viz-chart]').count() === 2, 'parallel comparison resizes canvas to its actual column')
  await page.locator('[data-dsh-viz-chart="storyboard"] summary').click()
  check(await page.locator('[data-dsh-viz-chart="storyboard"] pre').isVisible(), 'source details expose recorded chart specification')
  await page.locator('[data-dsh-viz-chart="storyboard"] summary').click()
  await page.evaluate(() => window.vizPreview.emit('bad', { kind: 'echarts', title: 'Expected error isolation test', option: { series: [{type:'bar',data:[1]}] } }))
  await page.locator('[data-dsh-viz-chart="bad"] [role="alert"]').waitFor()
  check(await page.locator('[data-dsh-viz-chart="storyboard"] canvas').count() === 1, 'one broken chart is isolated rather than crashing collection')
  await page.evaluate(() => window.vizPreview.catalog.select('bad', false))
  await page.getByRole('combobox', { name: '图表对比布局' }).selectOption('auto')
  await page.setViewportSize({width:1050,height:900})
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-dsh-viz-chart="storyboard"] [_echarts_instance_]')
    return Math.abs(window.vizPreview.echarts.getInstanceByDom(node).getWidth() - node.clientWidth) < 2
  })
  check(true, 'viewport resize keeps chart and container dimensions aligned')
  await page.setViewportSize({width:1500,height:1050})
  return { passed, total: passed.length, scope: 'real component preview, not installed DSH integration' }
}
