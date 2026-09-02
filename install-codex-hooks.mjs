#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const HOOKS_JSON_PATH = path.join(os.homedir(), ".codex", "hooks.json");
const HOOK_SCRIPT = path.join(SCRIPT_DIR, "codex-touchbar-hook.mjs");
const NODE_CANDIDATES = [
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
  "/Applications/Codex.app/Contents/Resources/node",
];
const NODE_PATH = NODE_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || process.execPath;
const START = "# --- Codex Touch Bar buddy status hooks: start ---";
const END = "# --- Codex Touch Bar buddy status hooks: end ---";

function hookCommand() {
  return `"${NODE_PATH}" "${HOOK_SCRIPT}"`;
}

function hookEvents() {
  return [
    { name: "SessionStart", matcher: "startup|resume|clear|compact", timeout: 5 },
    { name: "UserPromptSubmit", timeout: 5 },
    { name: "PreToolUse", timeout: 5 },
    { name: "PostToolUse", timeout: 5 },
    { name: "PermissionRequest", timeout: 5 },
    { name: "PreCompact", timeout: 5 },
    { name: "PostCompact", timeout: 5 },
    { name: "Stop", timeout: 5 },
    { name: "SessionEnd", timeout: 3 },
  ];
}

function commandHook(event) {
  const hook = {
    type: "command",
    command: hookCommand(),
    timeout: event.timeout,
    statusMessage: "Touch Bar: updating Codex buddy status",
  };
  const group = { hooks: [hook] };
  if (event.matcher) group.matcher = event.matcher;
  return group;
}

function removeTouchBarHooks(hooksConfig) {
  const command = hookCommand();
  for (const groups of Object.values(hooksConfig.hooks || {})) {
    if (!Array.isArray(groups)) continue;
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index];
      if (!Array.isArray(group?.hooks)) continue;
      group.hooks = group.hooks.filter((hook) => hook?.command !== command);
      if (group.hooks.length === 0) groups.splice(index, 1);
    }
  }
}

function installHooksJson() {
  const original = fs.existsSync(HOOKS_JSON_PATH)
    ? fs.readFileSync(HOOKS_JSON_PATH, "utf8")
    : JSON.stringify({ hooks: {} });
  const hooksConfig = JSON.parse(original);
  if (!hooksConfig.hooks || typeof hooksConfig.hooks !== "object") {
    hooksConfig.hooks = {};
  }

  removeTouchBarHooks(hooksConfig);
  for (const event of hookEvents()) {
    if (!Array.isArray(hooksConfig.hooks[event.name])) {
      hooksConfig.hooks[event.name] = [];
    }
    hooksConfig.hooks[event.name].push(commandHook(event));
  }

  const backupPath = `${HOOKS_JSON_PATH}.bak.touchbar-${new Date()
    .toISOString()
    .replaceAll(/[:.]/g, "-")}`;
  if (fs.existsSync(HOOKS_JSON_PATH)) {
    fs.copyFileSync(HOOKS_JSON_PATH, backupPath);
  }
  fs.writeFileSync(HOOKS_JSON_PATH, `${JSON.stringify(hooksConfig, null, 2)}\n`, "utf8");
  return backupPath;
}

function removeExistingBlock(config) {
  const start = config.indexOf(START);
  if (start === -1) return config.trimEnd();

  const end = config.indexOf(END, start);
  if (end === -1) {
    throw new Error(`Found ${START} without matching ${END}`);
  }

  const afterEnd = end + END.length;
  return `${config.slice(0, start).trimEnd()}\n${config.slice(afterEnd).trimStart()}`.trimEnd();
}

function main() {
  if (!fs.existsSync(HOOK_SCRIPT)) {
    throw new Error(`Hook script not found: ${HOOK_SCRIPT}`);
  }

  const original = fs.readFileSync(CONFIG_PATH, "utf8");
  const backupPath = `${CONFIG_PATH}.bak.touchbar-${new Date()
    .toISOString()
    .replaceAll(/[:.]/g, "-")}`;
  fs.copyFileSync(CONFIG_PATH, backupPath);

  const hooksBackupPath = installHooksJson();
  fs.writeFileSync(CONFIG_PATH, removeExistingBlock(original), "utf8");

  process.stdout.write(`Installed Codex Touch Bar hooks in hooks.json.\n`);
  process.stdout.write(`Hooks: ${HOOKS_JSON_PATH}\n`);
  process.stdout.write(`Hooks backup: ${hooksBackupPath}\n`);
  process.stdout.write(`Config: ${CONFIG_PATH}\n`);
  process.stdout.write(`Config backup: ${backupPath}\n`);
  process.stdout.write(`Node: ${NODE_PATH}\n`);
}

main();
