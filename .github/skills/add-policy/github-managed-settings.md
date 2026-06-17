# GitHub Copilot Managed Settings

This file documents the **managed-settings** modality: how an enterprise admin's
Copilot configuration (delivered via MDM, a file, or the GitHub server) flows into
VS Code's policy stack and locks a setting. It is a companion to `SKILL.md` — read
that first for the general policy lifecycle (`policy:` field, export, artifacts).

Managed settings layer **on top of** the existing policy framework. They do **not**
introduce a new `IPolicyService`; they feed `IPolicyData.managedSettings`, which the
existing `policy.value(policyData)` callback already consumes via `AccountPolicyService`.

## The big idea: one canonical bag, three delivery channels

Every enterprise-managed Copilot setting resolves through a single normalized bag:

```ts
// src/vs/base/common/policy.ts
export type ManagedSettingValue = string | number | boolean;
export type ManagedSettingsData = Readonly<Record<string, ManagedSettingValue>>;
```

…surfaced on `IPolicyData.managedSettings` (`src/vs/base/common/defaultAccount.ts`):

```ts
export interface IPolicyData {
    // ...
    /** Normalized enterprise-managed settings, keyed by dot-separated paths
     *  (e.g. `permissions.disableBypassPermissionsMode`). Single channel for
     *  enterprise config: server-delivered AND native MDM both project into this
     *  bag, so policy value() callbacks behave identically regardless of source.
     *  Structured settings (enabledPlugins, extraKnownMarketplaces) are carried
     *  as canonical JSON strings. */
    readonly managedSettings?: ManagedSettingsData;
}
```

Keys are **flat dot-paths**. Scalar leaves flatten directly. Structured values
(objects/arrays such as `enabledPlugins` / `extraKnownMarketplaces`) are carried as a
**JSON string under a single key** — the same shape an admin authors via native MDM —
and parsed back into the object-typed setting on read by `PolicyConfiguration`.

### Delivery channels

| Channel | Where it's read | Implementation | Lands on |
|---------|-----------------|----------------|----------|
| **Native MDM** (Windows registry / macOS plist) | OS managed preferences | `CopilotManagedSettingsService` (`src/vs/platform/policy/node/copilotManagedSettingsService.ts`) via `@vscode/policy-watcher` | `ICopilotManagedSettingsService.managedSettings` |
| **File-based** (`managed-settings.json`) | local file (per schema) | same MDM service path | `ICopilotManagedSettingsService.managedSettings` |
| **Server-managed** (`/copilot_internal/managed_settings`) | GitHub endpoint returning enterprise `.github/copilot/settings.json` | `adaptManagedSettings` (`src/vs/workbench/services/accounts/browser/managedSettings.ts`) → `DefaultAccountService.policyData` | `accountPolicyData.managedSettings` |

All three converge in `AccountPolicyService.getPolicyData()`:

```ts
// MDM overrides server; then project onto the declared schema.
const managedSettingsData = projectManagedSettings(
    { ...accountPolicyData?.managedSettings, ...managedPolicyData },
    collectManagedSettingsDefinitions(this.policyDefinitions),
    msg => this.logService.warn(`[AccountPolicy] ${msg}`)
);
return { ...accountPolicyData, managedSettings: managedSettingsData };
```

**Merge order: native MDM wins over server-delivered.** Then everything is projected
onto the declared schema (see below).

## Schema source of truth

When the developer has `copilot-agent-runtime` checked out side-by-side, reference
`copilot-agent-runtime/schema/managed-settings-schema.json` as the authoritative
shape. It is aligned with the `managed_settings` API output and is the same schema for
all three channels (MDM plist/registry, file-based, server-managed). Its top-level keys
today:

