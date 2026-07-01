---
name: add-policy
description: Use when adding, modifying, or reviewing VS Code configuration policies. Covers the full policy lifecycle from registration to export to platform-specific artifacts. Run on ANY change that adds a `policy:` field to a configuration property.
---

# Adding a Configuration Policy

Policies allow enterprise administrators to lock configuration settings via OS-level mechanisms (Windows Group Policy, macOS managed preferences, Linux config files) or via Copilot account-level policy data. This skill covers the complete procedure.

## When to Use

- Adding a new `policy:` field to any configuration property
- Modifying an existing policy (rename, category change, etc.)
- Reviewing a PR that touches policy registration
- Adding account-based policy support via `IPolicyData`
- Wiring an enterprise **managed setting** (native MDM / GitHub server) — see **[github-managed-settings.md](./github-managed-settings.md)**
- Having one policy govern **multiple** settings via `policyReference`
- **Testing** account/managed-settings policies locally without the real backend — see **[local-testing.md](./local-testing.md)**

## Architecture Overview

### Policy Sources (layered, last writer wins)

| Source | Implementation | How it reads policies |
|--------|---------------|----------------------|
| **OS-level** (Windows registry, macOS plist) | `NativePolicyService` via `@vscode/policy-watcher` | Watches `Software\Policies\Microsoft\{productName}` (Windows) or bundle identifier prefs (macOS) |
| **Linux file** | `FilePolicyService` | Reads `/etc/vscode/policy.json` |
| **Account/GitHub** | `AccountPolicyService` | Reads `IPolicyData` from `IDefaultAccountService.policyData`, applies `value()` function. Server-delivered managed settings arrive on `policyData.managedSettings`; native MDM (`INativeManagedSettingsService`) and a file on disk (`IFileManagedSettingsService`) are **separate** inputs that `AccountPolicyService` selects among in `getPolicyData()` via `selectManagedSettings(nativeMdm, server, file)` (single authoritative source by precedence native MDM > server > file; no merging between layers) |
| **Copilot managed settings (native MDM)** | `NativeManagedSettingsService` via `@vscode/policy-watcher` | Watches `SOFTWARE\Policies\GitHubCopilot` (Windows) / `com.github.copilot` prefs (macOS); feeds the canonical `managedSettings` bag — see [github-managed-settings.md](./github-managed-settings.md) |
| **Copilot managed settings (file)** | `FileManagedSettingsService` | Reads + watches `managed-settings.json` from a well-known per-OS path in the main process, exposed to renderers over IPC; lowest-precedence managed-settings channel — see [github-managed-settings.md](./github-managed-settings.md) |
| **Multiplex** | `MultiplexPolicyService` | In the main process, combines multiple OS/file policy readers; in desktop and Agents-window renderers, combines the main-process `PolicyChannelClient` with `AccountPolicyService` |

### Key Files

