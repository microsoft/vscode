/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetRange } from '../offsetRange.js';
import { BaseEdit, BaseReplacement } from './edit.js';

/**
 * Represents a set of replacements to a string.
 * All these replacements are applied at once.
*/
export class StringEdit extends BaseEdit<StringReplacement, StringEdit> {
	public static readonly empty = new StringEdit([]);

	public static create(replacements: readonly StringReplacement[]): StringEdit {
		return new StringEdit(replacements);
	}

	public static single(replacement: StringReplacement): StringEdit {
		return new StringEdit([replacement]);
	}

	public static replace(range: OffsetRange, replacement: string): StringEdit {
		return new StringEdit([new StringReplacement(range, replacement)]);
	}

	public static insert(offset: number, replacement: string): StringEdit {
		return new StringEdit([new StringReplacement(OffsetRange.emptyAt(offset), replacement)]);
	}

	public static delete(range: OffsetRange): StringEdit {
		return new StringEdit([new StringReplacement(range, '')]);
	}

	override _createNew(replacements: readonly StringReplacement[]): StringEdit {
		return new StringEdit(replacements);
	}

	public apply(base: string): string {
		const resultText: string[] = [];
		let pos = 0;
		for (const edit of this.replacements) {
			resultText.push(base.substring(pos, edit.replaceRange.start));
			resultText.push(edit.newValue);
			pos = edit.replaceRange.endExclusive;
		}
		resultText.push(base.substring(pos));
		return resultText.join('');
	}

	/**
	 * Creates an edit that reverts this edit.
	 */
	public inverse(baseStr: string): StringEdit {
		const edits: StringReplacement[] = [];
		let offset = 0;
		for (const e of this.replacements) {
			edits.push(new StringReplacement(
				OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newValue.length),
				baseStr.substring(e.replaceRange.start, e.replaceRange.endExclusive),
			));
			offset += e.newValue.length - e.replaceRange.length;
		}
		return new StringEdit(edits);
	}
}

export class StringReplacement extends BaseReplacement<StringReplacement> {
	constructor(
		range: OffsetRange,
		public readonly newValue: string,
	) {
		super(range);
	}

	override equals(other: StringReplacement): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newValue === other.newValue;
	}

	getNewLength(): number { return this.newValue.length; }

	tryJoinTouching(other: StringReplacement): StringReplacement | undefined {
		return new StringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newValue + other.newValue);
	}

	slice(range: OffsetRange, rangeInReplacement: OffsetRange): StringReplacement {
		return new StringReplacement(range, rangeInReplacement.substring(this.newValue));
	}
}
