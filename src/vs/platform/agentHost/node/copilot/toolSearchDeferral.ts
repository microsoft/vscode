/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';

/**
 * Non-deferred client tools, mirroring the Copilot extension allowlist entries
 * that are actually forwarded to Agent Host.
 */
export const NON_DEFERRED_CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
	'runTests',
	'rename',
	'usages',
]);

/** Mirrors the Copilot extension's string-form `modelSupportsToolSearch`. */
export function agentHostModelSupportsToolSearch(modelId: string | undefined): boolean {
	if (!modelId) {
		return false;
	}
	const id = modelId.toLowerCase();
	const normalizedId = id.replace(/\./g, '-');
	const isGpt56 = id === 'gpt-5.6-sol' || id === 'gpt-5.6-terra' || id === 'gpt-5.6-luna';
	if (normalizedId === 'gpt-5-4' || normalizedId === 'gpt-5-5' || isGpt56) {
		return true;
	}
	if (!normalizedId.startsWith('claude') || normalizedId.startsWith('claude-haiku')) {
		return false;
	}
	const isPre45 =
		normalizedId.startsWith('claude-1') ||
		normalizedId.startsWith('claude-2') ||
		normalizedId.startsWith('claude-3') ||
		normalizedId.startsWith('claude-instant') ||
		normalizedId === 'claude-sonnet-4' || normalizedId.startsWith('claude-sonnet-4-2') ||
		normalizedId === 'claude-opus-4' || normalizedId.startsWith('claude-opus-4-1') || normalizedId.startsWith('claude-opus-4-2');
	return !isPre45;
}
