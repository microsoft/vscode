# 08 — Find matching GitHub issues without requiring setup

**What to build:** Let Issue Wizard search microsoft/vscode for likely duplicate issues and explain useful matches without making GitHub tooling, authentication, or account creation a prerequisite.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] The skill derives a focused issue-search query from the reported title, symptom, and relevant terms.
- [ ] When an authenticated GitHub CLI is already available, the search reuses it without narrating irrelevant capability checks.
- [ ] Without a usable GitHub CLI, the search falls back to the anonymous GitHub Search Issues REST API.
- [ ] The anonymous query is correctly encoded and scoped to open or closed issues in microsoft/vscode as appropriate.
- [ ] Search never installs the GitHub CLI, requires sign-in, or asks the user to create an account.
- [ ] Results are summarized with a concise explanation of why each likely match is relevant.
- [ ] A strong match is preferred as the destination for new evidence; no issue or comment is created by this ticket.
- [ ] Rate limits, network failures, malformed responses, and no-result searches preserve the investigation and offer a useful fallback.
- [ ] Tests cover both search transports, transport selection, query scope, relevance presentation, and recoverable failures.
