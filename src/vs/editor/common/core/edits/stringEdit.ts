/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commonPrefixLength, commonSuffixLength } from '../../../../base/common/strings.js';
import { OffsetRange } from '../ranges/offsetRange.js';
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

	public static fromJson(data: ISerializedStringEdit): StringEdit {
		return new StringEdit(data.map(StringReplacement.fromJson));
	}

	public static compose(edits: readonly StringEdit[]): StringEdit {
		if (edits.length === 0) {
			return StringEdit.empty;
		}
		let result = edits[0];
		for (let i = 1; i < edits.length; i++) {
			result = result.compose(edits[i]);
		}
		return result;
	}

	constructor(replacements: readonly StringReplacement[]) {
		super(replacements);
	}

	protected override _createNew(replacements: readonly StringReplacement[]): StringEdit {
		return new StringEdit(replacements);
	}

	public apply(base: string): string {
		const resultText: string[] = [];
		let pos = 0;
		for (const edit of this.replacements) {
			resultText.push(base.substring(pos, edit.replaceRange.start));
			resultText.push(edit.newText);
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
				OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length),
				baseStr.substring(e.replaceRange.start, e.replaceRange.endExclusive),
			));
			offset += e.newText.length - e.replaceRange.length;
		}
		return new StringEdit(edits);
	}

	/**
	 * Consider `t1 := text o base` and `t2 := text o this`.
	 * We are interested in `tm := tryMerge(t1, t2, base: text)`.
	 * For that, we compute `tm' := t1 o base o this.rebase(base)`
	 * such that `tm' === tm`.
	 */
	public tryRebase(base: StringEdit): StringEdit;
	public tryRebase(base: StringEdit, noOverlap: true): StringEdit | undefined;
	public tryRebase(base: StringEdit, noOverlap?: true): StringEdit | undefined {
		const newEdits: StringReplacement[] = [];

		let baseIdx = 0;
		let ourIdx = 0;
		let offset = 0;

		while (ourIdx < this.replacements.length || baseIdx < base.replacements.length) {
			// take the edit that starts first
			const baseEdit = base.replacements[baseIdx];
			const ourEdit = this.replacements[ourIdx];

			if (!ourEdit) {
				// We processed all our edits
				break;
			} else if (!baseEdit) {
				// no more edits from base
				newEdits.push(new StringReplacement(
					ourEdit.replaceRange.delta(offset),
					ourEdit.newText,
				));
				ourIdx++;
			} else if (ourEdit.replaceRange.intersectsOrTouches(baseEdit.replaceRange)) {
				ourIdx++; // Don't take our edit, as it is conflicting -> skip
				if (noOverlap) {
					return undefined;
				}
			} else if (ourEdit.replaceRange.start < baseEdit.replaceRange.start) {
				// Our edit starts first
				newEdits.push(new StringReplacement(
					ourEdit.replaceRange.delta(offset),
					ourEdit.newText,
				));
				ourIdx++;
			} else {
				baseIdx++;
				offset += baseEdit.newText.length - baseEdit.replaceRange.length;
			}
		}

		return new StringEdit(newEdits);
	}

	public toJson(): ISerializedStringEdit {
		return this.replacements.map(e => ({
			txt: e.newText,
			pos: e.replaceRange.start,
			len: e.replaceRange.length,
		}));
	}

	public isNeutralOn(text: string): boolean {
		return this.replacements.every(e => e.isNeutralOn(text));
	}

	public removeCommonSuffixPrefix(originalText: string): StringEdit {
		const edits: StringReplacement[] = [];
		for (const e of this.replacements) {
			const edit = e.removeCommonSuffixPrefix(originalText);
			if (!edit.isEmpty) {
				edits.push(edit);
			}
		}
		return new StringEdit(edits);
	}
}

/**
 * Warning: Be careful when changing this type, as it is used for serialization!
*/
export type ISerializedStringEdit = ISerializedStringReplacement[];

/**
 * Warning: Be careful when changing this type, as it is used for serialization!
*/
export interface ISerializedStringReplacement {
	txt: string;
	pos: number;
	len: number;
}

