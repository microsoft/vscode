/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride } from '@github/copilot-sdk';
import { coalesce } from '../../../../../base/common/arrays.js';
import { BrowserChatToolReferenceName, browserChatToolReferenceNames } from '../../../../browserView/common/browserChatToolReferenceNames.js';
import type { SchemaValue } from '../../../common/agentHostSchema.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../../common/copilotCliConfig.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME } from '../../../common/toolSearchConstants.js';

/**
 * Model-agnostic guidance for the `tool_instructions` system-prompt section.
 *
 * This is the agent-host home for the Copilot extension's `toolUseInstructions`
 * pattern (`defaultAgentInstructions.tsx` and the per-model agent prompts): a
 * sequence of one-line nudges, either unconditional or gated on the relevant
 * tool being present in the session (or on a host setting), composed into the
 * single SDK `tool_instructions` section. The agent host sees client tools under
 * their camelCase `toolReferenceName`, so a line's gate and any tool name it
 * mentions use that form (NOT the extension's snake_case ids).
 *
 * To add guidance, write a {@link ToolInstructionLine} and add it to
 * {@link TOOL_INSTRUCTION_LINES}. The browser guidance
 * ({@link browserToolInstructions}) demonstrates a line gated on
 * `openBrowserPage` plus an agentic browser tool; the subagent guidance
 * ({@link subagentToolInstructions}) one gated on a setting.
 */

type CopilotCliConfigDefinition = typeof copilotCliConfigSchema.definition;

/**
 * What a {@link ToolInstructionLine} may gate on: the session's client tools and
 * the host-level Copilot CLI settings. The registry derives it from the wider
 * `IAgentHostPromptContext`.
 */
export interface IToolInstructionContext {
	/** Whether a client tool is available in the session, by camelCase `toolReferenceName`. */
	hasTool(name: string): boolean;

	/** The host-level value for a Copilot CLI setting, or `undefined` when unset. */
	getSetting<K extends keyof CopilotCliConfigDefinition & string>(key: K): SchemaValue<CopilotCliConfigDefinition[K]> | undefined;
}

/**
 * A single tool-instructions line. Returns its content (a single sentence, no
 * surrounding newlines) when it applies, or `undefined` to contribute nothing.
 * Mirrors one `<>…</>` fragment in the extension's `toolUseInstructions` block.
 */
type ToolInstructionLine = (context: IToolInstructionContext) => string | undefined;

/**
 * Browser tools other than `openBrowserPage` — the agent-host equivalent of the
 * Copilot extension's `agenticBrowserTools`. Derived from the full reference-name
 * list so it stays in sync as browser tools are added or removed.
 */
const agenticBrowserToolNames = browserChatToolReferenceNames.filter(name => name !== BrowserChatToolReferenceName.OpenBrowserPage);

/** Prevents oversized tool-output temp files from being re-offloaded by shell reads. */
export const COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION = 'When a tool reports that its output was saved to a temporary file because it was too large, ONLY use the `view` tool with a narrow `view_range` to inspect that file. NEVER read it with shell commands such as `cat`, `head`, `tail`, or `sed`, because their output may be offloaded again.';
const largeOutputToolInstructions: ToolInstructionLine = () => COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION;

/** Keeps subagents on their default model unless the user explicitly requests another model. */
export const COPILOT_AGENT_HOST_SUBAGENT_TOOL_INSTRUCTIONS = [
	'When launching subagents with the task tool, leave the `model`, `reasoning_effort`, and `context_tier` parameters unset — each agent type already runs on a model suited to it, and overriding the model changes the session\'s cost and behavior profile.',
	'Only set the task tool\'s `model` parameter when the user explicitly names the model the subagent should run on.',
].join('\n');
/** Opt-in via {@link CopilotCliConfigKey.SubagentModelGuidance}. */
const subagentToolInstructions: ToolInstructionLine = ({ getSetting }) =>
	getSetting(CopilotCliConfigKey.SubagentModelGuidance) === true ? COPILOT_AGENT_HOST_SUBAGENT_TOOL_INSTRUCTIONS : undefined;

/**
 * Front-end guidance for the integrated browser tools, ported from the Copilot
 * extension's `defaultAgentInstructions`/per-model prompts. Emitted only when the
 * page-opening tool AND at least one agentic browser tool are available, naming
 * the first available agentic tool as the example (the rest are covered by "etc.").
 */
