import assert from "node:assert/strict"
import { test } from "node:test"
import { parsePortalCsv, recordsToCsv } from "../src/csv.js"
import { buildManifest, buildReviewHtml, escapeHtml, makeRunId } from "../src/artifacts.js"
import { loadConfig } from "../src/config.js"
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
})

test("HTML output escapes untrusted portal content", () => {
  const html = buildReviewHtml("run-1", [{
    recordId: "<script>", title: "<&", organization: "\"x\"", deadline: null,
    budgetCents: null, status: "open", documents: [], valid: false, validationErrors: ["bad"]
  }])
  assert.ok(html.includes("&lt;script&gt;"))
  assert.ok(!html.includes("<script>"))
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

test("run ids are filesystem-safe and unique enough for concurrent runs", () => {
  const a = makeRunId(new Date("2026-09-01T00:00:00.000Z"))
  const b = makeRunId(new Date("2026-09-01T00:00:00.000Z"))
  assert.match(a, /^20260901000000-[a-z0-9]+$/)
  assert.notEqual(a, b)
  assert.equal(a.includes("/"), false)
})
