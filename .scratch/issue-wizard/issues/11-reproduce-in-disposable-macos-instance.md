# 11 — Reproduce in a disposable macOS VS Code instance

**What to build:** Let Issue Wizard test whether a symptom survives in a clean, disposable desktop instance while the user's original support session remains open and understandable.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] The flow can launch a second macOS process for either an installed VS Code product or a Code OSS development build.
- [ ] The test process uses isolated user-data and extension state and does not modify the user's normal profile.
- [ ] The original process and Issue Wizard session remain running throughout the isolated reproduction.
- [ ] The agent clearly tells the user which window is the test instance and what focused reproduction action is needed.
- [ ] Product launch does not assume that a code or code-insiders command is on PATH.
- [ ] Existing terminal and desktop-automation capabilities can opt into remote debugging when needed; no dedicated CDP product tool is introduced.
- [ ] The result distinguishes a clean-profile reproduction from a profile-specific symptom and feeds that fact back into the support session.
- [ ] Temporary processes and profile state are retained when needed for diagnosis and otherwise cleaned up safely with user-visible confirmation.
- [ ] macOS integration and manual tests cover installed VS Code, Code OSS, process-launch failure, user cancellation, and preservation of the original session.