| File | Purpose |
|------|---------|
| `src/vs/base/common/policy.ts` | `PolicyCategory` enum, `IPolicy` interface, `IPolicyReference`, `ManagedSettingsData`, `IManagedSettingsPolicyDefinitions` |
| `src/vs/platform/policy/common/policy.ts` | `IPolicyService`, `AbstractPolicyService`, `PolicyDefinition`, `toSerializablePolicyDefinition` (drops the non-cloneable `value()` for IPC), `getRestrictedPolicyValue` |
| `src/vs/platform/policy/common/copilotManagedSettings.ts` | Managed-settings key constants + well-known file paths, `collectManagedSettingsDefinitions`, `projectManagedSettings`, the shared `normalizeManagedSettings` (single normalizer for all channels), `selectManagedSettings` (channel precedence), `INativeManagedSettingsService` / `IFileManagedSettingsService` |
| `src/vs/platform/policy/node/nativeManagedSettingsService.ts` | Native MDM watcher (`@vscode/policy-watcher`) for Copilot managed settings |
| `src/vs/platform/policy/common/fileManagedSettingsService.ts` | File-based channel: reads + watches `managed-settings.json` on a well-known per-OS path, normalizes via `normalizeManagedSettings` |
| `src/vs/platform/configuration/common/configurations.ts` | `PolicyConfiguration` — bridges policies to configuration values; parses JSON-string managed settings back to typed values; applies values to `policyReference` settings |
| `src/vs/platform/configuration/common/configurationRegistry.ts` | `policy` / `policyReference` registration; `getPolicyReferenceConfigurations()` (name → subordinate settings) |
| `src/vs/workbench/services/policies/common/accountPolicyService.ts` | Account/GitHub-based policy evaluation; selects + projects managed settings (native MDM over server; single authoritative layer) |
| `src/vs/workbench/services/accounts/browser/managedSettings.ts` | `adaptManagedSettings` — normalizes the server `managed_settings` response into the canonical bag |
| `src/vs/workbench/services/policies/common/multiplexPolicyService.ts` | Combines multiple policy services |
| `src/vs/workbench/contrib/policyExport/electron-browser/policyExport.contribution.ts` | `--export-policy-data` CLI handler |
| `src/vs/base/common/defaultAccount.ts` | `IPolicyData` interface (incl. `managedSettings`) for account-level policy fields |
| `build/lib/policies/policyData.jsonc` | Auto-generated policy catalog incl. `referencedSettings` (DO NOT edit manually) |
| `build/lib/policies/policyGenerator.ts` | Generates ADMX/ADML (Windows), plist (macOS), JSON (Linux) |
| `build/lib/test/policyConversion.test.ts` | Tests for policy artifact generation |

## Procedure

### Step 1 — Add the `policy` field to the configuration property

Find the configuration registration (typically in a `*.contribution.ts` file) and add a `policy` object to the property schema.

**Required fields:**

**Determining `minimumVersion`:** Always read `version` from the root `package.json` and use the `major.minor` portion. For example, if `package.json` has `"version": "1.112.0"`, use `minimumVersion: '1.112'`. Never hardcode an old version like `'1.99'`.

```typescript
policy: {
    name: 'MyPolicyName',                          // PascalCase, unique across all policies
    category: PolicyCategory.InteractiveSession,    // From PolicyCategory enum
    minimumVersion: '1.112',                        // Use major.minor from package.json version
    localization: {
        description: {
            key: 'my.config.key',                   // NLS key for the description
            value: nls.localize('my.config.key', "Human-readable description."),
        }
    }
}
```

**Optional: `value` function for account-based policy:**

If this policy should also be controllable via Copilot account policy data (from `IPolicyData`), add a `value` function:

```typescript
policy: {
    name: 'MyPolicyName',
    category: PolicyCategory.InteractiveSession,
    minimumVersion: '1.112',                        // Use major.minor from package.json version
    value: (policyData) => policyData.my_field === false ? false : undefined,
    localization: { /* ... */ }
}
```

The `value` function receives `IPolicyData` (from `src/vs/base/common/defaultAccount.ts`) and should:
- Return a concrete value to **override** the user's setting
- Return `undefined` to **not apply** any account-level override (falls through to OS policy or user setting)

If you need a new field on `IPolicyData`, add it to the interface in `src/vs/base/common/defaultAccount.ts`.

**Optional: `enumDescriptions` for enum/string policies:**

**IMPORTANT:** If the configuration property has `type: 'string'` and an `enum` array, you **must** include `enumDescriptions` in the `localization` block with the same number of entries as the `enum` array. Without this, `npm run export-policy-data` will fail with: `enumDescriptions must exist and have the same length as enum for policy "..."`.

```typescript
localization: {
    description: { key: '...', value: nls.localize('...', "...") },
    enumDescriptions: [
        { key: 'opt.none', value: nls.localize('opt.none', "No access.") },
        { key: 'opt.all', value: nls.localize('opt.all', "Full access.") },
    ]
}
```

