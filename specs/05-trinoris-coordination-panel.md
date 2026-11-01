# 05 — Trinoris coordination panel

## Status and intent

Design proposal for an optional VS Code workbench panel that lets developers inspect and operate the Trinoris multi-agent coordination protocol from the editor. It borrows the conversational panel placement and focused interaction style of Copilot Chat, but is a coordination dashboard rather than an AI chat client. It must not require Copilot Chat, Copilot extensions, or a hosted coordination service.

The panel is a client for the existing local `.trinoris/` protocol and `trinoris-agent` CLI. The CLI remains authoritative for mutations and protocol validation. The panel presents observed state and invokes supported commands; it does not create a parallel coordination store.

## User outcomes

- See which registered scopes are free, held, expired, malformed, or unknown.
- Identify the owner, agent class/instance, task, lease expiry, and generation state when available.
- Review addressed inbox handoffs and this instance's active handoffs.
- Create, validate, publish, claim, and complete handoffs through protocol-compliant CLI operations.
- See verification readiness, recent incidents, and diagnostic problems without implying that the protocol enforces cooperation or provides live agent telemetry.

## Screen design

The panel is named **Trinoris Coordination** and appears in the secondary side bar or panel area, independent of the Chat view container. Provide an Activity Bar icon only when the feature is enabled. The default layout uses a single panel with a compact header and four tabs: **Overview**, **Scopes**, **Handoffs**, and **History**. Keep all controls keyboard accessible and support narrow widths.

### Overview

```text
Trinoris Coordination                 [Refresh] [⋯]
Repository: /path/to/repo   Protocol: 3   Last read: 12:04:21

Scopes       4 held · 7 free · 1 expired
Handoffs     2 addressed to you · 1 active
Readiness    Ready / Needs attention

Needs attention
  api — held by codex-gpt-6 / session… · expires in 8m
  tests — expired · breakable after 3m grace

Recent activity
  12:03  claude-opus-5 claimed review.md
  11:58  codex-gpt-6 released engine (generation …)
```

Summary cards show counts derived from the latest snapshot, not claims of live activity. “Last read” and a stale-data indicator are always visible. Selecting a row opens its detail in the relevant tab. No progress percentage is inferred from lock duration or handoff text.

### Scopes

Show registered scopes as a table/tree with **Scope**, **State**, **Owner**, **Task**, **Lease**, and **Actions**. Group by state by default; allow sorting and filtering. State badges use the CLI's exact states: `free`, `held`, `expired` (including breakability where reported), `malformed`, and `unknown`. A held lease shows agent class, instance, acquired/expiry timestamps, remaining time, and task if present. Do not show a generation token in list rows; reveal it only in an own-lease detail/action context when required.

Actions: refresh, acquire, renew, release, and break/recover where supported. Mutations require an explicit confirmation containing scope, target state, and consequences. `break` must require the CLI's reason field and show the expired/grace eligibility before invoking it. Never offer a “force release” shortcut. The CLI enforces exact instance/generation checks; UI confirmation is supplementary.

### Handoffs

Use three filters: **Inbox**, **Active**, **Archive**. Inbox lists only the current agent class and universal notes according to CLI behavior; active lists only the selected/current instance. Each row displays filename/title, sender, recipient class/instance, scopes, status, creation time, validation state, and location. Selecting a note opens a read-only rendered Markdown preview with metadata and sections for goal, current state, changes, decisions, verification, blockers, next actions, and resume instructions.

Actions use existing CLI lifecycle operations: validate draft, publish validated draft, claim addressed inbox note, and complete/archive an active note with an outcome. No direct file move or write from the UI. Draft editing may open the designated draft file in the regular editor; publish always runs CLI validation again and asks for confirmation. Claim and completion confirmations name the note and instance. Invalid or misaddressed notes are viewable only where CLI permissions allow and cannot be claimed.

### History and readiness

