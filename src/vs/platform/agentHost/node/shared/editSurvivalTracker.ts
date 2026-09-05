/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Edit-survival math for agent-host file edits.
 *
 * Sister implementation of the chat extension's `EditSurvivalTracker`
 * (`extensions/copilot/src/platform/editSurvivalTracking/common/editSurvivalTracker.ts`).
 * The extension version operates on multi-range `StringEdit`s with a
 * live `TextModel`; here we only have whole-file snapshots and (when
 * the tool input is recognisable) the explicit text the AI wrote. The
 * whole-file path is the baseline; the chunked path uses asymmetric
 * "fraction of AI 4-grams still present in the file" scoring so an
 * edit's score doesn't decay as the file grows around it.
 *
 * Mostly carried over from the chat extension's version.
 */

/**
 * Computes a number between 0 and 1 that reflects how similar the two
 * texts are by counting how many 4-grams are shared between them.
 */
export function compute4GramTextSimilarity(text1: string, text2: string): number {
	const n = 4;

	if (text1.length < n || text2.length < n) {
		return text1 === text2 ? 1 : 0;
	}

	const nGramIdx = new Map<string, number>();

	for (let i = 0; i <= text1.length - n; i++) {
		const nGram = text1.substring(i, i + n);
		const count = nGramIdx.get(nGram) || 0;
		nGramIdx.set(nGram, count + 1);
	}

	for (let i = 0; i <= text2.length - n; i++) {
		const nGram = text2.substring(i, i + n);
		const count = nGramIdx.get(nGram) || 0;
		nGramIdx.set(nGram, count - 1);
	}

	const totalNGramCount = text1.length - n + 1 + text2.length - n + 1;

	let differentNGramCount = 0;
	for (const count of nGramIdx.values()) {
		differentNGramCount += Math.abs(count);
	}

	const equalNGramCount = totalNGramCount - differentNGramCount;

	return equalNGramCount / totalNGramCount;
}

/**
 * Computes the share of `chunk`'s 4-grams that appear anywhere in
 * `currentText`. Unlike {@link compute4GramTextSimilarity}, this is
 * asymmetric: the denominator is the chunk's n-gram count, not the
 * combined corpus. That makes the result stable as `currentText` grows
 * around the chunk — appending unrelated content does not drag the
 * score down. Returns a number in [0, 1].
 *
 * Used to ask "is the text the AI wrote still present in the file?"
 * when we have an explicit chunk (the `new_string` from `Edit`, each
 * entry of `MultiEdit.edits[*].new_string`, or `Write.content`) rather
 * than a whole-file before/after pair.
 *
 * For multi-chunk scoring against the same file, prefer building the
 * file n-gram set once via {@link buildNGramSet} and passing it to
 * {@link computeFractionPresentInSet} to avoid rebuilding the set per
 * chunk — see {@link computeChunkedFourGramSurvival}.
 */
export function computeFractionPresentIn(chunk: string, currentText: string): number {
	const n = 4;
	if (chunk.length === 0) {
		return 1;
	}
	if (chunk.length < n) {
		return currentText.includes(chunk) ? 1 : 0;
	}
	if (currentText.length < n) {
		return 0;
	}
	return computeFractionPresentInSet(chunk, buildNGramSet(currentText, n), n);
}

/** Builds the set of length-`n` substrings of `text`. */
function buildNGramSet(text: string, n: number): Set<string> {
	const set = new Set<string>();
	for (let i = 0; i <= text.length - n; i++) {
		set.add(text.substring(i, i + n));
	}
	return set;
}

/**
 * {@link computeFractionPresentIn} with a precomputed file n-gram set.
 * `chunk.length >= n` is the caller's responsibility; short/empty
 * chunks are handled by {@link computeFractionPresentIn}.
 */
function computeFractionPresentInSet(chunk: string, fileNGrams: ReadonlySet<string>, n: number): number {
	const total = chunk.length - n + 1;
	let present = 0;
	for (let i = 0; i < total; i++) {
		if (fileNGrams.has(chunk.substring(i, i + n))) {
			present++;
		}
	}
	return present / total;
}

