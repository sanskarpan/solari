import { Solari } from "@solarisdk/browser"
import { SolariClient } from "@solarisdk/sdk"
import type { Desktop, Sandbox } from "@solarisdk/sdk"
import { buildManifest, buildReviewHtml, makeRunId, redactError } from "./artifacts.js"
import { loadConfig, type AppConfig } from "./config.js"
import { parsePortalCsv } from "./csv.js"
import { FIXTURE_PORTAL_SCRIPT, startFixture } from "./fixture.js"
import { normalizeRecords } from "./normalize.js"
import type { NormalizedRecord } from "./types.js"

const BASE_URL = "https://api.getsolari.com"

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitForHttp(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastStatus = "no response"
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      lastStatus = String(response.status)
      if (response.ok) return
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error)
    }
    await sleep(1_000)
  }
  throw new Error(`Timed out waiting for ${url} (${lastStatus})`)
}

async function downloadBytes(download: { createReadStream(): Promise<AsyncIterable<Uint8Array> | null> }): Promise<Uint8Array> {
  const stream = await download.createReadStream()
  if (!stream) throw new Error("Solari browser returned no download stream")
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export function pythonNormalizeCode(inputPath: string, normalizedPath: string, reviewPath: string): string {
  const input = JSON.stringify(inputPath)
  const normalized = JSON.stringify(normalizedPath)
  const review = JSON.stringify(reviewPath)
  return `import csv, datetime, json, re

INPUT = ${input}
NORMALIZED = ${normalized}
REVIEW = ${review}
allowed_statuses = {"open", "closed", "draft"}

def deadline(value):
    if not re.fullmatch(r"\\d{4}-\\d{2}-\\d{2}", value):
        return None, "deadline must use YYYY-MM-DD"
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        return None, "deadline is not a real calendar date"
    return value, None

def budget(value):
    clean = value.replace(",", "").replace("$", "").strip()
    if not re.fullmatch(r"\\d+(?:\\.\\d{1,2})?", clean):
        return None, "budget must be a non-negative currency amount"
    cents = round(float(clean) * 100)
    return (cents, None) if cents < 9007199254740991 else (None, "budget is too large")

with open(INPUT, newline="", encoding="utf-8") as handle:
    source = list(csv.DictReader(handle))
ids = {}
for row in source:
    ids[row["recordId"]] = ids.get(row["recordId"], 0) + 1

output = []
for row in source:
    errors = []
    date_value, date_error = deadline(row["deadline"].strip())
    budget_value, budget_error = budget(row["budget"].strip())
    status = row["status"].strip().lower()
    if not row["recordId"].strip(): errors.append("recordId is required")
    if not row["title"].strip(): errors.append("title is required")
    if not row["organization"].strip(): errors.append("organization is required")
    if date_error: errors.append(date_error)
    if budget_error: errors.append(budget_error)
    if status not in allowed_statuses: errors.append("status must be one of open, closed, draft")
    if ids[row["recordId"]] > 1: errors.append("duplicate recordId")
    output.append({
        "recordId": row["recordId"].strip(),
        "title": row["title"].strip(),
        "organization": row["organization"].strip(),
        "deadline": date_value,
        "budgetCents": budget_value,
        "status": status,
        "documents": [x.strip() for x in row["documents"].split(";") if x.strip()],
        "valid": not errors,
        "validationErrors": errors,
    })

with open(NORMALIZED, "w", encoding="utf-8") as handle:
    json.dump(output, handle, indent=2)
with open(REVIEW, "w", newline="", encoding="utf-8") as handle:
    fields = ["recordId", "title", "organization", "deadline", "budget", "status", "documents", "valid", "validationErrors"]
    writer = csv.DictWriter(handle, fieldnames=fields)
    writer.writeheader()
    for row in output:
        writer.writerow({
            "recordId": row["recordId"], "title": row["title"], "organization": row["organization"],
            "deadline": row["deadline"] or "", "budget": "" if row["budgetCents"] is None else f'{row["budgetCents"] / 100:.2f}',
            "status": row["status"], "documents": ";".join(row["documents"]),
            "valid": row["valid"], "validationErrors": "; ".join(row["validationErrors"]),
        })
print(json.dumps({"input": len(output), "valid": sum(x["valid"] for x in output), "invalid": sum(not x["valid"] for x in output)}))`
}

async function replayUrl(client: Solari, sessionId: string): Promise<string | undefined> {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      return (await client.sessions.getReplayUrl(sessionId)).url
    } catch (error) {
      const status = error instanceof Error && "status" in error ? (error as { status?: number }).status : undefined
      if (status !== 404) throw error
      console.log(`replay attempt ${attempt}: not uploaded yet`)
      await sleep(3_000)
    }
  }
  return undefined
}

