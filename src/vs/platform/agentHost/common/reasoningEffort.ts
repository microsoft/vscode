/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';

/**
 * Every reasoning-effort / thinking-level value surfaced by any agent-host
 * provider, ordered from least to most effort.
 *
 * Consumers that need to recognize *any* advertised tier — notably the Copilot
 * launcher's `isCopilotReasoningEffort`, which decides what the model picker
 * offers — must derive from this list rather than repeat it. A private copy
 * silently drops newly-added tiers from the picker (see the missing `'max'` in
 * https://github.com/microsoft/vscode/pull/329167), and a `satisfies` check
 * does not prevent that: it only verifies each entry is a valid level, not that
 * every level is present.
 */
export const reasoningEffortLevels = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;

/**
 * Union of every reasoning-effort / thinking-level value surfaced by any
 * agent-host provider. Individual providers expose a subset:
 * - Codex: model-dependent, currently up to `'ultra'`
 * - Copilot / Claude: model-dependent, currently up to `'max'`
 *
 * The label/description helpers below are the single source of truth for
 * the localized picker strings so every provider renders the same value
 * consistently.
 */
export type ReasoningEffortLevel = typeof reasoningEffortLevels[number];

/**
 * Localized, title-cased picker label for a reasoning-effort value.
 * Falls back to capitalizing an unrecognized value so a newly-introduced
 * effort tier never surfaces raw (e.g. lowercase `'max'`).
 */
export function getReasoningEffortLabel(level: string): string {
	switch (level) {
		case 'none': return localize('reasoningEffort.none', "None");
		case 'minimal': return localize('reasoningEffort.minimal', "Minimal");
		case 'low': return localize('reasoningEffort.low', "Low");
		case 'medium': return localize('reasoningEffort.medium', "Medium");
		case 'high': return localize('reasoningEffort.high', "High");
		case 'xhigh': return localize('reasoningEffort.xhigh', "Extra High");
		case 'max': return localize('reasoningEffort.max', "Max");
		case 'ultra': return localize('reasoningEffort.ultra', "Ultra");
		default: return level.charAt(0).toUpperCase() + level.slice(1);
	}
}

/**
 * Localized description for a reasoning-effort value, shown beneath the
 * label in the picker. Returns `undefined` for an unrecognized value so
 * callers can omit the description rather than show an empty string.
 *
 * Wording mirrors the canonical extension helper `getReasoningEffortDescription`
 * in `extensions/copilot/src/extension/conversation/common/languageModelAccess.ts`
 * so every provider surfaces the same descriptions.
 */
export function getReasoningEffortDescription(level: string): string | undefined {
	switch (level) {
		case 'none': return localize('reasoningEffort.noneDescription', "No reasoning applied");
		case 'minimal': return localize('reasoningEffort.minimalDescription', "Minimal reasoning for fastest responses");
		case 'low': return localize('reasoningEffort.lowDescription', "Faster responses with less reasoning");
		case 'medium': return localize('reasoningEffort.mediumDescription', "Balanced reasoning and speed");
		case 'high': return localize('reasoningEffort.highDescription', "Greater reasoning depth but slower");
		case 'xhigh': return localize('reasoningEffort.xhighDescription', "Highest reasoning depth but slowest");
		case 'max': return localize('reasoningEffort.maxDescription', "Absolute maximum capability with no constraints");
		case 'ultra': return localize('reasoningEffort.ultraDescription', "Maximum reasoning with automatic task delegation");
		default: return undefined;
	}
}

/**
 * Resolve the default reasoning effort for a model so the picker never renders an
 * `undefined` selection. Prefers the declared default, then `'high'` for Claude/Kimi K3
 * and `'medium'` otherwise, then the first supported level.
 */
export function resolveDefaultReasoningEffort(supportedEfforts: readonly string[] | undefined, declaredDefault?: string, modelId?: string): string | undefined {
	if (!supportedEfforts?.length) {
		return undefined;
	}
	if (declaredDefault && supportedEfforts.includes(declaredDefault)) {
		return declaredDefault;
	}
	const lowerId = modelId?.toLowerCase() ?? '';
	const preferred = lowerId.startsWith('claude') || lowerId.includes('kimi-k3') ? 'high' : 'medium';
	return supportedEfforts.includes(preferred) ? preferred : supportedEfforts[0];
}
