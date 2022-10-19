/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISequence, OffsetRange, SequenceDiff } from 'vs/editor/common/diff/algorithms/diffAlgorithm';

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

		if (cur.seq1Range.start - lastResult.seq1Range.endExclusive === 1) {
			if (cur.seq1Range.isEmpty) {
				if (sequence2.getElement(cur.seq2Range.start - 1) === sequence2.getElement(cur.seq2Range.endExclusive - 1)) {
					result[result.length - 1] = new SequenceDiff(lastResult.seq1Range, new OffsetRange(
						lastResult.seq2Range.start,
						cur.seq2Range.endExclusive - 1
					));
					continue;
				}
			}
		}

		result.push(cur);
	}

	return result;
}