type Closable = { close(): Promise<unknown> }
type Killable = { kill(): Promise<unknown> }
type BrowserPage = Awaited<ReturnType<Awaited<ReturnType<Solari["launch"]>>["newPage"]>>

export async function cleanupLiveResources(resources: {
  browser?: Closable | undefined
  browserClient: Closable
  desktop?: Killable | undefined
  reviewServer?: Killable | undefined
  portalServer?: Killable | undefined
  verifier?: Killable | undefined
  processing?: Killable | undefined
  workspace?: Killable | undefined
  cleanupVolume: boolean
  volumeId?: string
  deleteVolume: (volumeId: string) => Promise<unknown>
}): Promise<void> {
  await resources.browser?.close().catch(() => undefined)
  await resources.browserClient.close().catch(() => undefined)
  await resources.desktop?.kill().catch(() => undefined)
  await resources.reviewServer?.kill().catch(() => undefined)
  await resources.portalServer?.kill().catch(() => undefined)
  await resources.verifier?.kill().catch(() => undefined)
  await resources.processing?.kill().catch(() => undefined)
  await resources.workspace?.kill().catch(() => undefined)
  if (resources.cleanupVolume && resources.volumeId) await resources.deleteVolume(resources.volumeId).catch(() => undefined)
}

async function findOrCreateVolume(client: SolariClient, name: string): Promise<{ volumeId: string }> {
  const existing = (await client.volumes.list()).find((volume) => volume.name === name)
  if (existing) return existing
  return client.volumes.create({ name, sizeMb: 1_024, metadata: { purpose: "portal-ops-demo" } })
}

async function createProcessingSandbox(client: SolariClient, snapshotId: string, volumeId: string, timeoutMs: number): Promise<Sandbox> {
  const sandbox = await client.sandboxes.create({
    template: "base",
    fromSnapshot: snapshotId,
    volumes: [{ volumeId, path: "/data" }],
    timeoutMs,
    lifecycle: { onTimeout: "kill" },
  })
  await sandbox.connect()
  return sandbox
}

async function optionalDesktopReview(client: SolariClient, config: AppConfig, volumeId: string, reviewCsv: string, workspace: Sandbox): Promise<{ desktop?: Desktop; screenshotPath?: string }> {
  if (!config.enableDesktop) return {}
  const desktop = await client.sandboxes.createDesktop({
    template: "office",
    resolution: "1280x720",
    timeoutMs: config.timeoutMs,
    lifecycle: { onTimeout: "kill" },
    volumes: [{ volumeId, path: "/data" }],
  })
  try {
    await desktop.connect()
    let ready = false
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await desktop.health()).ready) {
        ready = true
        break
      }
      await sleep(1_000)
    }
    if (!ready) throw new Error("desktop did not become ready within 30 seconds")
    await desktop.open("libreoffice", [reviewCsv])
    await sleep(4_000)
    const screenshotPath = reviewCsv.replace(/\/normalized\/review\.csv$/, "/review/desktop-review.png")
    await workspace.files.write(screenshotPath, await desktop.screenshot({ format: "png" }))
    return { desktop, screenshotPath }
  } catch (error) {
    await desktop.kill().catch(() => undefined)
    throw error
  }
}

