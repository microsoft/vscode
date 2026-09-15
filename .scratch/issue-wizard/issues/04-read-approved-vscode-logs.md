# 04 — Read only approved VS Code logs

**What to build:** Let Issue Wizard locate and inspect relevant logs itself while keeping the user in control of sensitive diagnostic access. The workflow should be useful without asking the user to browse for log directories or paste raw files.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** done

- [x] Before invoking the log tool, the skill briefly explains what it wants to search and that logs may contain sensitive context, then invokes the tool in the same response; the normal Agent Host approval card is the single consent surface.
- [x] The dedicated log tool also requires the normal Agent Host approval before discovery or log content is returned.
- [x] No logs are read or attached automatically, and denial returns no log data while allowing diagnosis to continue.
- [x] The tool resolves the current product's log root through VS Code-owned environment information and discovers registered Output channels.
- [x] Discovery and literal searches are bounded, and the agent can select only the current-run sources and terms relevant to the symptom.
- [x] Paths outside the resolved log root, including traversal attempts and unrelated absolute paths, are rejected.
- [x] Missing, rotated, or unreadable logs produce a useful recoverable result rather than ending the session.
- [x] Serial searches allow one session approval to cover later reads without stacking confirmation prompts.
- [x] When ordinary logs are insufficient, the skill guides the user through narrow Trace logging, reload or restart, one reproduction, a fresh search, and restoring the previous level.
- [x] Contract tests verify approval and denial, root confinement, traversal rejection, bounded output, and failure behavior.
