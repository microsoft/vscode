# 02 — Launch Issue Wizard from the Agents Window

**What to build:** Let a user start the same Issue Wizard workflow from the Agents Window without leaving that surface. The Agents Window contribution should be a thin adapter over the shared launcher and should preserve the normal session experience.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** done

- [x] A bug-icon action appears in the Agents Window title bar immediately to the left of the account action in the bar containing “Open in Editor”.
- [x] The icon has a clear Issue Wizard tooltip, accessible name, and keyboard-accessible invocation.
- [x] Invoking the action creates and focuses a fresh issue-specific session in the Agents Window rather than opening it in the editor workbench.
- [x] The session displays the same provider-neutral bootstrap message and optional symptom behavior as the editor path.
- [x] The adapter reuses the shared launcher behavior rather than duplicating prompt, policy, or session-creation logic.
- [x] Surface-level tests verify contribution placement, accessibility, session creation, focus, and visible bootstrap behavior.

Proof: adapter tests cover contribution and bootstrap behavior, while a direct SessionsService test observes the fresh workspace and quick-chat sessions becoming rendered, active, and focused through the sessions-part boundary.
