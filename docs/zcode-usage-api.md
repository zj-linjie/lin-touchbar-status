# ZCode 个人套餐额度获取笔记

2026-09-03 实测验证通过。目标：像 `codex-usage-read.mjs` 读 Codex 额度那样，读取 ZCode（GLM Coding Plan）个人套餐的用量百分比和刷新时间，给 MTMR 额度槽位用。

## 结论

ZCode 桌面端"用量"页背后的 monitor 接口是公开可调的 HTTP GET，用个人套餐的 API key 即可获取，无需浏览器 Cookie 或 OAuth：

```
GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
Authorization: Bearer <个人套餐 API key>
accept: application/json
```

验证命令模板（key 不要写进任何文件，运行时读取）：

```sh
curl -sS "https://open.bigmodel.cn/api/monitor/usage/quota/limit" \
  -H "authorization: Bearer $BIGMODEL_CODING_PLAN_KEY" \
  -H "accept: application/json"
```

## 实测响应（2026-09-03，个人套餐 level=lite）

```json
{
  "code": 200,
  "msg": "操作成功",
  "success": true,
  "data": {
    "level": "lite",
    "limits": [
      {"type": "CREDIT_LIMIT", "unit": 3, "number": 5, "usage": 2000, "currentValue": 802, "remaining": 1197, "percentage": 40, "nextResetTime": 1788368637410},
      {"type": "CREDIT_LIMIT", "unit": 6, "number": 1, "usage": 10000, "currentValue": 2467, "remaining": 7532, "percentage": 24, "nextResetTime": 1788937234995}
    ]
  }
}
```

字段说明（与 Codex `account/rateLimits/read` 的对应关系）：

| 字段 | 含义 | Codex 对应 |
|---|---|---|
| `data.limits[]` | 限额窗口数组，一个 5h 窗口 + 一个周窗口 | `primary` / `secondary` |
| `type` | `CREDIT_LIMIT` / `TOKENS_LIMIT` 是套餐窗口；`TIME_LIMIT` 是 MCP 窗口 | — |
| `unit` + `number` | 窗口时长。实测 `unit 3 + number 5` = 5 小时，`unit 6 + number 1` = 1 周（unit 编码未官方文档化，是从数据推断的：3=小时，6=周） | `windowDurationMins` |
| `percentage` | 已用百分比（0-100） | `usedPercent` |
| `currentValue` / `remaining` | 已用 / 剩余的原始计数（积分或请求数） | — |
| `nextResetTime` | 重置时间，epoch 毫秒。**仅当前窗口内有消耗时才返回**（5h 窗口 `percentage: 0` 时字段缺失；周窗口因锚定下单时间始终有值），见下节 | `resetsAt` |
| `data.level` | 套餐档位（如 `lite`） | — |
| `usageDetails[]` | 按模型细分的用量（存在时） | — |

槽位显示可直接复用现有格式：`额度5h余60%-刷新:01:03-周余76%`（余量 = 100 - percentage，刷新时间 = nextResetTime 转本地 HH:MM）。

## 5h 窗口与 nextResetTime 的行为（2026-09-03 补充实测 + 官方定义）

- 官方定义（[用量规则修订](https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision)）：每 5 小时限额「动态刷新，额度在请求消耗 5 小时后刷新重置」——**滚动窗口**，跟随请求时刻；每周限额「自下单时开启，以 7 天为一个周期刷新重置」——固定锚点。社区（知乎"卡点重置"玩法）同样按滚动窗口理解。
- 实测对照：`percentage: 40` 时 5h 窗口返回 `nextResetTime: 1788368637410`；同日稍后 `percentage: 0` 时该字段缺失。即 5h 的重置时间只在窗口内有消耗时存在，0 消耗时没有"正在等待重置"的批次。
- 新版套餐为积分制（lite：5h 窗口 2000 积分 + 周 10000 积分），`currentValue`/`remaining` 单位是积分，不再是 prompt 次数。
- 槽位逻辑（`zcode-usage-read.mjs`）：`nextResetTime` 有值就直接显示（滚动值，与 App 页面一致）；为 null（额度 100% 未消耗）时显示「首次观察到时刻 + 5h」的占位锚点并保持稳定，过期后重新锚定，与 Codex 槽的锚定策略一致。

