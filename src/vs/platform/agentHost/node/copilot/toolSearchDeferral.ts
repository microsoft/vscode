/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isGpt56Model } from './modelIdentifiers.js';
import { COPILOT_HYDRA_FUSION_MODEL_ID } from '../../common/copilotCliConfig.js';
import type { IToolSearchCandidate } from '../../common/meta/agentToolCallMeta.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';

export { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';

/**
 * Non-deferred client tools, mirroring the Copilot extension allowlist entries
 * that are actually forwarded to Agent Host.
 */
export const NON_DEFERRED_CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
	'runTests',
	SEMANTIC_SEARCH_TOOL_NAME,
]);

export interface IHostToolSearchResult {
	/** Candidates the query named exactly, to load as tool references. */
	readonly toolNames: readonly string[];
	readonly textResultForLlm: string;
}

const HOST_TOOL_SEARCH_PREAMBLE = 'No client is connected, so tool search only matches exact tool names and client tools are unavailable.';

/**
 * Tool search for sessions whose search cannot reach a client. Only exact tool
 * names in the query match, so a prompt that names its tools (e.g. Agent Merge)
 * can still load them. `candidates` must already exclude client tools, which
 * cannot run without a client. When nothing matches, the result lists the
 * loadable names so the model can search again by name.
 */
export function searchToolsWithoutClient(query: string, candidates: readonly IToolSearchCandidate[]): IHostToolSearchResult {
	const namesByLowerCase = new Map(candidates.map(candidate => [candidate.name.toLowerCase(), candidate.name]));
	const toolNames = new Set<string>();
	for (const word of query.split(/[^\w.\-/]+/)) {
		const name = namesByLowerCase.get(word.replace(/^[.\-/]+|[.\-/]+$/g, '').toLowerCase());
		if (name) {
			toolNames.add(name);
		}
	}
	if (toolNames.size > 0) {
		return { toolNames: [...toolNames], textResultForLlm: `${HOST_TOOL_SEARCH_PREAMBLE} Loaded: ${[...toolNames].join(', ')}.` };
	}
	if (candidates.length === 0) {
		return { toolNames: [], textResultForLlm: `${HOST_TOOL_SEARCH_PREAMBLE} No other deferred tools can be loaded.` };
	}
	return {
		toolNames: [],
		textResultForLlm: `${HOST_TOOL_SEARCH_PREAMBLE} No tool name matched. Search again with the exact name of one of these tools: ${candidates.map(candidate => candidate.name).join(', ')}.`,
	};
}

/** Mirrors the Copilot extension's string-form `modelSupportsToolSearch`. */
export function agentHostModelSupportsToolSearch(modelId: string | undefined): boolean {
	if (!modelId) {
		return false;
	}
	const id = modelId.toLowerCase();
	const normalizedId = id.replace(/\./g, '-');
	if (normalizedId === COPILOT_HYDRA_FUSION_MODEL_ID || normalizedId === 'gpt-5-4' || normalizedId === 'gpt-5-5' || isGpt56Model(id) || normalizedId.startsWith('gpt-6')) {
		return true;
	}
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
