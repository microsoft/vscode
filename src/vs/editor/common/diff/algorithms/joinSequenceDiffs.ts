/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { ISequence, SequenceDiff } from 'vs/editor/common/diff/algorithms/diffAlgorithm';

export function optimizeSequenceDiffs(sequence1: ISequence, sequence2: ISequence, sequenceDiffs: SequenceDiff[]): SequenceDiff[] {
	let result = sequenceDiffs;
	result = joinSequenceDiffs(sequence1, sequence2, result);
	result = shiftSequenceDiffs(sequence1, sequence2, result);
	return result;
}

export function smoothenSequenceDiffs(sequence1: ISequence, sequence2: ISequence, sequenceDiffs: SequenceDiff[]): SequenceDiff[] {
	const result: SequenceDiff[] = [];
	for (const s of sequenceDiffs) {
		const last = result[result.length - 1];
		if (!last) {
			result.push(s);
			continue;
		}

		if (s.seq1Range.start - last.seq1Range.endExclusive <= 2 || s.seq2Range.start - last.seq2Range.endExclusive <= 2) {
			result[result.length - 1] = new SequenceDiff(last.seq1Range.join(s.seq1Range), last.seq2Range.join(s.seq2Range));
		} else {
			result.push(s);
		}
	}

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
	if (sequenceDiffs.length === 0) {
		return sequenceDiffs;
	}

	const result: SequenceDiff[] = [];
	result.push(sequenceDiffs[0]);

	// First move them all to the left as much as possible and join them if possible
	for (let i = 1; i < sequenceDiffs.length; i++) {
		const prevResult = result[result.length - 1];
		let cur = sequenceDiffs[i];

		if (cur.seq1Range.isEmpty || cur.seq2Range.isEmpty) {
			const length = cur.seq1Range.start - prevResult.seq1Range.endExclusive;
			let d;
			for (d = 1; d <= length; d++) {
				if (
					sequence1.getElement(cur.seq1Range.start - d) !== sequence1.getElement(cur.seq1Range.endExclusive - d) ||
					sequence2.getElement(cur.seq2Range.start - d) !== sequence2.getElement(cur.seq2Range.endExclusive - d)) {
					break;
				}
			}
			d--;

			if (d === length) {
				// Merge previous and current diff
				result[result.length - 1] = new SequenceDiff(
					new OffsetRange(prevResult.seq1Range.start, cur.seq1Range.endExclusive - length),
					new OffsetRange(prevResult.seq2Range.start, cur.seq2Range.endExclusive - length),
				);
				continue;
			}

			cur = cur.delta(-d);
		}

		result.push(cur);
	}

	const result2: SequenceDiff[] = [];
	// Then move them all to the right and join them again if possible
	for (let i = 0; i < result.length - 1; i++) {
		const nextResult = result[i + 1];
		let cur = result[i];

		if (cur.seq1Range.isEmpty || cur.seq2Range.isEmpty) {
			const length = nextResult.seq1Range.start - cur.seq1Range.endExclusive;
			let d;
			for (d = 0; d < length; d++) {
				if (
					sequence1.getElement(cur.seq1Range.start + d) !== sequence1.getElement(cur.seq1Range.endExclusive + d) ||
					sequence2.getElement(cur.seq2Range.start + d) !== sequence2.getElement(cur.seq2Range.endExclusive + d)
				) {
					break;
				}
			}

			if (d === length) {
				// Merge previous and current diff, write to result!
				result[i + 1] = new SequenceDiff(
					new OffsetRange(cur.seq1Range.start + length, nextResult.seq1Range.endExclusive),
					new OffsetRange(cur.seq2Range.start + length, nextResult.seq2Range.endExclusive),
				);
				continue;
			}

			if (d > 0) {
				cur = cur.delta(d);
			}
		}

		result2.push(cur);
	}

	if (result.length > 0) {
		result2.push(result[result.length - 1]);
	}

	return result2;
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
		const prevDiff = (i > 0 ? sequenceDiffs[i - 1] : undefined);
		const diff = sequenceDiffs[i];
		const nextDiff = (i + 1 < sequenceDiffs.length ? sequenceDiffs[i + 1] : undefined);

		const seq1ValidRange = new OffsetRange(prevDiff ? prevDiff.seq1Range.start + 1 : 0, nextDiff ? nextDiff.seq1Range.endExclusive - 1 : sequence1.length);
		const seq2ValidRange = new OffsetRange(prevDiff ? prevDiff.seq2Range.start + 1 : 0, nextDiff ? nextDiff.seq2Range.endExclusive - 1 : sequence2.length);

		if (diff.seq1Range.isEmpty) {
			sequenceDiffs[i] = shiftDiffToBetterPosition(diff, sequence1, sequence2, seq1ValidRange, seq2ValidRange);
		} else if (diff.seq2Range.isEmpty) {
			sequenceDiffs[i] = shiftDiffToBetterPosition(diff.reverse(), sequence2, sequence1, seq2ValidRange, seq1ValidRange).reverse();
		}
	}

	return sequenceDiffs;
}

function shiftDiffToBetterPosition(diff: SequenceDiff, sequence1: ISequence, sequence2: ISequence, seq1ValidRange: OffsetRange, seq2ValidRange: OffsetRange,) {
	const maxShiftLimit = 100; // To prevent performance issues

	// don't touch previous or next!
	let deltaBefore = 1;
	while (
		diff.seq1Range.start - deltaBefore >= seq1ValidRange.start &&
		diff.seq2Range.start - deltaBefore >= seq2ValidRange.start &&
		sequence2.getElement(diff.seq2Range.start - deltaBefore) ===
		sequence2.getElement(diff.seq2Range.endExclusive - deltaBefore) && deltaBefore < maxShiftLimit
	) {
		deltaBefore++;
	}
	deltaBefore--;

	let deltaAfter = 0;
	while (
		diff.seq1Range.start + deltaAfter < seq1ValidRange.endExclusive &&
		diff.seq2Range.endExclusive + deltaAfter < seq2ValidRange.endExclusive &&
		sequence2.getElement(diff.seq2Range.start + deltaAfter) ===
		sequence2.getElement(diff.seq2Range.endExclusive + deltaAfter) && deltaAfter < maxShiftLimit
	) {
		deltaAfter++;
	}

	if (deltaBefore === 0 && deltaAfter === 0) {
		return diff;
	}

	// Visualize `[sequence1.text, diff.seq1Range.start + deltaAfter]`
	// and `[sequence2.text, diff.seq2Range.start + deltaAfter, diff.seq2Range.endExclusive + deltaAfter]`

	let bestDelta = 0;
	let bestScore = -1;
	// find best scored delta
	for (let delta = -deltaBefore; delta <= deltaAfter; delta++) {
		const seq2OffsetStart = diff.seq2Range.start + delta;
		const seq2OffsetEndExclusive = diff.seq2Range.endExclusive + delta;
		const seq1Offset = diff.seq1Range.start + delta;

		const score = sequence1.getBoundaryScore!(seq1Offset) + sequence2.getBoundaryScore!(seq2OffsetStart) + sequence2.getBoundaryScore!(seq2OffsetEndExclusive);
		if (score > bestScore) {
			bestScore = score;
			bestDelta = delta;
		}
	}

	return diff.delta(bestDelta);
}
