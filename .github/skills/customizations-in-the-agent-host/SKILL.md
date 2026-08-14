---
name: customizations-in-the-agent-host
description: Architecture and hard-won debugging lessons for customization enablement (plugins, MCP servers, agents, skills, instructions) in the agent host. Use when changing how customizations are discovered, published, enabled/disabled, or handed to a provider SDK; when a customization shows the wrong enabled state in the UI; or when a disabled MCP server or plugin is still reaching the model.
---

# Customizations in the Agent Host

Customizations are the plugins, MCP servers, agents, skills and instructions that an
agent-host session exposes to a model. This skill covers **enablement**: how a
customization's on/off state is decided, stored, published and enforced.

Read this before changing anything in:

- `src/vs/platform/agentHost/node/agentHostCustomizationEnablementService.ts`
- `src/vs/platform/agentHost/node/shared/customizationEnablementGate.ts`
- `src/vs/platform/agentHost/common/customizationEnablement.ts`
- the per-provider customization paths under `node/copilot/`, `node/claude/`, `node/codex/`

## The mental model

### Enablement is a list of scoped decisions, not a boolean

A plugin or MCP server carries `enablement?: CustomizationEnablement[]` — an ordered
list of decisions, most specific first:

| Kind | Owner | Meaning |
|---|---|---|
| `Session` | agent host | this session only |
| `Workspace` | agent host | this working directory (carries `uri`) |
| `Global` | client, unless the host discovered it | everywhere |

`isCustomizationEnabled()` picks the first entry; absent entries inherit from the next
scope out, and an absent list means enabled. Never re-add a parallel `enabled` boolean
to plugins or MCP servers — a second source of truth is what this design exists to
remove. (`DirectoryCustomization` legitimately keeps a plain `enabled`; consumers
derive its state through `isCustomizationEnabled()` all the same.)

### Who owns `Global`

The host owns `Global` for anything it **discovered**, even when that thing lives inside
a plugin the client forwarded. The client owns `Global` only for what it actually
**bundled**. The discriminator is `childEnablement` — *not* `clientId`. A plugin whose
`childEnablement` record has a key for a child MCP server means "the client bundled this
child and owns its global decision"; anything else the host discovered by parsing the
plugin directory.

### The overlay model

This is the single most important invariant, and getting it wrong caused a
self-defeating write that silently erased user decisions:

> The client's value is the **base**. Host decisions layer **on top**. "Store only what
> differs" compares against that base — never against a hardcoded `true`.

Concretely, in `agentHostCustomizationEnablementService.ts`:

- `_clientGlobalEnablement` is the in-memory **base**, per session. `_setClientGlobal`
  writes here and **must never touch `_persistent`**.
- `_persistent` holds only host-owned decisions that differ from the base.
- Inheritance runs host → base → `DEFAULT_CUSTOMIZATION_ENABLED`
  (`_globalEnablement`, `_workspaceInheritedEnablement`).
- `_setPersistentDecision` deletes a decision that matches its inherited value, so the
  UI can restore inheritance without a third "Inherit" action.

Keeping these separate is what stops this loop:
`replaceEnablement` → synchronous republish → client's stale `[{global,true}]` →
`_setClientGlobal` → "store only what differs" deletes the entry just written.

### Identity must not depend on tree position

An MCP server's storage key is derived from `owningPluginUri`, never from where it
happened to appear in the published tree. The same server discovered top-level
(`mcpServers#azure`) and nested under a plugin (`<pluginURI>#mcp=azure`) must produce
**one** key, or a decision written in one session is invisible to the next.
`targetForMcpServer()` and `withOwningPluginUri()` in the gate are the only supported
way to build that target.

### Pending means fail closed — but pending must be transient

`resolve()` returns `{kind:'pending'}` when the session isn't initialized yet
(`reason: 'session'`) or the working directory isn't known (`reason: 'workingDirectory'`).
`resolveCustomizationEnablement()` records those in `pendingCustomizationIds`, and
`isCustomizationSdkEligible()` makes SDK-boundary consumers **fail closed**.

Two rules follow:

1. Never "fix" a pending customization by defaulting it to enabled.
2. Never cache the pending verdict. Pending is a *temporary* state; recompute it, and
   republish when the enablement service settles. A cached `pendingEnablement: true`
   silently drops a plugin forever.

