# SDK/Runtime Managed Setting

Use this path when policy governs behavior implemented inside the Copilot runtime:

- tools, shell, files, URLs, MCP, plugins, or subagents;
- permissions, approvals, or sandboxing;
- runtime-owned model, telemetry, or remote-agent behavior.

## Contract

The runtime owns:

- managed-settings schema and rule grammar;
- restrictive composition across enterprise sources;
- enforcement immediately before side effects;
- managed-ask one-time semantics;
- effective-policy and enforcement events;
- public SDK types when an integrator must supply or observe the control.

Prefer runtime discovery of managed settings. Add a host-supplied SDK contract only when
the host genuinely owns the value.

Do not add a VS Code `policy:` merely to mirror runtime policy.
Do not add a GitHub-token/account-policy field as a substitute for managed settings.

## Permissions

- Managed `deny` / `ask` / `allow` are runtime policy.
- AHP `{ allow, deny }` contains tool-name client preferences; it is not the managed DSL.
- New VS Code/AHP code transports managed rules opaquely and does not parse or match them.
- `managedApprovalRequired` bypasses all automatic and persistent approval paths.
- Managed approval is human-only and one-time-only.
- Permission authorization never widens sandbox access.
- Validate rule grammar through the real SDK/runtime boundary.

## Host-Injection Lifecycle (In Progress)

The runtime host-injection capability is still being adopted by the public SDK and VS
Code. When an integrator uses it, host-injected managed settings are startup
configuration:

- supply them on local create and resume;
- re-supply them because they are not persisted;
- omission clears the previous injected layer;
- refresh default and peer sessions before the next turn when policy changes;
- reject unsupported cloud use instead of ignoring it.

Policy removal must survive real JSON/AHP serialization.

Client-injected settings are strict: malformed or unsupported rules reject create/resume.
Server/device discovery instead uses its defined cache and fail-open/fail-closed
degradation behavior.

The runtime composes managed sandbox floors. While sandbox configuration remains
host-driven, verify that Agent Host applies the effective floor to session
`sandboxConfig`; policy state and containment must not diverge.

Do not log raw enterprise rules or values.

## Tests

- Runtime: schema, parsing, matching, composition, revalidation, and pre-side-effect deny.
- SDK: create/resume serialization, events, handler safety, and cloud rejection.
- Agent Host E2E: generated grammar, managed asks, removal/resume, and diagnostics.

Start with:

- `github/copilot-agent-runtime/schema/managed-settings-schema.json`
- `github/copilot-agent-runtime/src/runtime/src/permissions/managed.rs`
- `github/copilot-agent-runtime/src/runtime/src/permissions/orchestrator.rs`
- `github/copilot-sdk/nodejs/src/types.ts`
