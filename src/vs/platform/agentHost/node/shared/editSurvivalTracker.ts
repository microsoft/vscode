/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Edit-survival math for agent-host file edits.
 *
 * This is a duplicated, simplified port of the chat extension's
 * `EditSurvivalTracker` (see
 * `extensions/copilot/src/platform/editSurvivalTracking/common/editSurvivalTracker.ts`).
 * The extension version operates on multi-range `StringEdit`s; here we only
 * have whole-file before/after snapshots (the agent host has no access to
 * the per-range structure of the SDK tool input), so the math collapses to
 * a single "edit region" that spans the entire file. Keep the two copies
 * in sync algorithmically — and if you change the scoring here, mirror
 * the change in the extension copy.
 *
 * Extensions cannot import from `src/vs/platform/*`, so we cannot share
 * the implementation; duplication is intentional.
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
	const fourGram = compute4GramTextSimilarity(currentText, afterText);

	const aiSimilarity = compute4GramTextSimilarity(afterText, beforeText);
	let noRevert = 1;
	if (aiSimilarity !== 1) {
		// Should not happen unless the AI tool reported an edit that
		// produced identical text; guard so we don't divide by zero.
		const userSimilarity = compute4GramTextSimilarity(currentText, beforeText);
		noRevert = 1 - Math.max(userSimilarity - aiSimilarity, 0) / (1 - aiSimilarity);
	}

	return { fourGram, noRevert };
}
