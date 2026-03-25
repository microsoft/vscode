# Chat Session Customizations API — Open Items

## Cross-Harness Customization Visibility

Today each harness is an island — it only sees customizations from its own provider.
But in practice, other extensions may contribute customizations via
`registerCustomAgentProvider`, `registerSkillProvider`, etc. These items vanish when
a non-built-in harness is active because the provider path bypasses `IPromptsService`.

### Solution: extension pulls via `chatPromptFiles` API

The existing `chatPromptFiles` proposed API already exposes read-only arrays of
globally-discovered customizations:

```typescript
// Already available in vscode.proposed.chatPromptFiles.d.ts
chat.customAgents    // readonly ChatResource[]
chat.skills          // readonly ChatResource[]
chat.instructions    // readonly ChatResource[]

chat.onDidChangeCustomAgents   // Event<void>
chat.onDidChangeSkills         // Event<void>
chat.onDidChangeInstructions   // Event<void>
```

The extension's `ChatSessionCustomizationsProvider` can query these in
`provideCustomizations` to discover items from other sources, merge them
with its own, and return the curated result:

```typescript
async provideCustomizations(token) {
    const groups = [];

    // Own items from .joshbot/ folder
    const myAgents = await this._findFiles('agents', '**/*.agent.md');

    // Pull globally-discovered agents from other extensions/workspace
    const globalAgents = vscode.chat.customAgents.map(r => ({
        id: r.uri.toString(),
        label: basename(r.uri),
        uri: r.uri,
        storageLocation: ChatSessionCustomizationStorageLocation.Extension,
    }));

    // Curate: include global agents that joshbot wants to support
    groups.push({
        id: ChatSessionCustomizationType.Agents,
        items: [...myAgents, ...globalAgents],
    });

    return groups;
}
```

The extension listens to `onDidChange*` events and fires
`onDidChangeCustomizations` to keep the UI in sync:

```typescript
constructor() {
    vscode.chat.onDidChangeCustomAgents(() => this._onChange.fire());
    vscode.chat.onDidChangeSkills(() => this._onChange.fire());
    vscode.chat.onDidChangeInstructions(() => this._onChange.fire());
}
```

### Why this works

- **No API changes needed** — `chatPromptFiles` already exists
- **Extension is authoritative** — it decides what to include/exclude
- **Pull model** — extension queries when ready, no context parameter overhead
- **Reactive** — `onDidChange*` events trigger re-curation automatically
- **Backwards compatible** — providers that don't query `chatPromptFiles` work as today

### Open question

- The `chatPromptFiles` API returns `ChatResource` (just a URI). The provider needs
  to parse frontmatter to get labels/descriptions. Should we expose richer metadata
  on the `ChatResource` type, or is URI-only sufficient?
