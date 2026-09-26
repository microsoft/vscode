/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ScoringCandidate {
	readonly id: string;
	readonly text: string;
}

export interface RelevanceScore {
	readonly id: string;
	readonly score: number;
}

/** This is the PoC's adapter interface, not a claimed Jev wire protocol. Scores are not probabilities. */
export type ChunkScorer = (query: string, candidates: readonly ScoringCandidate[], signal: AbortSignal) => Promise<readonly RelevanceScore[]>;

const stopWords = new Set(['a', 'an', 'and', 'are', 'do', 'does', 'for', 'how', 'in', 'is', 'of', 'the', 'to', 'what', 'where', 'which', 'with']);

function words(text: string): Set<string> {
	const separated = text.replace(/(?<lower>[a-z0-9])(?<upper>[A-Z])/g, '$<lower> $<upper>');
	return new Set((separated.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? [])
		.filter(word => !stopWords.has(word))
		.map(word => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word));
}

/** Deterministic token overlap for exercising the UI; this does not call or emulate Jev. */
export async function scoreLocally(query: string, candidates: readonly ScoringCandidate[], signal: AbortSignal): Promise<readonly RelevanceScore[]> {
	const queryWords = words(query);
	return candidates.map(candidate => {
		signal.throwIfAborted();
		const candidateWords = words(candidate.text);
		const overlap = [...queryWords].filter(word => candidateWords.has(word)).length;
		return { id: candidate.id, score: queryWords.size ? overlap / queryWords.size : 0 };
	});
}
