---
agent: agent
---

> **Fork notice:** This is [sergey-zinchenko/vscode](https://github.com/sergey-zinchenko/vscode), not vanilla [microsoft/vscode](https://github.com/microsoft/vscode). Read [FORK.md](../../FORK.md) before making changes. Key fork areas: DIAL (`extensions/dial-chat-model-provider/`), BYOK (`src/vs/workbench/contrib/chat/`, `extensions/copilot/`).

Read the changes introduced on the current branch, including BOTH:

1. Uncommitted workspace modifications (staged and unstaged)
2. Committed changes that are on the current HEAD but not yet in the default upstream branch (e.g. `origin/main`)

Guidance:

- First, capture uncommitted diffs (equivalent of `git diff` and `git diff --cached`).
- Then, determine the merge base with the default branch (assume `origin/main` unless configured otherwise) using `git merge-base HEAD origin/main` and diff (`git diff <merge-base>...HEAD`) to include committed-but-unpushed work.

After understanding all of these changes, read every instruction file under `.github/instructions` and assess whether any instruction is invalidated. If so, propose minimal, necessary wording updates. If no updates are needed, respond exactly with: `No updates needed`.

Be concise and conservative: only suggest changes that are absolutely necessary.
