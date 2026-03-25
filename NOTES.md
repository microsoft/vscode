# Chat Session Customizations API — Open Items

## Cross-Harness Customization Visibility

Today each harness is an island — it only sees customizations from its own provider.
But in practice, other extensions (e.g. a third-party MCP plugin, a company-wide
instructions pack) may contribute customizations via `registerInstructionsProvider`,
`registerSkillProvider`, etc. These items currently vanish when a non-built-in harness
is active because the provider path bypasses `IPromptsService` entirely.

### Relevant VS Code patterns

**`TreeDataProvider` (source-of-truth model):**
The provider is the sole authority — `getChildren()` returns exactly what the UI shows.
External changes flow through `onDidChangeTreeData`. This is our current model: the
`ChatSessionCustomizationsProvider` is the single source, and what it returns is what
appears. But it means the provider must independently discover everything.

**`applyStorageSourceFilter` (post-collection filter model):**
`IPromptsService` gathers items from ALL sources (workspace, user, extension, plugin),
then `applyStorageSourceFilter()` removes items that don't match the harness policy.
The harness doesn't provide items — it defines a filter. This is how the built-in
path works today.

**`CompletionItemProvider` / `CodeActionProvider` (isolated model):**
Each provider runs independently with no context about others' results. VS Code merges
after the fact. NOT suitable — we need the provider to curate, not just contribute.

### Proposed approach: provider as curator with context

The provider should receive the "global pool" of customizations as input and return
the curated subset. This matches `applyStorageSourceFilter` semantics but gives the
extension full control over the curation logic.

```typescript
interface ChatSessionCustomizationsProvider {
    readonly onDidChangeCustomizations: Event<void>;

    provideCustomizations(
        context: ChatSessionCustomizationsContext,
        token: CancellationToken
    ): ProviderResult<ChatSessionCustomizationItemGroup[]>;
}

interface ChatSessionCustomizationsContext {
    /**
     * Customization items discovered from other sources (workspace files,
     * user configuration, other extensions' providers). The provider can
     * include, exclude, or augment these in its returned groups.
     */
    readonly discoveredItems: readonly ChatSessionCustomizationItemGroup[];
}
```

**How it would work:**

1. User opens Customizations editor with joshbot harness active
2. VS Code runs the built-in `IPromptsService` discovery (workspace + user + extensions)
3. VS Code converts discovered items to `ChatSessionCustomizationItemGroup[]`
4. VS Code calls `provider.provideCustomizations({ discoveredItems }, token)`
5. Provider examines discovered items, adds its own, returns final curated list
6. UI shows exactly what the provider returned

**Provider strategies:**

```typescript
// Strategy A: Include everything + add own items
async provideCustomizations(context, token) {
    return [...context.discoveredItems, ...myOwnItems];
}

// Strategy B: Filter to only relevant items
async provideCustomizations(context, token) {
    const relevant = context.discoveredItems.filter(g =>
        g.items.some(i => i.storageLocation !== StorageLocation.Extension)
    );
    return [...relevant, ...myOwnItems];
}

// Strategy C: Ignore external, only show own
async provideCustomizations(context, token) {
    return myOwnItems;  // Same as today
}
```

### Why context parameter is better than separate filter API

- **Flexibility**: provider can do arbitrary logic, not just source/path filtering
- **Transparency**: provider sees exactly what it's filtering, can add badges/descriptions
- **Backwards compatible**: `context.discoveredItems` can be empty initially, providers
  that ignore it work exactly as today
- **Single call**: no two-phase provide-then-filter dance

### Open questions

- Should `discoveredItems` include items from ALL harnesses, or only the "global"
  (non-harness-specific) pool?
- Performance: running `IPromptsService` discovery even when a non-built-in harness
  is active adds overhead. Should it be lazy / cached?
- Should the context include the raw `IPromptPath[]` (with full metadata) or just
  the simplified `ChatSessionCustomizationItem[]`?
- How does this interact with `onDidChangeCustomizations`? If discovered items change
  (e.g. a new workspace file is created), should the provider be re-called automatically?
