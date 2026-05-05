# Migration plan: move `ComputeAutomaticInstructions` from core to the Copilot extension

## Goal

Stop running `ComputeAutomaticInstructions` in the renderer (`chatServiceImpl`)
on every chat request. Instead, run an equivalent computation inside the
Copilot extension at the point where the agent prompt is built, so that the
results live entirely on the extension side.

The current call sites in core are:

- `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts` (line ~1163)
- `src/vs/workbench/contrib/chat/common/tools/builtinTools/runSubagentTool.ts` (line ~305)

## Approach

Keep `AgentPrompt` (the prompt-tsx element in the extension) **unchanged**.
The migration target is `AgentIntentInvocation.buildPrompt` in
`extensions/copilot/src/extension/intents/node/agentIntent.ts`.

Today the renderer adds a set of `IChatRequestVariableEntry` items
(applying instructions, agent instructions, referenced instructions, the
customizations index) to the request before it ever reaches the extension.
These flow through to `promptContext.chatVariables` and are consumed by:

- `CustomInstructions` (the prompt-tsx element) — reads
  `isInstructionFile` and `isCustomizationsIndex` entries.
- `SkillAdherenceReminder` in `agentPrompt.tsx` — reads
  `isCustomizationsIndex`.
- `skillTool.ts` — reads `isCustomizationsIndex` to resolve a skill name.
- `toolUtils.ts` (`getInstructionsIndexFile`) — reads
  `isCustomizationsIndex` to validate file access.
- `editCodeStep.ts` — forwards instruction-file/index entries.

If the extension produces these same entries before rendering and merges
them into `promptContext.chatVariables`, **none of the consumers above need
changes**. The contract is the variable set; the caller doesn't matter.

## Where to inject in the extension

`AgentIntentInvocation.buildPrompt` (file
`extensions/copilot/src/extension/intents/node/agentIntent.ts`) already does
similar pre-render work — for example, the codebase tool injects new
references via `toNewChatReferences` and rebuilds the
`ChatVariablesCollection`:

```ts
const codebase = await this._getCodebaseReferences(promptContext, token);
let variables = promptContext.chatVariables;
let toolReferences: vscode.ChatPromptReference[] = [];
if (codebase) {
    toolReferences = toNewChatReferences(variables, codebase.references);
    variables = new ChatVariablesCollection([...this.request.references, ...toolReferences]);
}
```

We add an analogous step right after this:

1. Compute automatic instructions for the current request (modeKind,
   enabled tools, enabled subagents, session type) → produce a list of
   `vscode.ChatPromptReference` (or directly `PromptVariable` entries).
2. Merge them into the variable collection that becomes
   `promptContext.chatVariables` for the render.

The render path (`AgentPrompt` → `CustomInstructions` /
`SkillAdherenceReminder`) and downstream consumers (`skillTool`,
`toolUtils`, `editCodeStep`) keep working unchanged because the variable
shape is preserved.

## What to port

The body of `ComputeAutomaticInstructions.collect` performs four steps:

1. `addApplyingInstructions` — `applyTo` glob match against attached files.
2. `_addAgentInstructions` — copilot-instructions.md, AGENTS.md, CLAUDE.md.
3. `_addReferencedInstructions` — transitive references from instruction
   files.
4. `_getCustomizationsIndex` — the `<instructions>…<skills>…<agents>…`
   text variable, with embedded tool reference variables
   (`#tool:readFile`, `#tool:skill`, `#tool:runSubagent`).

All four steps need an extension-side equivalent. The mapping is:

| Core dependency | Extension equivalent |
|---|---|
| `IPromptsService.getInstructionFiles` | `IPromptsService.getInstructions` |
| `IPromptsService.listAgentInstructions` |  `IPromptsService.listAgentInstructions` |
| `IPromptsService.listNestedAgentMDs` | `IPromptsService.listNestedAgentMDs` |
| `IPromptsService.findAgentSkills` | `IPromptsService.getSkills` — `ChatSkill` now exposes `disableModelInvocation`, `pluginUri`, `userInvocable`, `sessionTypes`, `description`, `extensionId`. The `storage` field used by core (`PromptsStorage`) maps 1:1 from `ChatSkill.source` (`local`/`user`/`extension`/`plugin`). Only `skill.extension.version` (telemetry-only) needs to be re-derived from `vscode.extensions.getExtension(extensionId)?.packageJSON.version`. |
| `IPromptsService.getCustomAgents` | `IPromptsService.getCustomAgents` — `ChatCustomAgent.disableModelInvocation` + `enabled` already exist |
| `IPromptsService.parseNew` (for ref following) | `IPromptsService.parseFile` |
| `IPromptsService.parseInstructionIndexFile` | `ICustomInstructionsService.parseInstructionIndexFile` (already exists) |
| `ILanguageModelToolsService.getToolByName` (to embed `#tool:` variables) | Use `vscode.lm.tools` plus the existing `IPromptVariablesService` resolver path |
| `IRemoteAgentService` (remote OS path normalization) | `IPromptPathRepresentationService.getFilePath` |
| Telemetry events `instructionsCollected`, `skillLoadedIntoContext` | `ITelemetryService` (extension-side) |

