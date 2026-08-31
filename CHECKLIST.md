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
- [ ] Commit reviewed specification and checklist.

## Phase 2 — Example scaffold

- [ ] Create `examples/portal-ops-worker-ts/`.
- [ ] Add `package.json` with pinned compatible SDK ranges, `tsx`, TypeScript,
      `@types/node`, and scripts: `start`, `dry`, `test`, `typecheck`.
- [ ] Add `.env.example` with safe fixture defaults and explicit live options.
- [ ] Add README with architecture, run commands, lifecycle gotchas, security
      warnings, and external-portal adapter notes.
- [ ] Add a strict `tsconfig.json`.
- [ ] Add initial unit-test harness.
- [ ] Run install and typecheck.
- [ ] Mark this phase complete and commit it.

## Phase 3 — Pure workflow core

- [ ] Implement validated config parsing.
- [ ] Implement CSV parsing with quoted-field support and helpful errors.
- [ ] Implement deterministic normalization: dates, currency, status, lists,
      duplicate IDs, and invalid-row preservation.
- [ ] Implement HTML escaping for review artifacts.
- [ ] Implement run-id and run-directory generation without path traversal.
- [ ] Implement manifest schema and redaction helpers.
- [ ] Add unit tests for happy paths, malformed CSV, duplicate IDs, invalid
      currency/deadline, HTML escaping, and unique run directories.
- [ ] Run `npm test` and mark every corresponding test item done.
- [ ] Commit the pure workflow core.

## Phase 4 — Deterministic fixture portal

- [ ] Add a fixture portal server using only Node standard library.
- [ ] Add login, cookie session, records page, and CSV download endpoints.
- [ ] Add a deliberately invalid record and a duplicate to exercise validation.
- [ ] Add fixture-only credentials that are never used as production secrets.
- [ ] Add fixture tests for login, protected records, and download response.
- [ ] Run tests and commit the fixture.

## Phase 5 — Live Solari workflow

- [ ] Create/reuse a durable Solari volume by name.
- [ ] Create the workspace sandbox and write/start the fixture portal.
- [ ] Resolve a preview URL and wait for readiness with bounded polling.
- [ ] Launch the browser with a profile; use stealth/proxy only when explicitly
      enabled for an authorized external portal.
- [ ] Navigate, authenticate, and download the CSV using the download event.
- [ ] Transfer download bytes to the sandbox with `files.upload`.
- [ ] Snapshot the prepared workspace and create the processing sandbox from the
      snapshot with the volume attached.
- [ ] Run stateful sandbox `runCode` to normalize and write output artifacts.
- [ ] Read the normalized output and create the review HTML/manifest.
- [ ] Serve the review directory with `previewUrl` and verify it from the host.
- [ ] Prove volume persistence by reading the manifest from a fresh sandbox.
- [ ] Clean up browser, processing sandbox, and workspace in all paths.
- [ ] Mark completed items in this checklist and commit the live workflow.

## Phase 6 — Browser evidence and optional desktop review

- [ ] Add opt-in `RECORDING=1` handling.
- [ ] Capture a replay URL/download after release with bounded 404 polling.
- [ ] Ensure login/password steps are excluded or explicitly warned about when
      recording is enabled.
- [ ] Add opt-in `ENABLE_DESKTOP=1` office desktop creation with the same volume.
- [ ] Wait for desktop health readiness.
- [ ] Open `review.csv` in LibreOffice and capture a PNG screenshot.
- [ ] Print `streamUrl` and document human review/takeover.
- [ ] Treat desktop capacity failure as a retained-artifact warning.
- [ ] Test teardown for browser, sandbox, and desktop independently.
- [ ] Commit evidence and desktop work.

## Phase 7 — Testing and hardening

- [ ] `npm install` from a clean example directory.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run dry` passes twice and produces isolated run directories.
- [ ] Live fixture run passes with a real API key, if available.
- [ ] Live preview returns the review page and manifest.
- [ ] Live volume reattach returns the same manifest.
- [ ] Failure injection proves cleanup and failed-manifest behavior.
- [ ] No API key, password, cookie, or proxy credential appears in logs or files.
- [ ] `git diff --check` passes.
- [ ] Mark each verified gate and commit the hardening changes.

## Phase 8 — Final audit

- [ ] Review every SPEC requirement against current files and test evidence.
- [ ] Review all unchecked items and either complete them or document why they
      are explicitly future work.
- [ ] Confirm `git status` is clean except intentional generated/ignored files.
- [ ] Confirm commit history contains separate cleanup, spec, scaffold/core,
      workflow, evidence, and hardening commits.
- [ ] Provide final report separating offline-verified behavior from live API or
      desktop-capacity-gated behavior.

## Deferred product work

- [ ] Authorized procurement portal adapter.
- [ ] External scheduler, queue, webhook, tenant auth, and billing.
- [ ] PDF/OCR extraction and confidence scoring.
- [ ] Authenticated preview/artifact gateway.
- [ ] Idempotent human-approved portal submission.