## API key 的来源

个人套餐 key 存在 ZCode 桌面端配置里，运行时读取，不要硬编码或提交：

- 路径：`~/.zcode/v2/config.json`
- 位置：`provider["builtin:bigmodel-coding-plan"].options.apiKey`
- 注意同文件里还有 `builtin:bigmodel-start-plan`（JWT，走 zcode.z.ai 代理），两者不通用，见下节。

## start-plan 与 coding-plan 的区别（踩坑记录）

- 当前 ZCode 会话默认走 `builtin:bigmodel-start-plan`（baseURL `https://zcode.z.ai/api/v1/zcode-plan/anthropic`，apiKey 是 zcode.z.ai 签发的 JWT）。**这个 JWT 调 open.bigmodel.cn 的 monitor 接口返回 401（令牌已过期或验证不正确）**。
- start-plan 在 App 内部走的是 `https://zcode.z.ai/api/v1/zcode-plan/billing/balance`（返回按积分单位的 `total_units/used_units/remaining_units`）。用纯 `Authorization: Bearer` 直调返回 `{"code":3001,"msg":"parameter error"}`，App 还带了额外请求头（X-Device-Mid 等），未继续逆向。start-plan 有"ZCode 内配额加成"的说法，数字可能与个人套餐视图不一致，如需对齐请开 App 用量页对照。
- 个人套餐 `builtin:bigmodel-coding-plan`（baseURL `https://open.bigmodel.cn/api/anthropic`，经典 API key）直接可用，即本文档验证的方式。

## 团队套餐附加参数（备用）

默认查询个人用量。团队用量需要：

- quota URL 加 `?type=2`（小时级模型用量为 `type=3`）
- 请求头 `Bigmodel-Organization: <org id>` 和 `Bigmodel-Project: <project id>`
- 缺任一头时会返回 `code:200` 但 `limits` 为空数组，注意别当成"无用量"

## 其他相关端点（App 内监测到，备用）

均位于同一 host、同样的 Bearer 鉴权：

- `GET /api/monitor/usage/model-usage?startTime=&endTime=` — 按模型用量
- `GET /api/monitor/usage/tool-usage?startTime=&endTime=` — 按工具用量
- `GET /api/monitor/usage/model-performance-day?startTime=&endTime=` — 模型性能按天
- `GET /api/biz/subscription/list` — 订阅/套餐列表
- 时间参数格式：`YYYY-MM-DD` 起止日期

## 参考实现

- [steipete/CodexBar docs/zai.md](https://github.com/steipete/CodexBar/blob/main/docs/zai.md) — 端点、鉴权、字段解析写得最全
- [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) `src/hud/usage-api.ts` — TS 实现，含 unit 编码归类
- [wangjs-jacky/glm-coding-plan-statusline](https://github.com/wangjs-jacky/glm-coding-plan-statusline) — 状态栏，显示 5H 重置倒计时
- [jukanntenn/glm-plan-usage](https://github.com/jukanntenn/glm-plan-usage) — Claude Code 插件（Rust）
- [deluo/glm-quota-line](https://github.com/deluo/glm-quota-line) — Claude Code 配额监控 CLI

## 落地计划（未实施）

新建 `zcode-usage-read.mjs`，结构照抄 `codex-usage-read.mjs`：

1. 把 `spawn codex app-server` 换成 `fetch` monitor 接口，key 从 `~/.zcode/v2/config.json` 读取（`builtin:bigmodel-coding-plan`）。
2. 缓存策略沿用：`.state/zcode-touchbar-usage.json`，TTL 5 分钟，失败时回退 `~` 前缀显示旧值。
3. 窗口归类：按 `unit*number` 排序取前两个窗口（5h 在前），`unit 3`→`h`、`unit 6`→`7d`/`周`，未知编码回退 `额度`。
4. MTMR 配置加第三个 shellScriptTitledButton，`refreshInterval: 300`。
