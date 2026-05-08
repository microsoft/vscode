# AGENTS.md

Son of Anton injects a "Project Context" section into the orchestrator and
specialist system prompts from the first file it finds in each workspace
root, in this order:

- `<workspace-root>/.son-of-anton/AGENTS.md`
- `<workspace-root>/AGENTS.md`
- `<workspace-root>/CLAUDE.md`

The first match wins per root. In multi-root workspaces, sections from each
root are concatenated and headed with the root folder name. Each file is
capped at 8 KB; longer files are truncated with a `[truncated — file longer
than 8KB]` marker. Use `AGENTS.md` to tell agents the project's invariants:
architecture decisions, forbidden patterns, coding standards, modification
tier policy, and anything else you want every agent turn to honour.

The file is reloaded automatically when it changes — no editor restart
required. The IDE registers a watcher per candidate per root, so creating a
higher-priority file (e.g. dropping `.son-of-anton/AGENTS.md` into a project
that previously only had `CLAUDE.md`) takes effect on the next chat turn.
The Output channel "Son of Anton: AGENTS.md" logs one INFO line the first
time each file is loaded so you can confirm which sources the agents are
seeing.

The CLI (`sota`) reads the same files from the current working directory
when it starts, applying the same priority order and 8 KB cap. There is no
watcher in CLI v1: each invocation is short-lived, and the file is read
once at host construction. The system-prompt section is omitted entirely
when no candidate file is found in the workspace.
