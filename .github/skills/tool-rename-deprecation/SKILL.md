---
name: tool-rename-deprecation
description: 'Ensure renamed built-in tool references preserve backward compatibility. Use when renaming a toolReferenceName, tool set referenceName, or any tool identifier. Run on ANY change to tool registration code. Covers legacyToolReferenceFullNames for tools and legacyFullNames for tool sets.'
---

# Tool Rename Deprecation

When a tool or tool set reference name is changed, the **old name must always be added to the deprecated/legacy array** so that existing prompt files, tool configurations, and saved references continue to resolve correctly.

## When to Use

Run this skill on **any change to built-in tool or tool set registration code** to catch regressions:

- Renaming a tool's `toolReferenceName`
- Renaming a tool set's `referenceName`
- Moving a tool from one tool set to another (the old `toolSet/toolName` path becomes a legacy name)
- Reviewing a PR that modifies tool registration — verify no legacy names were dropped

## Procedure

### Step 1 — Identify What Changed

Determine whether you are renaming a **tool** or a **tool set**, and where it is registered:

| Entity | Registration | Name field to rename | Legacy array | Stable ID (NEVER change) |
|--------|-------------|---------------------|-------------|-------------------------|
| Tool (`IToolData`) | TypeScript | `toolReferenceName` | `legacyToolReferenceFullNames` | `id` |
| Tool (extension) | `package.json` `languageModelTools` | `toolReferenceName` | `legacyToolReferenceFullNames` | `name` (becomes `id`) |
| Tool set (`IToolSet`) | TypeScript | `referenceName` | `legacyFullNames` | `id` |
| Tool set (extension) | `package.json` `languageModelToolSets` | `name` or `referenceName` | `legacyFullNames` | — |

**Critical:** For extension-contributed tools, the `name` field in `package.json` is mapped to `id` on `IToolData` (see `languageModelToolsContribution.ts` line `id: rawTool.name`). It is also used for activation events (`onLanguageModelTool:<name>`). **Never rename the `name` field** — only rename `toolReferenceName`.

### Step 2 — Add the Old Name to the Legacy Array

**Verify the old `toolReferenceName` value appears in `legacyToolReferenceFullNames`.** Don't assume it's already there — check the actual array contents. If the old name is already listed (e.g., from a previous rename), confirm it wasn't removed. If it's not there, add it.

**For internal/built-in tools** (TypeScript `IToolData`):

```typescript
// Before rename
export const MyToolData: IToolData = {
	id: 'myExtension.myTool',
	toolReferenceName: 'oldName',
	// ...
};

// After rename — old name preserved
export const MyToolData: IToolData = {
	id: 'myExtension.myTool',
	toolReferenceName: 'newName',
	legacyToolReferenceFullNames: ['oldName'],
	// ...
};
```

If the tool previously lived inside a tool set, use the full `toolSet/toolName` form:

```typescript
legacyToolReferenceFullNames: ['oldToolSet/oldToolName'],
```

If renaming multiple times, **accumulate** all prior names — never remove existing entries:

```typescript
legacyToolReferenceFullNames: ['firstOldName', 'secondOldName'],
```

**For tool sets**, add the old name to the `legacyFullNames` option when calling `createToolSet`:

```typescript
toolsService.createToolSet(source, id, 'newSetName', {
	legacyFullNames: ['oldSetName'],
});
```

**For extension-contributed tools** (`package.json`), rename only `toolReferenceName` and add the old value to `legacyToolReferenceFullNames`. **Do NOT rename the `name` field:**

```jsonc
// CORRECT — only toolReferenceName changes, name stays stable
{
	"name": "copilot_myTool",           // ← KEEP this unchanged
	"toolReferenceName": "newName",     // ← renamed
	"legacyToolReferenceFullNames": [
		"oldName"                       // ← old toolReferenceName preserved
	]
}
```

### Step 3 — Check All Consumers of Tool Names

Legacy names must be respected **everywhere** a tool is looked up by reference name, not just in prompt resolution. Key consumers:

- **Prompt files** — `getDeprecatedFullReferenceNames()` maps old → current names for `.prompt.md` validation and code actions
- **Tool enablement** — `getToolAliases()` / `getToolSetAliases()` yield legacy names so tool picker and enablement maps resolve them
- **Auto-approval config** — `isToolEligibleForAutoApproval()` checks `legacyToolReferenceFullNames` (including the segment after `/` for namespaced legacy names) against `chat.tools.eligibleForAutoApproval` settings
- **RunInTerminalTool** — has its own local auto-approval check that also iterates `LEGACY_TOOL_REFERENCE_FULL_NAMES`

After renaming, confirm:
1. `#oldName` in a `.prompt.md` file still resolves (shows no validation error)
2. Tool configurations referencing the old name still activate the tool
3. A user who had `"chat.tools.eligibleForAutoApproval": { "oldName": false }` still has that restriction honored

