#!/usr/bin/env node

// ZCode fires the same Claude-style hook protocol (one JSON line on stdin),
// so this bridge reuses the shared state machine in codex-touchbar-hook.mjs
// and only redirects its state file to keep Codex and ZCode sessions
// independent. Must stay a dynamic import: the env var has to be set before
// the imported module evaluates its constants.
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
process.env.CODEX_TOUCHBAR_STATE_FILE =
  process.env.CODEX_TOUCHBAR_STATE_FILE ||
  path.join(SCRIPT_DIR, ".state", "zcode-touchbar-status.json");

await import("./codex-touchbar-hook.mjs");