### Step 2 — Ensure `PolicyCategory` is imported

```typescript
import { PolicyCategory } from '../../../../base/common/policy.js';
```

Existing categories in the `PolicyCategory` enum:
- `Extensions`
- `IntegratedTerminal`
- `InteractiveSession` (used for all chat/Copilot policies)
- `Telemetry`
- `Update`

If you need a new category, add it to `PolicyCategory` in `src/vs/base/common/policy.ts` and add corresponding `PolicyCategoryData` localization.

### Step 3 — Validate TypeScript compilation

Check the `VS Code - Build` watch task output, or run:

```bash
npm run typecheck-client
```

### Step 4 — Export the policy data

Regenerate the auto-generated policy catalog:

```bash
npm run export-policy-data
```

This script handles transpilation, sets up `GITHUB_TOKEN` (via `gh` CLI or GitHub OAuth device flow), and runs `--export-policy-data`. The export command reads extension configuration policies from the distro's `product.json` via the GitHub API and merges them into the output.

This updates `build/lib/policies/policyData.jsonc`. **Never edit this file manually.** Verify your new policy appears in the output.  You will need code review from a codeowner to merge the change to main.


## Policy for extension-provided settings

Extension authors cannot add `policy:` fields directly—their settings are defined in the extension's `package.json`, not in VS Code core. Instead, policies for extension settings are defined in `vscode-distro`'s `product.json` under the `extensionConfigurationPolicy` key.

### How it works

1. **Source of truth**: The `extensionConfigurationPolicy` map lives in `vscode-distro` under `mixin/{quality}/product.json` (stable, insider, exploration).
2. **Runtime**: When VS Code starts with a distro-mixed `product.json`, `configurationExtensionPoint.ts` reads `extensionConfigurationPolicy` and attaches matching `policy` objects to extension-contributed configuration properties.
3. **Export/build**: The `--export-policy-data` command fetches the distro's `product.json` at the commit pinned in `package.json` and merges extension policies into the output. Use `npm run export-policy-data` which sets up authentication automatically.

### Distro format

Each entry in `extensionConfigurationPolicy` must include:

```json
"extensionConfigurationPolicy": {
    "publisher.extension.settingName": {
        "name": "PolicyName",
        "category": "InteractiveSession",
        "minimumVersion": "1.99",
        "description": "Human-readable description."
    }
}
```

- `name`: PascalCase policy name, unique across all policies
- `category`: Must be a valid `PolicyCategory` enum value (e.g., `InteractiveSession`, `Extensions`)
- `minimumVersion`: The VS Code version that first shipped this policy
- `description`: Human-readable description string used to generate localization key/value pairs for ADMX/ADML/macOS/Linux policy artifacts

### Adding a new extension policy

1. Add the entry to `extensionConfigurationPolicy` in **all three** quality `product.json` files in `vscode-distro` (`mixin/stable/`, `mixin/insider/`, `mixin/exploration/`)
2. Update the `distro` commit hash in `package.json` to point to the distro commit that includes your new entry — the export command fetches extension policies from the pinned distro commit
3. Regenerate `policyData.jsonc` by running `npm run export-policy-data` (see Step 4 above)
4. Update the test fixture at `src/vs/workbench/contrib/policyExport/test/node/extensionPolicyFixture.json` with the new entry

### Test fixtures

The file `src/vs/workbench/contrib/policyExport/test/node/extensionPolicyFixture.json` is a test fixture that must stay in sync with the extension policies in the checked-in `policyData.jsonc`. When extension policies are added or changed in the distro, this fixture must be updated to match — otherwise the integration test will fail because the test output (generated from the fixture) won't match the checked-in file (generated from the real distro).

### Downstream consumers

| Consumer | What it reads | Output |
|----------|--------------|--------|
| `policyGenerator.ts` | `policyData.jsonc` | ADMX/ADML (Windows GP), `.mobileconfig` (macOS), `policy.json` (Linux) |
| `vscode-website` (`gulpfile.policies.js`) | `policyData.jsonc` | Enterprise policy reference table at code.visualstudio.com/docs/enterprise/policies |
| `vscode-docs` | Generated from website build | `docs/enterprise/policies.md` |

