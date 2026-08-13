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

## Host-Injection Lifecycle

Host-injected managed settings are startup configuration:

- supply them on local create and resume;
- re-supply them because they are not persisted;
- omission clears the previous injected layer;
- refresh default and peer sessions before the next turn when policy changes;
- reject unsupported cloud use instead of ignoring it.

Policy removal must survive real JSON/AHP serialization.

Client-injected settings are strict: malformed or unsupported rules reject create/resume.
Server/device discovery instead uses its defined cache and fail-open/fail-closed
degradation behavior.

### VS Code legacy-setting bridge

VS Code has a narrow declarative bridge for settings whose explicitly configured values
must contribute restrictions to `managedSettings.permissions`. This is a bounded
compatibility path for pre-existing legacy settings, not an architecture for new
controls. New runtime-owned controls belong directly in the managed-settings schema and
public SDK contract, without introducing or translating a VS Code setting.

Bridge invariants:

- the bridge is guarded by its own false-by-default experimental compatibility setting;
- add mappings only for legacy settings that already exist; never create a new setting
  for this bridge;
- mappings select one VS Code setting and use a callback typed against the host-owned managed
  permissions DTO;
- mappings contribute only fields that can be flattened restrictively (`disable`, `deny`,
  and `ask`); do not flatten independent `allow` lists in VS Code;
- only explicit global layers participate, in policy, user, then application precedence;
- registered defaults and workspace/folder values do not contribute;
- contributions aggregate restrictively and are transported without parsing their rule
  grammar in VS Code;
- the aggregate is supplied on SDK create and resume;
- an empty aggregate is forwarded when settings are removed so stale restrictions clear
  across JSON/AHP serialization;
- contributions use a typed, client-owned AHP extension notification and a dedicated Agent
  Host managed-settings service; do not route them through root configuration;
- the host aggregates contributions by client and removes an owner's contribution after
  its disconnect grace expires;
- changed contributions refresh local default and peer sessions at an idle boundary
  before the next turn.

Keep additional legacy mappings in the shared bridge table and cover their scope, removal,
create/resume, and refresh behavior in the corresponding Agent Host unit tests.

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
- `microsoft/vscode/src/vs/platform/agentHost/common/agentHostManagedSettings.ts`
- `microsoft/vscode/src/vs/platform/agentHost/node/copilot/copilotSessionLauncher.ts`
