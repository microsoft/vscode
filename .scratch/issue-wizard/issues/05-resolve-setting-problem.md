# 05 — Resolve a setting-caused problem

**What to build:** Deliver a complete support path in which Issue Wizard diagnoses a deterministic user-visible symptom as a settings problem, explains the smallest corrective change, and verifies the result with the user.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** done

- [x] A deterministic macOS demo scenario starts from a symptom that is caused by one documented VS Code setting.
- [x] The skill gathers only the missing facts needed to distinguish the setting from an update, extension, or product bug.
- [x] The agent does not install Git, clone source, require GitHub, or perform contributor setup for this route.
- [x] Before changing a setting itself, the agent explains the change and obtains the applicable user or tool approval.
- [x] The recommendation identifies the exact setting and expected effect in concise user-facing language.
- [x] The flow asks the user to verify the symptom after the change and records whether it is resolved.
- [x] A resolved setting scenario ends without proposing an issue or pull request.
- [x] The scenario is documented and repeatable for a hackathon demonstration, with behavior checked at the session boundary rather than by asserting model prose.
