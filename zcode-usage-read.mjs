#!/usr/bin/env node

// Reads the ZCode (GLM Coding Plan) personal-plan quota from the BigModel
// monitor API and renders it for an MTMR shell script widget. See
// docs/zcode-usage-api.md for the endpoint contract and verification notes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const STATE_DIR = path.join(SCRIPT_DIR, ".state");
const CACHE_FILE = process.env.ZCODE_TOUCHBAR_USAGE_CACHE ||
  path.join(STATE_DIR, "zcode-touchbar-usage.json");
const CACHE_TTL_MS = positiveIntEnv("ZCODE_TOUCHBAR_USAGE_CACHE_MS", 5 * 60_000);
const FETCH_TIMEOUT_MS = positiveIntEnv("ZCODE_TOUCHBAR_USAGE_TIMEOUT_MS", 8_000);
const QUOTA_URL = process.env.ZCODE_USAGE_QUOTA_URL ||
  "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
const ZCODE_CONFIG_FILE = process.env.ZCODE_CONFIG_FILE ||
  path.join(os.homedir(), ".zcode", "v2", "config.json");
const CONFIG_PROVIDER_ID = process.env.ZCODE_CONFIG_PROVIDER_ID ||
  "builtin:bigmodel-coding-plan";

// unit codes observed in the wild: 3 = hours, 6 = weeks. The rest are
// undocumented; unknown units fall back to a generic label.
const UNIT_MINUTES = { 1: 1, 2: 1, 3: 60, 4: 1_440, 5: 1_440, 6: 10_080, 7: 43_200 };

function positiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function debug(...args) {
  if (process.env.ZCODE_TOUCHBAR_USAGE_DEBUG === "1") {
    console.error("[zcode-usage]", ...args);
  }
}

function readApiKey() {
  if (process.env.ZCODE_USAGE_API_KEY) return process.env.ZCODE_USAGE_API_KEY;
  try {
    const config = JSON.parse(fs.readFileSync(ZCODE_CONFIG_FILE, "utf8"));
    const apiKey = config?.provider?.[CONFIG_PROVIDER_ID]?.options?.apiKey;
    return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
  } catch (error) {
    debug("could not read ZCode config:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function readCache() {
  try {
    const value = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!value || typeof value !== "object") return null;
    if (!Number.isFinite(value.fetchedAt)) return null;
    if (!Array.isArray(value.limits)) return null;
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

async function requestQuotaLimits(apiKey) {
  const response = await fetch(QUOTA_URL, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`BigModel quota request failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload?.code !== 200 || !Array.isArray(payload?.data?.limits)) {
    throw new Error(`BigModel quota request rejected: ${payload?.msg ?? "unknown error"}`);
  }
  return payload.data.limits;
}

function normalizeLimits(rawLimits) {
  const limits = rawLimits
    .filter((limit) => limit.type === "CREDIT_LIMIT" || limit.type === "TOKENS_LIMIT")
    .map((limit) => ({
      usedPercent: Number.isFinite(limit.percentage)
        ? Math.min(100, Math.max(0, Math.round(limit.percentage)))
        : null,
      windowMinutes: Number.isFinite(limit.unit) && Number.isFinite(limit.number)
        ? UNIT_MINUTES[limit.unit] * limit.number ?? null
        : null,
      remaining: Number.isFinite(limit.remaining) ? limit.remaining : null,
      nextResetTime: Number.isFinite(limit.nextResetTime) ? limit.nextResetTime : null,
    }))
    .filter((limit) => limit.usedPercent !== null);

  limits.sort((a, b) => (a.windowMinutes ?? Number.MAX_SAFE_INTEGER) -
    (b.windowMinutes ?? Number.MAX_SAFE_INTEGER));
  return limits;
}

function windowLabel(window) {
  const minutes = window.windowMinutes;
  if (minutes === 10_080) return "周";
  if (minutes === 300) return "5h";
  if (minutes && minutes % 1_440 === 0) return `${minutes / 1_440}d`;
  if (minutes && minutes % 60 === 0) return `${minutes / 60}h`;
  return "额度";
}

function formatResetTime(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  // BigModel reports nextResetTime in epoch milliseconds; tolerate seconds.
  const ms = timestamp >= 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatQuota(limits) {
  if (limits.length === 0) return "GLM额度暂不可用";
  const parts = limits.map((window) => {
    const remaining = 100 - window.usedPercent;
    return `${windowLabel(window)}余${remaining}%`;
  });
  // Same convention as the Codex slot: the bare time is the 5h window's
  // quota reset time on the local clock.
  const reset = formatResetTime(limits[0]?.nextResetTime);
  const resetPart = reset ? `-${reset}` : "";
  return `GLM${parts[0]}${resetPart}${parts.slice(1).map((part) => `-${part}`).join("")}`;
}

async function main() {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log(formatQuota(cached.limits));
    return;
  }

  try {
    const apiKey = readApiKey();
    if (!apiKey) throw new Error("No BigModel API key found in ZCode config");
    const limits = normalizeLimits(await requestQuotaLimits(apiKey));
    if (limits.length === 0) throw new Error("BigModel returned no plan limits");
    writeCache({ fetchedAt: Date.now(), limits });
    console.log(formatQuota(limits));
  } catch (error) {
    debug(error instanceof Error ? error.message : String(error));
    if (cached) console.log(`~${formatQuota(cached.limits)}`);
    else console.log("ZCode额度暂不可用");
  }
}

await main();
