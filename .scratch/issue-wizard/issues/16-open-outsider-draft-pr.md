# 16 — Open an outside-contributor draft pull request

**What to build:** Complete the verified-fix path for an outside contributor by reusing or explicitly creating a fork, pushing the approved fix branch there, and opening a draft pull request into microsoft/vscode.

**Blocked by:** 14 — Drive a confirmed bug to a reviewable local fix

**Status:** ready-for-agent

- [ ] The flow detects that direct microsoft/vscode push access is unavailable without presenting an access-level selector.
- [ ] An already configured or discoverable local fork and remote are reused without creating redundant repositories.
- [ ] If no fork can be discovered, the agent asks whether the user already has one on disk before proposing creation.
- [ ] Creating a GitHub fork, adding or changing a remote, and pushing a branch each require the applicable explanation and approval.
- [ ] The dedicated fix branch is pushed with a normal non-force push to the contributor's fork.
- [ ] The exact approved title, body, commits or diff summary, base and fork head, and attachments are used to open a draft pull request into microsoft/vscode.
- [ ] No labels or assignees are added automatically, and no unreviewed payload is published.
- [ ] When authenticated creation is unavailable, the reviewed state is preserved and a browser-ready pull-request handoff is provided.
- [ ] Fork, authentication, push, and draft-creation failures retain the local fix and offer the smallest useful recovery action.
- [ ] Controlled tests and a demo verify both existing-fork reuse and newly approved fork creation.
