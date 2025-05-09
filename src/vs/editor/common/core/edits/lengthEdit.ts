/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from '../ranges/offsetRange.js';
import { AnyEdit, BaseEdit, BaseReplacement } from './edit.js';

/**
 * Like a normal edit, but only captures the length information.
*/
export class LengthEdit extends BaseEdit<LengthReplacement, LengthEdit> {
	public static readonly empty = new LengthEdit([]);

	public static fromEdit(edit: AnyEdit): LengthEdit {
		return new LengthEdit(edit.replacements.map(r => new LengthReplacement(r.replaceRange, r.getNewLength())));
	}

	public static create(replacements: readonly LengthReplacement[]): LengthEdit {
		return new LengthEdit(replacements);
	}

	public static single(replacement: LengthReplacement): LengthEdit {
		return new LengthEdit([replacement]);
	}

	public static replace(range: OffsetRange, newLength: number): LengthEdit {
		return new LengthEdit([new LengthReplacement(range, newLength)]);
	}

	public static insert(offset: number, newLength: number): LengthEdit {
		return new LengthEdit([new LengthReplacement(OffsetRange.emptyAt(offset), newLength)]);
	}

	public static delete(range: OffsetRange): LengthEdit {
		return new LengthEdit([new LengthReplacement(range, 0)]);
	}

	public static compose(edits: readonly LengthEdit[]): LengthEdit {
		let e = LengthEdit.empty;
		for (const edit of edits) {
			e = e.compose(edit);
		}
		return e;
	}

	/**
	 * Creates an edit that reverts this edit.
	 */
	public inverse(): LengthEdit {
		const edits: LengthReplacement[] = [];
		let offset = 0;
		for (const e of this.replacements) {
			edits.push(new LengthReplacement(
				OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newLength),
				e.replaceRange.length,
			));
			offset += e.newLength - e.replaceRange.length;
		}
		return new LengthEdit(edits);
	}

	protected override _createNew(replacements: readonly LengthReplacement[]): LengthEdit {
		return new LengthEdit(replacements);
	}

	public applyArray<T>(arr: readonly T[], fillItem: T): T[] {
		const newArr = new Array(this.getNewDataLength(arr.length));

		let srcPos = 0;
		let dstPos = 0;

		for (const replacement of this.replacements) {
			// Copy items before the current replacement
			for (let i = srcPos; i < replacement.replaceRange.start; i++) {
				newArr[dstPos++] = arr[i];
			}

			// Skip the replaced items in the source array
			srcPos = replacement.replaceRange.endExclusive;

			// Fill with the provided fillItem for insertions
			for (let i = 0; i < replacement.newLength; i++) {
				newArr[dstPos++] = fillItem;
			}
		}

		// Copy any remaining items from the original array
		while (srcPos < arr.length) {
			newArr[dstPos++] = arr[srcPos++];
		}

		return newArr;
	}
}

export class LengthReplacement extends BaseReplacement<LengthReplacement> {
	public static create(
		startOffset: number,
		endOffsetExclusive: number,
		newLength: number,
	): LengthReplacement {
		return new LengthReplacement(new OffsetRange(startOffset, endOffsetExclusive), newLength);
	}

	constructor(
		range: OffsetRange,
		public readonly newLength: number,
	) {
		super(range);
	}

	override equals(other: LengthReplacement): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength;
	}

	getNewLength(): number { return this.newLength; }

	tryJoinTouching(other: LengthReplacement): LengthReplacement | undefined {
		return new LengthReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newLength + other.newLength);
	}

	slice(range: OffsetRange, rangeInReplacement: OffsetRange): LengthReplacement {
		return new LengthReplacement(range, rangeInReplacement.length);
	}

	override toString() {
		return `[${this.replaceRange.start}, +${this.replaceRange.length}) -> +${this.newLength}}`;
	}
}
