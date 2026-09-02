# Portal-to-Decision Pack (TypeScript)

This example turns an authorized portal workflow into a reviewable business
artifact. It starts a deterministic portal fixture in a Solari sandbox, uses a
Solari browser to log in and download a CSV, explicitly transfers the bytes into
an isolated processing sandbox, normalizes the records with `runCode`, persists
artifacts on a volume, and serves a review page with `previewUrl`. An optional
desktop stage opens the CSV in LibreOffice for human verification.

The fixture is intentionally deterministic. To connect an authorized external
portal, set `PORTAL_URL=https://...` and `ALLOW_EXTERNAL_PORTAL=1`, then override
the four `PORTAL_*_SELECTOR` values if its login/download DOM differs. Keep an
allowlist and an approval boundary before production use.

## Run

```bash
cd examples/portal-ops-worker-ts
npm install
cp .env.example .env

# No API key: exercise the parser, manifest, and artifact contract locally.
npm run dry

# Live Solari fixture workflow.
export SOLARI_API_KEY=slr_live_...
npm start

# Authorized external HTTPS portal with the same workflow.
PORTAL_URL=https://portal.example.test/records ALLOW_EXTERNAL_PORTAL=1 npm start

# Optional: enable browser replay and desktop review.
RECORDING=1 ENABLE_DESKTOP=1 npm start

# Optional authorized-target browser resilience features. These may incur
# proxy/CAPTCHA usage; keep disabled for the synthetic fixture.
ENABLE_STEALTH=1 PROXY_TIER=residential PROXY_SESSION=warm-1 CAPTCHA=1 npm start

# Test-only: force a post-transfer failure and retain a failed manifest.
FAIL_AFTER_DOWNLOAD=1 npm start
```

The live run prints the review URL, volume/run paths, and (when enabled) the
desktop `streamUrl`. The preview URL is public-facing; do not expose sensitive
production artifacts without putting an authenticated application in front of
it. The browser recording is also sensitive: Solari documents that input values
can be captured by default.

## What the run proves

```text
browser download → host transfer → sandbox files.upload → volume
                                         ↓
                                  sandbox runCode
                                         ↓
                              review page + CSV + manifest
                                         ↓
                         optional LibreOffice desktop review
```

Browser and sandbox sessions do not share a filesystem. The host transfer is
deliberate. Each run gets its own directory, so concurrent jobs cannot corrupt a
single shared `results.json`.

## Lifecycle gotchas

- `browser.close()` releases the browser; call `solari.close()` as well in Node.
- `sandbox.kill()` destroys a VM; `sandbox.close()` only closes its channel.
- `timeoutMs` is a rolling idle window.
- `commands.run` is not shell-interpreted; use `args` or `sh -c`.
- Snapshots preserve machine state; volumes preserve run artifacts.
- Desktop capacity can be unavailable even when browser/sandbox capacity exists.
- `FAIL_AFTER_DOWNLOAD=1` is an intentional live-path failure test; it should
  leave the raw transfer and a failed manifest on the volume before cleanup.
- Never log API keys, profile storage state, passwords, or proxy credentials.

Source: [`index.ts`](index.ts)