| Schema key | Type | Composition (`x-composition.strategy`) |
|------------|------|----------------------------------------|
| `permissions.disableBypassPermissionsMode` | string enum `"disable"` | most-restrictive-wins (sticky once set) |
| `enabledPlugins` | `{ "PLUGIN@MARKETPLACE": boolean }` | deny-wins (false beats true; enterprise denials immutable) |
| `extraKnownMarketplaces` | `{ name: { source } }` | most-restrictive-wins (higher layer is the complete allowlist) |
| `strictKnownMarketplaces` | array of source descriptors | most-restrictive-wins (empty array = lockdown) |

> Note a current divergence: the schema models `strictKnownMarketplaces` as an array
> allowlist, but the VS Code runtime today declares the `COPILOT_STRICT_MARKETPLACES_KEY`
> managed key as a **boolean** flag (`{ type: 'boolean' }` on `ChatStrictMarketplaces`).
> When reconciling, treat `managed-settings-schema.json` as the API source of truth and
> keep the VS Code `managedSettings` type declaration aligned with what the server
> actually projects into the bag.

Note the schema's `x-composition` describes the **server/runtime** layering across
enterprise/org/user. Inside VS Code the bag has already been collapsed to a single
projected `ManagedSettingsData` before a `policy.value()` callback ever sees it.

## Declaring a managed setting on a policy

A policy that should be driven by a managed-settings key declares two things on its
`IPolicy` object (`src/vs/base/common/policy.ts`):

1. `managedSettings` — the dot-path keys it reads, with their value `type`.
2. A `value(policyData)` callback that reads `policyData.managedSettings?.[KEY]`.

Use the exported key constants from
`src/vs/platform/policy/common/copilotManagedSettings.ts` — never inline the strings:

```ts
import {
    COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY,
} from '../../../../platform/policy/common/copilotManagedSettings.js';

// chat.tools.global.autoApprove — owns ChatToolsAutoApprove
policy: {
    name: 'ChatToolsAutoApprove',
    category: PolicyCategory.InteractiveSession,
    minimumVersion: '1.99',
    value: (policyData) =>
        policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === 'disable'
            || policyData.chat_preview_features_enabled === false
            ? false
            : undefined,
    managedSettings: {
        [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
    },
    localization: { description: { /* ... */ } },
}
```

Key rules for the `value` callback:

- Read from `policyData.managedSettings?.[KEY]` — never a typed field on `IPolicyData`
  (the typed `enabledPlugins` / `extraKnownMarketplaces` / `strictKnownMarketplaces`
  fields were **removed**; everything is the canonical bag now).
- Return the **locking value** when the managed setting demands it, `undefined` otherwise
  (so the user's setting falls through).
- It's fine to combine with `chat_preview_features_enabled === false` (see SKILL.md's
  "GitHub Preview Features" section).

### Structured (object/array) settings

For settings whose `type` is `'object'` or `'array'`, the policy still declares the
managed-settings key as a **string** (the JSON is carried as a string), and the
`value` callback returns that raw string. `PolicyConfiguration` then `JSON.parse`s it
back into the typed value on read (see `configurations.ts`). Examples in
`chat.shared.contribution.ts`:

```ts
// chat.plugins.enabledPlugins — type: 'object'
value: (policyData) => policyData.managedSettings?.[COPILOT_ENABLED_PLUGINS_KEY],
managedSettings: { [COPILOT_ENABLED_PLUGINS_KEY]: { type: 'string' } },
```

`ChatExtraMarketplaces` (`chat.plugins.extraMarketplaces`) is **policy-only**
(`included: false`) — there is no user-writable surface for it; it exists solely as a
delivery slot for the managed value.

## How the pieces fit (helpers in `copilotManagedSettings.ts`)

| Function | Role |
|----------|------|
| `flattenManagedSettings(obj)` | Flattens a nested response into dot-path scalars (used by the server adapter). |
| `collectManagedSettingsDefinitions(policyDefinitions)` | Aggregates every policy's `managedSettings` into one `key → { type }` map. **Single source of truth** for which keys (and types) are honored; drives both the MDM watcher and the server projection. |
| `projectManagedSettings(values, definitions, onWarn?)` | Keeps only declared keys whose runtime value **matches the declared type**. Undeclared keys and type mismatches are **dropped (validated, never coerced)**, with an optional warning. |

