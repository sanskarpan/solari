# Portal-to-Decision Pack — CHECKLIST

Phases are sequential unless marked `(P)`. Every checked item must have command
or file evidence. Update this file in the same commit as the completed work.

## Phase 0 — Preflight and cleanup

- [x] Remove the obsolete scraper-factory `SPEC.md` and `CHECKLIST.md`.
- [x] Record the cleanup as commit `969bcc7`.
- [x] Re-read the current Solari docs for sessions, browser driving, profiles,
      recording, sandboxes, snapshots, volumes, VMs, templates, errors, and
      pricing before implementation.
- [x] Confirm current published package versions before writing package.json:
      browser `0.1.1`, umbrella SDK `0.1.2`.
- [x] Confirm the worktree contains no API keys or tracked generated artifacts;
      prior diagnostic `node_modules` remain ignored and untracked.

## Phase 1 — Specification review

- [x] Review `SPEC.md` against the current SDK type declarations and docs.
- [x] Confirm browser↔sandbox transfer is explicit and documented.
- [x] Confirm volume writes are per-run/per-worker and race-free.
- [x] Confirm preview, recording, profile, and desktop security caveats are
      represented.
- [x] Commit reviewed specification and checklist (`843dcef`).

## Phase 2 — Example scaffold

- [x] Create `examples/portal-ops-worker-ts/`.
- [x] Add `package.json` with pinned compatible SDK ranges, `tsx`, TypeScript,
      `@types/node`, and scripts: `start`, `dry`, `test`, `typecheck`.
- [x] Add `.env.example` with safe fixture defaults and explicit live options.
- [x] Add README with architecture, run commands, lifecycle gotchas, security
      warnings, and external-portal adapter notes.
- [x] Register the workflow in the root browser, sandbox, and desktop example
      catalog.
- [x] Add a strict `tsconfig.json`.
- [x] Add initial unit-test harness.
- [x] Run install, typecheck, unit tests, dry run, and `git diff --check`.
- [x] Mark this phase complete and commit it.

## Phase 3 — Pure workflow core

- [x] Implement validated config parsing.
- [x] Implement CSV parsing with quoted-field support and helpful errors.
- [x] Implement deterministic normalization: dates, currency, status, lists,
      duplicate IDs, and invalid-row preservation.
- [x] Runtime-validate sandbox normalized JSON before allowing it into the
      manifest or review artifacts.
- [x] Reject semantically contradictory normalized records where `valid` does
      not match the presence of `validationErrors`.
- [x] Implement HTML escaping for review artifacts.
- [x] Implement run-id and run-directory generation without path traversal.
- [x] Use cryptographically generated run-id suffixes to reduce concurrent
      directory collision risk.
- [x] Implement manifest schema and redaction helpers.
- [x] Runtime-validate persisted manifests, including status, source, counts,
      artifact paths, timestamps, and optional evidence fields.
- [x] Persist and validate the optional desktop review outcome so capacity
      skips are durable evidence rather than log-only state.
- [x] Reject invalid or backwards manifest timestamps during reattachment.
- [x] Add unit tests for happy paths, malformed CSV, duplicate IDs, invalid
      currency/deadline, HTML escaping, and unique run directories.
- [x] Run `npm test` and mark every corresponding test item done.
- [x] Commit the pure workflow core.

## Phase 4 — Deterministic fixture portal

- [x] Add a fixture portal server using only Python standard library available in
      the documented base sandbox image.
- [x] Add login, cookie session, records page, and CSV download endpoints.
- [x] Add a deliberately invalid record and a duplicate to exercise validation.
- [x] Add fixture-only credentials that are never used as production secrets.
- [x] Add fixture tests for login, protected records, and download response.
- [x] Run tests, Python syntax validation, and commit the fixture.

## Phase 5 — Live Solari workflow

- [x] Create/reuse a durable Solari volume by name.
- [x] Create the workspace sandbox and write/start the fixture portal.
- [x] Resolve a preview URL and wait for readiness with bounded polling.
- [x] Launch the browser with a profile; use stealth/proxy only when explicitly
      enabled for an authorized external portal.