## Concrete steps


### 3. Add `AutomaticInstructionsCollector` in the extension

Create `extensions/copilot/src/extension/intents/node/automaticInstructionsCollector.ts`
(or under `prompt/`) exposing roughly:

```ts
export interface AutomaticInstructionsResult {
    /** Newly-added chat variable entries to merge into the request. */
    readonly entries: ReadonlyArray<vscode.ChatPromptReference>;
    /** Telemetry payload (parity with core's `instructionsCollected`). */
    readonly telemetry: InstructionsCollectionEvent;
}

export interface IAutomaticInstructionsCollector {
    collect(
        modeKind: ChatModeKind,
        enabledTools: UserSelectedTools | undefined,
        enabledSubagents: readonly string[] | undefined,
        sessionType: string,
        existingVariables: ChatVariablesCollection,
        token: vscode.CancellationToken,
    ): Promise<AutomaticInstructionsResult>;
}
```

Internally it ports the four steps of
`ComputeAutomaticInstructions.collect`.

### 4. Wire into `AgentIntentInvocation.buildPrompt`

Right after the codebase block (today's `let variables = …`):

```ts
const automatic = await this._automaticInstructionsCollector.collect(
    ChatModeKind.Agent,
    /* enabledTools */ undefined, // pulled off promptContext or request as needed
    /* enabledSubagents */ undefined,
    /* sessionType */ getChatSessionType(promptContext),
    variables,
    token,
);
if (automatic.entries.length > 0) {
    variables = new ChatVariablesCollection([...variables.references, ...automatic.entries]);
}
```

Then thread `variables` through into `props.promptContext.chatVariables`
exactly as it is today.

For the **subagent** path (`runSubagentTool` in core), this works
automatically: subagents call back into the Copilot extension via the
normal request pipeline, so `AgentIntentInvocation.buildPrompt` runs again
with the subagent's own `enabledTools`/`sessionType` and gets a fresh
collection.

### 5. Remove core call sites

Once the extension wiring lands and is exercised by tests, delete:

- The `collectInstructions` block in
  `chatServiceImpl.ts` (lines ~1151–1175) and its `markChat`/`StopWatch`
  bookkeeping.
- The `ComputeAutomaticInstructions` invocation in `runSubagentTool.ts`
  (lines ~304–306). The variable set built there can stay empty (the
  callee re-computes it) or the call site can be deleted entirely if it
  was only feeding instructions.

### 6. Move (or thin out) the tests

`src/vs/workbench/contrib/chat/test/common/promptSyntax/computeAutomaticInstructions.test.ts`
exercises the four steps in detail. Two options:

- Port verbatim into
  `extensions/copilot/src/extension/intents/node/automaticInstructionsCollector.test.ts`
  against the new collector. This is the high-fidelity option.
- Keep a much smaller core test that asserts no automatic instructions
  are added by `chatServiceImpl` anymore, and rely on the extension test
  suite for the matching/referencing/index logic.

The relevant tests in
`src/vs/workbench/contrib/chat/test/common/promptSyntax/service/promptsService.test.ts`
that use `ComputeAutomaticInstructions` (lines 525, 696, 770) need to be
updated either way.

### 7. Delete `ComputeAutomaticInstructions` (last)

Once nothing in core references it:

- Delete
  `src/vs/workbench/contrib/chat/common/promptSyntax/computeAutomaticInstructions.ts`.
- Drop the re-exports of `InstructionsCollectionEvent` etc. and inline
  the helper functions (`getFilePath`, `newInstructionsCollectionEvent`,
  `newInstructionsCollectionDebugInfo`) at their remaining callers if
  any.

## Open questions / risks

1. **First-render latency.** The extension currently sees the variables as
   already-resolved data. Reading instruction files / parsing references
   inside the extension may add a small per-request cost on a cold cache.
   Worth measuring against the existing `markChat(WillCollectInstructions)`
   timer.
2. **Debug instrumentation.**
   `lastInstructionsCollectionResult` is consumed by the existing debug
   contributions in core (search for
   `lastInstructionsCollectionResult`). If we delete it, those need to
   either move to the extension or be removed.
3. **Skill telemetry: extension version.** `IAgentSkill.extension.version`
   (used by the `skillLoadedIntoContext` telemetry event) is not on
   `ChatSkill`. Look it up via
   `vscode.extensions.getExtension(skill.extensionId)?.packageJSON.version`
   when emitting telemetry on the extension side.
4. **Order with codebase tool variables.** The current renderer-side
   collection runs *before* the codebase tool adds its references. Moving
   it to `AgentIntentInvocation.buildPrompt` runs *after* the codebase
   pass. The `applyTo` matcher matches against attached file URIs only,
   so the new ordering is at least as inclusive (new files added by the
   codebase pass would now also be considered for `applyTo` matches);
   confirm this is acceptable behavior.
5. **Editing flows that don't go through `AgentIntentInvocation`.** If
   any other intent (`AskAgentIntent`, edit/inline flows) relies on
   automatic instructions today, the equivalent injection step needs to
   be added there too. A cheap way to ensure parity is to factor the
   step into `EditCodeIntentInvocation.buildPrompt` (the parent class)
   so all subclasses pick it up.