Constants (also in `copilotManagedSettings.ts`):

| Constant | Value |
|----------|-------|
| `GITHUB_COPILOT_WIN32_REGISTRY_PATH` | `SOFTWARE\Policies\GitHubCopilot` |
| `GITHUB_COPILOT_WIN32_POLICY_NAME` | `GitHubCopilot` (productName for the watcher) |
| `GITHUB_COPILOT_MACOS_BUNDLE_ID` | `com.github.copilot` (CFPreferences app id) |
| `COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY` | `permissions.disableBypassPermissionsMode` |
| `COPILOT_ENABLED_PLUGINS_KEY` | `enabledPlugins` |
| `COPILOT_EXTRA_MARKETPLACES_KEY` | `extraKnownMarketplaces` |
| `COPILOT_STRICT_MARKETPLACES_KEY` | `strictKnownMarketplaces` |

## Wiring (where the MDM service is constructed)

Native MDM is desktop-main only (`src/vs/code/electron-main/main.ts`):

```ts
if (isWindows) {
    copilotManagedSettingsService = new CopilotManagedSettingsService(
        logService, GITHUB_COPILOT_WIN32_POLICY_NAME, { registryPath: GITHUB_COPILOT_WIN32_REGISTRY_PATH });
} else if (isMacintosh) {
    copilotManagedSettingsService = new CopilotManagedSettingsService(
        logService, GITHUB_COPILOT_MACOS_BUNDLE_ID);
} else {
    services.set(ICopilotManagedSettingsService, new NullCopilotManagedSettingsService());
}
```

It is exposed to the renderer over IPC via `CopilotManagedSettingsChannel` /
`CopilotManagedSettingsChannelClient` (`copilotManagedSettingsIpc.ts`), registered as
the `copilotManagedSettings` channel in `app.ts`. `AccountPolicyService` subscribes to
`onDidChangeManagedSettings` and re-evaluates policy values when managed settings change.

The service only watches keys that some policy declares: `updatePolicyDefinitions`
calls `collectManagedSettingsDefinitions`, then `@vscode/policy-watcher` watches exactly
those dot-paths. No declared keys ⇒ no watcher.

## Adding a brand-new managed-settings key (checklist)

1. **Pick the canonical dot-path** and add it as a constant in
   `copilotManagedSettings.ts`. It must match the server `managed_settings` API field /
   the `managed-settings-schema.json` key exactly.
2. **Attach it to a policy** on the governing setting: add `managedSettings: { [KEY]: { type } }`
   and a `value(policyData)` that reads `policyData.managedSettings?.[KEY]`.
3. **If the value is structured** (object/array), declare the managed key as `'string'`,
   return the raw JSON string from `value`, and let `PolicyConfiguration` parse it. If the
   server response shape differs from the stored shape, normalize it in
   `adaptManagedSettings` (server side) so the bag matches what an admin would author in MDM.
4. **Keep the schema aligned.** The runtime, the server endpoint, and
   `managed-settings-schema.json` must agree on the key name and value type. The
   declaration-driven projection (`projectManagedSettings`) silently drops anything that
   doesn't match the declared type, so a type drift = a silently ignored setting.
5. **Export & test** as in SKILL.md Step 3–4 (`npm run typecheck-client`,
   `npm run export-policy-data`). Verify the policy appears in `policyData.jsonc`.

Reference tests:
- `src/vs/platform/policy/test/common/copilotManagedSettings.test.ts`
- `src/vs/platform/policy/test/node/copilotManagedSettingsService.test.ts`
- `src/vs/workbench/services/policies/test/browser/accountPolicyService.test.ts`
- `src/vs/workbench/services/accounts/test/browser/managedSettings.test.ts`
  (includes an end-to-end equivalence test: a server JSON string and a native MDM JSON
  string resolve to the **identical** typed object).

