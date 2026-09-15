# 17 — Rehearse the five MVP demos and safety gates

**What to build:** Turn the completed Issue Wizard slices into a reliable hackathon story that proves the five distinct support outcomes for both ordinary users and experienced contributors while preserving privacy, accessibility, and human control.

**Blocked by:** 02 — Launch Issue Wizard from the Agents Window; 05 — Resolve a setting-caused problem; 06 — Resolve a problem by updating VS Code; 07 — Resolve or route an extension-caused problem; 10 — Publish an approved issue or comment; 15 — Open a collaborator draft pull request; 16 — Open an outside-contributor draft pull request

**Status:** ready-for-agent

- [ ] Five repeatable scripts cover the setting, update, extension, high-quality issue, and verified-fix-to-draft-PR outcomes.
- [ ] The draft-PR script uses the controlled visual regression and requires the demo user to confirm that the symptom is gone before publication is offered.
- [ ] The issue script demonstrates duplicate search, sanitization, the hidden marker, exact text-and-attachment review, and both authenticated and browser-handoff behavior.
- [ ] The PR script demonstrates both direct collaborator and outside-contributor fork routing without noisy narration of irrelevant checks.
- [ ] One profile represents an ordinary macOS user without Git, GitHub CLI, GitHub authentication, or a VS Code launcher on PATH.
- [ ] A second profile represents an experienced VS Code contributor with an existing checkout and authenticated tooling.
- [ ] Editor and Agents Window entry points, focus behavior, accessible names, tooltips, and keyboard operation are exercised.
- [ ] Diagnostic denial, missing logs, failed search, failed isolated launch, and unavailable publication preserve useful session state and show recovery actions.
- [ ] Every proposed public payload and attachment receives a privacy review, and nothing is posted before explicit acknowledgement.
- [ ] Copilot is used for the hackathon run while the scripts and product behavior remain provider-neutral.
- [ ] Rehearsal results, known limitations, reset steps, and the macOS-only MVP boundary are documented for the demo team.
