# 09 — Trinoris CLI contract for the coordination panel

## Purpose

Define the loose process boundary between VS Code's Trinoris Coordination panel and the separately installed `trinoris-agent` CLI. The panel must work with supported CLI releases without importing the CLI SDK or depending on its package internals. The CLI remains the authority for protocol reads and mutations.

This spec describes the CLI work needed to support the panel. It does not bundle, install, or automatically upgrade the CLI.

## Current baseline

At this spec review, `@trinoris/agent-cli` is version 0.3.0. It provides `--version`, JSON output for supported commands, scope status for observed lock files, inbox/universal/active handoff list/show, `verify`, `incidents list`, `diagnose`, and `log`.

The current machine interface has these panel gaps:

- `status --json` inspects lock files; it does not provide a complete configured scope registry including scopes with no lock file.
- `handoff list --json` returns compact entries (`filename`, `location`, `path`, `valid`, and optional `title`, `status`, `scopes`). Sender, recipient, and other row metadata are not included in bulk list results.
- `handoff show` only accepts inbox, universal, or the current instance's active location. There is no authorized archive list/read operation.
- There is no `capabilities --json` manifest, so the panel cannot discover optional command support without invoking documented read-only probes.
- `verify --json` returns readiness checks and notes, but no protocol digest or structured remediation identifiers. The panel must not claim those values exist.

The panel may use the current commands for supported data. It must mark unsupported or incomplete metrics and must not infer a complete scope inventory from observed locks or read files directly to fill the gaps.

## Process boundary

- The CLI is an external executable resolved from the explicit user setting `trinoris.agentCli.path`, then the user's PATH. Do not search workspace scripts or package manifests for an executable.
- Use VS Code's process service with an argument array. Never form a shell command string from settings, workspace data, speech transcripts, or CLI output.
- Pass `--work-dir <selected-workspace-root>` and `--json` for supported machine commands. Do not pass an implicit agent identity for mutations; the selected class and instance must be explicit.
- Apply command-specific timeouts, stdout/stderr byte limits, cancellation, and bounded/redacted error presentation. Treat nonzero status and malformed JSON as unavailable data, not empty data.
- Probe or query the CLI only in a trusted workspace. No CLI launch, filesystem watcher, or coordination data read is allowed while workspace trust is denied.
- No API or JSON field from the CLI is executable. Capability IDs are identifiers matched against a panel-owned allowlist; commands and arguments come from panel code.

## Version and capability discovery

### Existing commands

1. Run `trinoris-agent --version` with a short timeout and a small output limit. Display the returned version and reject empty, malformed, or unparseable output as unknown.
2. For a version known to the panel's compatibility table, expose only the documented capabilities for that release. Probe an allowlisted read-only command if the version's behavior is uncertain.
3. For an unknown version, probe only the fixed read-only commands needed by the panel. A capability is available only after the command exits successfully and its JSON passes the panel's versioned validator.
4. Never probe a mutation, `verify`, recovery, setup, or a long-running command for capability discovery.

This keeps existing CLI releases useful before they implement the new handshake. It also makes the interface fail closed for unknown output instead of guessing from help text or filesystem layout.

### New `capabilities --json` command

Add a read-only command that reports the installed CLI interface without requiring a workspace path or reading `.trinoris/`:

```json
{
  "schema_version": 1,
  "cli_version": "0.4.0",
  "protocol_versions": [3],
  "capabilities": [
    "scope.registry",
    "scope.status",
    "handoff.inboxActive",
    "handoff.listDetails",
    "handoff.archiveRead",
    "history.journal",
    "history.incidents",
    "history.diagnose",
    "readiness.verify",
    "readiness.remediation"
  ]
}
```

Requirements:

- `schema_version` changes only when the manifest shape changes incompatibly.
- Capability IDs are stable, documented strings. Adding a capability is backward-compatible; removing or changing its meaning requires a CLI major/minor compatibility decision and release note.
- `protocol_versions` describes protocol formats supported by the CLI, not a claim that a selected workspace is initialized or ready.
- The manifest includes no workspace paths, identities, handoff content, scope task text, secrets, install commands, or arbitrary executable templates.
- Output is one JSON object on stdout; diagnostics use bounded stderr and nonzero exit status. The command must not mutate workspace state or make network requests.
- The panel has a local allowlist that maps each ID to a known CLI command/argument template and a validator. Unknown IDs are ignored and shown as unsupported.

The example version is illustrative. Do not promise a release number until the CLI project schedules it.

## Panel capabilities and JSON requirements

