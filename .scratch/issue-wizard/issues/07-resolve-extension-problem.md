# 07 — Resolve or route an extension-caused problem

**What to build:** Deliver a complete support path in which Issue Wizard distinguishes an extension problem from a VS Code product bug, helps the user disable the responsible extension, and points an unresolved extension defect to its owning repository.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] A deterministic macOS demo scenario exposes a symptom caused by a known test extension or extension configuration.
- [ ] The investigation narrows the cause without disabling unrelated extensions or requiring a source checkout.
- [ ] Before disabling an extension or changing its configuration, the agent explains the action and obtains the applicable approval.
- [ ] The user is asked to verify that the symptom is gone with the extension disabled.
- [ ] When disablement resolves the problem, the flow clearly identifies the extension as the owner and does not propose a microsoft/vscode issue.
- [ ] When a report is still useful, the flow identifies the extension's issue tracker and prepares a reviewable handoff without publishing automatically.
- [ ] The route works for users without Git, the GitHub CLI, or GitHub authentication.
- [ ] The repeatable demo checks the support outcome rather than asserting the agent's internal reasoning sequence.