## Related: one policy governing many settings (`policyReference`)

A single enterprise policy can lock **more than one setting** — e.g. gate an agent in
both the editor window and the Agents window. This is the `policyReference` mechanism
(`src/vs/base/common/policy.ts` → `IPolicyReference`).

- The **owner** setting declares the full `policy: { name, … }` (type, metadata, runtime
  `value`/`managedSettings`). Exactly one setting may own a given policy name.
- Other settings declare `policyReference: { name }` pointing at that owner's policy name.
  A reference is a **pure pointer**: no type, no value, no localization. It only
  contributes the name so the setting is gated and the OS watcher observes the name in
  processes where the owner module isn't loaded.

```ts
// Owner: chat.agentHost.codexAgent.enabled
policy: { name: 'Codex3PIntegration', category: PolicyCategory.InteractiveSession,
          minimumVersion: '1.126', value: (d) => d.chat_preview_features_enabled === false ? false : undefined,
          localization: { /* ... */ } }

// Reference: sessions.chat.claudeAgent.enabled and chat.agentHost.claudeAgent.enabled
policyReference: { name: 'Claude3PIntegration' }  // owned by github.copilot.chat.claudeAgent.enabled
```

Rules & internals:

- **Cannot declare both** `policy` and `policyReference` on the same setting (rejected at
  registration in `configurationRegistry.ts`).
- The reference's `type` must match the owner's (enforced when exporting the catalog).
- `ConfigurationRegistry.getPolicyReferenceConfigurations()` returns `name → Set<settingKey>`.
  `PolicyConfiguration` applies the owner's resolved policy value to every reference key too.
- **IPC-safe serialization:** `toSerializablePolicyDefinition()` strips the non-cloneable
  `value()` callback so a policy registered in the main process survives structured-clone
  to the renderer. `AbstractPolicyService.updatePolicyDefinitions` replaces per name, so a
  late-registering **owner supersedes** an earlier-registered reference (and removing the
  owner falls back to the reference's bare type).
- **Catalog & diagnostics:** the exported `PolicyDto` gains `referencedSettings: string[]`
  (sorted; omitted when a policy governs only its owner) and `policyData.jsonc` lists them.
  **Developer: Policy Diagnostics** (`developerActions.ts`) lists every setting each policy
  governs, owner + references.

## What changed (PR history)

| PR | Change |
|----|--------|
| [#318623](https://github.com/microsoft/vscode/pull/318623) | Wire `/copilot_internal/managed_settings` into `AccountPolicyService`/`IPolicyData`; add `chat.plugins.enabledPlugins`/`extraMarketplaces`/`strictMarketplaces` settings + `adaptManagedSettings` shape adaptation. No new `IPolicyService`. |
| [#320991](https://github.com/microsoft/vscode/pull/320991) | Add native MDM delivery: `CopilotManagedSettingsService` + `@vscode/policy-watcher`; let policies declare `managedSettings` mappings; wire the first V0 key `permissions.disableBypassPermissionsMode` → force `ChatToolsAutoApprove=false`. |
| [#321218](https://github.com/microsoft/vscode/pull/321218) | Make `IPolicyData.managedSettings` the **single** channel: server + native MDM project into one canonical bag; structured settings carried as canonical JSON strings; remove the typed `enabledPlugins`/`extraKnownMarketplaces`/`strictKnownMarketplaces` fields. End-to-end equivalence test. |
| [#321515](https://github.com/microsoft/vscode/pull/321515) | Add `policyReference` so one policy governs many settings; callback-free serialization; catalog + diagnostics list governed settings. Used to gate Claude (`Claude3PIntegration`) and Codex (`Codex3PIntegration`) across the editor and Agents windows. |
