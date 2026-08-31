# Portal-to-Decision Pack — SPEC

## 1. Purpose

Build a production-shaped Solari example for an authorized, no-API procurement
portal workflow. The worker logs into a portal with a saved browser profile,
downloads a CSV or document, transfers the bytes into an isolated sandbox,
normalizes and validates the records, writes durable run artifacts to a volume,
serves a review page, and optionally opens the resulting CSV in a Solari desktop
for human verification.

The first implementation uses a deterministic synthetic portal served from a
Solari sandbox. This keeps the example runnable without depending on a third-
party portal, CAPTCHA, or unstable DOM. An external portal can be supplied later
with `PORTAL_URL` and an adapter that preserves the same artifact contract.

## 2. Product thesis

Solari's browser, sandbox, volume, preview, and desktop primitives become more
valuable when they complete a business process rather than merely expose
infrastructure. The product story is:

> Turn an authorized portal workflow into a verified, reviewable business artifact.

Stealth, proxy, CAPTCHA, and profiles are supporting capabilities. The example
must not frame unauthorized access or bot-defense bypass as the product value.

## 3. Scope

### In scope

- A TypeScript example at `examples/portal-ops-worker-ts`.
- A safe synthetic portal with login, a records page, and a downloadable CSV.
- A configurable authorized external HTTPS portal adapter with selector
  overrides, guarded by an explicit opt-in.
- A browser worker using the Playwright-shaped Solari browser API.
- Profile create/list/attach/save lifecycle.
- Browser download transfer through the host into a sandbox; no assumption that
  browser and sandbox share a filesystem.
- A sandbox created from a golden snapshot for parsing and validation.
- A persistent volume with one immutable directory per run.
- Stateful `runCode` normalization in the sandbox.
- Review artifacts: raw CSV, normalized JSON, review CSV, manifest, and HTML.
- A public preview URL for the review page, with its access caveat documented.
- An optional desktop review stage using the `office` template, CSV opening,
  screenshot, and `streamUrl`.
- Offline unit tests for configuration, CSV parsing, normalization, escaping,
  manifest generation, and run-directory isolation.
- A dry run that exercises the workflow contract without an API key.

### Out of scope

- A generic crawler, scheduler, queue, multi-tenant SaaS, or billing service.
- Automatic submission of tenders, payments, or irreversible portal actions.
- CAPTCHA solving against the fixture.
- LLM-based extraction. The first parser is deterministic and inspectable.
- Concurrent read-modify-write to a shared result file.
- Claiming that rrweb replay is a complete browser test trace.

## 4. User journey

1. Start the fixture portal in a sandbox and obtain a preview URL.
2. Launch a Solari browser against the portal URL.
3. Log in if required, or reuse a saved profile when the origin is stable.
4. Download `records.csv` with `waitForEvent("download")`.
5. Upload the bytes to `/data/runs/<run-id>/raw/records.csv`.
6. Fork a processing sandbox from the golden snapshot and attach the volume.
7. Run Python code in a persistent kernel to validate, normalize, deduplicate,
   and write `normalized.json` and `review.csv`.
8. Generate a review page and manifest containing source, timing, counts, and
   artifact paths. No API keys or passwords may enter the manifest.
9. Serve the review directory using `previewUrl(3001)` and print the URL.
10. If `ENABLE_DESKTOP=1`, attach the volume to an `office` desktop, open the
    review CSV in LibreOffice, save a screenshot, and print `streamUrl`.
11. Close/release every browser, kill temporary sandboxes, and leave the volume
    available for inspection unless `CLEANUP_VOLUME=1` is set.

## 5. Architecture invariants

```text
browser session --download bytes--> host coordinator
                                      |
                                      +--> sandbox.files.upload()
                                      |
                                      +--> volume /data/runs/<run-id>/
                                      |
                                      +--> processing sandbox runCode()
                                      |
                                      +--> preview dashboard
                                      |
                                      +--> optional office desktop review
```

- Browser and sandbox are separate sessions. Transfers are explicit.
- Each run has a unique directory. Workers write separate files and a single
  coordinator owns the final manifest.
- Volumes are durable folders, not snapshots. Snapshots are used for repeatable
  machine state, not for output persistence.
- A snapshot restore may be used with the same volume, but revert does not erase
  data that lives on the volume.
- Preview URLs are public-facing. The example must warn that production data
  needs an authenticated proxy or short-lived access layer.
- Browser recording is opt-in. When enabled, the replay is evidence and may
  contain sensitive input; do not record the fixture password step by default.
- Every remote resource has a `finally` cleanup path.

