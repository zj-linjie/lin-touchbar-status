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
  },
  petItem(PETS[1]),
  {
    type: "shellScriptTitledButton",
    title: "ZCode额度",
    width: 260,
    refreshInterval: 300,
    bordered: false,
    source: {
      inline: `"${CODEX_NODE}" "${path.join(PROJECT_DIR, "zcode-usage-read.mjs")}"`,
    },
  },
];

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
const frameCount = PETS.reduce((total, pet) => {
  const frames = ROWS.reduce((sum, [, count]) => sum + count, 0);
  return total + frames;
}, 0);
console.log(`Wrote MTMR config with ${frameCount} frames per 2 pets and 5 items: ${CONFIG_PATH}`);
