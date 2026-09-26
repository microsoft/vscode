---
name: cli-review
description: >
  Runs a Greptile CLI review for the current local branch, installing or authenticating the CLI
  when needed, then summarizes JSON findings for the user. Use when the user wants Greptile
  feedback before opening a PR, outside a hosted PR review flow, or directly from a local checkout.
license: MIT
metadata:
  author: greptileai
  version: "1.0"
allowed-tools: Bash(git:*) Bash(greptile:*) Bash(command:*) Bash(curl:*) Bash(npm:*)
---

# CLI Review

Run a Greptile review from the local checkout and summarize the findings.

## Instructions

### 1. Confirm repository context

Start from the current repository root:

```bash
git rev-parse --show-toplevel
```

If the command fails, tell the user that the Greptile CLI review must be run from a git repository.

### 2. Check for the Greptile CLI

Check whether `greptile` is installed:

```bash
command -v greptile
```

If it is missing, do not install it automatically. Ask the user for permission, then show the recommended install command:

```bash
npm i -g greptile
```

If npm is unavailable, offer the shell installer fallback:

```bash
curl -fsSL "https://greptile.com/cli/install" | sh
```

After installation, re-run `command -v greptile`.

### 3. Ensure authentication

Check the signed-in account:

```bash
greptile whoami
```

If the CLI reports that authentication is missing, run:

```bash
greptile login
```

Wait for the user to complete the login flow before continuing.

### 4. Run the review

Prefer JSON output:

```bash
greptile review --json
```

If JSON output is unsupported or fails with a usage error, fall back to:

```bash
greptile review --agent
```

Do not hide the raw command failure if both commands fail. Summarize the failing command and the next action the user needs to take.

### 5. Summarize results

Parse JSON output when available and report:

- Review status
- Number of findings
- Highest severity findings first
- Files that need edits
- Suggested next command or fix path

When output is plain text, preserve the same structure as much as possible. Keep the summary concise and focused on actionable findings.
