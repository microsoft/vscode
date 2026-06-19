/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';

/**
 * Union of every reasoning-effort / thinking-level value surfaced by any
 * agent-host provider. Individual providers expose a subset:
 * - Codex: `'minimal' | 'low' | 'medium' | 'high'`
 * - Copilot / Claude: `'low' | 'medium' | 'high' | 'xhigh' | 'max'`
 *
 * The label/description helpers below are the single source of truth for
 * the localized picker strings so every provider renders the same value
 * consistently.
 */
export type ReasoningEffortLevel = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

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
		default: return undefined;
	}
}
