import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { recordsToCsv } from "./csv.js"
import { normalizeRecords, sampleRecords } from "./normalize.js"
import { buildManifest, buildReviewHtml, makeRunId } from "./artifacts.js"

export async function runDryWorkflow(): Promise<void> {
  const runId = makeRunId(new Date("2026-09-01T00:00:00.000Z"))
  const root = join(process.cwd(), ".runs", runId)
  const rawDir = join(root, "raw")
  const normalizedDir = join(root, "normalized")
  const reviewDir = join(root, "review")
  await Promise.all([mkdir(rawDir, { recursive: true }), mkdir(normalizedDir, { recursive: true }), mkdir(reviewDir, { recursive: true })])

  const records = sampleRecords()
  const normalized = normalizeRecords(records)
  await writeFile(join(rawDir, "records.csv"), recordsToCsv(records))
  await writeFile(join(normalizedDir, "normalized.json"), JSON.stringify(normalized, null, 2) + "\n")
  await writeFile(join(normalizedDir, "review.csv"), recordsToCsv(normalized.map((r) => ({
    recordId: r.recordId,
    title: r.title,
    organization: r.organization,
    deadline: r.deadline ?? "",
    budget: r.budgetCents === null ? "" : (r.budgetCents / 100).toFixed(2),
    status: r.status,
    documents: r.documents.join(";"),
  }))))
  await writeFile(join(reviewDir, "index.html"), buildReviewHtml(runId, normalized))
  const manifest = buildManifest({
    runId,
    status: "dry-run",
    sourceUrl: "fixture://portal",
    startedAt: "2026-09-01T00:00:00.000Z",
    finishedAt: "2026-09-01T00:00:01.000Z",
    records: normalized,
    artifacts: [
      `runs/${runId}/raw/records.csv`,
      `runs/${runId}/normalized/normalized.json`,
      `runs/${runId}/normalized/review.csv`,
      `runs/${runId}/review/index.html`,
    ],
  })
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
  console.log(`dry run: ${runId}`)
  console.log(`artifacts: ${root}`)
  console.log(`records: ${normalized.length} (${manifest.counts.valid} valid, ${manifest.counts.invalid} invalid)`)
}
