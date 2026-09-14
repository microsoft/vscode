# 13 — Seed the historical visual-regression demo

**What to build:** Prepare a credible, repeatable visual bug for the draft-pull-request demonstration by selecting a recently fixed VS Code regression and safely reintroducing it without revealing the known solution to Issue Wizard.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] The selected regression has a clear original microsoft/vscode issue and pull request with useful before-and-after screenshots.
- [ ] The symptom is visually obvious, reproducible on the macOS demo environment, and small enough for a live investigation.
- [ ] The historical fix can be reverted in isolation without destabilizing unrelated product areas or requiring unavailable services.
- [ ] A controlled demo baseline reproduces the broken state and a separate evaluator reference preserves the known fixed state.
- [ ] Reproduction steps, expected appearance, actual appearance, build prerequisites, and reset instructions are documented for demonstrators.
- [ ] The investigating Issue Wizard session receives the symptom and user-visible evidence but not the historical commit, patch, or solution.
- [ ] The seeded regression builds and reproduces reliably in Code OSS before downstream fix work begins.
- [ ] If no suitable historical regression meets these constraints, a small purpose-built visual bug is prepared with equivalent before-and-after evidence and the substitution is documented.