| Capability ID | CLI surface | Required data | Compatibility behavior |
| --- | --- | --- | --- |
| `scope.registry` | Extend `status` compatibly (for example, `--all-registered`) or add a read-only scope-list command | Every configured scope plus its lease state, including registered scopes with no lock file; separately identify observed unregistered lock entries | Without it, show observed lock entries only and mark scope totals/inventory partial. |
| `scope.status` | `status --json` | Exact CLI state (`free`, `held`, `expired`, `malformed`, `unknown`) and supported holder/task/lease fields | Keep current state values; absent holder fields remain unknown. |
| `handoff.inboxActive` | Existing `handoff list --json` | Current class inbox, universal inbox, and selected instance's active notes | Respect CLI scoping and existing 500-note bound. |
| `handoff.listDetails` | Extend list with an explicit detail option or a versioned response | Filename, location, validity, title, sender/recipient class/instance, scopes, protocol/body status, and creation timestamp when the format provides one | Do not invoke `show` once per row. If unavailable, show only supported compact fields and fetch full detail only for the selected note. |
| `handoff.archiveRead` | Add authorized `handoff archive list/show` operations | Bounded archive entries and selected archived note, scoped to the selected workspace | Hide Archive until this capability is reported and the command response validates. Never scan `archive/INDEX.md` or archive paths directly in VS Code. |
| `history.journal` | Existing `log --json` | Recent operation time, class/instance, operation, outcome, scopes, and bounded task/detail fields | Best-effort local journal; distinguish absent history from a failed/malformed query. |
| `history.incidents` | Existing `incidents list --json` | Bounded incident summaries | Incident history is not the normal activity journal and is not an authenticated audit log. |
| `history.diagnose` | Existing `diagnose --json` | Abandoned mutation/recovery/claim marker diagnostics | Diagnostics do not establish operation success. |
| `readiness.verify` | Existing `verify --json` | `structureOk`, `configOk`, `protocolOk`, `gitignoreOk`, `atomicityOk`, `ready`, and bounded notes | Run only on explicit user action; never infer a protocol digest. |
| `readiness.remediation` | Extend verify with stable remediation IDs or add a separate mapping contract | Known remediation identifiers such as `run-setup` or `add-gitignore-rule` | The panel maps IDs to reviewed fixed commands/help. Never execute arbitrary remediation strings from CLI output. |

The CLI must keep existing JSON consumers working when adding optional fields. If a shape must change incompatibly, increment an explicit response schema version or add a new command/option; do not silently reinterpret existing fields.

## Upgrade behavior

- The panel maintains a compatibility table from CLI version to known capabilities until the manifest command is available.
- If a supported data section is missing, display the installed version, missing capability ID, and minimum version when known. Continue showing supported metrics, clearly marked partial.
- An **Upgrade CLI** action opens the maintained installation/upgrade documentation and may copy a documented command. It does not execute a package manager, download a binary, change the CLI path, or alter `.trinoris/`.
- After the user upgrades, **Recheck CLI** repeats `--version`, capability discovery, and relevant JSON validation; then the panel refreshes newly available sections.
- Missing CLI, unsupported CLI, unsupported protocol, workspace not initialized, trust denied, timeout, and malformed output are separate states with specific next steps.
- The first-party panel has no direct dependency on `@trinoris/agent-cli`; its only runtime integration is the stable process and JSON contract defined here.

## Delivery sequence

1. Use current 0.3.0 commands through the process adapter; validate status, handoff, journal, incident, diagnose, and verify output; show partial states for missing capabilities.
2. Add and document `capabilities --json` plus the `scope.registry` response.
3. Add compact detailed handoff rows and safe archive list/show APIs.
4. Add structured readiness remediation identifiers if the panel needs remediation links beyond bounded notes.
5. Update the panel's compatibility table only after a CLI release publishes the corresponding contract; do not couple VS Code releases to a CLI source checkout.

## Acceptance criteria

- The panel works without the Trinoris CLI package installed in VS Code and becomes operational only when a compatible external CLI is available.
- A missing or old CLI never causes automatic installation or update; users can see an actionable path to resolve it.
- Supported metrics load automatically only after workspace trust, while mutating commands and `verify` remain explicit actions.
- Every displayed field maps to a validated CLI response field and capability ID; unsupported data is visibly partial/unavailable, never presented as zero or complete.
- CLI capability output cannot cause the panel to execute arbitrary commands or paths.
- Current consumers of existing CLI JSON remain compatible with additive fields and new commands.
- The panel does not import CLI SDK packages, read `.trinoris/` to compensate for missing APIs, or maintain a second coordination store.
