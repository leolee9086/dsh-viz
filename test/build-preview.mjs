import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

// 可选显式输入旧分镜表：只提取静态字符串，不 eval 其中的脚本。
const source = process.argv[2]
let fixture = null
if (source) {
  const html = await readFile(source, 'utf8')
  const section = /const shots = \[([\s\S]*?)\n\];/.exec(html)?.[1]
  if (!section) throw new Error('Expected a static shots array in the storyboard input')
  const items = []
  let group = '分镜'
  for (const match of section.matchAll(/\{n:(\d+), act:'([^']*)', tc:'([^']*)'[\s\S]*?want:'([^']*)'/g)) {
    if (match[2]) group = match[2]
    const [start, end] = match[3].split('–')
    items.push({ label: 'S' + match[1].padStart(2, '0'), start, end, group, note: match[4] })
  }
  if (items.length !== 19) throw new Error(`Expected 19 storyboard shots, received ${items.length}`)
  fixture = { kind: 'timeline', title: '长田湾 · 第1集《拖枪》', subtitle: '旧版分镜表 · 19镜 / 95秒', height: 380, items }
}
await mkdir('artifacts', { recursive: true })
const result = await build({ entryPoints: ['test/preview.js'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', define: { 'process.env.NODE_ENV': '"development"' } })
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script')
const data = JSON.stringify(fixture).replaceAll('<', '\\u003c')
await writeFile('artifacts/preview.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>dsh-viz component preview</title><style>body{margin:20px;font-family:system-ui,sans-serif;color:#20252c;background:#f6f8fb}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}</style><div id="root"></div><script>window.__VIZ_FIXTURE__=${data};</script><script>${script}</script></html>`)
console.log('Created artifacts/preview.html with real React + production chart and panel components' + (fixture ? `; ${fixture.items.length} shots extracted from explicit input` : ''))
