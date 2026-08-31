import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { test } from "node:test"
import { parsePortalCsv, recordsToCsv } from "../src/csv.js"
import { buildManifest, buildReviewHtml, escapeHtml, makeRunId, redactError } from "../src/artifacts.js"
import { loadConfig } from "../src/config.js"
import { cleanupLiveResources, pythonNormalizeCode } from "../src/live.js"
import { normalizeCsv, normalizeRecords, sampleRecords } from "../src/normalize.js"

test("CSV round-trips quoted commas, quotes, and newlines", () => {
  const records = [{ ...sampleRecords()[0]!, title: "Network, wired\nbackbone", documents: 'a"b.pdf' }]
  assert.deepEqual(parsePortalCsv(recordsToCsv(records)), records)
})

test("normalization preserves invalid rows and explains every failure", () => {
  const records = normalizeRecords(sampleRecords())
  assert.equal(records.length, 4)
  assert.equal(records.filter((record) => record.valid).length, 1)
  assert.equal(records[0]!.budgetCents, 12_500_000)
  assert.ok(records[1]!.validationErrors.includes("duplicate recordId"))
  assert.ok(records[2]!.validationErrors.includes("deadline is not a real calendar date"))
  assert.ok(records[2]!.validationErrors.includes("budget must be a non-negative currency amount"))
})

test("CSV normalization accepts CRLF and currency commas", () => {
  const csv = "recordId,title,organization,deadline,budget,status,documents\r\nA,Title,Org,2026-01-02,1,OPEN,doc.pdf\r\n"
  const [record] = normalizeCsv(csv)
  assert.equal(record?.valid, true)
  assert.equal(record?.budgetCents, 100)
})

test("CSV rejects malformed headers, rows, and quoted fields", () => {
  assert.throws(() => parsePortalCsv("wrong\nvalue\n"), /CSV header must be/)
  assert.throws(() => parsePortalCsv("recordId,title,organization,deadline,budget,status,documents\nA,B\n"), /expected 7/)
  assert.throws(() => parsePortalCsv("recordId,title,organization,deadline,budget,status,documents\n\"unterminated\n"), /unterminated/)
})

test("config requires a live API key but supports explicit dry mode", () => {
  assert.throws(() => loadConfig({ SOLARI_API_KEY: "" }, false), /SOLARI_API_KEY is required/)
  const config = loadConfig({ TIMEOUT_MS: "1000", ENABLE_STEALTH: "1" }, true)
  assert.equal(config.dryRun, true)
  assert.equal(config.timeoutMs, 1000)
  assert.equal(config.enableStealth, true)
  assert.equal(config.failAfterDownload, false)
  assert.equal(loadConfig({ FAIL_AFTER_DOWNLOAD: "1" }, true).failAfterDownload, true)
  assert.equal(loadConfig({ ENABLE_STEALTH: "1", CAPTCHA: "1", PROXY_TIER: "mobile", PROXY_SESSION: "warm-1" }, true).captcha, true)
  assert.throws(() => loadConfig({ CAPTCHA: "1" }, true), /CAPTCHA requires ENABLE_STEALTH=1/)
  assert.throws(() => loadConfig({ ENABLE_STEALTH: "1", PROXY_TIER: "unknown" }, true), /PROXY_TIER/)
  assert.throws(() => loadConfig({ ENABLE_STEALTH: "1", PROXY_SESSION: "bad session" }, true), /PROXY_SESSION/)
  assert.throws(() => loadConfig({ ENABLE_STEALTH: "1", PROXY_SESSION: "warm-1", PROXY_SESSION_DURATION: "31" }, true), /between 1 and 30/)
  assert.throws(() => loadConfig({ PORTAL_URL: "https://portal.example.test" }, true), /ALLOW_EXTERNAL_PORTAL=1/)
  assert.throws(() => loadConfig({ PORTAL_URL: "http://portal.example.test", ALLOW_EXTERNAL_PORTAL: "1" }, true), /must use HTTPS/)
  assert.throws(() => loadConfig({ PORTAL_URL: "https://user:password@portal.example.test", ALLOW_EXTERNAL_PORTAL: "1" }, true), /embedded credentials/)
  const external = loadConfig({ PORTAL_URL: "https://portal.example.test", ALLOW_EXTERNAL_PORTAL: "1" }, true)
  assert.equal(external.portalUrl, "https://portal.example.test")
})

