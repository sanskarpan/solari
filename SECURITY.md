# Security policy

## Scope

This repository contains runnable examples for cloud browsers, sandboxes, and
desktops. Examples may interact with credentials, authenticated profiles,
public preview URLs, downloaded documents, or recorded sessions. Treat all of
those as sensitive unless explicitly marked as fixture data.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository, or
contact the repository maintainer privately through GitHub. Do not open a
public issue for an undisclosed credential leak, authentication bypass,
arbitrary command execution, or data exposure.

Include the affected path, reproduction steps, impact, and a proposed
mitigation if known. Do not include real API keys or personal data in the
report.

## Key and artifact handling

- Store `SOLARI_API_KEY` only in the environment or a local untracked `.env`.
- Rotate a key immediately if it is pasted into chat, a ticket, a terminal log,
  or a repository.
- Do not persist cookies, profile storage state, proxy credentials, CAPTCHA
  data, preview bearer tokens, or raw production documents in git.
- Put authentication in front of production preview/artifact URLs.
- Disable recording for login flows unless the retention and access policy is
  understood.
