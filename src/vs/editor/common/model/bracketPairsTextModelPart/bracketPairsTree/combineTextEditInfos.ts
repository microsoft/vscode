/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue } from 'vs/base/common/arrays';
import { TextEditInfo } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper';
import { Length, lengthAdd, lengthDiffNonNegative, lengthEquals, lengthIsZero, lengthLessThanEqual, lengthZero, sumLengths } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';

export function combineTextEditInfos(textEditInfoFirst: TextEditInfo[], textEditInfoSecond: TextEditInfo[]): TextEditInfo[] {
	if (textEditInfoFirst.length === 0) {
		return textEditInfoSecond;
	}

	// s0: State before any edits
	const firstMap = new ArrayQueue(toTextMap(textEditInfoFirst));
	// s1: State after first edit, but before second edit
	const secondMap = toTextMap(textEditInfoSecond);
	// s2: State after both edits

	// If set, we are in an edit
	let remainingS0Length: Length | undefined = undefined;
	let remainingS1Length: Length = lengthZero;

	/**
	 * @param s1Length Use undefined for length "infinity"
	 */
	function readPartialS0Map(s1Length: Length | undefined): TextMapping[] {
		const result: TextMapping[] = [];

		while (true) {
			if ((remainingS0Length !== undefined && !lengthIsZero(remainingS0Length)) || !lengthIsZero(remainingS1Length)) {
				let readS1Length: Length;
				if (s1Length !== undefined && lengthLessThanEqual(s1Length, remainingS1Length)) {
					// remaining satisfies request
					readS1Length = s1Length;
					remainingS1Length = lengthDiffNonNegative(s1Length, remainingS1Length);
					s1Length = lengthZero;
				} else {
					// Read all of remaining, potentially even more
					readS1Length = remainingS1Length;
					if (s1Length !== undefined) {
						s1Length = lengthDiffNonNegative(remainingS1Length, s1Length);
					}
					remainingS1Length = lengthZero;
				}

				if (remainingS0Length === undefined) {
					// unchanged area
					result.push({
						oldLength: readS1Length,
						newLength: undefined
					});
				} else {
					// We eagerly consume all of the old length, even if
					// we are in an edit and only consume it partially.
					result.push({
						oldLength: remainingS0Length,
						newLength: readS1Length
					});
					remainingS0Length = lengthZero;
				}
			}

			if (s1Length !== undefined && lengthIsZero(s1Length)) {
				break;
			}

			const item = firstMap.dequeue();
			if (!item) {
				if (s1Length !== undefined) {
					result.push({
						oldLength: s1Length,
						newLength: undefined,
					});
				}
				break;
			}
			if (item.newLength === undefined) {
				remainingS1Length = item.oldLength;
				remainingS0Length = undefined;
			} else {
				remainingS0Length = item.oldLength;
				remainingS1Length = item.newLength;
			}
		}

		return result;
	}

	const result: TextEditInfo[] = [];

	function push(startOffset: Length, endOffset: Length, newLength: Length) {
		if (result.length > 0 && lengthEquals(result[result.length - 1].endOffset, startOffset)) {
			const lastResult = result[result.length - 1];
			result[result.length - 1] = new TextEditInfo(lastResult.startOffset, endOffset, lengthAdd(lastResult.newLength, newLength));
		} else {
			result.push({ startOffset, endOffset, newLength });
		}
	}

	let s0offset = lengthZero;
	for (const s2 of secondMap) {
		const s0ToS1Map = readPartialS0Map(s2.oldLength);
		if (s2.newLength !== undefined) {
			// This is an edit
			const s0Length = sumLengths(s0ToS1Map, s => s.oldLength);
			const s0EndOffset = lengthAdd(s0offset, s0Length);
			push(s0offset, s0EndOffset, s2.newLength);
			s0offset = s0EndOffset;
		} else {
			// We are in an unchanged area
			for (const s1 of s0ToS1Map) {
				const s0startOffset = s0offset;
				s0offset = lengthAdd(s0offset, s1.oldLength);

				if (s1.newLength !== undefined) {
					push(s0startOffset, s0offset, s1.newLength);
				}
			}
		}
	}

	const s0ToS1Map = readPartialS0Map(undefined);
	for (const s1 of s0ToS1Map) {
		const s0startOffset = s0offset;
		s0offset = lengthAdd(s0offset, s1.oldLength);

		if (s1.newLength !== undefined) {
			push(s0startOffset, s0offset, s1.newLength);
		}
	}

	return result;
}

interface TextMapping {
	oldLength: Length;

	/**
	 * If set, this mapping represents an edit.
	 * If not set, this mapping represents an unchanged region (for which the new length equals the old length).
	 */
	newLength?: Length;
}

function toTextMap(textEditInfos: TextEditInfo[]): TextMapping[] {
	const result: TextMapping[] = [];
	let lastOffset = lengthZero;
	for (const textEditInfo of textEditInfos) {
		const spaceLength = lengthDiffNonNegative(lastOffset, textEditInfo.startOffset);
		if (!lengthIsZero(spaceLength)) {
			result.push({ oldLength: spaceLength });
		}

		const oldLength = lengthDiffNonNegative(textEditInfo.startOffset, textEditInfo.endOffset);
		result.push({ oldLength, newLength: textEditInfo.newLength });
		lastOffset = textEditInfo.endOffset;
	}
	return result;
}