const browserToolInstructions: ToolInstructionLine = ({ hasTool }) => {
	if (!hasTool(BrowserChatToolReferenceName.OpenBrowserPage)) {
		return undefined;
	}
	const companion = agenticBrowserToolNames.find(hasTool);
	if (!companion) {
		return undefined;
	}
	return `Use the browser tools (${BrowserChatToolReferenceName.OpenBrowserPage}, ${companion}, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.`;
};

/**
 * The registered tool-instruction lines, in render order.
 */
const TOOL_INSTRUCTION_LINES: readonly ToolInstructionLine[] = [largeOutputToolInstructions, subagentToolInstructions, browserToolInstructions];

/** Tool-search guidance mirrored from the Copilot extension prompt. */
const toolSearchToolInstructions: ToolInstructionLine = ({ hasTool }) =>
	hasTool(CLIENT_TOOL_SEARCH_REFERENCE_NAME)
		? `Most tools are deferred and hidden until you search for them. Before calling a tool that has not already been loaded, ALWAYS use tool search first with a short description of the capability you need, then call the specific tool it returns; tools it returns are immediately available and must not be searched for again.`
		: undefined;

export function toolSearchInstructionLines(toolSearchActive: boolean): readonly ToolInstructionLine[] {
	return toolSearchActive ? [...TOOL_INSTRUCTION_LINES, toolSearchToolInstructions] : TOOL_INSTRUCTION_LINES;
}

/**
 * Composes the applicable `lines` into a single block (one line each), or
 * `undefined` when none apply to the session.
 *
 * @param lines defaults to the registered {@link TOOL_INSTRUCTION_LINES};
 * overridable so the composition can be exercised in isolation.
 */
export function universalToolInstructions(context: IToolInstructionContext, lines: readonly ToolInstructionLine[] = TOOL_INSTRUCTION_LINES): string | undefined {
	const rendered = coalesce(lines.map(line => line(context)));
	return rendered.length > 0 ? rendered.join('\n') : undefined;
}

/**
 * Folds universal tool-instructions `content` into a per-model contributor's
 * `existing` `tool_instructions` override (if any), so a contributor's section
 * is preserved rather than clobbered.
 *
 * @param existing the per-model contributor's `tool_instructions` override, if any.
 */
function composeToolInstructions(existing: SectionOverride | undefined, content: string): SectionOverride {
	// No per-model override: append after the SDK foundation section, led by a
	// newline so it doesn't run on from the foundation content.
	if (!existing) {
		return { action: 'append', content: `\n${content}` };
	}
	// A `remove` or transform-function override is a deliberate, non-composable
	// choice by the contributor; preserve it untouched rather than fight it.
	if (existing.action === 'remove' || typeof existing.action === 'function') {
		return existing;
	}
	// Fold our lines into the contributor's content (preserve it, don't clobber),
	// then pad relative to the foundation by where this action places the content:
	// `append` sits after it (lead with a newline), `prepend` sits before it (trail
	// with a newline), `replace` owns the section (no foundation adjacency, so no
	// padding — and no leading newline even when the contributor's content is empty).
	const base = existing.content ?? '';
	const merged = base ? `${base}\n${content}` : content;
	switch (existing.action) {
		case 'append': return { action: 'append', content: `\n${merged}` };
		case 'prepend': return { action: 'prepend', content: `${merged}\n` };
		default: return { action: existing.action, content: merged };
	}
}

/**
 * Resolves the `tool_instructions` {@link SectionOverride} for a session,
 * composing the universal lines with any override a per-model contributor
 * already set for that section.
 *
 * Returns `undefined` when no universal lines apply — the caller then keeps the
 * contributor's `existing` override (if any) untouched.
 *
 * @param existing the per-model contributor's `tool_instructions` override, if any.
 * @param lines defaults to the registered {@link TOOL_INSTRUCTION_LINES}.
 */
export function resolveToolInstructionsOverride(context: IToolInstructionContext, existing: SectionOverride | undefined, lines: readonly ToolInstructionLine[] = TOOL_INSTRUCTION_LINES): SectionOverride | undefined {
	const content = universalToolInstructions(context, lines);
	return content === undefined ? undefined : composeToolInstructions(existing, content);
}
