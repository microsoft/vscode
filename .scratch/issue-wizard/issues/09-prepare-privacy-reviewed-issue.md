# 09 — Prepare a privacy-reviewed issue or comment

**What to build:** Give the user a complete, sanitized VS Code issue or existing-issue comment that they can knowingly approve and post through a browser, including all relevant context but no unreviewed diagnostic material.

**Blocked by:** 03 — Identify the running VS Code build with approval; 04 — Read only approved VS Code logs; 08 — Find matching GitHub issues without requiring setup

**Status:** ready-for-agent

- [ ] The flow chooses a new issue only when no existing issue is a suitable destination for the evidence.
- [ ] A new issue draft includes a concise title, expected and actual behavior, reproducible steps, and only relevant approved environment information.
- [ ] A matching-issue path prepares a focused comment that adds new evidence instead of duplicating the report.
- [ ] Tokens, secrets, personal paths, machine identifiers, and unrelated log content are removed from proposed public text and files.
- [ ] The exact sanitized title and body or comment are shown to the user before any publication handoff.
- [ ] Every proposed screenshot, log excerpt, or other attachment is enumerated and previewed or described for explicit acknowledgement.
- [ ] The final acknowledgement covers the sanitized text and all attachments together, and declining it preserves the draft.
- [ ] A new issue includes an invisible Issue Wizard HTML marker and does not request labels or assignees.
- [ ] When no authenticated posting route exists, the flow provides a browser-ready draft and a clear manual posting action.
- [ ] Tests and a manual scenario verify duplicate handling, sanitization, attachment review, the marker, decline behavior, and the unauthenticated browser path.
