---
name: generate-run-commands
description: Generate or modify run commands for the current session. Use when the user wants to set up or update run commands that appear in the session's Run button.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Generate Run Commands

Help the user set up run commands for the current Agent Session workspace. Run commands appear in the session's Run button in the title bar.

## Understanding the task schema

A run command is a `tasks.json` task with:
- `"inSessions": true` — required: makes the task appear in the Sessions run button
- `"runOptions": { "runOn": "worktreeCreated" }` — optional: auto-runs the task whenever a new worktree is created (use for setup/install commands)

```json
{
  "tasks": [
    {
      "label": "Install dependencies",
      "type": "shell",
      "command": "npm install",
      "inSessions": true,
      "runOptions": { "runOn": "worktreeCreated" }
    },
    {
      "label": "Start dev server",
      "type": "shell",
      "command": "npm run dev",
      "inSessions": true
    }
  ]
}
```

## Decision logic

**First, read the existing `.vscode/tasks.json`** to check for existing run commands (`inSessions: true` tasks).

**If run commands already exist:** treat this as a modify request — ask the user what they'd like to change (add, remove, or update a command).

**If no run commands exist:** try to infer the right commands from the workspace:
- Check `package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `.nvmrc`, or other project files to understand the stack and common commands.
- If it's clear what the setup command is (e.g., `npm install`, `pip install -r requirements.txt`), add it with `"runOptions": { "runOn": "worktreeCreated" }` — no need to ask.
- If it's clear what the primary run/dev command is (e.g., `npm run dev`, `cargo run`), add it with just `"inSessions": true`.
- **Only ask the user** if the commands are ambiguous (e.g., multiple equally valid options, no recognizable project structure, or the project uses a non-standard setup).

## Writing the file

Always write to `.vscode/tasks.json` in the workspace root. If the file already exists, merge — do not overwrite unrelated tasks.

After writing, briefly confirm what was added and how to trigger it from the Run button.
