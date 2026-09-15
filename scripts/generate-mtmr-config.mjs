#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = path.dirname(SCRIPT_DIR);
const CODEX_NODE = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node";
const CONFIG_PATH = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "MTMR",
  "items.json",
);

// Both pet atlases share the Codex pet grid, so the same rows/counts work for
// every pet under assets/pet/<name>/ (see scripts/extract-mtmr-pet-frames.sh).
const ROWS = [
  [0, 6],
  [1, 8],
  [3, 4],
  [5, 8],
  [6, 6],
  [7, 6],
];

const PETS = [
  { name: "einstein", script: "mtmr-pet.applescript", width: 24 },
  { name: "deepseek", script: "mtmr-pet-deepseek.applescript", width: 24 },
];

// 单击额度槽位唤出对应 agent 的桌面窗口；bundle id 与文件夹名不同：
// ChatGPT.app 是 com.openai.codex，ZCode.app 是 dev.zcode.app。
// reopen 先于 activate：activate 只能前置已显示的窗口，最小化进 Dock 的
// 窗口要靠 reopen（等同点一下 Dock 图标）还原，且 reopen 不需要辅助访问权限。
//
// 最小化走双击（trigger: doubleTap）：MTMR 0.27 的 longTap 依赖自定义
// touchesBegan 触摸检测，在 macOS 27 上收不到事件（单击管线正常），因此
// 长按无法使用；doubleTap 与单击共用同一识别器。开启双击后单击动作会有
// 0.3s 的双击判定延迟。首次双击时系统会弹"MTMR 想要控制系统事件"授权，
// 允许一次即可；权限缺失时静默无效。
// 注意：Chromium/Electron 字典不支持 close/hide/miniaturized，故最小化
// 走 System Events 的 AXMinimized，需要 MTMR 在辅助功能权限中已启用。
function focusActions(bundleId, processName) {
  return [
    {
      trigger: "singleTap",
      action: "appleScript",
      actionAppleScript: {
        inline: `tell application id "${bundleId}"
reopen
activate
end tell`,
      },
    },
    {
      trigger: "doubleTap",
      action: "appleScript",
      actionAppleScript: {
        inline: `tell application "System Events" to tell process "${processName}"
repeat with w in windows
try
set value of attribute "AXMinimized" of w to true
end try
end repeat
end tell`,
      },
    },
  ];
}

function framePath(petName, row, frame) {
  return path.join(PROJECT_DIR, "assets", "pet", petName, `${petName}-r${row}-${frame}.png`);
}

function image(petName, row, frame) {
  return {
    base64: fs.readFileSync(framePath(petName, row, frame)).toString("base64"),
  };
}

function petItem(pet) {
  const alternativeImages = {};
  for (const [row, count] of ROWS) {
    for (let frame = 0; frame < count; frame += 1) {
      alternativeImages[`${pet.name}-r${row}-${frame}`] = image(pet.name, row, frame);
    }
  }
  return {
    type: "appleScriptTitledButton",
    title: " ",
    width: pet.width,
    refreshInterval: 0.7,
    bordered: false,
    source: {
      filePath: path.join(PROJECT_DIR, pet.script),
    },
    image: image(pet.name, 0, 0),
    alternativeImages,
  };
}

const config = [
  petItem(PETS[0]),
  {
    type: "shellScriptTitledButton",
    title: "Codex",
    width: 76,
    refreshInterval: 1,
    bordered: false,
    source: {
      inline: `"${CODEX_NODE}" "${path.join(PROJECT_DIR, "codex-touchbar-read.mjs")}" --text`,
    },
  },
  {
    type: "shellScriptTitledButton",
    title: "额度",
    width: 260,
    refreshInterval: 300,
    bordered: false,
    source: {
      inline: `"${CODEX_NODE}" "${path.join(PROJECT_DIR, "codex-usage-read.mjs")}"`,
    },
    actions: focusActions("com.openai.codex", "ChatGPT"),
  },
  petItem(PETS[1]),
  {
    type: "shellScriptTitledButton",
    title: "ZCode",
    width: 76,
    refreshInterval: 1,
    bordered: false,
    source: {
      inline: `"${CODEX_NODE}" "${path.join(PROJECT_DIR, "zcode-touchbar-read.mjs")}" --text`,
    },
  },
  {
    type: "shellScriptTitledButton",
    title: "ZCode额度",
    width: 260,
    refreshInterval: 300,
    bordered: false,
    source: {
      inline: `"${CODEX_NODE}" "${path.join(PROJECT_DIR, "zcode-usage-read.mjs")}"`,
    },
    actions: focusActions("dev.zcode.app", "ZCode"),
  },
];

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
const frameCount = PETS.reduce((total, pet) => {
  const frames = ROWS.reduce((sum, [, count]) => sum + count, 0);
  return total + frames;
}, 0);
console.log(`Wrote MTMR config with ${frameCount} frames per 2 pets and ${config.length} items: ${CONFIG_PATH}`);
