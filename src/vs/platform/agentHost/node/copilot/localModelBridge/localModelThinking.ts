/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reasoningEffortLevels } from '../../../common/reasoningEffort.js';

/* Thinking control of an on-device model from its GGUF chat template (searched, never executed). The level reaches `llama-server` as `chat_template_kwargs`, since it ignores a top-level `reasoning_effort`. */

/** Levels of a `reasoning_effort` template (harmony). */
export const LOCAL_MODEL_EFFORT_LEVELS: readonly string[] = ['low', 'medium', 'high'];

/** The thinking-level values of a toggle template: `none` turns thinking off, `medium` on. */
export const LOCAL_MODEL_TOGGLE_LEVELS: readonly string[] = ['none', 'medium'];

/**
 * How a chat template controls thinking: `effort` reads the
 * `reasoning_effort` kwarg (levels, with the template's default); `toggle`
 * reads `enable_thinking` (`llama-server` turns it on unless told otherwise).
 */
export type LocalModelThinkingSupport =
	| { readonly kind: 'effort'; readonly levels: readonly string[]; readonly defaultLevel: string }
	| { readonly kind: 'toggle' };

const REASONING_EFFORT_KWARG = /\breasoning_effort\b/;
const ENABLE_THINKING_KWARG = /\benable_thinking\b/;
/** `{% set reasoning_effort = "medium" %}` or `reasoning_effort | default("medium")`. */
const REASONING_EFFORT_DEFAULT = /\breasoning_effort\s*(?:=|\|\s*default\s*\()\s*["'](?<level>[a-z]+)["']/;

/** Detects the thinking control of a chat template; `undefined` when it has none. Pure. */
export function detectChatTemplateThinking(template: string | undefined): LocalModelThinkingSupport | undefined {
	if (!template) {
		return undefined;
	}
	if (REASONING_EFFORT_KWARG.test(template)) {
		const declared = REASONING_EFFORT_DEFAULT.exec(template)?.groups?.level;
		const defaultLevel = declared && LOCAL_MODEL_EFFORT_LEVELS.includes(declared) ? declared : 'medium';
		return { kind: 'effort', levels: LOCAL_MODEL_EFFORT_LEVELS, defaultLevel };
	}
	if (ENABLE_THINKING_KWARG.test(template)) {
		return { kind: 'toggle' };
	}
	return undefined;
}

/** The thinking-level values a picker offers for `support`, and its default. Pure. */
export function getLocalModelThinkingLevels(support: LocalModelThinkingSupport): { readonly levels: readonly string[]; readonly defaultLevel: string } {
	return support.kind === 'effort' ? { levels: support.levels, defaultLevel: support.defaultLevel } : { levels: LOCAL_MODEL_TOGGLE_LEVELS, defaultLevel: 'medium' };
}

/** Maps `requested` to the nearest of `levels` (ties toward lower effort); `undefined` for an unknown value. */
function nearestLevel(requested: string, levels: readonly string[]): string | undefined {
	const order: readonly string[] = reasoningEffortLevels;
	const requestedRank = order.indexOf(requested);
	if (requestedRank < 0) {
		return undefined;
	}
	let best: string | undefined;
	let bestDistance = Infinity;
	for (const level of levels) {
		const rank = order.indexOf(level);
		const distance = Math.abs(rank - requestedRank);
		if (rank >= 0 && distance < bestDistance) {
			best = level;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * The `chat_template_kwargs` applying a requested `reasoning_effort`: the nearest supported level, or `enable_thinking`
 * (`false` for `none` and for `minimal`, which is how an on-device row's Off arrives); `undefined` when nothing applies. Pure.
 */
export function toChatTemplateKwargs(requested: unknown, support: LocalModelThinkingSupport | undefined): Record<string, string | boolean> | undefined {
	if (typeof requested !== 'string' || !support) {
		return undefined;
	}
	if (support.kind === 'toggle') {
		return reasoningEffortLevels.some(level => level === requested) ? { enable_thinking: requested !== 'none' && requested !== 'minimal' } : undefined;
	}
	const level = nearestLevel(requested, support.levels);
	return level ? { reasoning_effort: level } : undefined;
}
