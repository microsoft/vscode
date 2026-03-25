# Chat Session Customizations API — Open Items

## Cross-Harness Customization Visibility

Today each harness is an island — it only sees customizations from its own provider.
But in practice, other extensions (e.g. a third-party MCP plugin, a company-wide
instructions pack) may contribute customizations via `registerInstructionsProvider`,
`registerSkillProvider`, etc. These items currently vanish when a non-built-in harness
is active because the provider path bypasses `IPromptsService` entirely.

### What we need

The harness's `ChatSessionCustomizationsProvider` should be the **single source of truth**
for what the UI displays — but it needs to be *aware* of customizations from outside its
own extension so it can decide whether to include them.

Concretely:

1. **Feeding external customizations into the provider.** When VS Code discovers items
   from other sources (built-in discovery, other extensions' providers, the workspace),
   it should offer them to the active harness's provider as *candidates*. The provider
   then decides which to accept, reject, or augment.

2. **Provider as a filter, not just a source.** The provider's `provideCustomizations`
   could receive a `context` parameter containing the candidate items from other sources.
   The provider returns the final merged list — keeping its own items, optionally
   including external ones, and controlling ordering/grouping.

   Sketch:
   ```typescript
   provideCustomizations(
       context: { externalItems: ChatSessionCustomizationItemGroup[] },
       token: CancellationToken
   ): ProviderResult<ChatSessionCustomizationItemGroup[]>;
   ```

3. **Opt-in to other harnesses' customizations.** An extension should be able to declare
   that it wants to see customizations from specific other harnesses or from the global
   `IPromptsService` pool. This avoids every provider having to re-discover everything
   — VS Code does the gathering, the provider does the curation.

4. **The provider is always authoritative.** Whatever the provider returns is what the UI
   shows. If the provider drops an external item, it's dropped. If the provider adds a
   badge or changes the grouping of an external item, that's what the user sees. The
   provider owns the final presentation.

### Why this matters

Without this, switching to a third-party harness (like joshbot) hides all the user's
existing workspace agents, instructions, and skills that were contributed by other
extensions. Users expect to see *everything relevant* regardless of which harness is
active — but the harness should control *how* it's presented and *whether* each item
is actually consumed by its runtime.

### Open questions

- Should the context include items from ALL sources, or only those matching the
  harness's storage source filter?
- Should external items be passed as candidates on every `provideCustomizations` call,
  or should the provider subscribe to a separate event?
- How does this interact with the existing `chatPromptFiles` API
  (`registerCustomAgentProvider`, `registerSkillProvider`, etc.)? Those are global
  providers that contribute to all session types. Do they become the "external items"
  that get fed into the harness provider?
- Performance: if the provider is called frequently, passing all external items each
  time may be expensive. Caching / diffing strategies?
