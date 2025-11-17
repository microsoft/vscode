/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commonPrefixLength, commonSuffixLength } from '../../../../base/common/strings.js';
import { OffsetRange } from '../ranges/offsetRange.js';
import { StringText } from '../text/abstractText.js';
import { BaseEdit, BaseReplacement } from './edit.js';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class BaseStringEdit<T extends BaseStringReplacement<T> = BaseStringReplacement<any>, TEdit extends BaseStringEdit<T, TEdit> = BaseStringEdit<any, any>> extends BaseEdit<T, TEdit> {
	get TReplacement(): T {
		throw new Error('TReplacement is not defined for BaseStringEdit');
	}

	public static composeOrUndefined<T extends BaseStringEdit>(edits: readonly T[]): T | undefined {
		if (edits.length === 0) {
			return undefined;
		}
		let result = edits[0];
		for (let i = 1; i < edits.length; i++) {
			// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
			result = result.compose(edits[i]) as any;
		}
		return result;
	}

	/**
	 * r := trySwap(e1, e2);
	 * e1.compose(e2) === r.e1.compose(r.e2)
	*/
	public static trySwap(e1: BaseStringEdit, e2: BaseStringEdit): { e1: StringEdit; e2: StringEdit } | undefined {
		// TODO make this more efficient
		const e1Inv = e1.inverseOnSlice((start, endEx) => ' '.repeat(endEx - start));

		const e1_ = e2.tryRebase(e1Inv);
		if (!e1_) {
			return undefined;
		}
		const e2_ = e1.tryRebase(e1_);
		if (!e2_) {
			return undefined;
		}

		return { e1: e1_, e2: e2_ };
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
	public inverseOnSlice(getOriginalSlice: (start: number, endEx: number) => string): StringEdit {
		const edits: StringReplacement[] = [];
		let offset = 0;
		for (const e of this.replacements) {
			edits.push(StringReplacement.replace(
				OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length),
				getOriginalSlice(e.replaceRange.start, e.replaceRange.endExclusive)
			));
			offset += e.newText.length - e.replaceRange.length;
		}
		return new StringEdit(edits);
	}

	/**
	 * Creates an edit that reverts this edit.
	 */
	public inverse(original: string): StringEdit {
		return this.inverseOnSlice((start, endEx) => original.substring(start, endEx));
	}

	public rebaseSkipConflicting(base: StringEdit): StringEdit {
		return this._tryRebase(base, false)!;
	}

	public tryRebase(base: StringEdit): StringEdit | undefined {
		return this._tryRebase(base, true);
	}

	private _tryRebase(base: StringEdit, noOverlap: boolean): StringEdit | undefined {
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
					ourEdit.newText
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
					ourEdit.newText
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
		return this.replacements.map(e => e.toJson());
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

	public normalizeEOL(eol: '\r\n' | '\n'): StringEdit {
		return new StringEdit(this.replacements.map(edit => edit.normalizeEOL(eol)));
	}

	/**
	 * If `e1.apply(source) === e2.apply(source)`, then `e1.normalizeOnSource(source).equals(e2.normalizeOnSource(source))`.
	*/
	public normalizeOnSource(source: string): StringEdit {
		const result = this.apply(source);

		const edit = StringReplacement.replace(OffsetRange.ofLength(source.length), result);
		const e = edit.removeCommonSuffixAndPrefix(source);
		if (e.isEmpty) {
			return StringEdit.empty;
		}
		return e.toEdit();
	}

	public removeCommonSuffixAndPrefix(source: string): TEdit {
		return this._createNew(this.replacements.map(e => e.removeCommonSuffixAndPrefix(source))).normalize();
	}

	public applyOnText(docContents: StringText): StringText {
		return new StringText(this.apply(docContents.value));
	}

	public mapData<TData extends IEditData<TData>>(f: (replacement: T) => TData): AnnotatedStringEdit<TData> {
		return new AnnotatedStringEdit(
			this.replacements.map(e => new AnnotatedStringReplacement(
				e.replaceRange,
				e.newText,
				f(e)
			))
		);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class BaseStringReplacement<T extends BaseStringReplacement<T> = BaseStringReplacement<any>> extends BaseReplacement<T> {
	constructor(
		range: OffsetRange,
		public readonly newText: string
	) {
		super(range);
	}

	getNewLength(): number { return this.newText.length; }

	override toString(): string {
		return `${this.replaceRange} -> ${JSON.stringify(this.newText)}`;
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

	normalizeEOL(eol: '\r\n' | '\n'): StringReplacement {
		const newText = this.newText.replace(/\r\n|\n/g, eol);
		return new StringReplacement(this.replaceRange, newText);
	}

	public removeCommonSuffixAndPrefix(source: string): T {
		return this.removeCommonSuffix(source).removeCommonPrefix(source);
	}

	public removeCommonPrefix(source: string): T {
		const oldText = this.replaceRange.substring(source);

		const prefixLen = commonPrefixLength(oldText, this.newText);
		if (prefixLen === 0) {
			return this as unknown as T;
		}

		return this.slice(this.replaceRange.deltaStart(prefixLen), new OffsetRange(prefixLen, this.newText.length));
	}

	public removeCommonSuffix(source: string): T {
		const oldText = this.replaceRange.substring(source);

		const suffixLen = commonSuffixLength(oldText, this.newText);
		if (suffixLen === 0) {
			return this as unknown as T;
		}
		return this.slice(this.replaceRange.deltaEnd(-suffixLen), new OffsetRange(0, this.newText.length - suffixLen));
	}

	public toEdit(): StringEdit {
		return new StringEdit([this]);
	}

	public toJson(): ISerializedStringReplacement {
		return ({
			txt: this.newText,
			pos: this.replaceRange.start,
			len: this.replaceRange.length,
		});
	}
}


/**
 * Represents a set of replacements to a string.
 * All these replacements are applied at once.
*/
export class StringEdit extends BaseStringEdit<StringReplacement, StringEdit> {
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

	/**
	 * The replacements are applied in order!
	 * Equals `StringEdit.compose(replacements.map(r => r.toEdit()))`, but is much more performant.
	*/
	public static composeSequentialReplacements(replacements: readonly StringReplacement[]): StringEdit {
		let edit = StringEdit.empty;
		let curEditReplacements: StringReplacement[] = []; // These are reverse sorted

		for (const r of replacements) {
			const last = curEditReplacements.at(-1);
			if (!last || r.replaceRange.isBefore(last.replaceRange)) {
				// Detect subsequences of reverse sorted replacements
				curEditReplacements.push(r);
			} else {
				// Once the subsequence is broken, compose the current replacements and look for a new subsequence.
				edit = edit.compose(StringEdit.create(curEditReplacements.reverse()));
				curEditReplacements = [r];
			}
		}

		edit = edit.compose(StringEdit.create(curEditReplacements.reverse()));
		return edit;
	}

	constructor(replacements: readonly StringReplacement[]) {
		super(replacements);
	}

	protected override _createNew(replacements: readonly StringReplacement[]): StringEdit {
		return new StringEdit(replacements);
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

export class StringReplacement extends BaseStringReplacement<StringReplacement> {
	public static insert(offset: number, text: string): StringReplacement {
		return new StringReplacement(OffsetRange.emptyAt(offset), text);
	}

	public static replace(range: OffsetRange, text: string): StringReplacement {
		return new StringReplacement(range, text);
	}

	public static delete(range: OffsetRange): StringReplacement {
		return new StringReplacement(range, '');
	}

	public static fromJson(data: ISerializedStringReplacement): StringReplacement {
		return new StringReplacement(OffsetRange.ofStartAndLength(data.pos, data.len), data.txt);
	}

	override equals(other: StringReplacement): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText;
	}

	override tryJoinTouching(other: StringReplacement): StringReplacement | undefined {
		return new StringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText);
	}

	override slice(range: OffsetRange, rangeInReplacement?: OffsetRange): StringReplacement {
		return new StringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText);
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

/**
 * Represents data associated to a single edit, which survives certain edit operations.
*/
export interface IEditData<T> {
	join(other: T): T | undefined;
}

export class VoidEditData implements IEditData<VoidEditData> {
	join(other: VoidEditData): VoidEditData | undefined {
		return this;
	}
}

/**
 * Represents a set of replacements to a string.
 * All these replacements are applied at once.
*/
export class AnnotatedStringEdit<T extends IEditData<T>> extends BaseStringEdit<AnnotatedStringReplacement<T>, AnnotatedStringEdit<T>> {
	public static readonly empty = new AnnotatedStringEdit<never>([]);

	public static create<T extends IEditData<T>>(replacements: readonly AnnotatedStringReplacement<T>[]): AnnotatedStringEdit<T> {
		return new AnnotatedStringEdit(replacements);
	}

	public static single<T extends IEditData<T>>(replacement: AnnotatedStringReplacement<T>): AnnotatedStringEdit<T> {
		return new AnnotatedStringEdit([replacement]);
	}

	public static replace<T extends IEditData<T>>(range: OffsetRange, replacement: string, data: T): AnnotatedStringEdit<T> {
		return new AnnotatedStringEdit([new AnnotatedStringReplacement(range, replacement, data)]);
	}

	public static insert<T extends IEditData<T>>(offset: number, replacement: string, data: T): AnnotatedStringEdit<T> {
		return new AnnotatedStringEdit([new AnnotatedStringReplacement(OffsetRange.emptyAt(offset), replacement, data)]);
	}

	public static delete<T extends IEditData<T>>(range: OffsetRange, data: T): AnnotatedStringEdit<T> {
		return new AnnotatedStringEdit([new AnnotatedStringReplacement(range, '', data)]);
	}

	public static compose<T extends IEditData<T>>(edits: readonly AnnotatedStringEdit<T>[]): AnnotatedStringEdit<T> {
		if (edits.length === 0) {
			return AnnotatedStringEdit.empty;
		}
		let result = edits[0];
		for (let i = 1; i < edits.length; i++) {
			result = result.compose(edits[i]);
		}
		return result;
	}

	constructor(replacements: readonly AnnotatedStringReplacement<T>[]) {
		super(replacements);
	}

	protected override _createNew(replacements: readonly AnnotatedStringReplacement<T>[]): AnnotatedStringEdit<T> {
		return new AnnotatedStringEdit<T>(replacements);
	}

	public toStringEdit(filter?: (replacement: AnnotatedStringReplacement<T>) => boolean): StringEdit {
		const newReplacements: StringReplacement[] = [];
		for (const r of this.replacements) {
			if (!filter || filter(r)) {
				newReplacements.push(new StringReplacement(r.replaceRange, r.newText));
			}
		}
		return new StringEdit(newReplacements);
	}
}

export class AnnotatedStringReplacement<T extends IEditData<T>> extends BaseStringReplacement<AnnotatedStringReplacement<T>> {
	public static insert<T extends IEditData<T>>(offset: number, text: string, data: T): AnnotatedStringReplacement<T> {
		return new AnnotatedStringReplacement<T>(OffsetRange.emptyAt(offset), text, data);
	}

	public static replace<T extends IEditData<T>>(range: OffsetRange, text: string, data: T): AnnotatedStringReplacement<T> {
		return new AnnotatedStringReplacement<T>(range, text, data);
	}

	public static delete<T extends IEditData<T>>(range: OffsetRange, data: T): AnnotatedStringReplacement<T> {
		return new AnnotatedStringReplacement<T>(range, '', data);
	}

	constructor(
		range: OffsetRange,
		newText: string,
		public readonly data: T
	) {
		super(range, newText);
	}

	override equals(other: AnnotatedStringReplacement<T>): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText && this.data === other.data;
	}

	tryJoinTouching(other: AnnotatedStringReplacement<T>): AnnotatedStringReplacement<T> | undefined {
		const joined = this.data.join(other.data);
		if (joined === undefined) {
			return undefined;
		}
		return new AnnotatedStringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText, joined);
	}

	slice(range: OffsetRange, rangeInReplacement?: OffsetRange): AnnotatedStringReplacement<T> {
		return new AnnotatedStringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText, this.data);
	}
}

