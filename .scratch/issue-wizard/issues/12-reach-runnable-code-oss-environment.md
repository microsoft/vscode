# 12 — Reach a runnable Code OSS contributor environment

**What to build:** Let Issue Wizard move a confirmed product bug into a runnable Code OSS environment by reusing an experienced contributor's setup or guiding a newcomer through only the setup that is actually required.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] Source setup is proposed only after the investigation has a credible VS Code product bug and the user chooses to pursue a fix.
- [ ] The skill detects an existing vscode checkout, remotes, Git, runtime, package-manager, and build prerequisites before asking setup questions.
- [ ] A ready contributor environment takes the fast path without reinstalling dependencies or narrating checks that do not affect the user.
- [ ] A partial environment receives the smallest missing setup steps, grounded in the current VS Code contribution guide.
- [ ] A newcomer is not assumed to have Git, a fork, a GitHub account, or a launcher on PATH.
- [ ] Cloning, installing dependencies, signing in, changing remotes, or other consequential work is explained and approved before it occurs.
- [ ] The user can stop at a reportable issue without being forced through contributor setup.
- [ ] Successful completion produces a Code OSS build that can be launched for reproduction while preserving the support session.
- [ ] The path can later delegate lengthy setup to grouped sessions, but the MVP succeeds without requiring automated subagent orchestration.
- [ ] Manual coverage exercises both a clean newcomer profile and an existing contributor checkout, including a recoverable failed setup.