### Step 4 — Update References (Optional)

While legacy names ensure backward compatibility, update first-party references to use the new name:
- System prompts and built-in `.prompt.md` files
- Documentation and model descriptions that mention the tool by reference name
- Test files that reference the old name directly

## Key Files

| File | What it contains |
|------|-----------------|
| `src/vs/workbench/contrib/chat/common/tools/languageModelToolsService.ts` | `IToolData` and `IToolSet` interfaces with legacy name fields |
| `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts` | Resolution logic: `getToolAliases`, `getToolSetAliases`, `getDeprecatedFullReferenceNames`, `isToolEligibleForAutoApproval` |
| `src/vs/workbench/contrib/chat/common/tools/languageModelToolsContribution.ts` | Extension point schema, validation, and the critical `id: rawTool.name` mapping (line ~274) |
| `src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.ts` | Example of a tool with its own local auto-approval check against legacy names |

## Real Examples

- `runInTerminal` tool: renamed from `runCommands/runInTerminal` → `legacyToolReferenceFullNames: ['runCommands/runInTerminal']`
- `todo` tool: renamed from `todos` → `legacyToolReferenceFullNames: ['todos']`
- `getTaskOutput` tool: renamed from `runTasks/getTaskOutput` → `legacyToolReferenceFullNames: ['runTasks/getTaskOutput']`

## Reference PRs

- [#277047](https://github.com/microsoft/vscode/pull/277047) — **Design PR**: Introduced `legacyToolReferenceFullNames` and `legacyFullNames`, built the resolution infrastructure, and performed the first batch of tool renames. Use as a template for how to properly rename with legacy names.
- [#278506](https://github.com/microsoft/vscode/pull/278506) — **Consumer-side fix**: After the renames in #277047, the `eligibleForAutoApproval` setting wasn't checking legacy names — users who had restricted the old name lost that restriction. Shows why all consumers of tool reference names must account for legacy names.
- [vscode-copilot-chat#3810](https://github.com/microsoft/vscode-copilot-chat/pull/3810) — **Example of a miss**: Renamed `openSimpleBrowser` → `openIntegratedBrowser` but also changed the `name` field (stable id) from `copilot_openSimpleBrowser` → `copilot_openIntegratedBrowser`. The `toolReferenceName` backward compat only worked by coincidence (the old name happened to already be in the legacy array from a prior change — it was not intentionally added as part of this rename).

## Regression Check

Run this check on any PR that touches tool registration (TypeScript `IToolData`, `createToolSet`, or `package.json` `languageModelTools`/`languageModelToolSets`):

1. **Search the diff for changed `toolReferenceName` or `referenceName` values.** For each change, confirm the **previous value** now appears in `legacyToolReferenceFullNames` or `legacyFullNames`. Don't assume it was already there — read the actual array.
2. **Search the diff for changed `name` fields** on extension-contributed tools. The `name` field is the tool's stable `id` — it must **never** change. If it changed, flag it as a bug. (This breaks activation events, tool invocations by id, and any code referencing the tool by its `name`.)
3. **Verify no entries were removed** from existing legacy arrays.
4. **If a tool moved between tool sets**, confirm the old `toolSet/toolName` full path is in the legacy array.
5. **Check tool set membership lists** (the `tools` array in `languageModelToolSets` contributions). If a tool's `toolReferenceName` changed, any tool set `tools` array referencing the old name should be updated — but the legacy resolution system handles this, so the old name still works.

## Anti-patterns

- **Changing the `name` field on extension-contributed tools** — the `name` in `package.json` becomes the `id` on `IToolData` (via `id: rawTool.name` in `languageModelToolsContribution.ts`). Changing it breaks activation events (`onLanguageModelTool:<name>`), any code referencing the tool by id, and tool invocations. Only rename `toolReferenceName`, never `name`. (See [vscode-copilot-chat#3810](https://github.com/microsoft/vscode-copilot-chat/pull/3810) where both `name` and `toolReferenceName` were changed.)
- **Changing the `id` field on TypeScript-registered tools** — same principle as above. The `id` is a stable internal identifier and must never change.
- **Assuming the old name is already in the legacy array** — always verify by reading the actual `legacyToolReferenceFullNames` contents, not just checking that the field exists. A legacy array might list names from an even older rename but not the current one being changed.
- **Removing an old name from the legacy array** — breaks existing saved prompts and user configurations.
- **Forgetting to add the legacy name entirely** — prompt files and tool configs silently stop resolving.
- **Only updating prompt resolution but not other consumers** — auto-approval settings, tool enablement maps, and individual tool checks (like `RunInTerminalTool`) all need to respect legacy names (see [#278506](https://github.com/microsoft/vscode/pull/278506)).
