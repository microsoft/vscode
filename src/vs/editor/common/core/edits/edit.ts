/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sumBy } from '../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { OffsetRange } from '../ranges/offsetRange.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class BaseEdit<T extends BaseReplacement<T> = BaseReplacement<any>, TEdit extends BaseEdit<T, TEdit> = BaseEdit<T, any>> {
	constructor(
		public readonly replacements: readonly T[],
	) {
		let lastEndEx = -1;
		for (const replacement of replacements) {
			if (!(replacement.replaceRange.start >= lastEndEx)) {
				throw new BugIndicatingError(`Edits must be disjoint and sorted. Found ${replacement} after ${lastEndEx}`);
			}
			lastEndEx = replacement.replaceRange.endExclusive;
		}
	}

	protected abstract _createNew(replacements: readonly T[]): TEdit;

	/**
	 * Returns true if and only if this edit and the given edit are structurally equal.
	 * Note that this does not mean that the edits have the same effect on a given input!
	 * See `.normalize()` or `.normalizeOnBase(base)` for that.
	*/
	public equals(other: TEdit): boolean {
		if (this.replacements.length !== other.replacements.length) {
			return false;
		}
		for (let i = 0; i < this.replacements.length; i++) {
			if (!this.replacements[i].equals(other.replacements[i])) {
				return false;
			}
		}
		return true;
	}

	public toString() {
		const edits = this.replacements.map(e => e.toString()).join(', ');
		return `[${edits}]`;
	}

	/**
	 * Normalizes the edit by removing empty replacements and joining touching replacements (if the replacements allow joining).
	 * Two edits have an equal normalized edit if and only if they have the same effect on any input.
	 *
	 * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_normalize.drawio.png)
	 *
	 * Invariant:
	 * ```
	 * (forall base: TEdit.apply(base).equals(other.apply(base))) <-> this.normalize().equals(other.normalize())
	 * ```
	 * and
	 * ```
	 * forall base: TEdit.apply(base).equals(this.normalize().apply(base))
	 * ```
	 *
	 */
	public normalize(): TEdit {
		const newReplacements: T[] = [];
		let lastReplacement: T | undefined;
		for (const r of this.replacements) {
			if (r.getNewLength() === 0 && r.replaceRange.length === 0) {
				continue;
			}
			if (lastReplacement && lastReplacement.replaceRange.endExclusive === r.replaceRange.start) {
				const joined = lastReplacement.tryJoinTouching(r);
				if (joined) {
					lastReplacement = joined;
					continue;
				}
			}

			if (lastReplacement) {
				newReplacements.push(lastReplacement);
			}
			lastReplacement = r;
		}

		if (lastReplacement) {
			newReplacements.push(lastReplacement);
		}
		return this._createNew(newReplacements);
	}

	/**
	 * Combines two edits into one with the same effect.
	 *
	 * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_compose.drawio.png)
	 *
	 * Invariant:
	 * ```
	 * other.apply(this.apply(s0)) = this.compose(other).apply(s0)
	 * ```
	 */
	public compose(other: TEdit): TEdit {
		const edits1 = this.normalize();
		const edits2 = other.normalize();

		if (edits1.isEmpty()) { return edits2; }
		if (edits2.isEmpty()) { return edits1; }

		const edit1Queue = [...edits1.replacements];
		const result: T[] = [];

		let edit1ToEdit2 = 0;

		for (const r2 of edits2.replacements) {
			// Copy over edit1 unmodified until it touches edit2.
			while (true) {
				const r1 = edit1Queue[0];
				if (!r1 || r1.replaceRange.start + edit1ToEdit2 + r1.getNewLength() >= r2.replaceRange.start) {
					break;
				}
				edit1Queue.shift();

				result.push(r1);
				edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
			}

			const firstEdit1ToEdit2 = edit1ToEdit2;
			let firstIntersecting: T | undefined; // or touching
			let lastIntersecting: T | undefined; // or touching

			while (true) {
				const r1 = edit1Queue[0];
				if (!r1 || r1.replaceRange.start + edit1ToEdit2 > r2.replaceRange.endExclusive) {
					break;
				}
				// else we intersect, because the new end of edit1 is after or equal to our start

				if (!firstIntersecting) {
					firstIntersecting = r1;
				}
				lastIntersecting = r1;
				edit1Queue.shift();

				edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
			}

			if (!firstIntersecting) {
				result.push(r2.delta(-edit1ToEdit2));
			} else {
				const newReplaceRangeStart = Math.min(firstIntersecting.replaceRange.start, r2.replaceRange.start - firstEdit1ToEdit2);

				const prefixLength = r2.replaceRange.start - (firstIntersecting.replaceRange.start + firstEdit1ToEdit2);
				if (prefixLength > 0) {
					const prefix = firstIntersecting.slice(OffsetRange.emptyAt(newReplaceRangeStart), new OffsetRange(0, prefixLength));
					result.push(prefix);
				}
				if (!lastIntersecting) {
					throw new BugIndicatingError(`Invariant violation: lastIntersecting is undefined`);
				}
				const suffixLength = (lastIntersecting.replaceRange.endExclusive + edit1ToEdit2) - r2.replaceRange.endExclusive;
				if (suffixLength > 0) {
					const e = lastIntersecting.slice(
						OffsetRange.ofStartAndLength(lastIntersecting.replaceRange.endExclusive, 0),
						new OffsetRange(lastIntersecting.getNewLength() - suffixLength, lastIntersecting.getNewLength())
					);
					edit1Queue.unshift(e);
					edit1ToEdit2 -= e.getNewLength() - e.replaceRange.length;
				}

				const newReplaceRange = new OffsetRange(
					newReplaceRangeStart,
					r2.replaceRange.endExclusive - edit1ToEdit2
				);
				const middle = r2.slice(newReplaceRange, new OffsetRange(0, r2.getNewLength()));
				result.push(middle);
			}
		}

		while (true) {
			const item = edit1Queue.shift();
			if (!item) { break; }
			result.push(item);
		}

		return this._createNew(result).normalize();
	}

	public decomposeSplit(shouldBeInE1: (repl: T) => boolean): { e1: TEdit; e2: TEdit } {
		const e1: T[] = [];
		const e2: T[] = [];

		let e2delta = 0;
		for (const edit of this.replacements) {
			if (shouldBeInE1(edit)) {
				e1.push(edit);
				e2delta += edit.getNewLength() - edit.replaceRange.length;
			} else {
				e2.push(edit.slice(edit.replaceRange.delta(e2delta), new OffsetRange(0, edit.getNewLength())));
			}
		}
		return { e1: this._createNew(e1), e2: this._createNew(e2) };
	}

	/**
	 * Returns the range of each replacement in the applied value.
	*/
	public getNewRanges(): OffsetRange[] {
		const ranges: OffsetRange[] = [];
		let offset = 0;
		for (const e of this.replacements) {
			ranges.push(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.getNewLength()));
			offset += e.getLengthDelta();
		}
		return ranges;
	}

	public getJoinedReplaceRange(): OffsetRange | undefined {
		if (this.replacements.length === 0) {
			return undefined;
		}
		return this.replacements[0].replaceRange.join(this.replacements.at(-1)!.replaceRange);
	}

	public isEmpty(): boolean {
		return this.replacements.length === 0;
	}

	public getLengthDelta(): number {
		return sumBy(this.replacements, (replacement) => replacement.getLengthDelta());
	}

	public getNewDataLength(dataLength: number): number {
		return dataLength + this.getLengthDelta();
	}

	public applyToOffset(originalOffset: number): number {
		let accumulatedDelta = 0;
		for (const r of this.replacements) {
			if (r.replaceRange.start <= originalOffset) {
				if (originalOffset < r.replaceRange.endExclusive) {
					// the offset is in the replaced range
					return r.replaceRange.start + accumulatedDelta;
				}
				accumulatedDelta += r.getNewLength() - r.replaceRange.length;
			} else {
				break;
			}
		}
		return originalOffset + accumulatedDelta;
	}

	public applyToOffsetRange(originalRange: OffsetRange): OffsetRange {
		return new OffsetRange(
			this.applyToOffset(originalRange.start),
			this.applyToOffset(originalRange.endExclusive)
		);
	}

	public applyInverseToOffset(postEditsOffset: number): number {
		let accumulatedDelta = 0;
		for (const edit of this.replacements) {
			const editLength = edit.getNewLength();
			if (edit.replaceRange.start <= postEditsOffset - accumulatedDelta) {
				if (postEditsOffset - accumulatedDelta < edit.replaceRange.start + editLength) {
					// the offset is in the replaced range
					return edit.replaceRange.start;
				}
				accumulatedDelta += editLength - edit.replaceRange.length;
			} else {
				break;
			}
		}
		return postEditsOffset - accumulatedDelta;
	}

	/**
	 * Return undefined if the originalOffset is within an edit
	 */
	public applyToOffsetOrUndefined(originalOffset: number): number | undefined {
		let accumulatedDelta = 0;
		for (const edit of this.replacements) {
			if (edit.replaceRange.start <= originalOffset) {
				if (originalOffset < edit.replaceRange.endExclusive) {
					// the offset is in the replaced range
					return undefined;
				}
				accumulatedDelta += edit.getNewLength() - edit.replaceRange.length;
			} else {
				break;
			}
		}
		return originalOffset + accumulatedDelta;
	}

	/**
	 * Return undefined if the originalRange is within an edit
	 */
	public applyToOffsetRangeOrUndefined(originalRange: OffsetRange): OffsetRange | undefined {
		const start = this.applyToOffsetOrUndefined(originalRange.start);
		if (start === undefined) {
			return undefined;
		}
		const end = this.applyToOffsetOrUndefined(originalRange.endExclusive);
		if (end === undefined) {
			return undefined;
		}
		return new OffsetRange(start, end);
	}
}

