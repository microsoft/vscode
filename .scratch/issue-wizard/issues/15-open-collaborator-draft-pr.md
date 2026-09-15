# 15 — Open a collaborator draft pull request

**What to build:** Complete the verified-fix path for a microsoft/vscode collaborator by quietly choosing the direct repository route, then pushing and opening only the draft pull request the user reviewed.

**Blocked by:** 14 — Drive a confirmed bug to a reviewable local fix

**Status:** ready-for-agent

- [ ] The flow detects collaborator push permission and a suitable microsoft/vscode remote without asking the user to classify their access.
- [ ] Capability checks stay in the background unless a permission or remote problem changes the user's next action.
- [ ] The exact draft title, body, commits or diff summary, base and head branches, and attachments remain visible for acknowledgement.
- [ ] Pushing the dedicated fix branch is explained and approved as a consequential external action.
- [ ] The push is a normal non-force push and never overwrites unrelated shared work.
- [ ] The approved branch is pushed directly to microsoft/vscode and opened as a draft pull request against the intended base.
- [ ] The draft is not assigned or labeled automatically and contains no payload or attachment that was not approved.
- [ ] Permission, push, validation, and pull-request creation failures preserve the local fix and reviewed draft with a narrow recovery path.
- [ ] Controlled tests and a demo verify the collaborator route without falling through to fork creation.
