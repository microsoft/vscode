# PR: Copilot Memory — Shared Package Migration + User-Scoped Memories

## What this PR does

This PR migrates the Copilot Memory feature to use the `@github/copilot-agentic-tools/memory` shared package and adds support for user-scoped memories. It covers four requirements:

1. **Migrate to the shared package** — All inline schema definitions, API call logic, and type declarations (`RepoMemoryEntry`, `isRepoMemoryEntry`, `normalizeCitations`) are removed. Every API call now delegates to `fetchMemoryPrompts`, `fetchRecentMemories`, and `storeMemory` from `@github/copilot-agentic-tools/memory`.

2. **User-scoped memories** — A `scope` field is added to the `store_memory` tool, letting the model store memories at the user level (persists across all repositories) or the repository level. `AgentMemoryService` gains a `storeUserMemory()` method that calls the package's `storeMemory()` with `scope: 'user'`.

3. **Migrate to the combined `/prompt` endpoint** — `AgentMemoryService.getMemoryPrompt()` now calls `fetchMemoryPrompts()`, which hits the unified `/prompt` endpoint. This replaces the old per-repository endpoint and also handles user-scoped contexts when no repo NWO is available.

4. **Version-dependent resolution from `/prompt`** — described in detail below.

---

## How Requirement #4 is addressed

The original review flag was:

> **Requirement #4 not implemented** — `/prompt` version-dependent resolution is completely missing. Schema is hardcoded in `package.json`; `storeToolDefinition.definitionVersion` and `storeInstructions` from the `/prompt` response are never consumed.

Here is exactly how each part of that is now resolved:

### Cache priming (`AgentMemoryToolRegistrar`)

`AgentMemoryToolRegistrar.registerMemoryTools()` is called at the start of every new agent conversation (when `history.length === 0`). It fetches the `/prompt` response and stores it in `AgentMemoryService._cachedPromptResponse` via `getMemoryPrompt()`. This happens before the second `getAvailableTools()` call that the model actually sees, so the cache is always warm when the tool definition is evaluated.

```ts
// agentMemoryToolRegistrar.ts
async registerMemoryTools(): Promise<void> {
    const enabled = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, ...);
    if (!enabled) { return; }
    const repoNwo = await this.agentMemoryService.getRepoNwo();
    const response = await this.agentMemoryService.getMemoryPrompt(repoNwo);
    // response is now cached in AgentMemoryService._cachedPromptResponse
}
```

### Version-dependent schema resolution (`StoreMemoryTool.alternativeDefinition`)

VS Code requires a static `inputSchema` in `package.json` at extension registration time. That static entry is now a minimal placeholder (`{"type": "object", "properties": {}}`). At runtime, `StoreMemoryTool.alternativeDefinition()` overrides it with the schema resolved from the `/prompt` response:

```ts
// storeMemoryTool.tsx
alternativeDefinition(tool: vscode.LanguageModelToolInformation): vscode.LanguageModelToolInformation {
    const cached = this.agentMemoryService.getCachedMemoryPrompt();
    if (!cached) { return tool; }           // no cache → keep static placeholder
    const toolDef = cached.storeToolDefinition;
    if (!toolDef) { return tool; }          // endpoint returned no tool def → keep placeholder
    const zodSchema = resolveStoreMemorySchema(toolDef.definitionVersion);
    // resolveStoreMemorySchema returns the scope-aware schema (5 fields) for version >=1.1.0
    // and the basic schema (4 fields, no scope) for older versions
    const inputSchema = zodToJsonSchema(zodSchema, { target: 'openApi3' }) as { [key: string]: unknown };
    return { ...tool, description: toolDef.description, inputSchema };
}
```

`resolveStoreMemorySchema` is exported by `@github/copilot-agentic-tools/memory` and encapsulates all versioning logic — the extension never hardcodes which fields are present.

The tool description is also sourced from `toolDef.description` rather than the static `modelDescription` in `package.json`.

### Store instructions from `/prompt` (`MemoryInstructionsPrompt`)

Previously `MemoryInstructionsPrompt` rendered several hundred lines of hardcoded instruction text for when `enableCopilotMemory` was true. That entire block is replaced with `storeInstructions.prompt` from the cached `/prompt` response:

```tsx
// memoryContextPrompt.tsx
const storeInstructionsPrompt = enableCopilotMemory
    ? this.agentMemoryService.getCachedMemoryPrompt()?.storeInstructions?.prompt
    : undefined;

// ...

{storeInstructionsPrompt && (
    <Tag name='storeMemoryInstructions'>
        {storeInstructionsPrompt}
    </Tag>
)}
```

If the cache wasn't primed (network failure at conversation start), the instructions block is simply absent — no hardcoded fallback, matching the intent that all CAPI memory behaviour should be server-driven.

### Memory context from `/prompt` (`MemoryContextPrompt`)

The memories themselves (the list of stored facts injected into the prompt) also come from the `/prompt` response rather than a separate `getRepoMemories()` call:

```ts
// memoryContextPrompt.tsx
const promptResponse = enableCopilotMemory
    ? this.agentMemoryService.getCachedMemoryPrompt()
    : undefined;
const memoryPromptText = promptResponse?.memoriesContext.prompt;
// rendered as <memory_context>{memoryPromptText}</memory_context>
```

The old fallback that called `getRepoMemories()` and formatted them locally is removed entirely.

### Summary

| What was hardcoded | What it is now |
|--------------------|----------------|
| `inputSchema` in `package.json` (all fields, descriptions, enum values) | Minimal `{"type":"object","properties":{}}` placeholder; real schema resolved from `storeToolDefinition.definitionVersion` via `resolveStoreMemorySchema()` at runtime |
| `modelDescription` in `package.json` | Overridden at runtime with `storeToolDefinition.description` from `/prompt` |
| Store instructions in `MemoryInstructionsPrompt` (~60 lines of JSX) | `storeInstructions.prompt` from the `/prompt` cache |
| Memory context rendered from `getRepoMemories()` + local formatting | `memoriesContext.prompt` from the `/prompt` cache |
| Schema fields (subject, fact, citations, reason, scope) always present | Scope field only present when `definitionVersion >= 1.1.0`, per server |
