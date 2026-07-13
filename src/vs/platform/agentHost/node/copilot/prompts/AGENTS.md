# Agent host system-prompt customization

This directory customizes the system prompt for Copilot CLI **agent host**
(ahp+cli) sessions. Read this before changing how the system message is built or
adding per-model / per-tool guidance. It mirrors the Copilot extension's
`extensions/copilot/.../prompts/node/agent/` (agentPrompts), but the agent host
runs in its own process and cannot use prompt-tsx, so contributors return plain
data the SDK accepts directly.

## Files

- `promptRegistry.ts` — `AgentHostPromptRegistry`: resolves the final
  `SystemMessageConfig` for a session's model. Defines the `IAgentHostPrompt`
  contributor interface and the `IAgentHostPromptContext` read-time context.
- `systemMessage.ts` — the default message (`COPILOT_AGENT_HOST_SYSTEM_MESSAGE`),
  shared identity text, the `fullSystemPrompt` / `sectionOverrides` builders, and
  `describeSystemMessageConfig` (the one-line log summary).
- `toolInstructions.ts` — the model-agnostic `tool_instructions` layer: gated
  one-line nudges (`TOOL_INSTRUCTION_LINES`) composed into the SDK's
  `tool_instructions` section. The browser line is the one registered today.
- `anthropicPrompt.ts` — example per-model contributor (Claude Opus 4.8).
- `allPrompts.ts` — side-effect import hub; importing it registers every
  contributor into the shared `agentHostPromptRegistry`.

## How the system message is built

`resolveSystemMessageConfig(model, context)` layers, in order:

1. **Base** — **`_resolveModelConfig`** picks the per-model (or default)
   config. Falls back to `COPILOT_AGENT_HOST_SYSTEM_MESSAGE` when there's no
   model, no matching contributor, or the contributor opts out for this
   `context`. A contributor's `customize` config gets the default sections
   composed **underneath** it (`withDefaultSections`), so a contributor only
   overrides the sections it names — the default `identity` survives unless
   explicitly overridden.
2. **`_withUniversalSections`** — layers the model-agnostic tool instructions on
   top, **composing** with — never clobbering — any per-model override for that
   section. For a `replace` base the lines are appended after the replacement
   content instead (`appendUniversalToolInstructions`).
3. **Workspaceless scratch + file-link contract** — appended as trailing
   `content` for every mode, including `replace`, so a full replacement owns the
   prompt body but not the host's response-format plumbing.

> **Launch-time freeze.** The SDK accepts a system message only at session
> create/resume; there is no mid-session update. The prompt is resolved once per
> (re)launch and any tool-gated content reflects the tool set at that moment. A
> change to the session's tools/plugins is part of the launcher's restart
> snapshot, so it re-launches and recomputes; an in-flight turn keeps the prompt
> it launched with.

There are two ways to customize, and a model can use both at once.

## Lever 1 — universal, all models (`toolInstructions.ts`)

Guidance for a tool that should apply to **every** model whenever that tool is in
the session. This is what the browser line does.

1. Write a `ToolInstructionLine` — a function `(hasTool) => string | undefined`
   that returns one sentence (no surrounding newlines) when its tool is present,
   or `undefined` to contribute nothing.
2. Add it to `TOOL_INSTRUCTION_LINES`.

```ts
const exampleToolInstructions: ToolInstructionLine = hasTool =>
	hasTool('someClientToolReferenceName')
		? 'One sentence of guidance, shown only when that tool is present.'
		: undefined;

const TOOL_INSTRUCTION_LINES: readonly ToolInstructionLine[] = [browserToolInstructions, exampleToolInstructions];
```

**Caveat — `hasTool` sees CLIENT tools only.** It is `context.hasClientTool`,
which knows only the forwarded workbench tools, addressed by their **camelCase
`toolReferenceName`** (e.g. `openBrowserPage`, `runTask`, `getTaskOutput`) — NOT
the extension's snake_case ids, and NOT shell / server-SDK / MCP tools (MCP is
discovered dynamically and isn't in the launch snapshot). A
line gated on a name that is never a client tool silently never renders. The
default client-tool allowlist is `chat.agentHost.clientTools` (see
`chat.shared.contribution.ts`). Broadening this context is a known follow-up.

These lines compose with a per-model `tool_instructions` override (see
`composeToolInstructions`), so Lever 1 and Lever 2 stack.

