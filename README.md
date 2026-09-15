<div align="center">
<img src="assets/readme/hero.svg" alt="Touch Bar Agent Status — Touch Bar 上的 Codex 与 GLM 双代理状态灯，两只宠物搭子分别跟随 Codex 与 GLM 的会话状态，旁边是各自的额度余量与重置时间" width="100%">
</div>

# Touch Bar Agent Status

<p align="center">
<b>简体中文</b> · <a href="README.en.md">English</a> · <b>Fork</b> from <a href="https://github.com/PPPHUANG/touch-bar-agent-status">PPPHUANG/touch-bar-agent-status</a>
</p>

> [!NOTE]
> **本项目 Fork 自 [PPPHUANG/touch-bar-agent-status](https://github.com/PPPHUANG/touch-bar-agent-status)。**
> 原项目是 Codex 的 Touch Bar 状态灯（Einstein 宠物 + 状态槽位），感谢原作者的创意与实现。
> 本 Fork 在其基础上新增了 **ZCode（GLM）双代理支持**：DeepSeek 宠物、GLM 状态槽位、GLM 额度槽位，以及两边的额度重置时间显示。完整差异见[与上游的差异](#与上游的差异)。

把 MacBook 的 Touch Bar 变成 AI 编程代理的工作状态灯：**Codex** 和 **ZCode（GLM）** 各有一条"宠物 + 状态文字 + 额度"组合，谁在摸鱼、谁在跑命令、谁在等你点头审批、额度还剩多少，扫一眼就知道。

## 它能做什么

- 🚦 **实时状态灯** — 通过 agent 的生命周期 hooks 实时反映会话状态：想方案、跑命令、改文件、等审批、收工，全部秒级切换。
- 🐬 **两只宠物搭子** — Einstein 跟着 Codex 干活，DeepSeek 跟着 GLM 干活，0.7 秒一帧地在 Touch Bar 上散步、奔跑或垂头丧气。
- 📊 **双额度槽位** — GPT 的 5 小时/周窗口与 GLM 的 5 小时/周积分各自显示剩余百分比和重置时间。
- 🔒 **隐私友好** — 状态文件只保存事件名、工具名和时间戳，额度缓存只保存百分比与时间戳；不保存 prompt 与回复正文，API key 只在运行时从本机配置读取、绝不入库。

## 真实效果

以下均为真实 Touch Bar 截图（Einstein 在槽位内的小图是早期版本，现在宠物是独立槽位，状态视觉一致）：

**思考中** —— 蓝色主状态 + 耗时：

![Thinking](assets/readme/status-thinking.png)

**跑命令** —— 终端图标 + 工具名 + 运行时间：

![Command](assets/readme/status-command.png)

**改文件** —— 显示补丁增删行数（单文件 `xxx.mjs +3 -0`，多文件 `3文件 +24 -6`）：

![Edit](assets/readme/status-edit.png)

**等审批** —— 紫色审批态，90 秒无人处理自动回摸鱼：

![Permission](assets/readme/status-permission.png)

**摸鱼中** —— 一切合理的空闲状态：

![Idle](assets/readme/status-idle.png)

<details>
<summary>更多状态截图（浏览网页、收工、命令收工等）</summary>

![Browser](assets/readme/status-browser.png)

![Inspect done](assets/readme/status-inspect-done.png)

![Done](assets/readme/status-done.png)

![Command done](assets/readme/status-command-done.png)

![Other 1](assets/readme/status-other-1.png)

![Other 2](assets/readme/status-other-2.png)

</details>

## 工作原理

<div align="center">
<img src="assets/readme/how-it-works.svg" alt="工作原理：Codex 与 ZCode 的会话 hooks 写入状态文件，额度接口写入额度缓存，MTMR 按 1 秒/0.7 秒/5 分钟的周期渲染 Touch Bar 槽位" width="100%">
</div>

两条数据流，全部只读、全部本地：

1. **状态流** — agent 会话触发生命周期 hooks（Codex 9 个事件、ZCode 7 个事件），hook 脚本把当前状态写进 `.state/*-touchbar-status.json`；MTMR 槽位每秒读取并渲染状态文字，宠物每 0.7 秒换帧。
2. **额度流** — GPT 额度走本机 Codex `app-server` 的只读 `account/rateLimits/read`，GLM 额度走 BigModel 的 `quota/limit` 监控接口，各配 5 分钟缓存；细节见 [docs/zcode-usage-api.md](docs/zcode-usage-api.md)。

## 状态一览

两个代理共用同一套状态机与文案：

| Touch Bar 显示 | 状态 | 触发时机 |
|---|---|---|
| 摸鱼中… | IDLE | 无会话或状态过期，省略号循环动画 |
| 接上回合 / 开工了 | RUN | 会话启动（SessionStart），显示 4 秒 |
| 我想想… | RUN | 用户提交 prompt、模型思考中、工具调用间隙 |
| 跑个命令 | TOOL | Bash 执行中，10 秒后追加耗时 |
| 改两笔 / `文件 +N -M` | TOOL | Edit/Write/补丁执行中 |
| 去看一眼 | TOOL | 浏览器 / 搜索 / MCP 类工具 |
| 喊同事 | TOOL | 派子代理（Agent/Task）干活 |
| 忙一下 | TOOL | 其他工具兜底 |
| 刚做完 | RUN | 单个工具完成，闪 3 秒 |
| 碰了个钉子 | RUN | 工具执行失败，闪 3 秒 |
| 等你点头 | WAIT | 权限确认等待，最多保留 90 秒 |
| 收工啦 | OK | 回合结束，显示 20 秒后回摸鱼 |
| 有点卡住 | ERR | hook 自身异常（正常使用不会出现） |

宠物行为映射：IDLE → 走路（row 0），RUN → 奔跑（row 7），TOOL → 动手（row 1），WAIT → 张望（row 6），OK → 挥手（row 3），ERR → 失落（row 5）。

## 快速开始

### 0. 环境

- macOS + 带 Touch Bar 的 MacBook，安装免费的 [MTMR](https://github.com/Toxblh/MTMR)：
  ```sh
  brew install --cask mtmr
  ```
- [ChatGPT.app](https://chatgpt.com/download)（自带 Codex CLI 与 Node 运行时，需位于 `/Applications/ChatGPT.app`；没有该路径时安装器会回退到 PATH 里的 node）。
- 想要 GLM 状态灯/额度槽位：安装并登录 [ZCode](https://zcode.z.ai)，且拥有个人套餐（coding plan）。只要 Codex 状态灯可跳过。

### 1. 克隆并安装

```sh
git clone https://github.com/zj-linjie/lin-touchbar-status.git
cd lin-touchbar-status

NODE="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"

"$NODE" install-codex-hooks.mjs          # Codex 状态灯 hooks
"$NODE" install-zcode-hooks.mjs          # GLM 状态灯 hooks（可选）
"$NODE" scripts/generate-mtmr-config.mjs # 生成 6 槽位 MTMR 配置
killall MTMR; open -a MTMR               # 重启 MTMR 生效
```

### 2. 信任 hooks

- **Codex**：运行 `codex`，输入 `/hooks`，审查并选择 `Trust all and continue`（脚本更新后需重新 trust，属正常行为）。
- **ZCode**：配置文件钩子无需信任步骤，**重开一个 ZCode 会话即生效**（hooks 配置在会话启动时快照）。

### 3. 验证

```sh
"$NODE" codex-touchbar-read.mjs --text   # 输出 摸鱼中...
"$NODE" zcode-touchbar-read.mjs --text   # 输出 摸鱼中...
"$NODE" codex-usage-read.mjs             # 输出 GPT5h余100%-08:28-周余0%
"$NODE" zcode-usage-read.mjs             # 输出 GLM5h余100%-08:28-周余76%
```

然后在 Codex / ZCode 里各跑一轮真实任务，Touch Bar 应依次切换：我想想 → 跑个命令 → 收工啦 → 摸鱼中，宠物同步换姿势。

## 槽位布局

`scripts/generate-mtmr-config.mjs` 会生成以下 6 槽位（修改布局请改该脚本后重新生成）：

| # | 槽位 | 实现 | 宽度 | 刷新 |
|---|---|---|---|---|
| 1 | Einstein 宠物（跟 Codex） | `mtmr-pet.applescript` | 24 | 0.7s |
| 2 | Codex 状态 | `codex-touchbar-read.mjs --text` | 76 | 1s |
| 3 | GPT 额度 | `codex-usage-read.mjs` | 260 | 5min |
| 4 | DeepSeek 宠物（跟 GLM） | `mtmr-pet-deepseek.applescript` | 24 | 0.7s |
| 5 | GLM 状态 | `zcode-touchbar-read.mjs --text` | 76 | 1s |
| 6 | GLM 额度 | `zcode-usage-read.mjs` | 260 | 5min |

## 额度显示细节

两边的重置时间都不是接口直接给的固定值，需要一点客户端处理：

- **GPT（Codex）**：`resetsAt` 实测恒等于"读数时刻 + 5 小时"（滚动窗口）。直接显示会永远差 5 小时，因此读取器在首次观察到时锚定窗口终点，之后稳定倒计时，过期后自动重新锚定。
- **GLM（ZCode）**：BigModel 只在 5 小时窗口内有消耗时才返回 `nextResetTime`（滚动窗口，跟随最近一次请求）。有值时直接显示（与 App 用量页一致）；额度 100% 无消耗时显示"首次观察到时刻 + 5h"的占位锚点，开始消耗后自动切换为真实值。
- 多个并发会话共享一份状态/缓存文件，后写覆盖；`~` 前缀表示接口失败、正在展示过期缓存。

## 宠物

- 宠物帧来自 agent 自带的 spritesheet（9 行 × 每行 6-8 帧），由 `scripts/extract-mtmr-pet-frames.sh` 裁切，帧文件在 `assets/pet/<名字>/`。
- 宠物槽位通过两个环境变量解耦素材与数据源：`MTMR_PET_PREFIX` 选素材（einstein / deepseek），`MTMR_PET_READER` 选跟随哪个代理的会话状态（默认 Codex，GLM 用 `zcode-touchbar-read.mjs`）。
- 想加新宠物？把它的 spritesheet 交给提取脚本，再把一组帧文件放进 `assets/pet/<名字>/` 并在 `scripts/generate-mtmr-config.mjs` 里登记即可。

## 进阶：一个读取器拆多槽位

`codex-touchbar-read.mjs` 与 `zcode-touchbar-read.mjs` 支持按槽位输出，可在 MTMR 里自由拼装：

| 参数 | 显示 |
|---|---|
| `--text`（默认主状态） | `我想想...` / `跑个命令` / `摸鱼中...` |
| `--slot timer --text` | 当前回合耗时，如 `00:18` |
| `--slot tool --text` | 当前工具：`Bash` / `Patch` / `Browser` |
| `--slot diff --text` | 补丁行数 `+12 -3`（`diff-add` / `diff-remove` 可分开显示） |
| `--slot file --text` | 当前文件名 |
| `--slot pet --text` | 只显示宠物图标 |
| `--meta-json` | 调试用：状态、颜色与 SF Symbol 的 JSON |

`--slot` 的完整行为见 `codex-touchbar-read.mjs`。等待审批的保留时长可用环境变量 `CODEX_TOUCHBAR_WAIT_STALE_MS` 调整（默认 90 秒）。

## 文件结构

| 文件 | 作用 |
|---|---|
| `codex-touchbar-hook.mjs` | Codex hooks 写入器（共享状态机，ZCode 复用） |
| `zcode-touchbar-hook.mjs` | ZCode hooks 桥接（指向独立状态文件） |
| `codex-touchbar-read.mjs` | Codex 状态读取器（状态文字 / 宠物行 / 各槽位） |
| `zcode-touchbar-read.mjs` | GLM 状态读取器（同上，读 ZCode 状态文件） |
| `codex-usage-read.mjs` | GPT 额度读取器（本机 Codex app-server） |
| `zcode-usage-read.mjs` | GLM 额度读取器（BigModel monitor API） |
| `install-codex-hooks.mjs` / `install-zcode-hooks.mjs` | 把 hooks 合并写入 `~/.codex/hooks.json` / `~/.zcode/cli/config.json`（自动备份） |
| `mtmr-pet-read.mjs` | 状态 → 宠物帧选择器（`MTMR_PET_PREFIX` / `MTMR_PET_READER`） |
| `mtmr-pet.applescript` / `mtmr-pet-deepseek.applescript` | MTMR 宠物槽位脚本 |
| `scripts/generate-mtmr-config.mjs` | 生成 MTMR `items.json`（布局的 source of truth） |
| `scripts/extract-mtmr-pet-frames.sh` 等 | 从 spritesheet 裁切宠物帧 |
| `assets/pet/einstein|deepseek/*.png` | 两只宠物的帧素材 |
| `assets/readme/*` | README 的 hero、架构图与真实截图 |
| `docs/zcode-usage-api.md` | GLM 额度接口的端点、字段与踩坑记录 |
| `.state/*.json` | 运行时状态与缓存（自动生成，不入库） |

## 与上游的差异

| 上游（[PPPHUANG/touch-bar-agent-status](https://github.com/PPPHUANG/touch-bar-agent-status)） | 本 Fork 新增 |
|---|---|
| Codex 状态灯（9 个 hooks） | ZCode（GLM）状态灯（7 个 hooks，`install-zcode-hooks.mjs`） |
| Einstein 宠物跟随 Codex | DeepSeek 宠物独立跟随 GLM |
| Codex 额度槽位 | GLM 额度槽位（`zcode-usage-read.mjs`） |
| 手工配置 MTMR | `generate-mtmr-config.mjs` 一键生成 6 槽位布局 |
| — | 状态机增强：`PostToolUseFailure`（碰了个钉子）、子代理识别（喊同事）、会话问候后自动回摸鱼 |
| — | 额度重置时间显示与锚定策略（两个槽位） |
| — | 中英双语 README |

## 致谢

- 感谢 **[PPPHUANG](https://github.com/PPPHUANG)** 的原始作品 [touch-bar-agent-status](https://github.com/PPPHUANG/touch-bar-agent-status)——"AI 工作搭子状态灯"的创意、Codex hooks 架构、Einstein 宠物与整套状态视觉都来自上游，本 Fork 只是站在它的肩膀上给 GLM 也安了个家。
- 宠物像素素材分别来自 Codex（Einstein）与 DeepSeek（鲸鱼）应用内置资源，版权归各自作者所有。
- [MTMR](https://github.com/Toxblh/MTMR) —— 让老 MacBook 的 Touch Bar 重获新生的开源项目。