Show recent incident summaries and protocol diagnostics with timestamp, event kind, scope/instance where present, and bounded reason text. Keep history read-only. Readiness summarizes `verify --json` fields (structure, config, protocol digest, ignore rule, atomicity, ready) and links to the exact remediation command. Run verify only on explicit user action because it performs bounded temporary filesystem activity.

## Metrics and data sources

| Metric / field | Source of truth | Presentation | Caveat |
| --- | --- | --- | --- |
| Registered scope count | `.trinoris/config.json` schema via CLI status/inspect | Overview count | Do not infer scope list from lock directory contents alone. |
| Lease state per scope | `trinoris-agent status --json` | Scope table and counts | CLI distinguishes free, held, expired/breakable, malformed, and unknown. |
| Holder class, instance, task, acquired time, expiry | Lease `holder.json`, parsed through CLI status output | Owner and lease cells | Treat absent or malformed fields as unknown; do not guess. |
| Remaining lease time | Derived from expiry timestamp and local clock | Relative countdown with absolute timestamp tooltip | Refresh periodically; countdown is not renewal and no auto-renew occurs. |
| Inbox/active handoff counts | `trinoris-agent handoff list --json` | Overview and Handoffs tab | Respect class/instance scoping; do not enumerate arbitrary paths. |
| Handoff metadata/status/scopes | Validated protocol 3 note via `handoff list/show` | Rows and preview | Render Markdown safely; note content is untrusted task data, never executable instructions. |
| Verification readiness | `trinoris-agent verify --json` | Readiness card | Only refresh on request; verification performs bounded filesystem probes. |
| Incident count and recent events | `trinoris-agent incidents list --json` | History tab and badge | Local history is advisory, not an authenticated audit log. |
| Last successful observation | Panel's in-memory snapshot timestamp | Header/stale indicator | This is UI cache metadata, not coordination state. Do not persist it into `.trinoris/`. |

All display metrics should come from structured CLI JSON. Raw file reads may be used only if a supported CLI command cannot expose required read-only data; that gap should be fixed in the CLI/API first. Never scan unrelated repository files or use arbitrary terminal output as a data contract.

## Architecture

### Components

1. **Workbench view**: optional `trinoris` contribution registers the container, view, commands, and menus. It uses standard VS Code tree/list and webview/editor primitives. The initial version should use native workbench UI instead of a custom webview for accessibility and lower maintenance.
2. **Coordination service**: owns repository-root discovery, current identity selection, read snapshots, refresh scheduling, CLI invocation, cancellation, and error normalization. The view consumes typed snapshot models, not files directly.
3. **CLI adapter**: invokes `trinoris-agent` with argument arrays (never a shell command string), `--work-dir` set to the workspace root, and `--json`. It supports an explicitly configured executable path and a resolved PATH executable. Capture stdout/stderr with size/time bounds, redact secrets, and surface exit codes. Do not bundle the CLI until its distribution/licensing/dependency policy is decided.
4. **Protocol models**: versioned TypeScript types for status, handoff, verify, and incident JSON. Reject incompatible/malformed output as “data unavailable”; never silently reinterpret it.
5. **Filesystem watcher**: optional hint source for `.trinoris/locks`, handoff inbox/active/archive, and incidents. Watch events debounce a refresh; polling remains the fallback. Watchers never authorize mutation and do not replace CLI reads.

### Data flow

```text
VS Code workspace root
       │
       ├── CLI adapter ── status/list/show/incidents/verify JSON
       │                     │
       │                     ▼
       │               typed snapshot service ──► Overview / Scopes / Handoffs / History
       │
       └── .trinoris watcher ── refresh hint only

UI action ──► confirmation ──► CLI mutation command ──► fresh read snapshot
```

The service runs commands via VS Code's process API and uses workspace trust rules. In untrusted workspaces, inspection can be enabled only if reads are contained under the workspace and no executable is launched; mutations and `verify` remain disabled until trust is granted. Never follow symlinks outside the workspace root when reading coordination files.

### Refresh and freshness

