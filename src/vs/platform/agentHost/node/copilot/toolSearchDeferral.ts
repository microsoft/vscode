/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';

export { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';

/**
 * Non-deferred client tools, mirroring the Copilot extension allowlist entries
 * that are actually forwarded to Agent Host.
 */
export const NON_DEFERRED_CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
	'runTests',
	'rename',
	'usages',
	SEMANTIC_SEARCH_TOOL_NAME,
]);

/**
 * Follows the Copilot extension's string-form `modelSupportsToolSearch`, minus
 * the GPT families — see the deliberate divergence below before re-syncing this
 * with the extension.
 */
export function agentHostModelSupportsToolSearch(modelId: string | undefined): boolean {
	if (!modelId) {
		return false;
	}
	const id = modelId.toLowerCase();
	const normalizedId = id.replace(/\./g, '-');
	// GPT-5.4 / 5.5 / 5.6 supported tool search and were turned off pending
	// microsoft/vscode-copilot-evaluation#6323; re-enabling them requires restoring
	// the GPT-5.4/5.5 exact checks and the `isGpt56Model` import/check.
	if (!normalizedId.startsWith('claude')) {
		return false;
	}
	const isPre45 =
		normalizedId.startsWith('claude-1') ||
		normalizedId.startsWith('claude-2') ||
		normalizedId.startsWith('claude-3') ||
		normalizedId === 'claude-sonnet-4' || normalizedId.startsWith('claude-sonnet-4-2') ||
		normalizedId === 'claude-opus-4' || normalizedId.startsWith('claude-opus-4-1') || normalizedId.startsWith('claude-opus-4-2');
	return !isPre45;
}
