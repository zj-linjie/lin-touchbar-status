#!/usr/bin/env node

// Reader counterpart of zcode-touchbar-hook.mjs: same shared renderer as the
// Codex slot, pointed at the ZCode session state file. The env var must be
// set before the dynamic import evaluates the reader's constants.
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
process.env.CODEX_TOUCHBAR_STATE_FILE =
  process.env.CODEX_TOUCHBAR_STATE_FILE ||
  path.join(SCRIPT_DIR, ".state", "zcode-touchbar-status.json");

await import("./codex-touchbar-read.mjs");
