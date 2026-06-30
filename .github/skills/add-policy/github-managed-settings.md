# GitHub Copilot Managed Settings

This file documents the **managed-settings** modality: how an enterprise admin's
Copilot configuration (delivered to VS Code via native MDM or the GitHub server) flows
into VS Code's policy stack and locks a setting. It is a companion to `SKILL.md` — read
that first for the general policy lifecycle (`policy:` field, export, artifacts).

Managed settings layer **on top of** the existing policy framework. They do **not**
introduce a new `IPolicyService`; they feed `IPolicyData.managedSettings`, which the
existing `policy.value(policyData)` callback already consumes via `AccountPolicyService`.

## The big idea: one canonical bag, three delivery channels (in VS Code)

Every enterprise-managed Copilot setting resolves through a single normalized bag:

```ts
// src/vs/base/common/policy.ts
export type PolicyValue = string | number | boolean;
export type ManagedSettingValue = PolicyValue;
export type ManagedSettingsData = Readonly<Record<string, ManagedSettingValue>>;
```

…surfaced on `IPolicyData.managedSettings` (`src/vs/base/common/defaultAccount.ts`).
The real JSDoc there summarizes it as: a normalized bag keyed by dot-separated paths
(e.g. `permissions.disableBypassPermissionsMode`), the single channel for
enterprise-managed config so server-delivered and native MDM settings resolve
identically, with structured settings (e.g. `enabledPlugins`, `extraKnownMarketplaces`)
carried as canonical JSON strings:

```ts
export interface IPolicyData {
    // ...
    readonly managedSettings?: ManagedSettingsData;
}
```

Keys are **flat dot-paths**. Scalar leaves flatten directly. Structured values
(objects/arrays such as `enabledPlugins` / `extraKnownMarketplaces`) are carried as a
**JSON string under a single key** — the same shape an admin authors via native MDM —
and parsed back into the object-typed setting on read by `PolicyConfiguration`.

### Delivery channels

VS Code implements **three** channels feeding the bag, matching the external schema's
described delivery slots (native MDM, server-managed, and file-based).

| Channel | Where it's read | Implementation | Lands on |
|---------|-----------------|----------------|----------|
| **Native MDM** (Windows registry / macOS plist) | OS managed preferences | `NativeManagedSettingsService` (`src/vs/platform/policy/node/nativeManagedSettingsService.ts`) via `@vscode/policy-watcher` | `INativeManagedSettingsService.managedSettings` |
| **Server-managed** (`/copilot_internal/managed_settings`) | GitHub endpoint; per the code comment in `managedSettings.ts`, it returns the enterprise's `.github/copilot/settings.json` content | `adaptManagedSettings` (`src/vs/workbench/services/accounts/browser/managedSettings.ts`) → `DefaultAccountService.policyData` | `accountPolicyData.managedSettings` |
| **File-based** (`managed-settings.json`) | well-known per-OS disk path (e.g. `/Library/Application Support/GitHubCopilot/` on macOS), read in the main process and exposed to renderer windows over IPC | `FileManagedSettingsService` (`src/vs/platform/policy/common/fileManagedSettingsService.ts`) | `IFileManagedSettingsService.managedSettings` |

All three VS Code channels converge in `AccountPolicyService.getPolicyData()`.

**Precedence: native MDM managed settings win over the server-delivered channel, which in
turn wins over the file-based channel** (`selectManagedSettings` in `copilotManagedSettings.ts`).
There is a single authoritative source at any point in time — the channels are **not**
merged. The highest-precedence non-empty channel wins outright and the rest are ignored.
Rationale: the server is harder to bypass than local MDM, and a local file is the most
easily tampered with, so admins need one authoritative source to reason about. The
winning channel is then projected onto the declared schema (see below). Client-side
merging still happens *within* the winning channel (e.g. `enabledPlugins`,
`extraKnownMarketplaces`).

## Schema source of truth

When the developer has `copilot-agent-runtime` checked out side-by-side, reference
`copilot-agent-runtime/schema/managed-settings-schema.json` as the authoritative
shape. It is aligned with the `managed_settings` API output and is the schema for all
delivery channels (MDM plist/registry, file-based, server-managed). Its top-level
properties today are `permissions`, `enabledPlugins`, `extraKnownMarketplaces`, and
`strictKnownMarketplaces` (nested objects/arrays). Note the schema is **nested**, whereas
the VS Code bag is **flattened** to dot-paths — e.g. the schema's nested
`permissions.disableBypassPermissionsMode` becomes the flat bag key of the same name
(the `COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY` constant):

