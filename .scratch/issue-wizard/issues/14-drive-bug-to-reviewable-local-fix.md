# 14 — Drive a confirmed bug to a reviewable local fix

**What to build:** Let Issue Wizard take the seeded visual regression from reproduction through diagnosis and a tested local Code OSS fix, while making the user's confirmation—not the agent's confidence—the gate for preparing a draft pull request.

**Blocked by:** 11 — Reproduce in a disposable macOS VS Code instance; 12 — Reach a runnable Code OSS contributor environment; 13 — Seed the historical visual-regression demo

**Status:** ready-for-agent

- [ ] The investigation begins from the seeded symptom and evidence without access to the historical fix.
- [ ] The agent reproduces the symptom in the appropriate isolated and Code OSS environments before changing source.
- [ ] Diagnosis and implementation use the normal agent, terminal, file, test, and optional approved diagnostic capabilities.
- [ ] The proposed change is narrowly scoped and passes the relevant automated checks.
- [ ] The user is asked to exercise the original reproduction and explicitly state whether the symptom is gone.
- [ ] Until the user confirms success, the agent does not offer to create or publish a pull request and instead continues diagnosis or refinement.
- [ ] After confirmation, the session shows the exact sanitized draft title and body, commit or diff summary, and every proposed attachment.
- [ ] Declining the draft review preserves the local change and session state without pushing or publishing anything.
- [ ] Demo evaluation may compare the result with the historical fix, but that reference remains outside the investigating agent's context.
