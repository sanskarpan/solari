import type { NormalizedRecord, RunManifest } from "./types.js"

export function makeRunId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 8)
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
<p>Artifacts: <a href="../raw/records.csv">raw CSV</a> · <a href="../normalized/normalized.json">normalized JSON</a> · <a href="../normalized/review.csv">review CSV</a> · <a href="../manifest.json">manifest</a></p>
</head><body><h1>Portal decision pack</h1><p>Run <code>${escapeHtml(runId)}</code></p>
<p><span class="badge">${records.length} records</span><span class="badge">${valid} valid</span><span class="badge">${records.length - valid} need review</span></p>
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
  desktopScreenshot?: string
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
  if (input.error) manifest.error = input.error
  return manifest
}

export function redactError(error: unknown, secrets: string[]): string {
  const message = error instanceof Error ? error.message : String(error)
  return secrets.filter(Boolean).reduce((safe, secret) => safe.split(secret).join("[REDACTED]"), message)
}