| Schema property (path) | Type in schema | Composition (`x-composition.strategy`) |
|------------------------|----------------|----------------------------------------|
| `permissions.disableBypassPermissionsMode` | string enum `"disable"` | most-restrictive-wins (sticky once set) |
| `enabledPlugins` | `{ "PLUGIN@MARKETPLACE": boolean }` | deny-wins (false beats true; enterprise denials immutable) |
| `extraKnownMarketplaces` | `{ name: { source } }`, source `github` \| `git` \| `directory` | most-restrictive-wins (higher layer is the complete allowlist) |
| `strictKnownMarketplaces` | array of source descriptors | most-restrictive-wins (empty array = lockdown) |

> **Current schema ↔ runtime divergence** (treat `managed-settings-schema.json` as the
> API source of truth, and keep the VS Code `managedSettings` declarations aligned with
> what the server actually projects into the bag):
> - `extraKnownMarketplaces`: the schema permits source kinds `github` / `git` /
>   `directory`, but the VS Code normalizer only accepts `github` and `git` —
>   `directory` (and any other kind) is dropped with a warning
>   (`managedSettings.ts` `normalizeExtraKnownMarketplaces`; `IExtraKnownMarketplaceEntry`
>   in `base/common/managedSettings.ts` only types `github`/`git`).
>
> Note every **structured** key — `enabledPlugins`, `extraKnownMarketplaces`,
> `strictKnownMarketplaces` — is declared on its policy as **`{ type: 'string' }`**: the
> object/array value is carried as a JSON string in the bag and parsed back on read (see
> [Structured settings](#structured-objectarray-settings)). The *setting's* own `type` is
> the real shape — e.g. `chat.plugins.strictMarketplaces` is `['array', 'null']`, modeling
> the schema's array allowlist; only the bag-carrying type is `'string'`. That `'string'` is
> **required, not cosmetic**: `type` is a required field whose only allowed values are
> `'string' | 'number' | 'boolean'`, so omitting it or declaring `'object'` / `'array'` is a
> *compile* error; declaring `'number'` / `'boolean'` compiles but then fails projection
> validation at *runtime* (the JSON-string bag value flunks `typeof value === type`), so the key
> is dropped and silently never applies.

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

// chat.tools.global.autoApprove — owns ChatToolsAutoApprove (existing policy, shown verbatim)
policy: {
    name: 'ChatToolsAutoApprove',
    category: PolicyCategory.InteractiveSession,
    minimumVersion: '1.99', // existing value — for a NEW policy use package.json major.minor (see SKILL.md Step 1)
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

For the **common pass-through case** — lock to the managed value, otherwise fall through to
the user's setting — use the `managedSettingValue(KEY)` helper instead of hand-writing the
callback:

```ts
import { managedSettingValue } from '../../../../platform/policy/common/copilotManagedSettings.js';

value: managedSettingValue(COPILOT_ENABLED_PLUGINS_KEY),
```

Policies that combine the managed value with other conditions (like `ChatToolsAutoApprove`
above, which also checks `chat_preview_features_enabled`) keep a custom callback. The helper
returns a callback memoized per key (the same function reference for a given key on every call),
preserving the policy-definition reference identity that lets `isSamePolicyDefinition` avoid
needless re-registration.

### Structured (object/array) settings

For settings whose `type` is `'object'` or `'array'`, the policy still declares the
managed-settings key as a **string** (the JSON is carried as a string), and the
`value` callback returns that raw string. The `{ type: 'string' }` is **mandatory and must
be `'string'`** for these keys, not filler: `projectManagedSettings` keeps a bag value only
when `typeof value === type`, and the native MDM watcher reads the registry/plist value as
that type. `type` is a required field whose only allowed values are `'string' | 'number' |
'boolean'` (`IManagedSettingPolicyDefinition` in `base/common/policy.ts`), so omitting it or
declaring `'object'` / `'array'` is a *compile* error. Declaring `'number'` / `'boolean'`
compiles, but because the structured value travels as a JSON string it then flunks that
`typeof` check at *runtime* and gets dropped, so the managed setting silently never applies. When the policy value is a string but the
setting's type is not, `PolicyConfiguration` parses it back into the typed value on read
via its own lenient JSONC parser (`PolicyConfiguration.parse()` using a `json.visit`
streaming visitor — *not* `JSON.parse`; see `configurations.ts`). Examples in
`chat.shared.contribution.ts`:

```ts
// chat.plugins.enabledPlugins — setting type: 'object'; managed key carried as a string
value: managedSettingValue(COPILOT_ENABLED_PLUGINS_KEY),
managedSettings: { [COPILOT_ENABLED_PLUGINS_KEY]: { type: 'string' } },
```

`ChatExtraMarketplaces` (`chat.plugins.extraMarketplaces`) is **policy-only**
(`included: false`) — there is no user-writable surface for it; it exists solely as a
delivery slot for the managed value.

## How the pieces fit (helpers in `copilotManagedSettings.ts`)

| Function | Role |
|----------|------|
| `flattenManagedSettings(obj)` | Flattens a nested response into dot-path scalars (used by `normalizeManagedSettings`). |
| `normalizeManagedSettings(parsed, onWarn?)` | The **single** normalizer shared by every channel: turns a parsed managed-settings object (server response, file on disk, …) into the canonical bag. Scalar leaves flatten; structured keys (declared in the `STRUCTURED_MANAGED_SETTINGS` table) are JSON-encoded under a single key each. The server adapter `adaptManagedSettings` and the file channel both call it. |
| `collectManagedSettingsDefinitions(policyDefinitions)` | Aggregates every policy's `managedSettings` into one `key → { type }` map. **Single source of truth** for which keys (and types) are honored; drives both the MDM watcher and the server projection. |
| `hasManagedSettingsDefinitions(policyDefinitions)` | Cheap short-circuiting existence check (does *any* policy declare a managed key?) — used to decide whether the native MDM watcher is needed at all, without building the full aggregate. |
| `projectManagedSettings(values, definitions, onWarn?)` | Keeps only declared keys whose runtime value **matches the declared type**. Undeclared keys and type mismatches are **dropped (validated, never coerced)**, with an optional warning. |
| `selectManagedSettings(nativeMdm, server, file)` | Picks the single authoritative channel by precedence (native MDM → server → file); never merges. **The extension point when adding a new channel** — extend the `ManagedSettingsSource` union and this function together. |
| `managedSettingValue(key)` | Builds the standard pass-through `value` callback `policyData => policyData.managedSettings?.[key]`. Use for the common "lock to the managed value, else fall through" case (see [Declaring a managed setting](#declaring-a-managed-setting-on-a-policy)). |

### Normalization: the structured-key descriptor table

`normalizeManagedSettings` (`copilotManagedSettings.ts`) turns a parsed managed-settings
object into the canonical bag, and is shared by every channel — the server adapter
`adaptManagedSettings` (`managedSettings.ts`) is a thin wrapper around it, and the file
channel calls it directly. Scalar leaves flatten directly; **structured** (object/array)
keys are JSON-encoded under a single bag key. The per-key knowledge for the structured ones
lives in **one table**, `STRUCTURED_MANAGED_SETTINGS`. Each row declares the `key` (the source
field name read from the input, which is also the canonical bag key the JSON string is stored
under — identical for structured settings by contract) and an `encode(raw, onWarn?)` that
normalizes the value before `JSON.stringify`. Adding a structured key is **one descriptor row**
(plus the server `IManagedSettingsResponse` field and the policy declaration) — no new bespoke branch in the
normalizer. The `adaptManagedSettings` / `normalizeManagedSettings` tests are the drift backstop.

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

Native MDM is desktop-main only (`src/vs/code/electron-main/main.ts`). The real wiring
constructs the platform service first (Windows / macOS only), then registers it — falling
back to `NullNativeManagedSettingsService` on Linux (abbreviated):

```ts
let nativeManagedSettingsService: NativeManagedSettingsService | undefined;
if (isWindows) {
    nativeManagedSettingsService = new NativeManagedSettingsService(
        logService, GITHUB_COPILOT_WIN32_POLICY_NAME, { registryPath: GITHUB_COPILOT_WIN32_REGISTRY_PATH });
} else if (isMacintosh) {
    nativeManagedSettingsService = new NativeManagedSettingsService(
        logService, GITHUB_COPILOT_MACOS_BUNDLE_ID);
}
if (nativeManagedSettingsService) {
    services.set(INativeManagedSettingsService, nativeManagedSettingsService);
} else {
    services.set(INativeManagedSettingsService, new NullNativeManagedSettingsService());
}
```

It is exposed to the renderer over IPC via `NativeManagedSettingsChannel` /
`NativeManagedSettingsChannelClient` (`nativeManagedSettingsIpc.ts`), registered as
the `nativeManagedSettings` channel in `app.ts`. `AccountPolicyService` subscribes to
`onDidChangeManagedSettings` and re-evaluates policy values when managed settings change.

The service only watches keys that some policy declares: `updatePolicyDefinitions`
calls `collectManagedSettingsDefinitions`, then `@vscode/policy-watcher` watches exactly
those dot-paths. No declared keys ⇒ no watcher.

The **file-based** channel is wired the same way (`src/vs/code/electron-main/main.ts`):
`FileManagedSettingsService` reads `managed-settings.json` from the per-OS well-known path
(`MANAGED_SETTINGS_*` constants in `copilotManagedSettings.ts`), falling back to
`NullFileManagedSettingsService` when no path applies. It is exposed to the renderer over IPC
via `FileManagedSettingsChannel` / `FileManagedSettingsChannelClient`
(`fileManagedSettingsIpc.ts`), registered as the `fileManagedSettings` channel in `app.ts`,
and `AccountPolicyService` subscribes to its `onDidChangeManagedSettings` too.

## Adding a brand-new managed-settings key (checklist)

1. **Pick the canonical dot-path** and add it as a constant in
   `copilotManagedSettings.ts`. It must match the server `managed_settings` API field /
   the `managed-settings-schema.json` key exactly.
2. **Attach it to a policy** on the governing setting: add `managedSettings: { [KEY]: { type } }`
   and a `value` callback. For a plain pass-through use `value: managedSettingValue(KEY)`;
   only hand-write the callback when combining with another condition.
3. **If the value is structured** (object/array), declare the managed key as `'string'` and
   let `PolicyConfiguration` parse the JSON back on read. Then teach the **shared normalizer** by
   adding one row to `STRUCTURED_MANAGED_SETTINGS` in `copilotManagedSettings.ts` (the `key` and an
   `encode` that normalizes the raw shape into what an admin would author in MDM) plus the matching
   field on the server `IManagedSettingsResponse`. That table
   is the single place structured-key handling lives, and it applies to every channel (server,
   file-based, …) because they all funnel through `normalizeManagedSettings`.
4. **Keep the schema aligned.** The runtime, the server endpoint, and
   `managed-settings-schema.json` must agree on the key name and value type. The
   declaration-driven projection (`projectManagedSettings`) silently drops anything that
   doesn't match the declared type, so a type drift = a silently ignored setting.
5. **Export & test** as in SKILL.md Step 3–4 (`npm run typecheck-client`,
   `npm run export-policy-data`). Verify the policy appears in `policyData.jsonc`.

Reference tests:
- `src/vs/platform/policy/test/common/copilotManagedSettings.test.ts`
- `src/vs/platform/policy/test/node/nativeManagedSettingsService.test.ts`
- `src/vs/workbench/services/policies/test/browser/accountPolicyService.test.ts`
- `src/vs/workbench/services/accounts/test/browser/managedSettings.test.ts`
  (includes an end-to-end equivalence test: a server JSON string and a native MDM JSON
  string resolve to the **identical** typed object).
- `src/vs/platform/policy/test/common/fileManagedSettingsService.test.ts`
  (covers `normalizeManagedSettings` and the file-based channel reader).

**Manual/local testing:** use the mock policy server to serve arbitrary
`managed_settings` (and entitlement/token) responses and apply them via
**Developer: Sync Account Policy** — see [local-testing.md](./local-testing.md).

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
// Owner: chat.agentHost.codexAgent.enabled (existing policy, shown verbatim;
// `minimumVersion: '1.126'` is its historical value — a NEW policy uses package.json major.minor)
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
  (sorted; omitted when a policy governs only its owner). The exporter only captures
  references that are **registered/loaded at export time**, so the checked-in
  `policyData.jsonc` can list fewer references than the source declares — e.g.
  `Claude3PIntegration` lists only `chat.agentHost.claudeAgent.enabled`, not the
  `sessions.chat.claudeAgent.enabled` reference declared in the sessions contribution.
  At runtime, the **Developer: Policy Diagnostics** report (`developerActions.ts`) lists
  every registered setting each policy governs, owner + references.

## What changed (PR history)

| PR | Change |
|----|--------|
| [#318623](https://github.com/microsoft/vscode/pull/318623) | Wire `/copilot_internal/managed_settings` into `AccountPolicyService`/`IPolicyData`; add `chat.plugins.enabledPlugins`/`extraMarketplaces`/`strictMarketplaces` settings + `adaptManagedSettings` shape adaptation. No new `IPolicyService`. |
| [#320991](https://github.com/microsoft/vscode/pull/320991) | Add native MDM delivery: `NativeManagedSettingsService` + `@vscode/policy-watcher`; let policies declare `managedSettings` mappings; wire the first V0 key `permissions.disableBypassPermissionsMode` → force `ChatToolsAutoApprove=false`. |
| [#321218](https://github.com/microsoft/vscode/pull/321218) | Make `IPolicyData.managedSettings` the **single** channel: server + native MDM project into one canonical bag; structured settings carried as canonical JSON strings; remove the typed `enabledPlugins`/`extraKnownMarketplaces`/`strictKnownMarketplaces` fields. End-to-end equivalence test. |
| [#321515](https://github.com/microsoft/vscode/pull/321515) | Add `policyReference` so one policy governs many settings; callback-free serialization; catalog + diagnostics list governed settings. Used to gate Claude (`Claude3PIntegration`) and Codex (`Codex3PIntegration`) across the editor and Agents windows. |
