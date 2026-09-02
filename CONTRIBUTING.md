# Contributing

Thanks for improving the Solari cookbook. Keep examples small, runnable, and
honest about the capabilities they require.

## Development setup

1. Fork the repository and create a focused branch from `main`.
2. Make changes in the relevant example or documentation.
3. Never commit `.env`, API keys, cookies, profile storage state, preview
   tokens, screenshots containing sensitive data, or generated `.runs` output.
4. Run the checks listed in the example README and the repository CI locally.
5. Open a pull request using the template. Explain live-provider or paid-plan
   checks separately from deterministic tests.

## Validation expectations

For TypeScript examples, run `npm ci` and the available `typecheck`, `test`,
`dry`, and `npm audit --omit=dev --audit-level=high` scripts. For Python
examples, install the example requirements and run `python -m compileall -q .`.
The portal worker additionally requires a real Solari key for its live fixture
smoke test; use a temporary volume and enable cleanup after the run.

## Pull requests

- Keep one coherent change per pull request.
- Include tests and documentation for behavior changes.
- Use conventional commit-style subjects, for example `feat:`, `fix:`,
  `docs:`, `test:`, or `chore:`.
- Do not merge around a failed required check. If a check is provider- or
  entitlement-gated, document the exact evidence and create a follow-up issue.

## Security-sensitive changes

Do not report undisclosed vulnerabilities in a public issue. Follow
[SECURITY.md](SECURITY.md) instead.
