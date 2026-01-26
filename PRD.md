# Tool Filtering for `workbench.action.chat.open`

## Overview

This document specifies the behavior of `includeTools` and `excludeTools` options for the `workbench.action.chat.open` command, enabling callers to control which tools are available in a chat session.

## Goals

1. Allow callers to restrict tools to a specific subset (whitelist)
2. Allow callers to remove specific tools from the default set (blacklist)
3. Support combining both for fine-grained control
4. Support referencing tools and toolsets by multiple identifiers

---

## Identifier Resolution

Tools and toolsets can be referenced by multiple identifiers. Matching is performed in this order:

| Type | Identifier | Example |
|------|------------|---------|
| Toolset | `id` | `"toolset:GitHub.copilot-chat/edit"` |
| Toolset | `referenceName` | `"edit"` |
| Tool | `id` | `"vscode_editFile"` |
| Tool | `toolReferenceName` | `"editFile"` |

When a **toolset** identifier matches, all member tools of that toolset are affected.

---

## Behavior Matrix

| `includeTools` | `excludeTools` | Behavior |
|----------------|----------------|----------|
| omitted | omitted | Default behavior (all tools enabled) |
| specified | omitted | **Whitelist mode**: Only specified tools/toolsets enabled |
| omitted | specified | **Blacklist mode**: All tools enabled except specified |
| specified | specified | **Combined mode**: Start with `includeTools`, then remove `excludeTools` |

---

## Resolution Algorithm

```
1. Expand all toolset identifiers to their member tools
2. If `includeTools` is specified:
     - Start with empty set
     - Add all tools matching `includeTools` identifiers
   Else:
     - Start with all available tools
3. If `excludeTools` is specified:
     - Remove all tools matching `excludeTools` identifiers
4. Calculate toolset enablement:
     - A toolset is enabled if ALL its member tools are enabled
5. Apply final enablement map to the chat widget
```

---

## Edge Cases

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Tool appears in both `includeTools` and `excludeTools` | **Excluded** | Explicit exclusion takes precedence |
| Toolset in `includeTools`, member tool in `excludeTools` | Toolset included, specific tool excluded | Allows fine-grained removal from groups |
| Tool in `includeTools`, its toolset in `excludeTools` | **Tool included** | Explicit tool reference overrides toolset membership |
| Unknown identifier | Warning logged | Helps debug typos while not blocking execution |
| `includeTools: []` (empty array) | Error thrown | At least one tool must be enabled |
| `excludeTools: []` (empty array) | No effect | Same as omitting the option |
| Filtering results in zero tools | Error thrown | At least one tool must be enabled |

---

## Examples

### Whitelist Only
```typescript
// Only enable the "edit" and "search" toolsets
await commands.executeCommand('workbench.action.chat.open', {
  query: 'Help me refactor this code',
  includeTools: ['edit', 'search']
});
```

### Blacklist Only
```typescript
// Enable all tools except the "web" toolset
await commands.executeCommand('workbench.action.chat.open', {
  query: 'Analyze this codebase',
  excludeTools: ['web']
});
```

### Combined Mode
```typescript
// Enable only "edit" toolset, but exclude the dangerous "deleteFile" tool
await commands.executeCommand('workbench.action.chat.open', {
  query: 'Clean up unused files',
  includeTools: ['edit'],
  excludeTools: ['deleteFile']
});
```

### Add to Defaults Then Remove
```typescript
// Start with "agent" and "read" tools, add "web", but exclude "fetch"
await commands.executeCommand('workbench.action.chat.open', {
  query: 'Research this topic',
  includeTools: ['agent', 'read', 'web'],
  excludeTools: ['fetch']
});
```

---

## API Interface

```typescript
interface IChatViewOpenOptions {
  // ... existing options ...

  /**
   * A list of tool identifiers to include. When specified alone, only these tools will be enabled.
   * Identifiers can be tool IDs, tool reference names (`toolReferenceName`),
   * toolset IDs, or toolset reference names (`referenceName`).
   * When a toolset identifier matches, all tools in that toolset are included.
   * Can be combined with `excludeTools` for fine-grained control.
   */
  includeTools?: string[];

  /**
   * A list of tool identifiers to exclude. When specified alone, all tools except these will be enabled.
   * Identifiers can be tool IDs, tool reference names (`toolReferenceName`),
   * toolset IDs, or toolset reference names (`referenceName`).
   * When a toolset identifier matches, all tools in that toolset are excluded.
   * Can be combined with `includeTools` - exclusions are applied after inclusions.
   * Explicit tool references in `includeTools` override toolset exclusions,
   * but explicit tool exclusions always win.
   */
  excludeTools?: string[];
}
```

---

## Design Decisions

1. **Explicit tool vs toolset precedence**: `includeTools: ["editFile"]` overrides `excludeTools: ["edit"]` - explicit tool references win over toolset membership. However, explicit tool exclusions always win over everything.

2. **Unknown identifier handling**: Unknown identifiers log a warning but do not throw an error. This helps debug typos while remaining flexible for tools that may vary by model.

3. **Validation**: At least one tool must remain enabled after filtering. An error is thrown if filtering results in zero enabled tools.

4. **Mode restriction**: Tool filtering applies in all chat modes, not just Agent mode.
