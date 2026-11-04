# Projecting Copilot Managed Settings into VS Code

How enterprise managed settings feed VS Code's existing policy stack. Use only after [SKILL.md](./SKILL.md) routes a control to VS Code. Runtime-only managed settings need no VS Code constant, policy, or export; see [sdk-runtime-policy.md](./sdk-runtime-policy.md).

Key source: `src/vs/platform/policy/common/copilotManagedSettings.ts` (key constants, normalizer, projection, channel merge, shared `value` callbacks).

## The bag

All channels normalize into one bag, `IPolicyData.managedSettings` (`ManagedSettingsData`), which `AccountPolicyService` hands to each policy's `value(policyData)`. There is no separate `IPolicyService`.

- Keys are flat dot-paths (`permissions.disableBypassPermissionsMode`); values are `string | number | boolean`.
- Object/array settings (`enabledPlugins`, `extraKnownMarketplaces`, …) are carried as a JSON string under one key, the same shape admins author in MDM.

## Channels and precedence

| Channel | Implementation |
|---|---|
| Native MDM (Windows registry `SOFTWARE\Policies\GitHubCopilot`, macOS `com.github.copilot`) | `NativeManagedSettingsService` via `@vscode/policy-watcher`; desktop main only, IPC to renderer |
| Server (`/copilot_internal/managed_settings`) | `adaptManagedSettings` → `DefaultAccountService.policyData` |
| File (`managed-settings.json` at per-OS `MANAGED_SETTINGS_*` paths) | `FileManagedSettingsService`; main process, IPC to renderer |

`pickManagedSettings` merges **per key**: native MDM > server > file; lower channels fill keys higher ones leave unset. To add a channel, extend `ManagedSettingsChannel`, `MANAGED_SETTINGS_CHANNELS`, and `pickManagedSettings` together.

Sandbox exceptions follow runtime composition: `sandbox.enabled` is force-on-wins (`true` anywhere wins); `sandbox.allowBypass` and `sandbox.userPolicy.network.allowOutbound` are deny-wins. The runtime's `x-composition` across enterprise/org/user layers is already collapsed before VS Code sees the bag.

`SandboxSettingsResolutionHelper` shares sandbox presentation rules with Agent Host's effective configuration: managed denials lock the corresponding `chat.agent.sandbox.*` controls; a present managed host or filesystem grant list (including `[]`) replaces the local list; block/denied lists combine local and managed entries. Malformed managed lists leave the local value editable. Stored user preferences are never rewritten.

## Schema

The authority is `copilot-agent-runtime/schema/managed-settings-schema.json` (nested; VS Code flattens it). It contains many runtime-owned keys VS Code never projects. Known gaps and special cases:

- `extraKnownMarketplaces`: VS Code accepts only `github`/`git` sources; `directory` and others are dropped with a warning.
- `strictKnownMarketplaces`: managed-only (no setting or policy), declared in `MANAGED_SETTINGS_CONTROL_DEFINITIONS` and enforced via `IPluginMarketplaceService`. Absent = all allowed; `[]` = lockdown. It governs installation, not already-installed plugins; `chat.plugins.strictMarketplaces` user values are ignored.
- `model` supersedes legacy `permissions.model` across channels; resolve that in the callback (`managedModelValue`), and declare both keys.

## Declaring a key on a policy

```ts
policy: {
	name: 'ChatEnabledPlugins', // chat.plugins.enabledPlugins (setting type: object)
	// ...
	value: managedSettingValue(COPILOT_ENABLED_PLUGINS_KEY),
	managedSettings: { [COPILOT_ENABLED_PLUGINS_KEY]: { type: 'string' } },
}
```

1. Add a key constant in `copilotManagedSettings.ts` that exactly matches the schema; never inline key strings.
2. Declare it in `managedSettings` with its bag type. Use `managedSettingValue(KEY)` for pass-through (memoized, preserving definition identity); hand-write the callback only to combine conditions. Callbacks must be pure; attribution evaluates them more than once.
3. Structured settings must declare `{ type: 'string' }`; `projectManagedSettings` drops values whose `typeof` mismatches (silently ignoring the setting), and `PolicyConfiguration` parses the JSON back. Add one row to `STRUCTURED_MANAGED_SETTINGS` and the field on `IManagedSettingsResponse`.
4. Controls with no governing setting go in `MANAGED_SETTINGS_CONTROL_DEFINITIONS` (always watched by native MDM, never projected) and need no policy export.
5. Export and test per [vscode-policy.md](./vscode-policy.md).

Policy-only settings use `included: false` (for example `chat.plugins.extraMarketplaces`).

## Transport control: `forceRemoteSettingsRefresh`

When effective (resolved across all channels, MDM first), only a fresh successful server response for the current account, auth provider, and endpoint unlocks AI features at startup or on scope change. Failures keep cached restrictions and keep AI disabled until a retry succeeds; authentication stays available. Once satisfied, same-scope background refreshes keep the accepted policy until a response arrives; a failure closes the gate. Chat keeps its selected mode while gated and rechecks the gate before dispatch.

## Governance presence and third-party harnesses

`IPolicyData.managedSettingsActive` is `true` when any channel supplies managed governance, independent of which keys VS Code declares. `thirdPartyAgentEnabledValue` (used by `Claude3PIntegration`/`Codex3PIntegration`) forces those harnesses off when preview features are disabled, governance is active, or `vscode.temporaryAllowLocalHarness` is `false`, because managed settings never reach Claude or Codex. `vscode.temporaryAllowLocalHarness` itself never counts as governance; empty or control-only server responses clear a cached governance flag.

## Diagnostics

**Developer: Policy Diagnostics** shows each channel's raw input → normalized bag → projection, then per-key precedence and the final bag. It separately shows the runtime's own sessionless `managedSettings.resolve()` snapshot, which excludes session-local contributions and does not prove a fresh fetch.

Tests: `copilotManagedSettings.test.ts`, `nativeManagedSettingsService.test.ts`, `fileManagedSettingsService.test.ts`, `accountPolicyService.test.ts`, `defaultAccount.test.ts`, `managedSettings.test.ts` (server/MDM equivalence).