export async function runLiveWorkflow(): Promise<void> {
  const config = loadConfig()
  const runId = makeRunId()
  const startedAt = new Date().toISOString()
  const client = new SolariClient({ apiKey: config.apiKey!, baseUrl: BASE_URL })
  const browserClient = new Solari({ apiKey: config.apiKey!, baseUrl: BASE_URL })
  const volume = await findOrCreateVolume(client, config.volumeName)
  const volumeId = volume.volumeId
  const volumeMount = { volumeId, path: "/data" }
  const runRoot = `/data/runs/${runId}`
  const rawPath = `${runRoot}/raw/records.csv`
  const normalizedPath = `${runRoot}/normalized/normalized.json`
  const reviewCsvPath = `${runRoot}/normalized/review.csv`
  const reviewDir = `${runRoot}/review`
  let workspace: Sandbox | undefined
  let processing: Sandbox | undefined
  let verifier: Sandbox | undefined
  let portalServer: { kill(): Promise<void> } | undefined
  let reviewServer: { kill(): Promise<void> } | undefined
  let browser: Awaited<ReturnType<Solari["launch"]>> | undefined
  let desktop: Desktop | undefined
  let browserSessionId: string | undefined
  let replay: string | undefined
  let page: BrowserPage | undefined
  let normalized: NormalizedRecord[] = []
  let sourceUrl = "fixture://portal"
  let rawUploaded = false

  try {
    workspace = await client.sandboxes.create({ template: "base", volumes: [volumeMount], timeoutMs: config.timeoutMs, lifecycle: { onTimeout: "kill" } })
    await workspace.connect()
    await workspace.files.write("/tmp/portal-fixture.py", FIXTURE_PORTAL_SCRIPT)
    const snapshotId = await workspace.snapshot("portal-ops-golden")
    portalServer = await startFixture(workspace, "/tmp/portal-fixture.py", false)
    const portalPreview = await workspace.previewUrl(3000)
    await waitForHttp(portalPreview.url)
    sourceUrl = `fixture://${portalPreview.url}`
    console.log(`fixture portal: ${portalPreview.url}`)

    const profiles = await browserClient.profiles.list()
    const profile = profiles.find((item) => item.name === config.profileName) ?? await browserClient.profiles.create({ name: config.profileName })
    if (config.recording) console.warn("recording enabled: login input may be captured in the replay; treat the replay as sensitive")
    const launchOptions = config.enableStealth
      ? { profileId: profile.id, recording: config.recording, stealth: true as const, proxy: { country: config.proxyCountry } }
      : { profileId: profile.id, recording: config.recording }
    browser = await browserClient.launch(launchOptions)
    browserSessionId = browser.id
    page = await browser.newPage()
    await page.goto(portalPreview.url, { waitUntil: "domcontentloaded" })
    if (!page.url().endsWith("/records")) {
      await page.locator("input[name=username]").fill(config.username)
      await page.locator("input[name=password]").fill(config.password)
      await page.locator("button[type=submit]").click()
      await page.waitForURL("**/records")
    }
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#download").click(),
    ])
    const csvBytes = await downloadBytes(download)
    await browserClient.profiles.save(profile.id, await page.context().storageState())
    if (config.enableStealth) console.log("browser proxy: enabled (credentials and vendor details withheld)")
    console.log(`download: ${download.suggestedFilename()} (${csvBytes.byteLength} bytes)`)
    await browser.close()
    browser = undefined
    if (config.recording && browserSessionId) {
      replay = await replayUrl(browserClient, browserSessionId)
      if (replay) console.log(`replay: ${replay}`)
    }

    processing = await createProcessingSandbox(client, snapshotId, volumeId, config.timeoutMs)
    await processing.commands.run("mkdir", { args: ["-p", `${runRoot}/raw`, `${runRoot}/normalized`, reviewDir] })
    await processing.files.upload(rawPath, csvBytes)
    rawUploaded = true
    if (config.failAfterDownload) throw new Error("failure injection requested after download transfer")
    const contextId = await processing.createCodeContext("python")
    const result = await processing.runCode(pythonNormalizeCode(rawPath, normalizedPath, reviewCsvPath), { language: "python", contextId })
    if (result.error) throw new Error(`sandbox normalization failed: ${result.error}`)
    normalized = JSON.parse(await processing.files.readText(normalizedPath)) as NormalizedRecord[]
    const localParity = normalizeRecords(parsePortalCsvForParity(csvBytes))
    if (JSON.stringify(normalized) !== JSON.stringify(localParity)) throw new Error("sandbox output differs from local contract normalization")
    await processing.kill()
    processing = undefined
    await workspace.files.write(`${reviewDir}/index.html`, buildReviewHtml(runId, normalized))
    const artifacts = [`runs/${runId}/raw/records.csv`, `runs/${runId}/normalized/normalized.json`, `runs/${runId}/normalized/review.csv`, `runs/${runId}/review/index.html`, `runs/${runId}/manifest.json`]
    let manifest = buildManifest({ runId, status: "succeeded", sourceUrl, startedAt, finishedAt: new Date().toISOString(), records: normalized, artifacts, browserSessionId, replayUrl: replay })
    await workspace.files.write(`${runRoot}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n")
    await workspace.files.write(`${reviewDir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n")
    reviewServer = await workspace.commands.start("python3", { args: ["-m", "http.server", "3001", "--directory", reviewDir] })
    const reviewPreview = await workspace.previewUrl(3001)
    await waitForHttp(`${reviewPreview.url}/index.html`)
    console.log(`review: ${reviewPreview.url}/index.html`)
    verifier = await client.sandboxes.create({ template: "base", volumes: [volumeMount], timeoutMs: config.timeoutMs, lifecycle: { onTimeout: "kill" } })
    await verifier.connect()
    const persisted = JSON.parse(await verifier.files.readText(`${runRoot}/manifest.json`)) as typeof manifest
    if (persisted.runId !== runId) throw new Error("volume persistence check returned the wrong run")
    console.log(`volume persistence: confirmed ${persisted.artifacts.length} artifacts`)
    await verifier.kill()
    verifier = undefined
    let desktopResult: { desktop?: Desktop; screenshotPath?: string } = {}
    try {
      desktopResult = await optionalDesktopReview(client, config, volumeId, reviewCsvPath, workspace)
    } catch (error) {
      console.warn(`desktop review skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
    desktop = desktopResult.desktop
    if (desktopResult.screenshotPath && desktopResult.desktop) {
      manifest = buildManifest({ runId, status: "succeeded", sourceUrl, startedAt, finishedAt: new Date().toISOString(), records: normalized, artifacts: [...artifacts, `runs/${runId}/review/desktop-review.png`], browserSessionId, replayUrl: replay, desktopScreenshot: `runs/${runId}/review/desktop-review.png` })
      await workspace.files.write(`${runRoot}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n")
      await workspace.files.write(`${reviewDir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n")
      console.log(`desktop screenshot: ${desktopResult.screenshotPath}`)
      console.log(`desktop stream: ${desktopResult.desktop.streamUrl}`)
    }
  } catch (error) {
    const failedArtifacts = rawUploaded ? [`runs/${runId}/raw/records.csv`] : []
    if (page && workspace) {
      try {
        await workspace.commands.run("mkdir", { args: ["-p", reviewDir] })
        await workspace.files.write(`${reviewDir}/browser-failure.png`, await page.screenshot({ fullPage: true }))
        failedArtifacts.push(`runs/${runId}/review/browser-failure.png`)
      } catch (screenshotError) {
        console.warn(`browser failure screenshot unavailable: ${redactError(screenshotError, [config.password, config.username, config.apiKey ?? ""])}`)
      }
    }
    const failedManifest = buildManifest({
      runId,
      status: "failed",
      sourceUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      records: normalized,
      artifacts: [...failedArtifacts, `runs/${runId}/manifest.json`],
      browserSessionId,
      replayUrl: replay,
      error: redactError(error, [config.password, config.username, config.apiKey ?? ""]),
    })
    if (workspace) {
      try {
        await workspace.commands.run("mkdir", { args: ["-p", runRoot, reviewDir] })
        await workspace.files.write(`${runRoot}/manifest.json`, JSON.stringify(failedManifest, null, 2) + "\n")
        if (normalized.length) await workspace.files.write(`${reviewDir}/index.html`, buildReviewHtml(runId, normalized))
        console.error(`workflow failed; retained artifacts: ${runRoot}`)
      } catch (manifestError) {
        console.error(`workflow failed and failed-manifest write also failed: ${redactError(manifestError, [config.password, config.username, config.apiKey ?? ""])}`)
      }
    }
    throw error
  } finally {
    await cleanupLiveResources({ browser, browserClient, desktop, reviewServer, portalServer, verifier, processing, workspace, cleanupVolume: config.cleanupVolume, volumeId, deleteVolume: (id) => client.volumes.delete(id) })
  }
}

function parsePortalCsvForParity(bytes: Uint8Array): Parameters<typeof normalizeRecords>[0] {
  return parsePortalCsv(Buffer.from(bytes).toString("utf8"))
}
