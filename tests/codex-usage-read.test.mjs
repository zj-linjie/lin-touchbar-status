import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const reader = new URL("../codex-usage-read.mjs", import.meta.url);

function fixture(t, ageMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "touchbar-usage-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cache = path.join(dir, "usage.json");
  const rateLimits = {
    primary: { usedPercent: 3, windowDurationMins: 300, resetsAt: 1791441544 },
    secondary: { usedPercent: 5, windowDurationMins: 10080, resetsAt: 1791957905 },
  };
  fs.writeFileSync(cache, JSON.stringify({
    fetchedAt: Date.now() - ageMs,
    rateLimits,
    windowEnd: Date.now() + 60_000,
  }));
  return { dir, cache, rateLimits };
}

function run(cache, bin) {
  const result = spawnSync(process.execPath, [reader.pathname], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ""}`,
      TZ: "Asia/Shanghai",
      CODEX_APP_SERVER_BIN: bin,
      CODEX_TOUCHBAR_USAGE_CACHE: cache,
      CODEX_TOUCHBAR_USAGE_CACHE_MS: "300000",
      CODEX_TOUCHBAR_USAGE_STALE_MS: "900000",
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("failed requests do not display days-old quota percentages", (t) => {
  const { cache } = fixture(t, 17 * 24 * 60 * 60_000);
  assert.equal(run(cache, "/usr/bin/false"), "额度暂不可用");
});

test("brief failures mark recent quota as stale", (t) => {
  const { cache } = fixture(t, 6 * 60_000);
  assert.equal(run(cache, "/usr/bin/false"), "~GPT5h余97%-14:39-周余95%");
});

test("fresh caches use the API reset time instead of the old anchor", (t) => {
  const { cache } = fixture(t, 0);
  assert.equal(run(cache, "/usr/bin/false"), "GPT5h余97%-14:39-周余95%");
});

test("successful requests replace stale percentages and the old reset anchor", (t) => {
  const { dir, cache, rateLimits } = fixture(t, 6 * 60_000);
  const old = JSON.parse(fs.readFileSync(cache, "utf8"));
  old.rateLimits.primary.usedPercent = 0;
  old.rateLimits.secondary.usedPercent = 15;
  fs.writeFileSync(cache, JSON.stringify(old));
  const bin = path.join(dir, "codex");
  fs.writeFileSync(bin, `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    console.log(JSON.stringify({ id: message.id, result: {} }));
  } else if (message.method === "account/rateLimits/read") {
    console.log(JSON.stringify({ id: message.id, result: { rateLimitsByLimitId: { codex: ${JSON.stringify(rateLimits)} } } }));
  }
});
`, { mode: 0o700 });
  assert.equal(run(cache, bin), "GPT5h余97%-14:39-周余95%");
  const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
  assert.deepEqual(saved.rateLimits.primary, rateLimits.primary);
  assert.deepEqual(saved.rateLimits.secondary, rateLimits.secondary);
  assert.ok(Date.now() - saved.fetchedAt < 5_000);
});
