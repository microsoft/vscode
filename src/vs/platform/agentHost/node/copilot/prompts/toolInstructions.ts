/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride } from '@github/copilot-sdk';
import { coalesce } from '../../../../../base/common/arrays.js';
import { BrowserChatToolReferenceName, browserChatToolReferenceNames } from '../../../../browserView/common/browserChatToolReferenceNames.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../../common/toolSearchConstants.js';

/**
 * Model-agnostic guidance for the `tool_instructions` system-prompt section.
 *
 * This is the agent-host home for the Copilot extension's `toolUseInstructions`
 * pattern (`defaultAgentInstructions.tsx` and the per-model agent prompts): a
 * sequence of one-line nudges, each gated on the relevant tool being present in
 * the session, composed into the single SDK `tool_instructions` section. The
 * agent host sees client tools under their camelCase `toolReferenceName`, so a
 * line's gate and any tool name it mentions use that form (NOT the extension's
 * snake_case ids).
 *
 * To add guidance for a tool, write a {@link ToolInstructionLine} and add it to
 * {@link TOOL_INSTRUCTION_LINES}. The browser guidance ({@link browserToolInstructions})
 * is the first such hookup: it gates on `openBrowserPage` (plus an agentic browser
 * tool) being present and returns the extension's "Use the browser tools (...)"
 * sentence.
 */

/**
 * A single gated tool-instructions line. Returns its content (a single
 * sentence, no surrounding newlines) when the session exposes the tools it
 * applies to, or `undefined` to contribute nothing. Mirrors one gated `<>…</>`
 * fragment in the extension's `toolUseInstructions` block.
 *
 * @param hasTool predicate for whether a tool name is available in the session.
 */
type ToolInstructionLine = (hasTool: (name: string) => boolean) => string | undefined;

/**
 * Browser tools other than `openBrowserPage` — the agent-host equivalent of the
 * Copilot extension's `agenticBrowserTools`. Derived from the full reference-name
 * list so it stays in sync as browser tools are added or removed.
 */
const agenticBrowserToolNames = browserChatToolReferenceNames.filter(name => name !== BrowserChatToolReferenceName.OpenBrowserPage);

/**
 * Front-end guidance for the integrated browser tools, ported from the Copilot
 * extension's `defaultAgentInstructions`/per-model prompts. Emitted only when the
 * page-opening tool AND at least one agentic browser tool are available, naming
 * the first available agentic tool as the example (the rest are covered by "etc.").
 */
const browserToolInstructions: ToolInstructionLine = hasTool => {
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
 * The registered tool-instruction lines, in render order. Add new per-tool
 * guidance here.
 */
const TOOL_INSTRUCTION_LINES: readonly ToolInstructionLine[] = [browserToolInstructions];

/** Tool-search guidance mirrored from the Copilot extension prompt. */
const toolSearchToolInstructions: ToolInstructionLine = hasTool =>
	hasTool(CLIENT_TOOL_SEARCH_REFERENCE_NAME)
		? `Most tools are deferred and hidden until you search for them. Before calling a tool that has not already been loaded, ALWAYS call \`${RUNTIME_TOOL_SEARCH_TOOL_NAME}\` first with a short description of the capability you need, then call the specific tool it returns; tools it returns are immediately available and must not be searched for again.`
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
export function universalToolInstructions(hasTool: (name: string) => boolean, lines: readonly ToolInstructionLine[] = TOOL_INSTRUCTION_LINES): string | undefined {
	const rendered = coalesce(lines.map(line => line(hasTool)));
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
export function resolveToolInstructionsOverride(hasTool: (name: string) => boolean, existing: SectionOverride | undefined, lines: readonly ToolInstructionLine[] = TOOL_INSTRUCTION_LINES): SectionOverride | undefined {
	const content = universalToolInstructions(hasTool, lines);
	return content === undefined ? undefined : composeToolInstructions(existing, content);
}
