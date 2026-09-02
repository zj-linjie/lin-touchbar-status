#!/usr/bin/env node

// Installs Touch Bar status hooks into the ZCode user configuration.
// ZCode only executes user-scope configuration hooks (~/.zcode/cli/config.json)
// and they stay disabled unless hooks.enabled is true. The config is
// snapshotted when a session starts, so new sessions pick this up.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = path.join(os.homedir(), ".zcode", "cli", "config.json");
const HOOK_SCRIPT = path.join(SCRIPT_DIR, "zcode-touchbar-hook.mjs");
const NODE_CANDIDATES = [
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
  "/Applications/Codex.app/Contents/Resources/node",
];
const NODE_PATH = NODE_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || process.execPath;

// ZCode supports exactly these seven lifecycle events.
const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Stop",
];
const HOOK_TIMEOUT_MS = 5000;

function isTouchBarHook(hook) {
  return Array.isArray(hook?.args) && hook.args.includes(HOOK_SCRIPT);
}

function removeTouchBarHooks(hooksConfig) {
  const events = hooksConfig.events || {};
  for (const [eventName, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue;
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index];
      if (!Array.isArray(group?.hooks)) continue;
      group.hooks = group.hooks.filter((hook) => !isTouchBarHook(hook));
      if (group.hooks.length === 0) groups.splice(index, 1);
    }
    if (groups.length === 0) delete events[eventName];
  }
}

function main() {
  if (!fs.existsSync(HOOK_SCRIPT)) {
    throw new Error(`Hook script not found: ${HOOK_SCRIPT}`);
  }

  const exists = fs.existsSync(CONFIG_PATH);
  const original = exists ? fs.readFileSync(CONFIG_PATH, "utf8") : "{}\n";
  const backupPath = `${CONFIG_PATH}.bak.touchbar-${new Date()
    .toISOString()
    .replaceAll(/[:.]/g, "-")}`;
  if (exists) {
    fs.copyFileSync(CONFIG_PATH, backupPath);
  }

  const config = JSON.parse(original);
  const hooks = config.hooks && typeof config.hooks === "object" ? config.hooks : {};
  hooks.enabled = true;
  if (!hooks.events || typeof hooks.events !== "object") hooks.events = {};
  removeTouchBarHooks(hooks);
  for (const eventName of HOOK_EVENTS) {
    if (!Array.isArray(hooks.events[eventName])) hooks.events[eventName] = [];
    hooks.events[eventName].push({
      hooks: [
        {
          type: "process",
          command: NODE_PATH,
          args: [HOOK_SCRIPT],
          timeoutMs: HOOK_TIMEOUT_MS,
        },
      ],
    });
  }
  config.hooks = hooks;

  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  process.stdout.write(`Installed ZCode Touch Bar hooks in ${CONFIG_PATH}\n`);
  process.stdout.write(`Config backup: ${exists ? backupPath : "(new file)" }\n`);
  process.stdout.write(`Node: ${NODE_PATH}\n`);
  process.stdout.write(`Hook: ${HOOK_SCRIPT}\n`);
  process.stdout.write(`Events: ${HOOK_EVENTS.join(", ")}\n`);
  process.stdout.write("Open a new ZCode session to activate them.\n");
}

main();
