#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const STATE_DIR = path.join(SCRIPT_DIR, ".state");
const CACHE_FILE = process.env.CODEX_TOUCHBAR_USAGE_CACHE ||
  path.join(STATE_DIR, "codex-touchbar-usage.json");
const CACHE_TTL_MS = positiveIntEnv("CODEX_TOUCHBAR_USAGE_CACHE_MS", 5 * 60_000);
const CACHE_STALE_MS = Math.max(
  CACHE_TTL_MS,
  positiveIntEnv("CODEX_TOUCHBAR_USAGE_STALE_MS", 15 * 60_000),
);
const FETCH_TIMEOUT_MS = positiveIntEnv("CODEX_TOUCHBAR_USAGE_TIMEOUT_MS", 8_000);
const CODEX_BIN_CANDIDATES = [
  process.env.CODEX_APP_SERVER_BIN,
  "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
  "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/Applications/Codex.app/Contents/Resources/codex",
  ...(process.env.PATH || "").split(path.delimiter).filter(Boolean)
    .map((directory) => path.join(directory, "codex")),
].filter(Boolean);
const CODEX_BIN = CODEX_BIN_CANDIDATES.find((candidate) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
});

function positiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function debug(...args) {
  if (process.env.CODEX_TOUCHBAR_USAGE_DEBUG === "1") {
    console.error("[codex-usage]", ...args);
  }
}

function readCache() {
  try {
    const value = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!value || typeof value !== "object") return null;
    if (!Number.isFinite(value.fetchedAt)) return null;
    if (!value.rateLimits || typeof value.rateLimits !== "object") return null;
    return value;
  } catch {
    return null;
  }
}

function writeCache(value) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const temporary = `${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, CACHE_FILE);
  } catch (error) {
    debug("could not write cache:", error instanceof Error ? error.message : String(error));
  }
}

function requestRateLimits() {
  return new Promise((resolve, reject) => {
    if (!CODEX_BIN) {
      reject(new Error("Codex executable was not found"));
      return;
    }

    const child = spawn(CODEX_BIN, ["app-server", "--stdio"], {
      cwd: os.homedir(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = readline.createInterface({ input: child.stdout });
    let settled = false;
    let stderr = "";

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      output.close();
      if (!child.killed) child.kill();
      if (error) reject(error);
      else resolve(result);
    };

    const send = (message) => {
      if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const timeout = setTimeout(() => {
      finish(new Error("Codex app-server request timed out"));
    }, FETCH_TIMEOUT_MS);

    output.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.id === 1) {
        send({ method: "initialized", params: {} });
        send({ id: 2, method: "account/rateLimits/read", params: null });
        return;
      }

      if (message.id === 2) {
        if (message.error) {
          finish(new Error(message.error.message || "Codex rate-limit request failed"));
        } else {
          finish(null, message.result);
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-1000);
    });
    child.stdin.on("error", (error) => finish(error));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (!settled) {
        finish(new Error(`Codex app-server exited before replying (code ${code}): ${stderr.trim()}`));
      }
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "touch-bar-agent-status", version: "1.0.0" },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

function normalizeRateLimits(result) {
  const source = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
  if (!source || typeof source !== "object") return null;

  const normalizeWindow = (window) => {
    if (!window || !Number.isFinite(window.usedPercent)) return null;
    return {
      usedPercent: Math.min(100, Math.max(0, Math.round(window.usedPercent))),
      windowDurationMins: Number.isFinite(window.windowDurationMins)
        ? window.windowDurationMins
        : null,
      resetsAt: Number.isFinite(window.resetsAt) ? window.resetsAt : null,
    };
  };

  return {
    primary: normalizeWindow(source.primary),
    secondary: normalizeWindow(source.secondary),
    credits: source.credits && {
      hasCredits: source.credits.hasCredits === true,
      unlimited: source.credits.unlimited === true,
      balance: String(source.credits.balance ?? ""),
    },
  };
}

function windowLabel(window) {
  if (window.windowDurationMins === 300) return "5h";
  if (window.windowDurationMins === 10_080) return "周";
  if (window.windowDurationMins && window.windowDurationMins % 1_440 === 0) {
    return `${window.windowDurationMins / 1_440}d`;
  }
  if (window.windowDurationMins && window.windowDurationMins % 60 === 0) {
    return `${window.windowDurationMins / 60}h`;
  }
  return "额度";
}

function formatResetTime(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  // Codex reports resetsAt in epoch seconds; tolerate ms-shaped values.
  const ms = timestamp >= 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatQuota(snapshot) {
  const windows = [snapshot?.primary, snapshot?.secondary].filter(Boolean);
  if (windows.length === 0) return "GPT暂不可用";

  const parts = windows.map((window) => {
    const remaining = 100 - window.usedPercent;
    return `${windowLabel(window)}余${remaining}%`;
  });

  const credits = snapshot.credits;
  if (credits?.unlimited) parts.push("积分无限");
  else if (credits?.hasCredits && credits.balance) parts.push(`积分${credits.balance}`);

  // The bare time is the 5h window's quota reset time on the local clock.
  const reset = formatResetTime(snapshot?.primary?.resetsAt);
  const resetPart = reset ? `-${reset}` : "";
  return `GPT${parts[0]}${resetPart}${parts.slice(1).map((part) => `-${part}`).join("")}`;
}

async function main() {
  const cached = readCache();
  const cacheAge = cached ? Date.now() - cached.fetchedAt : Infinity;
  const cacheIsFresh = cacheAge >= 0 && cacheAge < CACHE_TTL_MS;
  if (cacheIsFresh) {
    console.log(formatQuota(cached.rateLimits));
    return;
  }

  try {
    const result = await requestRateLimits();
    const rateLimits = normalizeRateLimits(result);
    if (!rateLimits) throw new Error("Codex returned no rate-limit snapshot");
    const fetchedAt = Date.now();
    writeCache({ fetchedAt, rateLimits });
    console.log(formatQuota(rateLimits));
  } catch (error) {
    debug(error instanceof Error ? error.message : String(error));
    const staleAge = cached ? Date.now() - cached.fetchedAt : Infinity;
    if (staleAge >= 0 && staleAge < CACHE_STALE_MS) {
      console.log(`~${formatQuota(cached.rateLimits)}`);
    } else console.log("额度暂不可用");
  }
}

await main();
