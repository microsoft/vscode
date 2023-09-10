/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue } from 'vs/base/common/arrays';
import { TextEditInfo } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper';
import { Length, lengthAdd, lengthDiffNonNegative, lengthEquals, lengthIsZero, lengthToObj, lengthZero, sumLengths } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';

export function combineTextEditInfos(textEditInfoFirst: TextEditInfo[], textEditInfoSecond: TextEditInfo[]): TextEditInfo[] {
	if (textEditInfoFirst.length === 0) {
		return textEditInfoSecond;
	}
	if (textEditInfoSecond.length === 0) {
		return textEditInfoFirst;
	}

	// s0: State before any edits
	const s0ToS1Map = new ArrayQueue(toLengthMapping(textEditInfoFirst));
	// s1: State after first edit, but before second edit
	const s1ToS2Map = toLengthMapping(textEditInfoSecond) as (LengthMapping | { lengthBefore: undefined; lengthAfter: undefined; modified: false })[];
	s1ToS2Map.push({ modified: false, lengthBefore: undefined, lengthAfter: undefined }); // Copy everything from old to new
	// s2: State after both edits

	let curItem: LengthMapping | undefined = s0ToS1Map.dequeue();

	/**
	 * @param s1Length Use undefined for length "infinity"
	 */
	function nextS0ToS1MapWithS1LengthOf(s1Length: Length | undefined): LengthMapping[] {
		if (s1Length === undefined) {
			const arr = s0ToS1Map.takeWhile(v => true) || [];
			if (curItem) {
				arr.unshift(curItem);
			}
			return arr;
		}

		const result: LengthMapping[] = [];
		while (curItem && !lengthIsZero(s1Length)) {
			const [item, remainingItem] = curItem.splitAt(s1Length);
			result.push(item);
			s1Length = lengthDiffNonNegative(item.lengthAfter, s1Length);
			curItem = remainingItem ?? s0ToS1Map.dequeue();
		}
		if (!lengthIsZero(s1Length)) {
			result.push(new LengthMapping(false, s1Length, s1Length));
		}
		return result;
	}

	const result: TextEditInfo[] = [];

	function pushEdit(startOffset: Length, endOffset: Length, newLength: Length): void {
		if (result.length > 0 && lengthEquals(result[result.length - 1].endOffset, startOffset)) {
			const lastResult = result[result.length - 1];
			result[result.length - 1] = new TextEditInfo(lastResult.startOffset, endOffset, lengthAdd(lastResult.newLength, newLength));
		} else {
			result.push({ startOffset, endOffset, newLength });
		}
	}

	let s0offset = lengthZero;
	for (const s1ToS2 of s1ToS2Map) {
		const s0ToS1Map = nextS0ToS1MapWithS1LengthOf(s1ToS2.lengthBefore);
		if (s1ToS2.modified) {
			const s0Length = sumLengths(s0ToS1Map, s => s.lengthBefore);
			const s0EndOffset = lengthAdd(s0offset, s0Length);
			pushEdit(s0offset, s0EndOffset, s1ToS2.lengthAfter);
			s0offset = s0EndOffset;
		} else {
			for (const s1 of s0ToS1Map) {
				const s0startOffset = s0offset;
				s0offset = lengthAdd(s0offset, s1.lengthBefore);
				if (s1.modified) {
					pushEdit(s0startOffset, s0offset, s1.lengthAfter);
				}
			}
		}
	}

	return result;
}

class LengthMapping {
	constructor(
		/**
		 * If false, length before and length after equal.
		 */
		public readonly modified: boolean,
		public readonly lengthBefore: Length,
		public readonly lengthAfter: Length,
	) {
	}

	splitAt(lengthAfter: Length): [LengthMapping, LengthMapping | undefined] {
		const remainingLengthAfter = lengthDiffNonNegative(lengthAfter, this.lengthAfter);
		if (lengthEquals(remainingLengthAfter, lengthZero)) {
			return [this, undefined];
		} else if (this.modified) {
			return [
				new LengthMapping(this.modified, this.lengthBefore, lengthAfter),
				new LengthMapping(this.modified, lengthZero, remainingLengthAfter)
			];
		} else {
			return [
				new LengthMapping(this.modified, lengthAfter, lengthAfter),
				new LengthMapping(this.modified, remainingLengthAfter, remainingLengthAfter)
			];
		}
	}

	toString(): string {
		return `${this.modified ? 'M' : 'U'}:${lengthToObj(this.lengthBefore)} -> ${lengthToObj(this.lengthAfter)}`;
	}
}

function toLengthMapping(textEditInfos: TextEditInfo[]): LengthMapping[] {
	const result: LengthMapping[] = [];
	let lastOffset = lengthZero;
	for (const textEditInfo of textEditInfos) {
		const spaceLength = lengthDiffNonNegative(lastOffset, textEditInfo.startOffset);
		if (!lengthIsZero(spaceLength)) {
			result.push(new LengthMapping(false, spaceLength, spaceLength));
		}

		const lengthBefore = lengthDiffNonNegative(textEditInfo.startOffset, textEditInfo.endOffset);
		result.push(new LengthMapping(true, lengthBefore, textEditInfo.newLength));
		lastOffset = textEditInfo.endOffset;
	}
	return result;
}
