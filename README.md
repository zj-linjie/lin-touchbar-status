# Codex Touch Bar Buddy

一个给 Touch Bar 用的 Codex 工作搭子状态灯。

## Files

- `codex-touchbar-hook.mjs`: Codex lifecycle hook 写入器。
- `codex-touchbar-read.mjs`: MTMR Shell Script Widget 读取器。
- `codex-usage-read.mjs`: 通过本机 Codex app-server 读取账户额度的 MTMR 读取器。
- `mtmr-pet-read.mjs`: 将 Codex 状态映射为 Einstein 宠物帧。
- `mtmr-pet.applescript`: 供 MTMR 动态切换宠物图片的 AppleScript。
- `install-codex-hooks.mjs`: 把 hooks 安装到 `~/.codex/hooks.json`。
- `scripts/extract-codex-pet-assets.mjs`: 从 Codex App 包里抽取官方宠物 spritesheet。
- `scripts/generate-touchbar-pet-frames.py`: 把官方宠物 spritesheet 裁成 Touch Bar 小帧。
- `scripts/extract-mtmr-pet-frames.sh`: 从 Einstein 宠物 atlas 提取 MTMR 帧。
- `assets/pet/frames/*.png`: Touch Bar 使用的小宠物帧。
- `assets/pet/einstein/*.png`: Einstein 动态宠物的 MTMR 帧。
- `.state/codex-touchbar-status.json`: 运行时状态文件，自动生成。
- `.state/codex-touchbar-usage.json`: 额度快照缓存，自动生成。

状态文件只保存事件、工作目录、模型、工具名和时间戳；不会保存用户 prompt 或 assistant 正文。

## Status Preview

这是一组最新的真实 Touch Bar 截图。主槽位负责表达 Codex 当前状态，副槽位显示耗时、工具、文件增删行数和当前文件。

思考时，会显示蓝色主状态、耗时和 `Think`：

![Thinking status](assets/readme/status-thinking.png)

需要授权时，会切到紫色审批态：

![Permission status](assets/readme/status-permission.png)

跑命令时，会显示终端图标、命令工具和运行时间：

![Command status](assets/readme/status-command.png)

改文件时，会显示当前文件、Patch、绿色新增行和红色删除行：

![Edit status](assets/readme/status-edit.png)

浏览/检查页面时，会显示 `Browser` 或 `inspect`：

![Browser status](assets/readme/status-browser.png)

![Inspect done status](assets/readme/status-inspect-done.png)

任务结束后，会短暂显示完成态：

![Done status](assets/readme/status-done.png)

![Command done status](assets/readme/status-command-done.png)

空闲时，它会进入一种非常合理的工作状态：摸鱼中。旁边还有一个 Codex 小宠物，在 Touch Bar 上慢慢走路。

![Idle status](assets/readme/status-idle.png)

## Quick Start

如果你是第一次从 GitHub 拉下这个项目，推荐按下面顺序配置：

1. 准备环境：
   安装 `ChatGPT.app` 和免费的 MTMR，并确认 `ChatGPT.app` 在 `/Applications/ChatGPT.app`。ChatGPT.app 内置了 Codex 和 Node，无需单独安装 Codex.app。

2. 安装 hooks：

```sh
"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" "/你的项目路径/install-codex-hooks.mjs"
```

3. 在 Codex 里 trust hooks：
   运行 `codex` 后输入 `/hooks`，审查并选择 `Trust all and continue`。本安装器会把 hook 合并到 `~/.codex/hooks.json`，并保留已有的其他 hooks。

4. 配置 MTMR：
   打开 `~/Library/Application Support/MTMR/items.json`，保留主状态的 `shellScriptTitledButton`，并加入 Einstein 动态宠物和额度按钮。当前项目的完整配置已经包含这三个按钮；如果需要重新生成宠物帧，可运行：

```sh
bash "/你的项目路径/scripts/extract-mtmr-pet-frames.sh"
```

主状态按钮示例：

```json
{
  "type": "shellScriptTitledButton",
  "title": "Codex",
  "width": 112,
  "refreshInterval": 1,
  "bordered": false,
  "source": {
    "inline": "\"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node\" \"/你的项目路径/codex-touchbar-read.mjs\" --text"
  }
}
```

额度槽位会放在主状态右侧，每 5 分钟读取一次 Codex 的账户限额，并显示短期额度、最近刷新时间和周期额度，例如 `额度5h余100%-刷新:18:52-7d余42%`：

```json
{
  "type": "shellScriptTitledButton",
  "title": "额度",
  "width": 320,
  "refreshInterval": 300,
  "bordered": false,
  "source": {
   "inline": "\"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node\" \"/你的项目路径/codex-usage-read.mjs\""
  }
}
```

读取器只调用本机 Codex app-server 的只读 `account/rateLimits/read` 方法；缓存中只保存百分比和重置时间，不保存账号 Token 或对话内容。

5. 主状态刷新间隔设为 `1` 或 `2` 秒；额度按钮保持 `300` 秒（5 分钟），避免频繁请求账户接口。

6. 验证是否成功：

```sh
"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" "/你的项目路径/codex-touchbar-read.mjs" --text
```