## GitHub Preview Features

If your setting is a **GitHub Preview Feature** — meaning it's a Copilot/chat feature that organizations can disable via their GitHub account-level policy — you **must** add a `value` function that checks `policyData.chat_preview_features_enabled`.

### When to add this flag

Add the `chat_preview_features_enabled` check when **all** of these apply:

- The setting controls a Copilot or chat feature (e.g., agent tools, hooks, MCP, auto-approve)
- The feature is in preview or experimental status (typically tagged `'preview'` or `'experimental'`)
- An organization admin should be able to disable it for all users in their org via GitHub account policy

### How it works

The `chat_preview_features_enabled` field on `IPolicyData` (defined in `src/vs/base/common/defaultAccount.ts`) is populated from the user's GitHub Copilot token entitlements. When an organization admin disables preview features, `chat_preview_features_enabled` is set to `false`.

### Pattern

Add a `value` function to the policy that returns a disabling value when `chat_preview_features_enabled === false`, and `undefined` otherwise (to fall through to the user's own setting):

```typescript
policy: {
    name: 'MyPreviewFeaturePolicy',
    category: PolicyCategory.InteractiveSession,
    minimumVersion: '1.xx', // Must match the first VS Code release that ships this policy.
    value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
    localization: {
        description: {
            key: 'my.setting.description',
            value: nls.localize('my.setting.description', "Description of the setting."),
        }
    }
}
```

Key details:
- **Always compare with `=== false`**, not `!policyData.chat_preview_features_enabled` — the field is optional and `undefined` means "no policy data available", which should not disable the feature.
- **Return `undefined`** when the flag is not `false` so the account-level policy does not override the user's setting.
- **Return the disabling value** for the setting's type: `false` for booleans, a restrictive string/enum value for other types.

### Real-world examples

See `chat.tools.global.autoApprove` and `chat.useHooks` in `src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts` for existing settings that use this pattern.

## Enterprise Managed Settings (native MDM / GitHub server)

GitHub Copilot enterprise admins can lock settings through a **managed-settings** bag.
VS Code feeds the bag from **two** channels: native MDM (Windows registry / macOS plist)
and the GitHub `/copilot_internal/managed_settings` endpoint. (The external
`managed-settings-schema.json` also describes a `managed-settings.json` file channel, but
VS Code does **not** read such a file.) Both VS Code channels converge on
`IPolicyData.managedSettings` (a flat dot-path bag) and are consumed by the **existing**
`policy.value(policyData)` callback — there is no new `IPolicyService`.

To drive a policy from a managed setting, declare `managedSettings` on the policy and
read `policyData.managedSettings?.[KEY]` in `value` (the real `ChatToolsAutoApprove` also
ORs in `chat_preview_features_enabled === false`):

```typescript
// Existing policy shown verbatim; `minimumVersion: '1.99'` is its historical value —
// a NEW policy derives minimumVersion from package.json major.minor (see Step 1).
policy: {
    name: 'ChatToolsAutoApprove',
    category: PolicyCategory.InteractiveSession,
    minimumVersion: '1.99',
    value: (policyData) =>
        policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === 'disable'
            || policyData.chat_preview_features_enabled === false ? false : undefined,
    managedSettings: {
        [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
    },
    localization: { /* ... */ }
}
```

**This is its own modality — full details, schema source of truth, helpers, wiring, and
the new-key checklist are in [github-managed-settings.md](./github-managed-settings.md).**
Read it before adding or reviewing any managed-settings key.

**Testing locally:** to exercise the account/managed-settings flow without the real
GitHub backend, use the mock policy server — see
**[local-testing.md](./local-testing.md)**.

## One Policy for Many Settings (`policyReference`)

A single policy can govern multiple settings (e.g. gate an agent in both the editor
window and the Agents window). The **owner** declares the full `policy: { name, … }`;
other settings declare `policyReference: { name }` pointing at the owner's policy name.

```typescript
// Owner setting (existing policy; `minimumVersion: '1.126'` is its historical value —
// a NEW policy uses package.json major.minor, see Step 1)
policy: { name: 'Codex3PIntegration', category: PolicyCategory.InteractiveSession, minimumVersion: '1.126', /* ... */ }

// Subordinate setting (no type/value/localization of its own)
policyReference: { name: 'Codex3PIntegration' }
```

`policyReference` is not managed-settings-specific: use it whenever one enterprise
policy should lock multiple settings to the same value. The reference is a **pure
pointer**. It contributes no type, `value`, `managedSettings`, `restrictedValue`, or
localization of its own; the owner remains the single source of truth for policy
metadata and runtime behavior.

Key rules and internals:

- A setting must **not** declare both `policy` and `policyReference` (rejected during
  configuration registration).
- Exactly one setting may own a policy name with `policy`; additional settings attach
  with `policyReference`.
- The reference setting's type must match the owner's type; `npm run export-policy-data`
  enforces this because the same resolved policy value is applied verbatim to owner and
  references.
- `ConfigurationRegistry.getPolicyReferenceConfigurations()` tracks `policyName →
  Set<settingKey>`, and `PolicyConfiguration` updates both the owner setting and all
  registered references when the policy value changes.
- `AbstractPolicyService.serialize()` uses `toSerializablePolicyDefinition()` to strip
  the non-cloneable `value()` callback before sending policy definitions over IPC.
- `AbstractPolicyService.updatePolicyDefinitions()` replaces definitions per policy
  name, so a late-registering owner supersedes an earlier reference fallback; if the
  owner is removed, a reference can still provide a bare type fallback.
- Exported policy data includes `referencedSettings` for references that are registered
  during export, and **Developer: Policy Diagnostics** lists registered owner/reference
  settings under the same policy name.

For managed-settings-specific examples that combine `policyReference` with Copilot
managed settings, see [github-managed-settings.md](./github-managed-settings.md).

## Examples

Search the codebase for `policy:` to find all the examples of different policy configurations.

## Learnings

* Never hand-edit `build/lib/policies/policyData.jsonc` (its header explicitly forbids it). If `npm run export-policy-data` is failing, fix the script — don't patch the JSON. Common cause: running it in the wrong working directory (e.g. main repo instead of a worktree), which silently exports the wrong source tree.
* **Regenerate `policyData.jsonc` in a clean environment, or the `PolicyExport` integration test will fail in CI.** `referencedSettings` is only captured for references **loaded at export time**. A plain `npm run export-policy-data` loads your **dev-profile extensions** (e.g. the Copilot extension), which injects `referencedSettings` onto core policies that the test's **fixture-based** export (clean profile, no user extensions) won't produce — so the checked-in file ends up with extra `referencedSettings` and CI fails. This is **not reproducible locally** because the test reuses your default extensions dir. Regenerate the way the test exports: `DISTRO_PRODUCT_JSON=<extensionPolicyFixture.json> ./scripts/code.sh --export-policy-data="$PWD/build/lib/policies/policyData.jsonc" --user-data-dir="$(mktemp -d)" --extensions-dir="$(mktemp -d)"` (with `VSCODE_SKIP_PRELAUNCH=1`).
* Document **behavior and business-logic expectations**, not copy-pasted implementation. Reproducing internal code (e.g. the `getPolicyData()` merge body) in the skill rots the moment the source changes and adds no information beyond the source itself. State the contract in prose (e.g. "native MDM managed settings win over the server-delivered channel; the two layers are never merged") and point to the source for the implementation. Reserve code blocks for the **author-facing API contract** a contributor must follow — how to *declare* a `policy` / `managedSettings` / `value` callback — not for restating runtime plumbing.