- [x] Support typed proxy tier/sticky-session and managed CAPTCHA options with
      validation; keep them disabled by default and cost-free for the fixture.
- [x] Extract and unit-test the browser launch policy so default and resilient
      sessions cannot silently diverge.
- [x] Bound streamed portal downloads with `MAX_DOWNLOAD_BYTES` to prevent an
      untrusted response from causing unbounded coordinator memory growth.
- [x] Navigate, authenticate, and download the CSV using the download event.
- [x] Transfer download bytes to the sandbox with `files.upload`.
- [x] Snapshot the prepared workspace and create the processing sandbox from the
      snapshot with the volume attached.
- [x] Run stateful sandbox `runCode` to normalize and write output artifacts.
- [x] Read the normalized output and create the review HTML/manifest.
- [x] Serve the review directory with `previewUrl` and verify it from the host.
- [x] Prove volume persistence by reading the manifest from a fresh sandbox.
- [x] Clean up browser, processing sandbox, and workspace in all paths.
- [x] Keep volume discovery inside the same lifecycle boundary so client cleanup
      also runs when volume list/create fails.
- [x] Implement best-effort browser failure screenshots into the retained run
      directory; screenshot execution remains part of the live environment gate.
- [x] Mark completed implementation items in this checklist and commit the live
      workflow; live execution remains a Phase 7 environment gate.

## Phase 6 — Browser evidence and optional desktop review

- [x] Add opt-in `RECORDING=1` handling.
- [x] Capture a replay URL/download after release with bounded 404 polling.
- [x] Ensure login/password steps are excluded or explicitly warned about when
      recording is enabled.
- [x] Add opt-in `ENABLE_DESKTOP=1` office desktop creation with the same volume.
- [x] Wait for desktop health readiness.
- [x] Open `review.csv` in LibreOffice and capture a PNG screenshot.
- [x] Print `streamUrl` and document human review/takeover.
- [x] Treat desktop capacity failure as a retained-artifact warning.
- [x] Test teardown for browser, sandbox, and desktop independently with a
      failure-isolating cleanup unit test.
- [x] Commit evidence and desktop work with the workflow hardening changes.

## Phase 7 — Testing and hardening

- [x] `npm install` from a clean example directory (`npm ci` in a temporary
      copy) succeeds with zero reported vulnerabilities.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes: 17 tests.
- [x] `npm run dry` passes twice and produces isolated run directories with the
      expected 4/1/3 record counts.
- [x] Dry-run artifact contract includes raw CSV, normalized JSON, review CSV,
      HTML, and the manifest itself.
- [x] Serve a dry-run review tree over local HTTP and verify the dashboard plus
      every artifact link resolves successfully.
- [ ] Live fixture run passes with a real API key, if available.
- [ ] Live preview returns the review page and manifest.
- [ ] Live volume reattach returns the same manifest.
- [x] Failure injection is wired after transfer, and failed-manifest behavior is
      covered by the redaction/manifest contract test; live execution remains
      environment-gated.
- [x] Offline source/log review finds no API key, password, cookie, or proxy
      credential emission; live output remains environment-gated.
- [x] `git diff --check` passes.
- [x] Mark each offline-verified gate and commit the hardening changes.

## Phase 8 — Final audit

- [x] Review every SPEC requirement against current files and test evidence;
      the three live API gates above remain explicitly unverified because no
      `SOLARI_API_KEY` is available in this environment.
- [x] Review all unchecked items and document the live gates and deferred
      product work rather than claiming them as complete.
- [x] Confirm `git status` is clean except intentional generated/ignored files.
- [x] Confirm commit history contains separate cleanup, spec, scaffold/core,
      workflow, and hardening commits; evidence/desktop work is included in the
      hardening commit.
- [x] Provide a final report separating offline-verified behavior from live API
      or desktop-capacity-gated behavior.

## Deferred product work

- [ ] Portal-specific procurement adapter with allowlist and target-specific
      authentication/readiness checks.
- [ ] External scheduler, queue, webhook, tenant auth, and billing.
- [ ] PDF/OCR extraction and confidence scoring.
- [ ] Authenticated preview/artifact gateway.
- [ ] Idempotent human-approved portal submission.