## Lever 2 — per-model contributor (`promptRegistry.ts` + `allPrompts.ts`)

Guidance scoped to a model or family. Implement `IAgentHostPrompt` and register
it. Use `anthropicPrompt.ts` as the template.

A contributor provides EITHER:

- `resolveSectionOverrides` → `{ mode: 'customize' }` — overrides named sections,
  keeps the SDK foundation prompt and its guardrails. **Prefer this.** The
  default sections are composed underneath, so there's no need to re-state the
  identity.
- `resolveFullSystemPrompt` → `{ mode: 'replace' }` — owns the entire prompt
  body and **drops all SDK guardrails (including safety)**. Only for callers
  that truly own the whole prompt. The registry still appends the universal
  layers (tool instructions, workspaceless guidance, file-link contract) after
  the replacement content.

```ts
class MyModelPrompt implements IAgentHostPrompt {
	static readonly familyPrefixes = ['my-model'];        // or implement static matchesModel(model)
	resolveSectionOverrides(model: ModelSelection, context: IAgentHostPromptContext) {
		// Gate on host settings; return undefined to fall back to the default message.
		return context.getSetting(CopilotCliConfigKey.SomeFlag) === true
			? { tool_instructions: { action: 'append', content: '\nFor this model, batch independent tool calls.' } }
			: undefined;
	}
}
agentHostPromptRegistry.registerPrompt(MyModelPrompt);   // then add `import './myModelPrompt.js'` to allPrompts.ts
```

Matching: a contributor matches a model by `static matchesModel(model)` (takes
precedence) or by `familyPrefixes` (model-id `startsWith`). The registry resolves
**exactly one** contributor per model (first match wins) — base + version
layering is a known follow-up.

## Related — per-model experimentation knobs (`copilotCliConfig.ts`)

`chat.agentHost.copilot.modelCapabilityOverrides` entries (keyed by model id; `'*'`
matches every model, a specific entry wins field-by-field) carry the non-prompt
experimentation knobs the launcher applies: `family` (prompt-routing alias, so
a preview model resolves through another family's contributor),
`reasoningEffort` (wins over `chat.agentHost.reasoningEffortOverride`,
re-applied on mid-session model change), and `availableTools`/`excludedTools`
(SDK tool filters; launch-frozen).

> **Security note.** The setting is workspace-configurable and forwarded to the
> agent host, so entries must never carry content that reaches the prompt or
> the host filesystem directly (e.g. a prompt-file path). Prompt experiments
> are code-managed: add a contributor (Lever 2) gated on its own opt-in setting,
> like `anthropicPrompt.ts` with `chat.agentHost.opus48Prompt.enabled`.

## Reference

- **Modes** (`SystemMessageConfig.mode`): `append` (foundation + text, default),
  `customize` (override named sections), `replace` (own the whole prompt, no
  guardrails).
- **Sections** (`SystemMessageSection`): `preamble`, `identity`, `tone`,
  `tool_efficiency`, `environment_context`, `code_change_rules`, `guidelines`,
  `safety`, `tool_instructions`, `custom_instructions`, `runtime_instructions`,
  `last_instructions`.
- **Override actions** (`SectionOverride.action`): `replace`, `append`,
  `prepend`, `remove`, or a `(content: string) => string` transform.

## Gotchas

- **Empty overrides = no override.** `resolveSectionOverrides` returning `{}`
  (or `undefined`) falls back to the default message — equivalent to composing
  nothing over the defaults, kept explicit to avoid pointless object churn.
- **Don't mutate the shared default.** `COPILOT_AGENT_HOST_SYSTEM_MESSAGE` is a
  shared constant; layering spreads into a fresh object, preserving any other
  customize-mode fields (e.g. `content`). Keep it that way.
- **Spacing is relative to the foundation.** `composeToolInstructions` pads by
  action (`append` leads with `\n`, `prepend` trails with `\n`, `replace` owns
  the section). When writing a section's `content` by hand, a leading `\n` keeps
  appended text off the foundation's last line.
- **Observability.** The launcher logs `describeSystemMessageConfig(...)` at
  `info` (mode + overridden sections) and the full config at `trace`. Keep new
  config shapes summarizable there.
- **Tests.** `../../../test/node/agentHostPromptRegistry.test.ts` covers the
  registry/wiring; `../../../test/node/toolInstructions.test.ts` covers the
  composition/gating. Add cases there, not new harnesses.