/**
 * Length-weighted average of {@link computeFractionPresentIn} across
 * multiple AI-written chunks. The weight is the chunk's n-gram count
 * (approx its character length), so a 200-char chunk counts ~10x as much
 * as a 20-char chunk. Returns 0 when there are no chunks (callers
 * should branch on that and fall back to whole-file scoring).
 *
 * Builds the file n-gram set exactly once and reuses it for every
 * chunk, so cost is O(|currentText| + sum(|chunk|)) rather than
 * O(|chunks| × |currentText|).
 */
export function computeChunkedFourGramSurvival(aiChunks: readonly string[], currentText: string): number {
	if (aiChunks.length === 0) {
		return 0;
	}

	const n = 4;
	const fileNGrams = currentText.length >= n ? buildNGramSet(currentText, n) : undefined;

	let totalWeight = 0;
	let weightedSum = 0;
	for (const chunk of aiChunks) {
		// Use n-gram count as the weight, with a floor of 1 for tiny
		// chunks (so they still contribute their full presence signal
		// rather than getting zero weight).
		const weight = Math.max(1, chunk.length - n + 1);
		let fraction: number;
		if (chunk.length === 0) {
			fraction = 1;
		} else if (chunk.length < n) {
			fraction = currentText.includes(chunk) ? 1 : 0;
		} else if (!fileNGrams) {
			fraction = 0;
		} else {
			fraction = computeFractionPresentInSet(chunk, fileNGrams, n);
		}
		weightedSum += fraction * weight;
		totalWeight += weight;
	}
	return weightedSum / totalWeight;
}

/**
 * Result of {@link computeWholeFileEditSurvival}.
 */
export interface IEditSurvivalScore {
	/**
	 * 4-gram similarity between the current file content and the
	 * text the AI wrote. 1 = current text is identical to AI text,
	 * 0 = nothing in common.
	 */
	readonly fourGram: number;
	/**
	 * 1 minus the fraction by which the user moved the text back
	 * toward the original. 1 = no revert (user kept or refined AI
	 * output), 0 = full revert to original.
	 */
	readonly noRevert: number;
}

/**
 * Computes the whole-file revert score. 1 = file did not move back
 * toward the original, 0 = file is back to the original. Used by both
 * the whole-file and the chunked code paths, since revert detection is
 * intrinsically a whole-file question (we want to know whether the
 * user undid the change, not whether each AI-written region is still
 * present).
 */
export function computeNoRevertScore(beforeText: string, afterText: string, currentText: string): number {
	const aiSimilarity = compute4GramTextSimilarity(afterText, beforeText);
	if (aiSimilarity === 1) {
		// AI's edit produced text identical to the file before — there
		// is nothing to revert. Guard so we don't divide by zero.
		return 1;
	}
	const userSimilarity = compute4GramTextSimilarity(currentText, beforeText);
	return 1 - Math.max(userSimilarity - aiSimilarity, 0) / (1 - aiSimilarity);
}

/**
 * Computes survival scores for a whole-file edit.
 *
 * @param beforeText - File content before the AI edit was applied.
 * @param afterText - File content the AI wrote.
 * @param currentText - File content right now.
 */
export function computeWholeFileEditSurvival(
	beforeText: string,
	afterText: string,
	currentText: string,
): IEditSurvivalScore {
	return {
		fourGram: compute4GramTextSimilarity(currentText, afterText),
		noRevert: computeNoRevertScore(beforeText, afterText, currentText),
	};
}

/**
 * Computes survival scores for an edit when we know the explicit
 * AI-written chunks. `fourGram` uses the chunked, search-within scoring
 * so the denominator is bounded by the AI's written text (immune to
 * file-growth artifacts); `noRevert` continues to use the whole-file
 * comparison so reverts are still detectable.
 *
 * Falls back to whole-file scoring when `aiChunks` is empty (e.g. tool
 * input was unrecognised or malformed) so callers can pass through
 * uniformly.
 */
export function computeChunkedEditSurvival(
	beforeText: string,
	afterText: string,
	aiChunks: readonly string[],
	currentText: string,
): IEditSurvivalScore {
	const fourGram = aiChunks.length === 0
		? compute4GramTextSimilarity(currentText, afterText)
		: computeChunkedFourGramSurvival(aiChunks, currentText);
	return {
		fourGram,
		noRevert: computeNoRevertScore(beforeText, afterText, currentText),
	};
}
