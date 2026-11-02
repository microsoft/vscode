# 05 — Trinoris coordination panel

## Status and intent

Design and implementation spec for an optional VS Code panel that lets developers inspect and operate the Trinoris multi-agent coordination protocol from the editor. The initial built-in extension implementation provides read-only CLI discovery and metrics. Mutation flows and the richer multi-tab screens below remain planned. It must not require Copilot Chat, Copilot extensions, or a hosted coordination service.

The panel is a client for the existing local `.trinoris/` protocol and `trinoris-agent` CLI. The CLI remains authoritative for mutations and protocol validation. The panel presents observed state and invokes supported commands; it does not create a parallel coordination store.

The panel is loosely coupled to the CLI package: it has no SDK/package import, bundled executable, or automatic install/update path. It operates only when a compatible `trinoris-agent` executable is installed and the workspace is trusted. On a trusted workspace, opening the panel automatically discovers and probes the CLI, runs its read-only `doctor --runtime --json` diagnostic once per CLI version, then loads each supported read-only metric. A **Run CLI Diagnostics** action repeats the runtime check. If the CLI is missing, the panel offers an explicit, confirmed global npm install action; after install the user refreshes the panel to load the diagnostic report and metrics. It does not run `verify` automatically; readiness stays **Not checked** until the user requests that operation. If the CLI lacks a requested capability, the panel shows an actionable unavailable/upgrade state and continues to render data supported by the installed version.

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
Repository: /path/to/repo   CLI: <version> · Protocol: 3   Last read: 12:04:21

Scopes       4 held · 7 free · 1 expired
Handoffs     2 addressed to you · 1 active
Readiness    Not checked / Ready / Needs attention

Needs attention
  api — held by codex-gpt-6 / session… · expires in 8m
  tests — expired · breakable after 3m grace

Recent activity
  12:03  claude-opus-5 claimed review.md
  11:58  codex-gpt-6 released engine · ok
