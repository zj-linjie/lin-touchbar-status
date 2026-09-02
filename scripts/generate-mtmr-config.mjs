#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = path.dirname(SCRIPT_DIR);
const FRAME_DIR = path.join(PROJECT_DIR, "assets", "pet", "einstein");
const CODEX_NODE = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node";
const CONFIG_PATH = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "MTMR",
  "items.json",
);

const ROWS = [
  [0, 6],
  [1, 8],
  [3, 4],
  [5, 8],
  [6, 6],
  [7, 6],
];

function framePath(row, frame) {
  return path.join(FRAME_DIR, `einstein-r${row}-${frame}.png`);
}

function image(row, frame) {
  return {
    base64: fs.readFileSync(framePath(row, frame)).toString("base64"),
  };
}

const alternativeImages = {};
for (const [row, count] of ROWS) {
  for (let frame = 0; frame < count; frame += 1) {
    alternativeImages[`einstein-r${row}-${frame}`] = image(row, frame);
  }
}

const config = [
  {
    type: "appleScriptTitledButton",
    title: " ",
    width: 32,
    refreshInterval: 0.7,
    bordered: false,
    source: {
      filePath: path.join(PROJECT_DIR, "mtmr-pet.applescript"),
    },
    image: image(0, 0),
    alternativeImages,
  },
  {
    type: "shellScriptTitledButton",
    title: "Codex",
    width: 112,
    refreshInterval: 1,
    bordered: false,
    source: {
      inline: `"${CODEX_NODE}" "${path.join(PROJECT_DIR, "codex-touchbar-read.mjs")}" --text`,
    },
  },
  {
    type: "shellScriptTitledButton",
    title: "额度",
    width: 320,
    refreshInterval: 300,
    bordered: false,
    source: {
      inline: `"${CODEX_NODE}" "${path.join(PROJECT_DIR, "codex-usage-read.mjs")}"`,
    },
  },
];

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote MTMR config with ${Object.keys(alternativeImages).length} Einstein frames: ${CONFIG_PATH}`);
