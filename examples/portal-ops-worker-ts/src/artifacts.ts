import { randomBytes } from "node:crypto"
import type { DesktopReview, NormalizedRecord, RunManifest } from "./types.js"

export function makeRunId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)
  const suffix = randomBytes(6).toString("hex")
  return `${stamp}-${suffix}`
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!)
}

export function buildReviewHtml(runId: string, records: NormalizedRecord[]): string {
  const rows = records.map((record) => `
    <tr class="${record.valid ? "valid" : "invalid"}">
      <td>${escapeHtml(record.recordId)}</td>
      <td>${escapeHtml(record.title)}</td>
      <td>${escapeHtml(record.organization)}</td>
      <td>${escapeHtml(record.deadline ?? "—")}</td>
      <td>${record.budgetCents === null ? "—" : `$${(record.budgetCents / 100).toFixed(2)}`}</td>
      <td>${escapeHtml(record.status)}</td>
      <td>${record.valid ? "Ready" : escapeHtml(record.validationErrors.join("; "))}</td>
    </tr>`).join("")
  const valid = records.filter((record) => record.valid).length
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Portal review ${escapeHtml(runId)}</title>
<style>body{font:15px system-ui;margin:2rem;color:#17202a}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd;padding:.55rem;text-align:left}th{background:#eef2f5}.valid{background:#f3fff5}.invalid{background:#fff4f3}.badge{display:inline-block;padding:.3rem .6rem;border-radius:1rem;background:#e8eef7;margin-right:.5rem}</style>
</head><body><h1>Portal decision pack</h1><p>Run <code>${escapeHtml(runId)}</code></p>
<p><span class="badge">${records.length} records</span><span class="badge">${valid} valid</span><span class="badge">${records.length - valid} need review</span></p>
<p>Artifacts: <a href="../raw/records.csv">raw CSV</a> · <a href="../normalized/normalized.json">normalized JSON</a> · <a href="../normalized/review.csv">review CSV</a> · <a href="../manifest.json">manifest</a></p>
<table><thead><tr><th>ID</th><th>Title</th><th>Organization</th><th>Deadline</th><th>Budget</th><th>Status</th><th>Validation</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>\n`
}

export function buildManifest(input: {
  runId: string
  status: RunManifest["status"]
  sourceUrl: string
  startedAt: string
  finishedAt: string
  records: NormalizedRecord[]
  artifacts: string[]
  browserSessionId?: string | undefined
  replayUrl?: string | undefined
  desktopScreenshot?: string | undefined
  desktopReview?: DesktopReview | undefined
  error?: string
}): RunManifest {
  const manifest: RunManifest = {
    schemaVersion: 1,
    runId: input.runId,
    status: input.status,
    source: { kind: input.sourceUrl.startsWith("fixture:") ? "fixture" : "external", url: input.sourceUrl },
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    counts: {
      input: input.records.length,
      valid: input.records.filter((record) => record.valid).length,
      invalid: input.records.filter((record) => !record.valid).length,
    },
    artifacts: input.artifacts,
  }
  if (input.browserSessionId) manifest.browserSessionId = input.browserSessionId
  if (input.replayUrl) manifest.replayUrl = input.replayUrl
  if (input.desktopScreenshot) manifest.desktopScreenshot = input.desktopScreenshot
  if (input.desktopReview) manifest.desktopReview = input.desktopReview
  if (input.error) manifest.error = input.error
  return manifest
}

export function redactError(error: unknown, secrets: string[]): string {
  const message = error instanceof Error ? error.message : String(error)
  return secrets.filter(Boolean).reduce((safe, secret) => safe.split(secret).join("[REDACTED]"), message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function validateRunManifest(value: unknown): RunManifest {
  if (!isObject(value)) throw new Error("manifest must be an object")
  if (value.schemaVersion !== 1) throw new Error("manifest schemaVersion must be 1")
  if (typeof value.runId !== "string" || !value.runId) throw new Error("manifest runId must be a non-empty string")
  if (value.status !== "dry-run" && value.status !== "succeeded" && value.status !== "failed") {
    throw new Error("manifest status is invalid")
  }
  if (!isObject(value.source) || (value.source.kind !== "fixture" && value.source.kind !== "external") || typeof value.source.url !== "string") {
    throw new Error("manifest source is invalid")
  }
  if (typeof value.startedAt !== "string" || typeof value.finishedAt !== "string") {
    throw new Error("manifest timestamps are invalid")
  }
  const startedAt = Date.parse(value.startedAt)
  const finishedAt = Date.parse(value.finishedAt)
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    throw new Error("manifest timestamps are inconsistent")
  }
  if (!isObject(value.counts)) {
    throw new Error("manifest counts are invalid")
  }
  const input = value.counts.input
  const valid = value.counts.valid
  const invalid = value.counts.invalid
  if (typeof input !== "number" || typeof valid !== "number" || typeof invalid !== "number" || !Number.isInteger(input) || !Number.isInteger(valid) || !Number.isInteger(invalid)) {
    throw new Error("manifest counts are invalid")
  }
  if (input < 0 || valid < 0 || invalid < 0 || valid + invalid !== input) {
    throw new Error("manifest counts are inconsistent")
  }
  if (!Array.isArray(value.artifacts) || value.artifacts.some((artifact) => typeof artifact !== "string" || !artifact)) {
    throw new Error("manifest artifacts are invalid")
  }
  for (const field of ["browserSessionId", "replayUrl", "desktopScreenshot", "error"]) {
    if (field in value && typeof value[field] !== "string") throw new Error("manifest " + field + " must be a string")
  }
  if ("desktopReview" in value) {
    if (!isObject(value.desktopReview) || typeof value.desktopReview.status !== "string" || !["not-requested", "pending", "succeeded", "skipped"].includes(value.desktopReview.status)) {
      throw new Error("manifest desktopReview is invalid")
    }
    if ("reason" in value.desktopReview && typeof value.desktopReview.reason !== "string") {
      throw new Error("manifest desktopReview.reason must be a string")
    }
  }
  return value as unknown as RunManifest
}