如果能看到 `摸鱼中...` 之类的输出，说明读取脚本是正常的。随后在 Codex 里跑一次简单命令，比如 `date`，Touch Bar 应该会切到思考、命令、完成这些状态。

`/你的项目路径/` 需要替换成你自己 clone 下来的实际目录，例如：

```sh
/Users/yourname/Documents/touch-bar-agent-status
```

## MTMR Widget

MTMR 是免费的开源 Touch Bar 工具。安装方式：

```sh
brew install --cask mtmr
```

如果 Homebrew cask loader 报错，也可以从 MTMR 官方 Release 下载并放入 `/Applications`。

MTMR 配置文件是 `~/Library/Application Support/MTMR/items.json`。主状态使用 Shell Script 按钮和读取器的 `--text` 参数；独立 Einstein 宠物使用 `appleScriptTitledButton` 的 `alternativeImages` 动态切帧：

```json
[
  {
    "type": "shellScriptTitledButton",
    "title": "Codex",
    "width": 112,
    "refreshInterval": 1,
    "bordered": false,
    "source": {
      "inline": "\"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node\" \"/Users/apple/dev/touch-bar-agent-status/codex-touchbar-read.mjs\" --text"
    }
  }
]
```

当前配置中的第一个按钮是 Einstein 宠物槽位，第二个按钮是主状态文字槽位，第三个按钮是额度槽位。宠物状态映射为：空闲使用 idle，思考使用 running，运行工具使用 running-right，等待授权使用 waiting，完成使用 waving，错误使用 failed。宠物帧由 `mtmr-pet-read.mjs` 每 0.7 秒选择一次。

如果需要重新从原始资源包生成帧：

```sh
bash "/Users/apple/dev/touch-bar-agent-status/scripts/extract-mtmr-pet-frames.sh" \
  "/Users/apple/.codex/pets/einstein/spritesheet.webp"
```

如果只想先确认文字，可以运行：

```sh
"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" "/Users/apple/dev/touch-bar-agent-status/codex-touchbar-read.mjs" --text
```

如果想查看当前状态对应的 SF Symbol 名称，可以运行：

```sh
"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" "/Users/apple/dev/touch-bar-agent-status/codex-touchbar-read.mjs" --meta-json
```

`--meta-json` 可用于调试当前状态、颜色和 SF Symbol。MTMR 的 Shell Script Widget 主要使用文本输出。

授权态默认最多保留 `90` 秒。如果用户拒绝、取消或 Codex 没有继续发出后续 hook，Touch Bar 会自动回到空闲态，避免一直卡在 `等你点头`。如需调整，可以给 MTMR 的 Shell Script Widget 设置环境变量 `CODEX_TOUCHBAR_WAIT_STALE_MS`。

当 Codex 通过 `apply_patch` 修改文件时，状态灯会优先显示本次补丁的行数跳动：

- 单文件：`read.mjs +3 -0`
- 多文件：`3文件 +24 -6`

这里的增删统计来自 hook 收到的 patch 文本，不读取文件正文。

## Multi-Widget Touch Bar

如果想利用更长的 Touch Bar，可以在 MTMR 的数组中加入多个 `shellScriptTitledButton`。每个小组件都调用同一个读取脚本，只是传不同的 `--slot` 和 `--text`：

- `--slot main`: 主状态，例如 `我想想...`、`跑个命令`；空闲时显示 `摸鱼中...` 和走动的小宠物
- `--slot timer`: 当前回合耗时，例如 `00:18`
- `--slot tool`: 当前工具，例如 `Bash`、`Patch`、`Browser`
- `--slot diff`: 当前补丁行数，例如 `+12 -3`
- `--slot diff-add`: 新增行数，例如绿色 `+12`
- `--slot diff-remove`: 删除行数，例如红色 `-3`
- `--slot file`: 当前文件，例如 `read.mjs`
- `--slot pet`: 单独的小宠物槽位，只显示宠物图标
- `--slot walk --index N --count M`: 空闲时横向走动用的宠物槽位

主状态槽位只负责显示文字；Einstein 宠物由独立的 `appleScriptTitledButton` 槽位负责动画。其他槽位在没有实际内容时会返回透明空白，例如空闲时不会再显示 `00:00`、`idle`、`+0 -0` 或工作区名。

如果想让新增和删除分别显示绿色/红色，请用 `diff-add` 和 `diff-remove` 两个槽位；MTMR 的 Shell Script Widget 主要显示文本，颜色能力取决于 MTMR 版本。

`timer`、`file` 和命令态的 `tool` 槽位会分别带本地 PNG 图标：时间、文本/文档、终端。

MTMR 中的每个槽位都可以使用类似下面的配置：

```json
{
  "type": "shellScriptTitledButton",
  "width": 80,
  "refreshInterval": 1,
  "source": {
    "inline": "\"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node\" \"/Users/apple/dev/touch-bar-agent-status/codex-touchbar-read.mjs\" --slot timer --text"
  }
}
```

把 `--slot timer` 换成 `main`、`tool`、`diff`、`file` 等即可。

## Hook Trust

安装或修改 hook 后，运行 `codex` 并输入 `/hooks`，review/trust 这组 hook。Codex 会按 hook hash 记录信任状态，所以脚本更新后重新 trust 是正常的。
