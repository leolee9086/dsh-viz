// scripts/build.mjs —— 用 esbuild 打包。
//
// 客户端（src/client.js）是正常 ESM，这里打成 CJS，再用 banner/footer 套成
// __ModuleLoader__ 需要的工厂形态；react 留作外部依赖，由平台模块表提供。
//
// 注意：esbuild 没有 intro 选项（那是 rollup/tsdown 的），
// 所以 `var module / var exports` 这两句要并进 banner 里，
// 位置正好在 factory 开括号之后、被打包代码之前。
//
// 宿主（src/host.js）是 Node ESM，直接打一份出来。

import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

await build({
  entryPoints: [join(root, 'src/host.js')],
  outfile: join(root, 'lib/host.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
})

await build({
  entryPoints: [join(root, 'src/client.js')],
  outfile: join(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  legalComments: 'none',
  external: ['react'],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(pkg.name) + ', factory: (require) => {\n'
      + 'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: '\nreturn module.exports; } });' },
})

console.log('dsh-viz: 打包完成 → lib/host.js, lib/client.js')
