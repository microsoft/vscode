/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { TfIdfCalculator } from '../../../../base/common/tfIdf.js';
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

/** Mirrors the default result limit of the Copilot extension's tool search. */
const HOST_TOOL_SEARCH_LIMIT = 5;

/**
 * Ranks deferred tools on the host, for sessions whose tool search cannot reach
 * a client. Candidates named in the query always match, ahead of the lexically
 * ranked rest, so a prompt that names its tools can load them without embeddings.
 */
export function rankToolSearchCandidates(query: string, candidates: readonly IToolSearchCandidate[], limit = HOST_TOOL_SEARCH_LIMIT): string[] {
	const namesByLowerCase = new Map(candidates.map(candidate => [candidate.name.toLowerCase(), candidate.name]));
	const named = new Set<string>();
	// Words of a named tool would otherwise also rank its siblings.
	const remainingWords: string[] = [];
	for (const word of query.split(/[^\w.\-/]+/).map(word => word.replace(/^[.\-/]+|[.\-/]+$/g, ''))) {
		const name = namesByLowerCase.get(word.toLowerCase());
		if (name) {
			named.add(name);
		} else {
			remainingWords.push(word);
		}
	}
	// The tf-idf tokenizer only splits camelCase, so separate snake_case and kebab-case names first.
	const separateWords = (text: string) => text.replace(/[_\-./]+/g, ' ');
	const calculator = new TfIdfCalculator().updateDocuments(candidates
		.filter(candidate => !named.has(candidate.name))
		.map(candidate => ({ key: candidate.name, textChunks: [separateWords(candidate.name), separateWords(candidate.description)] })));
	const scores = new Map<string, number>();
	for (const { key, score } of calculator.calculateScores(separateWords(remainingWords.join(' ')), CancellationToken.None)) {
		scores.set(key, Math.max(score, scores.get(key) ?? 0));
	}
	const ranked = [...scores].sort(([, a], [, b]) => b - a).map(([name]) => name);
	return [...named, ...ranked.slice(0, Math.max(0, limit - named.size))];
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