export class StringReplacement extends BaseReplacement<StringReplacement> {
	public static insert(offset: number, text: string): StringReplacement {
		return new StringReplacement(OffsetRange.emptyAt(offset), text);
	}

	public static replace(range: OffsetRange, text: string): StringReplacement {
		return new StringReplacement(range, text);
	}

	public static fromJson(data: ISerializedStringReplacement): StringReplacement {
		return new StringReplacement(OffsetRange.ofStartAndLength(data.pos, data.len), data.txt);
	}

	constructor(
		range: OffsetRange,
		public readonly newText: string,
	) {
		super(range);
	}

	override equals(other: StringReplacement): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText;
	}

	getNewLength(): number { return this.newText.length; }

	tryJoinTouching(other: StringReplacement): StringReplacement | undefined {
		return new StringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText);
	}

	slice(range: OffsetRange, rangeInReplacement: OffsetRange): StringReplacement {
		return new StringReplacement(range, rangeInReplacement.substring(this.newText));
	}

	override toString(): string {
		return `${this.replaceRange} -> "${this.newText}"`;
	}

	replace(str: string): string {
		return str.substring(0, this.replaceRange.start) + this.newText + str.substring(this.replaceRange.endExclusive);
	}

	/**
	 * Checks if the edit would produce no changes when applied to the given text.
	 */
	isNeutralOn(text: string): boolean {
		return this.newText === text.substring(this.replaceRange.start, this.replaceRange.endExclusive);
	}

	removeCommonSuffixPrefix(originalText: string): StringReplacement {
		const oldText = originalText.substring(this.replaceRange.start, this.replaceRange.endExclusive);

		const prefixLen = commonPrefixLength(oldText, this.newText);
		const suffixLen = Math.min(
			oldText.length - prefixLen,
			this.newText.length - prefixLen,
			commonSuffixLength(oldText, this.newText)
		);

		const replaceRange = new OffsetRange(
			this.replaceRange.start + prefixLen,
			this.replaceRange.endExclusive - suffixLen,
		);
		const newText = this.newText.substring(prefixLen, this.newText.length - suffixLen);

		return new StringReplacement(replaceRange, newText);
	}
}

export function applyEditsToRanges(sortedRanges: OffsetRange[], edit: StringEdit): OffsetRange[] {
	sortedRanges = sortedRanges.slice();

	// treat edits as deletion of the replace range and then as insertion that extends the first range
	const result: OffsetRange[] = [];

	let offset = 0;

	for (const e of edit.replacements) {
		while (true) {
			// ranges before the current edit
			const r = sortedRanges[0];
			if (!r || r.endExclusive >= e.replaceRange.start) {
				break;
			}
			sortedRanges.shift();
			result.push(r.delta(offset));
		}

		const intersecting: OffsetRange[] = [];
		while (true) {
			const r = sortedRanges[0];
			if (!r || !r.intersectsOrTouches(e.replaceRange)) {
				break;
			}
			sortedRanges.shift();
			intersecting.push(r);
		}

		for (let i = intersecting.length - 1; i >= 0; i--) {
			let r = intersecting[i];

			const overlap = r.intersect(e.replaceRange)!.length;
			r = r.deltaEnd(-overlap + (i === 0 ? e.newText.length : 0));

			const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
			if (rangeAheadOfReplaceRange > 0) {
				r = r.delta(-rangeAheadOfReplaceRange);
			}

			if (i !== 0) {
				r = r.delta(e.newText.length);
			}

			// We already took our offset into account.
			// Because we add r back to the queue (which then adds offset again),
			// we have to remove it here.
			r = r.delta(-(e.newText.length - e.replaceRange.length));

			sortedRanges.unshift(r);
		}

		offset += e.newText.length - e.replaceRange.length;
	}

	while (true) {
		const r = sortedRanges[0];
		if (!r) {
			break;
		}
		sortedRanges.shift();
		result.push(r.delta(offset));
	}

	return result;
}