export abstract class BaseReplacement<TSelf extends BaseReplacement<TSelf>> {
	constructor(
		/**
		 * The range to be replaced.
		*/
		public readonly replaceRange: OffsetRange,
	) { }

	public abstract getNewLength(): number;

	/**
	 * Precondition: TEdit.range.endExclusive === other.range.start
	*/
	public abstract tryJoinTouching(other: TSelf): TSelf | undefined;

	public abstract slice(newReplaceRange: OffsetRange, rangeInReplacement?: OffsetRange): TSelf;

	public delta(offset: number): TSelf {
		return this.slice(this.replaceRange.delta(offset), new OffsetRange(0, this.getNewLength()));
	}

	public getLengthDelta(): number {
		return this.getNewLength() - this.replaceRange.length;
	}

	abstract equals(other: TSelf): boolean;

	toString(): string {
		return `{ ${this.replaceRange.toString()} -> ${this.getNewLength()} }`;
	}

	get isEmpty() {
		return this.getNewLength() === 0 && this.replaceRange.length === 0;
	}

	getRangeAfterReplace(): OffsetRange {
		return new OffsetRange(this.replaceRange.start, this.replaceRange.start + this.getNewLength());
	}
}

export type AnyEdit = BaseEdit<AnyReplacement, AnyEdit>;
export type AnyReplacement = BaseReplacement<AnyReplacement>;

