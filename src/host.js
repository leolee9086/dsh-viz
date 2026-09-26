// src/host.js —— dsh-viz 的 Node 侧入口。
//
// 只做一件事：注册 viz_show 工具。工具本身几乎不做事——把参数收下、
// 校验、回一句摘要；真正的渲染在浏览器侧（src/client.js）那张工具卡里，
// 它直接读这次调用的参数画图。
//
// 为什么不 import 任何 @deepseek-ai/* 包：一切能力都走运行时 Cordis 服务契约
// （inject / ctx.get）。这是本仓库唯一一条硬规矩。

export const name = 'dsh-viz'

// tools 是注册工具用的服务；没有它这个插件无意义，所以走 inject 而不是 ctx.get。
export const inject = ['tools']

const TOOL_NAME = 'viz_show'

const DESCRIPTION = [
  '把数据画成会话里的一张图（前端卡面）。',
  'kind="timeline"：时间线/甘特。用 items，每项 { label, start, end, group, note }。适合分镜表、日程、进度、任务排期。',
  'kind="network"：关系网。用 nodes [{ id, label, group }] 与 edges [{ from, to, label }]。',
  'kind="calendar"：日历热力。用 items，每项 { date, value }。',
  'kind="echarts"：直接给一个 ECharts option 对象，走原生的任意图表（折线、柱、饼、桑基、树、地图…）。',
  'kind="gallery"：图册。用 images（每项是一个 http(s) 地址）。',
  '画出来的图会顶替这次调用的默认卡片显示在会话里；summary 里给一句人读的结论。',
].join(' ')

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: {
      type: 'string',
      enum: ['timeline', 'network', 'calendar', 'echarts', 'gallery'],
      description: '要画哪种视图。',
    },
    title: { type: 'string', description: '卡片标题。' },
    subtitle: { type: 'string', description: '标题下面的一行小字。' },
    height: { type: 'integer', description: '画布高度（像素），默认 360。' },
    items: {
      type: 'array',
      description: 'timeline 与 calendar 用的数据。',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          label: { type: 'string' },
          start: { type: 'string', description: 'timeline：起点，形如 "0:05"，也接受秒数或 ISO 时间。' },
          end: { type: 'string', description: 'timeline：终点。' },
          date: { type: 'string', description: 'calendar：日期，形如 "2026-09-26"。' },
          value: { type: 'number', description: 'calendar：当天的数值。' },
          group: { type: 'string', description: 'timeline：泳道。' },
          note: { type: 'string', description: '悬停时显示的说明。' },
        },
      },
    },
    nodes: {
      type: 'array',
      description: 'network 用的节点。',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          group: { type: 'string' },
        },
      },
    },
    edges: {
      type: 'array',
      description: 'network 用的边。',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
    option: {
      type: 'object',
      additionalProperties: true,
      description: 'kind="echarts" 时直接给 ECharts option。',
    },
    images: {
      type: 'array',
      description: 'kind="gallery" 时的图片地址列表。',
      items: { type: 'string' },
    },
    summary: { type: 'string', description: '一句人读的结论，作为工具结果返回。' },
  },
}

/** 没给 summary 时按数据凑一句人读的。 */
function describe(kind, args) {
  const title = (args && args.title) || ''
  const head = title ? title + '：' : ''
  const n = (v) => (Array.isArray(v) ? v.length : 0)
  if (kind === 'timeline') return head + '时间线，' + n(args && args.items) + ' 项。'
  if (kind === 'calendar') return head + '日历，' + n(args && args.items) + ' 天有数据。'
  if (kind === 'gallery') return head + '图册，' + n(args && args.images) + ' 张。'
  if (kind === 'network') {
    return head + '关系网，' + n(args && args.nodes) + ' 个节点、' + n(args && args.edges) + ' 条边。'
  }
  return head + '已按 ECharts option 画出一张图。'
}

/**
 * 组装工具定义。用原始 JSON Schema 注册，与同机其它本地插件一致。
 */
function toolDef() {
  return {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
          kind: { type: 'string' },
        },
      },
      // 工具结果只回一句话。图由客户端那张卡按参数画，模型不必再看一遍数据。
      render(_args, value) {
        return [{ type: 'text', text: (value && value.summary) || '已画出。' }]
      },
    },
    async execute(args) {
      const kind = String((args && args.kind) || 'echarts')
      return { summary: (args && args.summary) || describe(kind, args), kind }
    },
  }
}

/** Cordis 插件入口：注册即副作用，返回清理函数（HMR 安全）。 */
export function apply(ctx) {
  ctx.effect(() => ctx.tools.register(toolDef()), 'dsh-viz: viz_show tool')
}
