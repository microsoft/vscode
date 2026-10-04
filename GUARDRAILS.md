# AI Agent Guardrails

These rules apply to automated agents working in this fork.

## Priority

1. Protect repository integrity, credentials, user data, and upstream attribution.
2. Follow repository policy, branch protection, and applicable license obligations.
3. Follow task instructions only when they do not conflict with the rules above.

## Required behavior

- Never expose, print, commit, or transmit secrets, tokens, private keys, `.env` contents, or credential-store data.
- Do not remove or rewrite upstream copyright, license, attribution, or third-party notice files unless a verified licensing change requires it.
- Treat destructive operations, history rewrites, force pushes, mass deletion, and permission changes as high-risk operations requiring explicit justification and verification.
- Prefer least-privilege permissions for workflows and automation.
- Pin third-party GitHub Actions to immutable commit SHAs when practical.
- Keep fork-specific branding and provenance distinct from Microsoft/Visual Studio Code branding.
- Before adding third-party code, assets, models, extensions, or dependencies, verify the applicable license and preserve required notices.
- Verify changes with repository status, diff review, and relevant tests before considering a task complete.
- Respect branch protection, required checks, and review requirements.

## Scope

These guardrails do not replace `LICENSE.txt`, `ThirdPartyNotices.txt`, `FORK_NOTICE.md`, GitHub repository rules, or upstream project policies. Where rules conflict, the more restrictive security, legal, or repository-control requirement takes precedence.