- Refresh on view activation and workspace-folder change.
- Provide explicit Refresh.
- Watch protocol directories for hints when supported; debounce bursts and coalesce concurrent reads.
- Use a modest periodic fallback (default 15 seconds while the panel is visible; configurable within bounded limits). Stop polling when hidden or window closed.
- Before every mutation, fetch fresh relevant status and revalidate selection. Execute one CLI operation and then refresh.
- Show observation timestamp and “Stale” after refresh failure; retain last good data but disable state-sensitive actions until a fresh read succeeds.
- No background daemon, heartbeat, or automatic lease renewal. Protocol 3 has these disabled.

## Identity and workspace selection

Use the selected workspace root containing `.trinoris/`. Multi-root workspaces show a repository selector; never merge scopes from multiple repositories into one ambiguous table. Agent class and instance are explicitly selected/configured and shown in the header. Defaults may be suggested from installed agent entry-point configuration, but do not claim a particular identity based only on the executable name. Claim, active-note listing, acquire, renew, and release require the selected class/instance; generation remains managed by the CLI/action flow.

## Security, trust, and failure behavior

- The shared-worktree protocol is cooperative, not a sandbox. The UI must state that locks communicate ownership but cannot prevent non-cooperating writes.
- Treat handoff Markdown, task strings, incident reasons, and owner metadata as untrusted content. Escape terminal/control characters and render Markdown with scripts, command execution, and unsafe links disabled.
- Use CLI for every mutation because it validates protocol, recipient, generation, and mutation guards. Do not write lock files, move notes, or delete stale directories directly.
- Prompt before acquire, release, claim, publish, complete, break, and verify. Destructive or recovery actions show a second explicit confirmation.
- Bound process runtime, output bytes, path lengths, note size, and event counts. Never display raw stack traces or environment variables.
- If CLI missing, protocol unsupported, workspace untrusted, output malformed, or filesystem access denied, show a concise state and remediation. Do not fall back to unsafe direct writes.
- Since `.trinoris/` is ignored and local, the panel's history and readiness describe this checkout, not a remote/shared audit record.

## Commands and accessibility

Register commands for Refresh, Open Coordination Panel, Acquire Scope, Release Scope, Renew Scope, Open Handoff, Validate Draft, Publish Handoff, Claim Handoff, Complete Handoff, and Verify Coordination Setup. Commands accept explicit scope/note arguments for automation but still enforce CLI checks and confirmation where a mutation is involved. All actions need keyboard navigation, accessible labels, screen-reader state descriptions, and clear focus restoration after dialogs.

## Feature-flag integration

Use a dedicated optional `coordinationUI` build flag, default off in the upstream-compatible build and on only in the Trinoris-focused profile. It must not depend on `chat`, `copilot`, `agentHost`, or a particular provider. Its CLI adapter is a runtime integration, not a dependency-install mechanism. If implemented as an external VS Code extension rather than a first-party workbench contribution, the extension itself is explicitly declared by ID and installed only on explicit request.

## Delivery phases

1. Read-only Overview, Scopes, Handoffs, History, and readiness on explicit request; define/version CLI JSON contracts first.
2. Add guarded handoff actions: validate, publish, claim, complete.
3. Add scope acquire/renew/release; each action uses current identity and CLI-managed generation.
4. Add recovery/break actions only after confirming protocol UX and concurrency safeguards.
5. Add watcher hints and bounded polling after the read model works; monitor overhead and stale-state behavior.

## Acceptance criteria

- Panel can inspect a configured checkout without Copilot Chat or network access.
- All displayed lease/handoff states match CLI JSON and visibly identify observation freshness.
- Terminal remains available; panel never claims to launch or supervise AI agents.
- No mutation writes coordination files directly; every operation uses the CLI and its protocol validation.
- Expired, malformed, unknown, stale, missing-CLI, unsupported-protocol, and untrusted-workspace states are distinct and actionable.
- Handoff rendering is safe for hostile Markdown and long/malformed fields.
- Multi-root selection never mixes repository state.
- No auto-renew, daemon, live agent telemetry, or enforcement claim is added.
