/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISequence, OffsetRange, SequenceDiff } from 'vs/editor/common/diff/algorithms/diffAlgorithm';

export function optimizeSequenceDiffs(sequence1: ISequence, sequence2: ISequence, sequenceDiffs: SequenceDiff[]): SequenceDiff[] {
	let result = sequenceDiffs;
	result = joinSequenceDiffs(sequence1, sequence2, result);
	result = shiftSequenceDiffs(sequence1, sequence2, result);
	return result;
}

/**
 * This function fixes issues like this:
 * ```
 * import { Baz, Bar } from "foo";
 * ```
 * <->
 * ```
 * import { Baz, Bar, Foo } from "foo";
 * ```
 * Computed diff: [ {Add "," after Bar}, {Add "Foo " after space} }
 * Improved diff: [{Add ", Foo" after Bar}]
 */
export function joinSequenceDiffs(sequence1: ISequence, sequence2: ISequence, sequenceDiffs: SequenceDiff[]): SequenceDiff[] {
	const result: SequenceDiff[] = [];
	if (sequenceDiffs.length > 0) {
		result.push(sequenceDiffs[0]);
	}

	for (let i = 1; i < sequenceDiffs.length; i++) {
		const lastResult = result[result.length - 1];
		const cur = sequenceDiffs[i];

		if (cur.seq1Range.isEmpty) {
			let all = true;
			const length = cur.seq1Range.start - lastResult.seq1Range.endExclusive;
			for (let i = 1; i <= length; i++) {
				if (sequence2.getElement(cur.seq2Range.start - i) !== sequence2.getElement(cur.seq2Range.endExclusive - i)) {
					all = false;
					break;
				}
			}

			if (all) {
				// Merge previous and current diff
				result[result.length - 1] = new SequenceDiff(lastResult.seq1Range, new OffsetRange(
					lastResult.seq2Range.start,
					cur.seq2Range.endExclusive - length
				));
				continue;
			}
		}

		result.push(cur);
	}

	return result;
}

// align character level diffs at whitespace characters
// import { IBar } from "foo";
// import { I[Arr, I]Bar } from "foo";
// ->
// import { [IArr, ]IBar } from "foo";

// import { ITransaction, observableValue, transaction } from 'vs/base/common/observable';
// import { ITransaction, observable[FromEvent, observable]Value, transaction } from 'vs/base/common/observable';
// ->
// import { ITransaction, [observableFromEvent, ]observableValue, transaction } from 'vs/base/common/observable';

// collectBrackets(level + 1, levelPerBracketType);
// collectBrackets(level + 1, levelPerBracket[ + 1, levelPerBracket]Type);
// ->
// collectBrackets(level + 1, [levelPerBracket + 1, ]levelPerBracketType);

export function shiftSequenceDiffs(sequence1: ISequence, sequence2: ISequence, sequenceDiffs: SequenceDiff[]): SequenceDiff[] {
	if (!sequence1.getBoundaryScore || !sequence2.getBoundaryScore) {
		return sequenceDiffs;
	}

	for (let i = 0; i < sequenceDiffs.length; i++) {
		const diff = sequenceDiffs[i];
		if (diff.seq1Range.isEmpty) {
			const seq2PrevEndExclusive = (i > 0 ? sequenceDiffs[i - 1].seq2Range.endExclusive : -1);
			const seq2NextStart = (i + 1 < sequenceDiffs.length ? sequenceDiffs[i + 1].seq2Range.start : sequence2.length + 1);
			sequenceDiffs[i] = shiftDiffToBetterPosition(diff, sequence1, sequence2, seq2NextStart, seq2PrevEndExclusive);
		} else if (diff.seq2Range.isEmpty) {
			const seq1PrevEndExclusive = (i > 0 ? sequenceDiffs[i - 1].seq1Range.endExclusive : -1);
			const seq1NextStart = (i + 1 < sequenceDiffs.length ? sequenceDiffs[i + 1].seq1Range.start : sequence1.length + 1);
			sequenceDiffs[i] = shiftDiffToBetterPosition(diff.reverse(), sequence2, sequence1, seq1NextStart, seq1PrevEndExclusive).reverse();
		}
	}

	return sequenceDiffs;
}

function shiftDiffToBetterPosition(diff: SequenceDiff, sequence1: ISequence, sequence2: ISequence, seq2NextStart: number, seq2PrevEndExclusive: number) {
	// don't touch previous or next!
	let deltaBefore = 1;
	while (diff.seq1Range.start - deltaBefore > seq2PrevEndExclusive &&
		sequence2.getElement(diff.seq2Range.start - deltaBefore) ===
		sequence2.getElement(diff.seq2Range.endExclusive - deltaBefore)) {
		deltaBefore++;
	}
	deltaBefore--;

	let deltaAfter = 1;
	while (diff.seq1Range.start + deltaAfter < seq2NextStart &&
		sequence2.getElement(diff.seq2Range.start + deltaAfter) ===
		sequence2.getElement(diff.seq2Range.endExclusive + deltaAfter)) {
		deltaAfter++;
	}
	deltaAfter--;

	let bestDelta = 0;
	let bestScore = -1;
	// find best scored delta
	for (let delta = -deltaBefore; delta < deltaAfter; delta++) {
		const seq2OffsetStart = diff.seq2Range.start + delta;
		const seq2OffsetEndExclusive = diff.seq2Range.endExclusive + delta;
		const seq1Offset = diff.seq1Range.start + delta;

		const score = sequence1.getBoundaryScore!(seq1Offset) + sequence2.getBoundaryScore!(seq2OffsetStart) + sequence2.getBoundaryScore!(seq2OffsetEndExclusive);
		if (score > bestScore) {
			bestScore = score;
			bestDelta = delta;
		}
	}

	if (bestDelta !== 0) {
		return new SequenceDiff(diff.seq1Range.delta(bestDelta), diff.seq2Range.delta(bestDelta));
	}
	return diff;
}