## 6. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SOLARI_API_KEY` | required for live mode | Solari bearer key |
| `DRY_RUN` | `0` | Run local contract tests without Solari |
| `PORTAL_URL` | fixture URL created at runtime | Optional authorized external HTTPS portal origin |
| `ALLOW_EXTERNAL_PORTAL` | `0` | Required explicit opt-in for `PORTAL_URL` |
| `PORTAL_USERNAME` | `demo-user` | Fixture-only login value |
| `PORTAL_PASSWORD` | `demo-password` | Fixture-only login value |
| `PORTAL_USERNAME_SELECTOR` | `input[name=username]` | Login username selector |
| `PORTAL_PASSWORD_SELECTOR` | `input[name=password]` | Login password selector |
| `PORTAL_LOGIN_SUBMIT_SELECTOR` | `button[type=submit]` | Login submit selector |
| `PORTAL_DOWNLOAD_SELECTOR` | `#download` | CSV download selector |
| `PROFILE_NAME` | `portal-ops-demo` | Saved browser profile name |
| `ENABLE_STEALTH` | `0` | Opt-in for an authorized external target |
| `PROXY_COUNTRY` | `us` | Used only when stealth is enabled |
| `RECORDING` | `0` | Enable browser rrweb replay |
| `ENABLE_DESKTOP` | `0` | Run the optional office review stage |
| `CLEANUP_VOLUME` | `0` | Delete the durable volume after the run |
| `VOLUME_NAME` | `portal-ops-demo` | Reused organization volume |
| `TIMEOUT_MS` | `300000` | Rolling idle window for VMs |

The default live path uses the synthetic portal and does not spend proxy or
CAPTCHA credits. External targets must be explicitly supplied and allowlisted by
the caller.

## 7. SDK/API contract

Use currently published TypeScript packages: `@solarisdk/browser@0.1.1` and
`@solarisdk/sdk@0.1.2`. The umbrella SDK is preferred for VM, volume, snapshot,
template, and desktop operations because it supplies the documented default
gateway URL. The browser client remains separate because it owns the
Playwright/CDP connection.

Browser calls:

- `new Solari({ apiKey })`
- `profiles.list/create/save`
- `launch({ profileId, recording, stealth, proxy })`
- `newPage`, `goto`, locators, `waitForEvent("download")`,
  `download.createReadStream`
- `browser.id`, `browser.close`, `solari.close`
- `sessions.getReplayUrl` or `downloadReplay` with bounded 404 polling

VM calls:

- `new SolariClient({ apiKey })`
- `pt.volumes.list/create/delete`
- `pt.sandboxes.create`, `connect`, `files.upload/readText/write`
- `commands.start` or a correctly backgrounded `commands.run`
- `createCodeContext`, `runCode`, `snapshot`, `kill`
- `previewUrl`
- `pt.sandboxes.createDesktop({ template: "office", volumes })` when enabled
- desktop `health`, `open`, `screenshot`, `streamUrl`, `close`, `kill`

All SDK calls must use the current documented camelCase TypeScript names. Do not
copy Python method names into TypeScript.

## 8. Data contract

Input CSV columns:

```text
recordId,title,organization,deadline,budget,status,documents
```

Normalized record fields:

```json
{
  "recordId": "T-1001",
  "title": "Network equipment supply",
  "organization": "Example City",
  "deadline": "2026-09-15",
  "budgetCents": 12500000,
  "status": "open",
  "documents": ["specification.pdf"],
  "valid": true,
  "validationErrors": []
}
```

The parser must preserve invalid rows with `valid: false` and explainable
`validationErrors`; it must not silently discard them.

Run layout:

```text
/data/runs/<run-id>/
  raw/records.csv
  normalized/normalized.json
  normalized/review.csv
  review/index.html
  manifest.json
```

## 9. Reliability and security

- Validate the API key before creating a remote resource in live mode.
- Never log credential values, raw cookies, profile storage state, or proxy
  vendor details.
- Use bounded retries with jitter only for transient operations and replay
  availability; do not retry deterministic 4xx errors.
- On browser failure, capture a screenshot if possible and continue cleanup.
- On processing failure, retain the raw artifact and write a failed manifest.
- On desktop capacity failure, retain the generated artifacts and report the
  review stage as skipped rather than losing the run.
- Avoid recording login/password input. If recording is enabled, document the
  retention responsibility to the caller.
- Do not submit irreversible portal actions in this example.
- Keep the preview server alive only while its sandbox is live.

## 10. Verification gates

- `npm install` succeeds from the example directory.
- `npm run typecheck` succeeds with no implicit Node type errors.
- `npm test` passes pure unit tests.
- `npm run dry` produces a valid manifest and all expected artifacts locally.
- Live fixture run succeeds with a real API key when supplied.
- Live run proves browser-to-sandbox transfer by reading the uploaded CSV from
  the sandbox, not by using a shared browser path.
- Live run proves volume persistence by reattaching a fresh sandbox and reading
  the manifest.
- Optional desktop run reports a ready health check, creates a screenshot, and
  can be watched through `streamUrl`.
- Every live resource is cleaned up; the volume is deleted only when explicitly
  requested.

## 11. Future product work

- Add portal-specific adapters with stronger auth flows, selector contracts,
  allowlists, and target-specific readiness checks.
- Add a service-level queue, cron trigger, tenant auth, and webhook delivery.
- Add PDF/OCR extraction in a custom template with explicit confidence scores.
- Add reviewer actions that are idempotent and require confirmation before any
  portal submission.
- Add authenticated artifact serving instead of direct public preview URLs.
- Add retention policies, encryption/key management, and enterprise deployment.