```

Summary cards show counts derived from the latest snapshot, not claims of live activity. “Last read” and a stale-data indicator are always visible. Selecting a row opens its detail in the relevant tab. No progress percentage is inferred from lock duration or handoff text.

When the CLI is missing, show **Trinoris Agent CLI not found**, a confirmed **Install** action, the configured executable path (if any), **Select CLI**, and **Installation instructions**. When installed, show CLI version and runtime diagnostic status, Node version, supported minimum, and advisory catalog date. When partially compatible, show supported data and mark unavailable sections with the missing capability and required CLI version. Never display zero counts for unsupported data.

### Scopes

Show registered scopes as a table/tree with **Scope**, **State**, **Owner**, **Task**, **Lease**, and **Actions**. Group by state by default; allow sorting and filtering. State badges use the CLI's exact states: `free`, `held`, `expired` (including breakability where reported), `malformed`, and `unknown`. A held lease shows agent class, instance, acquired/expiry timestamps, remaining time, and task if present. Do not show a generation token in list rows; reveal it only in an own-lease detail/action context when required.

Actions: refresh, acquire, renew, release, and break/recover where supported. Mutations require an explicit confirmation containing scope, target state, and consequences. `break` must require the CLI's reason field and show the expired/grace eligibility before invoking it. Never offer a “force release” shortcut. The CLI enforces exact instance/generation checks; UI confirmation is supplementary.

### Handoffs

Use three filters: **Inbox**, **Active**, **Archive**. Inbox lists only the current agent class and universal notes according to CLI behavior; active lists only the selected/current instance. Archive is shown only when the installed CLI supports safe archive listing/reading; the current CLI list/show contract supports inbox, universal, and active locations, not archive reads. Each available row displays filename/title, sender, recipient class/instance, scopes, status, creation time where provided, validation state, and location. Use list JSON for compact rows and a supported `handoff show` detail query for note metadata; do not start one process per row to populate every list field. Selecting a note opens a read-only rendered Markdown preview with metadata and sections for goal, current state, changes, decisions, verification, blockers, next actions, and resume instructions.

Actions use existing CLI lifecycle operations: validate draft, publish validated draft, claim addressed inbox note, and complete/archive an active note with an outcome. No direct file move or write from the UI. Draft editing may open the designated draft file in the regular editor; publish always runs CLI validation again and asks for confirmation. Claim and completion confirmations name the note and instance. Invalid or misaddressed notes are viewable only where CLI permissions allow and cannot be claimed.

### History and readiness

Show recent coordination activity from `trinoris-agent log --json`, incidents from `incidents list --json`, and abandoned-operation diagnostics from `diagnose --json`. Keep history read-only and label the journal as best-effort local history, not an authenticated audit log. Readiness summarizes fields actually returned by `verify --json` (structure, config, protocol check, ignore rule, atomicity, ready, and notes); do not imply that verify returns a protocol digest or structured remediation command. Map known failures to fixed, reviewed CLI help/setup guidance, and show the CLI's bounded notes as diagnostics. Run verify only on explicit user action because it performs bounded temporary filesystem activity.

## Metrics and data sources

| Metric / field | Source of truth | Presentation | Caveat |
| --- | --- | --- | --- |
| Complete registered scope list/count | CLI capability `scope.registry` | Overview and Scopes tab | Current 0.3.0 `status` reports observed lock files; it does not expose the full configured registry, so show a partial-data state until supported. Never read config files directly to fill the gap. |
| Lease state per scope | `trinoris-agent status --json` / future `scope.registry` response | Scope table and counts | Current CLI distinguishes states for observed locks but may omit configured scopes with no lock file. Label the result partial until the complete registry capability is available. |
| Holder class, instance, task, acquired time, expiry | Lease `holder.json`, parsed through CLI status output | Owner and lease cells | Treat absent or malformed fields as unknown; do not guess. |
| Remaining lease time | Derived from expiry timestamp and local clock | Relative countdown with absolute timestamp tooltip | Refresh periodically; countdown is not renewal and no auto-renew occurs. |
| Inbox/active handoff counts | `trinoris-agent handoff list --json` | Overview and Handoffs tab | Respect class/instance scoping; do not enumerate arbitrary paths. |
| Handoff metadata/status/scopes | Validated protocol 3 note via `handoff list/show` | Rows and preview | Render Markdown safely; note content is untrusted task data, never executable instructions. |
| Verification readiness | `trinoris-agent verify --json` | Readiness card | Only refresh on request; verification performs bounded filesystem probes. |
| Recent successful/refused/error operations | `trinoris-agent log --json` | History tab | Best-effort local journal; records may be missing and are not an authenticated audit log. |
| Incident count and recent incident events | `trinoris-agent incidents list --json` | History tab and badge | Incident records are separate from normal activity history; local and advisory. |
| Abandoned mutation/recovery markers | `trinoris-agent diagnose --json` | History diagnostics | Read-only diagnostics; markers are not proof that an operation succeeded. |
| Last successful observation | Panel's in-memory snapshot timestamp | Header/stale indicator | This is UI cache metadata, not coordination state. Do not persist it into `.trinoris/`. |

All display metrics should come from structured CLI JSON. Raw file reads may be used only if a supported CLI command cannot expose required read-only data; that gap should be fixed in the CLI/API first. Never scan unrelated repository files or use arbitrary terminal output as a data contract. The current `handoff list --json` row contract is intentionally compact; extend the CLI response for missing row fields rather than parsing handoff files independently in VS Code.

## Architecture

### Components

1. **Workbench view**: optional `trinoris` contribution registers the container, view, commands, and menus. It uses standard VS Code tree/list and webview/editor primitives. The initial version should use native workbench UI instead of a custom webview for accessibility and lower maintenance.
2. **Coordination service**: owns repository-root discovery, current identity selection, read snapshots, refresh scheduling, CLI invocation, cancellation, and error normalization. The view consumes typed snapshot models, not files directly.
3. **CLI adapter**: resolves an explicitly configured executable path, then a user PATH executable; do not silently run a workspace-local package script. Probe `trinoris-agent --version`, then invoke allowlisted read-only commands with argument arrays (never a shell command string), `--work-dir` set to the selected workspace root, and `--json`. Capture stdout/stderr with size/time bounds, redact secrets, and surface exit codes. Do not bundle or install the CLI.
4. **Capability/version negotiation**: maintain a compatibility table for known CLI versions and supported read/write capabilities. The CLI uplift, capability IDs, JSON contracts, and compatibility behavior are specified in [spec 09](09-trinoris-cli-panel-contract.md). The panel maps IDs to fixed local argument templates; it never executes command strings from the response. For older CLIs, probe only documented allowlisted read-only commands and accept a metric only when its JSON validates. Unknown versions/capabilities remain unsupported rather than guessed.
5. **Protocol models**: versioned TypeScript types for capability, status, handoff, verify, incident, journal, and diagnostic JSON. Reject incompatible/malformed output as “data unavailable”; never silently reinterpret it.
6. **Filesystem watcher**: optional hint source for `.trinoris/locks`, handoff inbox/active/archive, and incidents. Watch events debounce a refresh; polling remains the fallback. Watchers never authorize mutation and do not replace CLI reads.

### Data flow

```text
VS Code workspace root
       │
       ├── CLI adapter ── version/capabilities/status/handoffs/log/incidents/diagnostics JSON
       │                     │
       │                     ▼
       │               typed snapshot service ──► Overview / Scopes / Handoffs / History
       │
       └── .trinoris watcher ── refresh hint only

