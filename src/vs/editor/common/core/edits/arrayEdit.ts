/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from '../ranges/offsetRange.js';
import { BaseEdit, BaseReplacement } from './edit.js';

/**
 * Represents a set of replacements to an array.
 * All these replacements are applied at once.
*/
export class ArrayEdit<T> extends BaseEdit<ArrayReplacement<T>, ArrayEdit<T>> {
	public static readonly empty = new ArrayEdit<never>([]);

	public static create<T>(replacements: readonly ArrayReplacement<T>[]): ArrayEdit<T> {
		return new ArrayEdit(replacements);
	}

	public static single<T>(replacement: ArrayReplacement<T>): ArrayEdit<T> {
		return new ArrayEdit([replacement]);
	}

	public static replace<T>(range: OffsetRange, replacement: readonly T[]): ArrayEdit<T> {
		return new ArrayEdit([new ArrayReplacement(range, replacement)]);
	}

	public static insert<T>(offset: number, replacement: readonly T[]): ArrayEdit<T> {
		return new ArrayEdit([new ArrayReplacement(OffsetRange.emptyAt(offset), replacement)]);
	}

	public static delete<T>(range: OffsetRange): ArrayEdit<T> {
		return new ArrayEdit([new ArrayReplacement(range, [])]);
	}

	protected override _createNew(replacements: readonly ArrayReplacement<T>[]): ArrayEdit<T> {
		return new ArrayEdit(replacements);
	}

	public apply(data: readonly T[]): readonly T[] {
		const resultData: T[] = [];
		let pos = 0;
		for (const edit of this.replacements) {
			resultData.push(...data.slice(pos, edit.replaceRange.start));
			resultData.push(...edit.newValue);
			pos = edit.replaceRange.endExclusive;
		}
		resultData.push(...data.slice(pos));
		return resultData;
	}

	/**
	 * Creates an edit that reverts this edit.
	 */
	public inverse(baseVal: readonly T[]): ArrayEdit<T> {
		const edits: ArrayReplacement<T>[] = [];
		let offset = 0;
		for (const e of this.replacements) {
			edits.push(new ArrayReplacement(
				OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newValue.length),
				baseVal.slice(e.replaceRange.start, e.replaceRange.endExclusive),
			));
			offset += e.newValue.length - e.replaceRange.length;
		}
		return new ArrayEdit(edits);
	}
}

export class ArrayReplacement<T> extends BaseReplacement<ArrayReplacement<T>> {
	constructor(
		range: OffsetRange,
		public readonly newValue: readonly T[]
	) {
		super(range);
	}

	override equals(other: ArrayReplacement<T>): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newValue.length === other.newValue.length && this.newValue.every((v, i) => v === other.newValue[i]);
	}

	getNewLength(): number { return this.newValue.length; }

	tryJoinTouching(other: ArrayReplacement<T>): ArrayReplacement<T> | undefined {
		return new ArrayReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newValue.concat(other.newValue));
	}

	slice(range: OffsetRange, rangeInReplacement: OffsetRange): ArrayReplacement<T> {
		return new ArrayReplacement(range, rangeInReplacement.slice(this.newValue));
	}
}
