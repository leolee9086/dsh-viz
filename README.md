# dsh-viz

DeepSeek Harness 的可视化卡面插件：**把数据画成会话里的一张图**。

宿主侧注册一个 `viz_show` 工具；浏览器侧认领它的专属工具卡，用 ECharts 与 vis-network 把这次调用的参数渲染出来。

## 装

在 DSH Web profile 目录（默认 `~/.dsh/profiles/web`）：

```sh
pnpm add dsh-viz
```

本包在 `package.json` 里声明了 `dsh.bundle.patch`，所以它能作为 profile 的一层被装进去。

## 支持哪些视图

| kind | 用来画 | 需要给的字段 |
|---|---|---|
| `timeline` | 时间线 / 甘特（分镜表、日程、排期） | `items[] = { label, start, end, group, note }` |
| `network` | 关系网（人物关系、依赖图） | `nodes[]`、`edges[]` |
| `calendar` | 日历热力 | `items[] = { date, value }` |
| `echarts` | 任意原生 ECharts 图表 | `option`（直接给 ECharts option） |
| `gallery` | 图册 | `images[]`（http(s) 地址） |

时间写法都能吃：`"0:05"`、`"1:02:03"`、纯秒数、`"2026-09-26 01:00"`。

## 已知边界

- `gallery` 目前只认 http(s) 地址；本地文件要先有可访问的 URL。
- 卡片是只读的：能看、能悬停看细节，不能在里面改数据。
- 客户端文件由 web server 原样下发，**不是 ESM**；两个可视化库在构建时被内联进 `lib/client.js`。

## 开发

```sh
pnpm install
pnpm run build      # scripts/build.mjs：校验 src/client.js，把库内联后写到 lib/
```

改浏览器侧（`src/client.js`）→ 刷新页面即可。
改宿主侧（`src/host.js`）→ 必须重启 DSH。
