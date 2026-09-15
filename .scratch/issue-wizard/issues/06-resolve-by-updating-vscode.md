# 06 — Resolve a problem by updating VS Code

**What to build:** Deliver a complete support path in which Issue Wizard uses approved running-build information to recognize that a symptom is already fixed in a newer appropriate VS Code build and guides the user to update.

**Blocked by:** 03 — Identify the running VS Code build with approval

**Status:** in-progress

- [x] A deterministic demo scenario represents a symptom whose fix is available in a newer VS Code build or channel.
- [x] The skill requests approved version, quality, and commit metadata instead of assuming a command-line launcher exists.
- [x] The recommendation names the appropriate update or product channel and explains why it applies to the reported symptom.
- [x] Search and diagnosis remain possible without installing Git or the GitHub CLI and without requiring a GitHub account.
- [x] The agent does not start source setup or issue publication when updating is the cheapest correct resolution.
- [x] The user is asked to verify the symptom after updating or restarting when that is practical.
- [x] The scenario remains recoverable when metadata access is denied or an update cannot be installed during the session.
- [ ] Live materialized-session end-to-end rehearsal verifies the user-visible recommendation and outcome without depending on exact incidental agent wording.

**Dependency note:** Current evidence is a handwritten transcript evaluation only. This ticket remains open until a true materialized-session rehearsal is run and recorded.
