# 10 — Publish an approved issue or comment

**What to build:** Let Issue Wizard publish the already reviewed issue or comment through an existing authenticated GitHub route while guaranteeing that the posted payload is the payload the user approved.

**Blocked by:** 09 — Prepare a privacy-reviewed issue or comment

**Status:** ready-for-agent

- [ ] The flow quietly detects whether an authenticated GitHub CLI or VS Code GitHub authentication can post the approved artifact.
- [ ] The agent uses only an already approved title, body or comment, and attachment set; any payload change triggers a new review.
- [ ] The user receives a final consequential-action approval before the post is sent.
- [ ] New microsoft/vscode issues include the invisible Issue Wizard marker and omit labels and assignees.
- [ ] A matching issue receives the approved comment rather than a duplicate issue.
- [ ] If authentication is unavailable, cancelled, or lost, the prepared artifact remains intact and the browser-ready fallback is offered.
- [ ] API, permission, validation, and attachment failures preserve the draft and report the narrow recovery action.
- [ ] Automated tests use controlled GitHub boundaries, and any live hackathon publication occurs only after explicit real-time user approval.
