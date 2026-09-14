# 04 — Read only approved VS Code logs

**What to build:** Let Issue Wizard locate and inspect relevant logs itself while keeping the user in control of sensitive diagnostic access. The workflow should be useful without asking the user to browse for log directories or paste raw files.

**Blocked by:** 01 — Launch Issue Wizard from the editor

**Status:** ready-for-agent

- [ ] Before invoking the log tool, the skill briefly explains why logs may help and asks for conversational consent.
- [ ] The dedicated log tool also requires the normal Agent Host approval before discovery or file content is returned.
- [ ] No logs are read or attached automatically, and denial returns no log data while allowing diagnosis to continue.
- [ ] The tool resolves the current product's log root through VS Code-owned environment information.
- [ ] Discovery and reads are bounded, and the agent can select only the log files and ranges relevant to the symptom.
- [ ] Paths outside the resolved log root, including traversal attempts and unrelated absolute paths, are rejected.
- [ ] Missing, rotated, or unreadable logs produce a useful recoverable result rather than ending the session.
- [ ] Contract tests verify approval and denial, root confinement, traversal rejection, bounded output, and failure behavior.