export class Edit<T extends BaseReplacement<T>> extends BaseEdit<T, Edit<T>> {
	/**
	 * Represents a set of edits to a string.
	 * All these edits are applied at once.
	*/
	public static readonly empty = new Edit<never>([]);

	public static create<T extends BaseReplacement<T>>(replacements: readonly T[]): Edit<T> {
		return new Edit(replacements);
	}

	public static single<T extends BaseReplacement<T>>(replacement: T): Edit<T> {
		return new Edit([replacement]);
	}

	protected override _createNew(replacements: readonly T[]): Edit<T> {
		return new Edit(replacements);
	}
}

export class AnnotationReplacement<TAnnotation> extends BaseReplacement<AnnotationReplacement<TAnnotation>> {
	constructor(
		range: OffsetRange,
		public readonly newLength: number,
		public readonly annotation: TAnnotation,
	) {
		super(range);
	}

	override equals(other: AnnotationReplacement<TAnnotation>): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength && this.annotation === other.annotation;
	}

	getNewLength(): number { return this.newLength; }

	tryJoinTouching(other: AnnotationReplacement<TAnnotation>): AnnotationReplacement<TAnnotation> | undefined {
		if (this.annotation !== other.annotation) {
			return undefined;
		}
		return new AnnotationReplacement<TAnnotation>(this.replaceRange.joinRightTouching(other.replaceRange), this.newLength + other.newLength, this.annotation);
	}

	slice(range: OffsetRange, rangeInReplacement?: OffsetRange): AnnotationReplacement<TAnnotation> {
		return new AnnotationReplacement<TAnnotation>(range, rangeInReplacement ? rangeInReplacement.length : this.newLength, this.annotation);
	}
}
