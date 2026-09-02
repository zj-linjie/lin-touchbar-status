#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const READER = path.join(SCRIPT_DIR, "codex-touchbar-read.mjs");

// MTMR_PET_PREFIX picks the pet asset family, matching the frame files under
// assets/pet/<prefix>/ (einstein, deepseek, ...). Pets share the Codex status
// mapping, so every pet reacts to the same session state.
const PET_PREFIX = process.env.MTMR_PET_PREFIX || "einstein";

// Einstein is an older 9-row atlas. The row numbers follow the Codex pet
// contract: idle, directional run, wave, jump, failed, waiting, running,
// and review. We use the rows that correspond to the status shown by the
// existing reader and leave the main text widget unchanged.
const STATUS_TO_ROW = {
  IDLE: 0,
  RUN: 7,
  TOOL: 1,
  WAIT: 6,
  OK: 3,
  ERR: 5,
};

const FRAME_COUNTS = {
  0: 6,
  1: 8,
  3: 4,
  5: 8,
  6: 6,
  7: 6,
};

function readStatus() {
  const result = spawnSync(process.execPath, [READER, "--meta-json"], {
    encoding: "utf8",
    env: process.env,
  });

  try {
    return JSON.parse(String(result.stdout || "").trim()).status;
  } catch {
    return "IDLE";
  }
}

const status = readStatus();
const row = STATUS_TO_ROW[status] ?? STATUS_TO_ROW.IDLE;
const frameCount = FRAME_COUNTS[row];
const frame = Math.floor(Date.now() / 700) % frameCount;

// MTMR uses this value as the alternativeImages dictionary key.
process.stdout.write(`${PET_PREFIX}-r${row}-${frame}`);