UI action ──► confirmation ──► CLI mutation command ──► fresh read snapshot
```

The service runs commands via VS Code's process API and uses workspace trust rules. In untrusted workspaces, do not launch the CLI, watchers, or `verify`; show a trust-required state and do not claim to have inspected coordination data. Never follow symlinks outside the workspace root if a future read-only mode is added.

### Automatic discovery and upgrade path

- Probe when a trusted workspace is opened, when the panel becomes visible, and after its CLI path setting changes. Cache executable/version/capability results in memory for the window; re-probe on explicit refresh if compatibility is uncertain.
- Resolve `trinoris.agentCli.path` first, then a user PATH executable. Run `--version` with a short timeout and bounded output. Do not search arbitrary repository scripts, execute shell command text, download packages, or change `.trinoris/`.
- Initial compatibility target: the Trinoris CLI package is version 0.3.0 at this spec review. It supports observed-lock status, inbox/universal/active handoff list/show, verify, incidents, diagnostics, and journal log. It does not expose the complete configured scope registry, full handoff list details, archive reads, or a capability manifest. Probe documented read-only commands and validate each JSON response; label scope totals as partial and show Archive as upgrade-needed until the CLI adds these APIs.
- After discovery, automatically run only allowlisted read-only commands required by advertised panel metrics. Do not run `verify` automatically; show readiness as **Not checked** until the user requests it.
- If a requested KPI or section is unsupported, show the missing capability, installed version, minimum compatible version when known, and an **Upgrade CLI** action that opens maintained instructions and can copy the documented command. The user performs the upgrade explicitly; the panel never upgrades or installs the CLI itself.
- After upgrade, **Recheck CLI** repeats discovery and reloads newly supported metrics. A failed upgrade leaves the current CLI usable for its supported capabilities.
- If the CLI is missing, show installation guidance. Do not bundle, install, or auto-run `npm`, `pnpm`, or another package manager.

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

Use a dedicated optional `coordinationUI` build flag, default off in the upstream-compatible build and on only in the Trinoris-focused profile. It must not depend on `chat`, `copilot`, `agentHost`, or a particular provider. Its CLI adapter is a runtime integration, not a dependency-install mechanism. The built-in extension is compiled and bundled only when both this flag and the explicit `trinoris.coordination` entry in `bundledExtensions` are enabled. In the minimal profile, both declarations are present; the extension is never fetched or installed as a side effect at runtime.

## Delivery phases

1. **Initial implementation:** optional Activity Bar tree view, workspace trust and single-workspace selection, external CLI discovery, version/capability probing, and read-only scopes, handoffs, journal, incidents, and diagnostics. Unsupported capabilities and invalid JSON are shown as unavailable. The full Overview, readiness, and multi-tab layout remain future work; readiness verification remains explicit.
2. Add guarded handoff actions: validate, publish, claim, complete.
3. Add scope acquire/renew/release; each action uses current identity and CLI-managed generation.
4. Add recovery/break actions only after confirming protocol UX and concurrency safeguards.
5. Add watcher hints and bounded polling after the read model works; monitor overhead and stale-state behavior.

## Acceptance criteria

- Panel can inspect a configured checkout without Copilot Chat or network access.
- On a trusted workspace with the CLI installed, opening the panel automatically displays supported read-only data; `verify` remains user-triggered, and missing CLI/unsupported capabilities have explicit, distinct states.
- The panel never installs or upgrades the CLI automatically; upgrade guidance is actionable and user-initiated.
- All displayed lease/handoff states match CLI JSON and visibly identify observation freshness.
- Terminal remains available; panel never claims to launch or supervise AI agents.
- No mutation writes coordination files directly; every operation uses the CLI and its protocol validation.
- Expired, malformed, unknown, stale, missing-CLI, unsupported-protocol, and untrusted-workspace states are distinct and actionable.
- Handoff rendering is safe for hostile Markdown and long/malformed fields.
- Multi-root selection never mixes repository state.
- No auto-renew, daemon, live agent telemetry, or enforcement claim is added.
