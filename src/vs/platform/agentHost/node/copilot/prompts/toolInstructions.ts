/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride } from '@github/copilot-sdk';
import { coalesce } from '../../../../../base/common/arrays.js';

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
 * {@link TOOL_INSTRUCTION_LINES}. For example, a browser line would gate on
 * `openBrowserPage` (plus an agentic browser tool) being present and return a
 * sentence such as "Use the browser tools (...) for front-end tasks". No lines
 * are registered yet — concrete tool hookups land in follow-up changes; this
 * module is the wiring they plug into.
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
 * The registered tool-instruction lines, in render order. Empty until concrete
 * tool hookups are added — add new per-tool guidance here.
 */
const TOOL_INSTRUCTION_LINES: readonly ToolInstructionLine[] = [];

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
export function composeToolInstructions(existing: SectionOverride | undefined, content: string): SectionOverride {
	// No per-model override: append our lines to the SDK foundation section. The
	// leading newline keeps the appended text on its own line rather than running
	// on from the foundation content.
	if (!existing) {
		return { action: 'append', content: `\n${content}` };
	}
	// A `remove` or transform-function override is a deliberate, non-composable
	// choice by the contributor; preserve it untouched rather than fight it.
	if (existing.action === 'remove' || typeof existing.action === 'function') {
		return existing;
	}
	// String action (`append` | `prepend` | `replace`): fold our lines into the
	// contributor's content so its instructions are preserved, not clobbered.
	const base = existing.content ?? '';
	return { action: existing.action, content: base ? `${base}\n${content}` : `\n${content}` };
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

/**
 * Appends the universal tool-instruction lines to a full (`replace`-mode)
 * system prompt's `content`.
 *
 * A `replace`-mode contributor owns its whole prompt and so is skipped by the
 * registry's universal `tool_instructions` layer; calling this from
 * `resolveFullSystemPrompt` gives such a contributor the same gated guidance by
 * construction, mirroring how the extension's full-prompt models inline it. Returns
 * `content` unchanged when no line applies.
 */
export function appendUniversalToolInstructions(content: string, hasTool: (name: string) => boolean): string {
	const extra = universalToolInstructions(hasTool);
	return extra === undefined ? content : `${content}\n\n${extra}`;
}
