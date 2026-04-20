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

## Architecture Overview

### Policy Sources (layered, last writer wins)

| Source | Implementation | How it reads policies |
|--------|---------------|----------------------|
| **OS-level** (Windows registry, macOS plist) | `NativePolicyService` via `@vscode/policy-watcher` | Watches `Software\Policies\Microsoft\{productName}` (Windows) or bundle identifier prefs (macOS) |
| **Linux file** | `FilePolicyService` | Reads `/etc/vscode/policy.json` |
| **Account/GitHub** | `AccountPolicyService` | Reads `IPolicyData` from `IDefaultAccountService.policyData`, applies `value()` function |
| **Multiplex** | `MultiplexPolicyService` | Combines OS-level + account policy services; used in desktop main |

### Key Files

| File | Purpose |
|------|---------|
| `src/vs/base/common/policy.ts` | `PolicyCategory` enum, `IPolicy` interface |
| `src/vs/platform/policy/common/policy.ts` | `IPolicyService`, `AbstractPolicyService`, `PolicyDefinition` |
| `src/vs/platform/configuration/common/configurations.ts` | `PolicyConfiguration` — bridges policies to configuration values |
| `src/vs/workbench/services/policies/common/accountPolicyService.ts` | Account/GitHub-based policy evaluation |
| `src/vs/workbench/services/policies/common/multiplexPolicyService.ts` | Combines multiple policy services |
| `src/vs/workbench/contrib/policyExport/electron-browser/policyExport.contribution.ts` | `--export-policy-data` CLI handler |
| `src/vs/base/common/defaultAccount.ts` | `IPolicyData` interface for account-level policy fields |
| `build/lib/policies/policyData.jsonc` | Auto-generated policy catalog (DO NOT edit manually) |
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
npm run compile-check-ts-native
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

See `chat.tools.global.autoApprove` and `chat.useHooks` in `src/vs/workbench/contrib/chat/browser/chat.contribution.ts` for existing settings that use this pattern.

## Examples

Search the codebase for `policy:` to find all the examples of different policy configurations.
