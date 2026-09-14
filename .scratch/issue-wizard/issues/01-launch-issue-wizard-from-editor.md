# 01 — Launch Issue Wizard from the editor

**What to build:** Give a VS Code user a complete first Issue Wizard experience from the editor workbench. The new command and editor entry points should open a fresh, editor-local Agent Host session, visibly invoke the provider-neutral Issue Wizard skill, and begin intake without changing the existing Issue Reporter.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] “Help: Troubleshoot with Issue Wizard...” is available from the Command Palette and Help menu.
- [ ] A “$(bug) Issue Wizard” status bar entry invokes the same command and has an explanatory tooltip and accessible name.
- [ ] Every invocation creates a fresh issue-specific session in the editor workbench and does not redirect the user into the Agents Window.
- [ ] The session contains a short, visible bootstrap message that invokes the bundled Issue Wizard skill.
- [ ] A supplied symptom is preserved in the bootstrap message; without one, the first agent question is “What’s going wrong?”
- [ ] The minimal skill behaves as a concise support agent and does not present an expertise selector.
- [ ] The launcher remains provider-neutral and exposes an understandable unavailable state when agent support is disabled or unavailable.
- [ ] High-level command tests verify session creation, focus, bootstrap visibility, optional symptom handling, and failure behavior without asserting private implementation structure.