test("HTML output escapes untrusted portal content", () => {
  const html = buildReviewHtml("run-1", [{
    recordId: "<script>", title: "<&", organization: "\"x\"", deadline: null,
    budgetCents: null, status: "open", documents: [], valid: false, validationErrors: ["bad"]
  }])
  assert.ok(html.includes("&lt;script&gt;"))
  assert.ok(!html.includes("<script>"))
  assert.match(html, /href="\.\.\/normalized\/review\.csv"/)
  assert.match(html, /href="\.\.\/manifest\.json"/)
  assert.ok(html.indexOf("</head>") < html.indexOf("Artifacts:"))
  assert.equal(escapeHtml("&<>\"'"), "&amp;&lt;&gt;&quot;&#39;")
})

test("manifest counts records and does not include credentials", () => {
  const manifest = buildManifest({
    runId: "run-1", status: "dry-run", sourceUrl: "fixture://portal",
    startedAt: "2026-09-01T00:00:00.000Z", finishedAt: "2026-09-01T00:00:01.000Z",
    records: normalizeRecords(sampleRecords()), artifacts: ["runs/run-1/manifest.json"]
  })
  assert.deepEqual(manifest.counts, { input: 4, valid: 1, invalid: 3 })
  assert.equal("password" in manifest, false)
})

test("failed manifests retain the error contract without credentials", () => {
  const manifest = buildManifest({
    runId: "run-failed", status: "failed", sourceUrl: "fixture://portal",
    startedAt: "2026-09-01T00:00:00.000Z", finishedAt: "2026-09-01T00:00:01.000Z",
    records: [], artifacts: ["runs/run-failed/raw/records.csv", "runs/run-failed/manifest.json"],
    error: redactError(new Error("login failed for demo-user with demo-password"), ["demo-user", "demo-password"]),
  })
  assert.equal(manifest.status, "failed")
  assert.equal(manifest.error, "login failed for [REDACTED] with [REDACTED]")
  assert.deepEqual(manifest.counts, { input: 0, valid: 0, invalid: 0 })
})

test("cleanup attempts every resource even when one teardown fails", async () => {
  const calls: string[] = []
  const failing = (name: string) => ({ kill: async () => { calls.push(name); throw new Error("teardown failure") } })
  const working = (name: string) => ({ kill: async () => { calls.push(name) } })
  await cleanupLiveResources({
    browser: { close: async () => { calls.push("browser") } },
    browserClient: { close: async () => { calls.push("browser-client") } },
    desktop: failing("desktop"), reviewServer: working("review"), portalServer: working("portal"),
    verifier: working("verifier"), processing: working("processing"), workspace: working("workspace"),
    cleanupVolume: true, volumeId: "vol-1", deleteVolume: async () => { calls.push("volume") },
  })
  assert.deepEqual(calls, ["browser", "browser-client", "desktop", "review", "portal", "verifier", "processing", "workspace", "volume"])
})

test("the sandbox Python normalizer matches the local contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "portal-ops-python-"))
  const input = join(dir, "records.csv")
  const normalized = join(dir, "normalized.json")
  const review = join(dir, "review.csv")
  await writeFile(input, recordsToCsv(sampleRecords()))
  const child = spawn("python3", ["-c", pythonNormalizeCode(input, normalized, review)], { stdio: "ignore" })
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code) => resolve(code ?? 1))
  })
  try {
    assert.equal(exitCode, 0)
    assert.deepEqual(JSON.parse(await readFile(normalized, "utf8")), normalizeRecords(sampleRecords()))
    assert.match(await readFile(review, "utf8"), /validationErrors/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("run ids are filesystem-safe and unique enough for concurrent runs", () => {
  const a = makeRunId(new Date("2026-09-01T00:00:00.000Z"))
  const b = makeRunId(new Date("2026-09-01T00:00:00.000Z"))
  assert.match(a, /^20260901000000-[a-z0-9]+$/)
  assert.notEqual(a, b)
  assert.equal(a.includes("/"), false)
})
