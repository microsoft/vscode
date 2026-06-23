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

`resolveSystemMessageConfig(model, context)` runs two steps:

1. **`_resolveModelConfig`** — picks the per-model (or default) config. Falls
   back to `COPILOT_AGENT_HOST_SYSTEM_MESSAGE` when there's no model, no matching
   contributor, or the contributor opts out for this `context`.
2. **`_withUniversalSections`** — layers the model-agnostic sections (currently
   just `tool_instructions`) on top, **composing** with — never clobbering — any
   per-model override for that section.

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
  keeps the SDK foundation prompt and its guardrails. **Prefer this.**
- `resolveFullSystemPrompt` → `{ mode: 'replace' }` — owns the entire prompt and
  **drops all SDK guardrails (including safety)**. Only for callers that truly
  own the whole prompt. A replace contributor bypasses Lever 1, so it must inline
  any universal guidance itself (`universalToolInstructions(hasTool)` renders the
  same gated lines; add a small replace-mode helper alongside it when the first
  such contributor lands).

```ts
class MyModelPrompt implements IAgentHostPrompt {
	static readonly familyPrefixes = ['my-model'];        // or implement static matchesModel(model)
	resolveSectionOverrides(model: ModelSelection, context: IAgentHostPromptContext) {
		// Gate on host settings; return undefined to fall back to the default message.
		return context.getSetting(AgentHostConfigKey.SomeFlag) === true
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

## Reference

- **Modes** (`SystemMessageConfig.mode`): `append` (foundation + text, default),
  `customize` (override named sections), `replace` (own the whole prompt, no
  guardrails).
- **Sections** (`SystemMessageSection`): `identity`, `tone`, `tool_efficiency`,
  `environment_context`, `code_change_rules`, `guidelines`, `safety`,
  `tool_instructions`, `custom_instructions`, `runtime_instructions`,
  `last_instructions`.
- **Override actions** (`SectionOverride.action`): `replace`, `append`,
  `prepend`, `remove`, or a `(content: string) => string` transform.

## Gotchas

- **Empty overrides = no override.** `resolveSectionOverrides` returning `{}`
  (or `undefined`) falls back to the default message rather than emitting an
  empty customize config that would drop the default identity.
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
