// dsh-viz/src/host.js
var name = "dsh-viz";
var inject = ["tools"];
var TOOL_NAME = "viz_show";
var DESCRIPTION = [
  "\u628A\u6570\u636E\u753B\u6210\u4F1A\u8BDD\u91CC\u7684\u4E00\u5F20\u56FE\uFF08\u524D\u7AEF\u5361\u9762\uFF09\u3002",
  'kind="timeline"\uFF1A\u65F6\u95F4\u7EBF/\u7518\u7279\u3002\u7528 items\uFF0C\u6BCF\u9879 { label, start, end, group, note }\u3002\u9002\u5408\u5206\u955C\u8868\u3001\u65E5\u7A0B\u3001\u8FDB\u5EA6\u3001\u4EFB\u52A1\u6392\u671F\u3002',
  'kind="network"\uFF1A\u5173\u7CFB\u7F51\u3002\u7528 nodes [{ id, label, group }] \u4E0E edges [{ from, to, label }]\u3002',
  'kind="calendar"\uFF1A\u65E5\u5386\u70ED\u529B\u3002\u7528 items\uFF0C\u6BCF\u9879 { date, value }\u3002',
  'kind="echarts"\uFF1A\u76F4\u63A5\u7ED9\u4E00\u4E2A ECharts option \u5BF9\u8C61\uFF0C\u8D70\u539F\u751F\u7684\u4EFB\u610F\u56FE\u8868\uFF08\u6298\u7EBF\u3001\u67F1\u3001\u997C\u3001\u6851\u57FA\u3001\u6811\u3001\u5730\u56FE\u2026\uFF09\u3002',
  'kind="gallery"\uFF1A\u56FE\u518C\u3002\u7528 images\uFF08\u6BCF\u9879\u662F\u4E00\u4E2A http(s) \u5730\u5740\uFF09\u3002',
  "\u753B\u51FA\u6765\u7684\u56FE\u4F1A\u9876\u66FF\u8FD9\u6B21\u8C03\u7528\u7684\u9ED8\u8BA4\u5361\u7247\u663E\u793A\u5728\u4F1A\u8BDD\u91CC\uFF1Bsummary \u91CC\u7ED9\u4E00\u53E5\u4EBA\u8BFB\u7684\u7ED3\u8BBA\u3002"
].join(" ");
var PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: {
      type: "string",
      enum: ["timeline", "network", "calendar", "echarts", "gallery"],
      description: "\u8981\u753B\u54EA\u79CD\u89C6\u56FE\u3002"
    },
    title: { type: "string", description: "\u5361\u7247\u6807\u9898\u3002" },
    subtitle: { type: "string", description: "\u6807\u9898\u4E0B\u9762\u7684\u4E00\u884C\u5C0F\u5B57\u3002" },
    height: { type: "integer", description: "\u753B\u5E03\u9AD8\u5EA6\uFF08\u50CF\u7D20\uFF09\uFF0C\u9ED8\u8BA4 360\u3002" },
    items: {
      type: "array",
      description: "timeline \u4E0E calendar \u7528\u7684\u6570\u636E\u3002",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          label: { type: "string" },
          start: { type: "string", description: 'timeline\uFF1A\u8D77\u70B9\uFF0C\u5F62\u5982 "0:05"\uFF0C\u4E5F\u63A5\u53D7\u79D2\u6570\u6216 ISO \u65F6\u95F4\u3002' },
          end: { type: "string", description: "timeline\uFF1A\u7EC8\u70B9\u3002" },
          date: { type: "string", description: 'calendar\uFF1A\u65E5\u671F\uFF0C\u5F62\u5982 "2026-09-26"\u3002' },
          value: { type: "number", description: "calendar\uFF1A\u5F53\u5929\u7684\u6570\u503C\u3002" },
          group: { type: "string", description: "timeline\uFF1A\u6CF3\u9053\u3002" },
          note: { type: "string", description: "\u60AC\u505C\u65F6\u663E\u793A\u7684\u8BF4\u660E\u3002" }
        }
      }
    },
    nodes: {
      type: "array",
      description: "network \u7528\u7684\u8282\u70B9\u3002",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          group: { type: "string" }
        }
      }
    },
    edges: {
      type: "array",
      description: "network \u7528\u7684\u8FB9\u3002",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          label: { type: "string" }
        }
      }
    },
    option: {
      type: "object",
      additionalProperties: true,
      description: 'kind="echarts" \u65F6\u76F4\u63A5\u7ED9 ECharts option\u3002'
    },
    images: {
      type: "array",
      description: 'kind="gallery" \u65F6\u7684\u56FE\u7247\u5730\u5740\u5217\u8868\u3002',
      items: { type: "string" }
    },
    summary: { type: "string", description: "\u4E00\u53E5\u4EBA\u8BFB\u7684\u7ED3\u8BBA\uFF0C\u4F5C\u4E3A\u5DE5\u5177\u7ED3\u679C\u8FD4\u56DE\u3002" }
  }
};
function describe(kind, args) {
  const title = args && args.title || "";
  const head = title ? title + "\uFF1A" : "";
  const n = (v) => Array.isArray(v) ? v.length : 0;
  if (kind === "timeline") return head + "\u65F6\u95F4\u7EBF\uFF0C" + n(args && args.items) + " \u9879\u3002";
  if (kind === "calendar") return head + "\u65E5\u5386\uFF0C" + n(args && args.items) + " \u5929\u6709\u6570\u636E\u3002";
  if (kind === "gallery") return head + "\u56FE\u518C\uFF0C" + n(args && args.images) + " \u5F20\u3002";
  if (kind === "network") {
    return head + "\u5173\u7CFB\u7F51\uFF0C" + n(args && args.nodes) + " \u4E2A\u8282\u70B9\u3001" + n(args && args.edges) + " \u6761\u8FB9\u3002";
  }
  return head + "\u5DF2\u6309 ECharts option \u753B\u51FA\u4E00\u5F20\u56FE\u3002";
}
function toolDef() {
  return {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          kind: { type: "string" }
        }
      },
      // 工具结果只回一句话。图由客户端那张卡按参数画，模型不必再看一遍数据。
      render(_args, value) {
        return [{ type: "text", text: value && value.summary || "\u5DF2\u753B\u51FA\u3002" }];
      }
    },
    async execute(args) {
      const kind = String(args && args.kind || "echarts");
      return { summary: args && args.summary || describe(kind, args), kind };
    }
  };
}
function apply(ctx) {
  ctx.effect(() => ctx.tools.register(toolDef()), "dsh-viz: viz_show tool");
}
export {
  apply,
  inject,
  name
};