A pending child MCP server also marks its **containing plugin** pending, because a
plugin directory can cause the SDK to discover the child on its own.

## The rule that prevents most bugs

> **Every publication, emit and SDK-handoff path must go through resolution.**

Three separate production bugs on this feature came from paths that skipped it (four
sites in `copilotAgent`, one in `mcpCustomizationController`, plus the post-startup
reconcile). When you add a new place that publishes a customization or hands one to a
provider, route it through `resolveCustomizationEnablement()` — do not read a stored
snapshot.

The corollary: **state computed once must be rebuilt when its inputs change.** Merged
per-client enablement maps that are only appended to will leak stale decisions onto a
newly parsed plugin with the same URI.

## Enforcement is per-provider, and they differ

| Provider | Launch | Mid-session |
|---|---|---|
| Copilot | `disabledMcpServers` on `SessionConfig` at open/resume | `rpc.mcp.enable` / `rpc.mcp.disable` |
| Claude | session options at materialize | live reconcile |
| Codex | MCP servers supplied only at `thread/start` / resume | **not possible** — documented limitation |

Two traps here:

- The post-startup reconcile runs ~800 ms after launch. Anything gated *only* there can
  still start, and request authentication, during the launch window. Gate at launch too.
- The SDK's `not_configured` status must **not** be translated as `enabled: true`. That
  bug made a correct "skip this disabled server" decision look like "enable it".

Client-provided MCP servers (ones the client bundled rather than the host discovering)
must route their global Disable to the **client**, not the host — the host correctly
refuses to store a client-owned global, so routing it to the host is a silent no-op.
`isClientBundled` is the discriminator; see `getBuiltinMcpServerEnablementActions` in
`mcpListWidget.ts`.

## Debugging playbook

Rank your signals. They disagree, and the model lies:

1. **Primary** — the published customization object and the host's stored decision.
2. **Definitive for tool exposure** — `tool_search override … clientMatched=[…]` in
   `Agent Host.log`.
3. **Secondary** — the customizations UI.
4. **Corroborating only** — what the model says. A model answered "yes, I have azure
   tools" while the server was `stopped`. Never conclude from this alone.

Reproduction recipe that exercises the real failure surface: start a session, send a
message to boot everything, disable the thing, then ask a **new** session whether it has
those tools. Cross-session persistence is where identity and overlay bugs surface.

Use the `agent-host-logs` skill for exported bundles, and the `launch` skill to drive a
real instance.

Known false alarms:

- The `azure` plugin contributes 24 `azure-*` **skills** in addition to its MCP server.
  Disabling the server correctly leaves the skills enabled.
- `sleepy` is a deliberately broken test server that cannot initialize — useless as a
  positive control.

## Gotchas that cost real time

- `CustomizationType` and `CustomizationEnablementKind` are `const enum`s. A **type-only
  import compiles and lints cleanly, then crashes at runtime.** Import them as values.
- The unit-test runner uses pre-compiled output and does **not** fail on type errors.
  Always run `npm run typecheck-client` separately.
- Integration-test servers start with `--quiet`. Wiring that you hoist out of
  `if (!options.quiet)` in `agentHostServerMain.ts` silently changes their behaviour —
  hoisting `setWorktreeIsolation` made quiet servers resolve `isolation: 'folder'` and
  broke seven unrelated tests.
- Protocol files under `common/state/protocol/` carry a "DO NOT EDIT — auto-generated"
  banner. Changes there need a matching backport to the `agent-host-protocol` repo.
- Electron runner setup aborts (`EEXIST`/`EPERM`/`ENOENT`/ReactiveObjC) are
  environmental. Recover with `rm -rf .build/electron && npm run electron`.

## Validation

```sh
npm run typecheck-client
./scripts/test.sh --grep "customizationEnablement"
./scripts/test-integration.sh --runGlob "**/agentHost/**/{sessionConfig,toolApproval,codexCustomizations}.integrationTest.js"
./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/claudeAgent.integrationTest.ts
```

Tests that construct an agent session directly need
`IAgentHostCustomizationEnablementService` in their service collection; use
`createNoopCustomizationEnablementService()` from
`src/vs/platform/agentHost/test/node/testCustomizationEnablementService.ts`.
