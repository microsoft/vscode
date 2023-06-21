/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { Range } from 'vs/editor/common/core/range';

/**
 * A range of lines (1-based).
 */
export class LineRange {
	public static fromRange(range: Range): LineRange {
		return new LineRange(range.startLineNumber, range.endLineNumber);
	}

	public static subtract(a: LineRange, b: LineRange | undefined): LineRange[] {
		if (!b) {
			return [a];
		}
		if (a.startLineNumber < b.startLineNumber && b.endLineNumberExclusive < a.endLineNumberExclusive) {
			return [
				new LineRange(a.startLineNumber, b.startLineNumber),
				new LineRange(b.endLineNumberExclusive, a.endLineNumberExclusive)
			];
		} else if (b.startLineNumber <= a.startLineNumber && a.endLineNumberExclusive <= b.endLineNumberExclusive) {
			return [];
		} else if (b.endLineNumberExclusive < a.endLineNumberExclusive) {
			return [new LineRange(Math.max(b.endLineNumberExclusive, a.startLineNumber), a.endLineNumberExclusive)];
		} else {
			return [new LineRange(a.startLineNumber, Math.min(b.startLineNumber, a.endLineNumberExclusive))];
		}
	}

	/**
	 * @param lineRanges An array of sorted line ranges.
	 */
	public static joinMany(lineRanges: readonly (readonly LineRange[])[]): readonly LineRange[] {
		if (lineRanges.length === 0) {
			return [];
		}
		let result = lineRanges[0];
		for (let i = 1; i < lineRanges.length; i++) {
			result = this.join(result, lineRanges[i]);
		}
		return result;
	}

	/**
	 * @param lineRanges1 Must be sorted.
	 * @param lineRanges2 Must be sorted.
	 */
	public static join(lineRanges1: readonly LineRange[], lineRanges2: readonly LineRange[]): readonly LineRange[] {
		if (lineRanges1.length === 0) {
			return lineRanges2;
		}
		if (lineRanges2.length === 0) {
			return lineRanges1;
		}

		const result: LineRange[] = [];
		let i1 = 0;
		let i2 = 0;
		let current: LineRange | null = null;
		while (i1 < lineRanges1.length || i2 < lineRanges2.length) {
			let next: LineRange | null = null;
			if (i1 < lineRanges1.length && i2 < lineRanges2.length) {
				const lineRange1 = lineRanges1[i1];
				const lineRange2 = lineRanges2[i2];
				if (lineRange1.startLineNumber < lineRange2.startLineNumber) {
					next = lineRange1;
					i1++;
				} else {
					next = lineRange2;
					i2++;
				}
			} else if (i1 < lineRanges1.length) {
				next = lineRanges1[i1];
				i1++;
			} else {
				next = lineRanges2[i2];
				i2++;
			}

			if (current === null) {
				current = next;
			} else {
				if (current.endLineNumberExclusive >= next.startLineNumber) {
					// merge
					current = new LineRange(current.startLineNumber, Math.max(current.endLineNumberExclusive, next.endLineNumberExclusive));
				} else {
					// push
					result.push(current);
					current = next;
				}
			}
		}
		if (current !== null) {
			result.push(current);
		}
		return result;
	}

	public static ofLength(startLineNumber: number, length: number): LineRange {
		return new LineRange(startLineNumber, startLineNumber + length);
	}

	/**
	 * The start line number.
	 */
	public readonly startLineNumber: number;

	/**
	 * The end line number (exclusive).
	 */
	public readonly endLineNumberExclusive: number;

	constructor(
		startLineNumber: number,
		endLineNumberExclusive: number,
	) {
		if (startLineNumber > endLineNumberExclusive) {
			throw new BugIndicatingError(`startLineNumber ${startLineNumber} cannot be after endLineNumberExclusive ${endLineNumberExclusive}`);
		}
		this.startLineNumber = startLineNumber;
		this.endLineNumberExclusive = endLineNumberExclusive;
	}

	/**
	 * Indicates if this line range contains the given line number.
	 */
	public contains(lineNumber: number): boolean {
		return this.startLineNumber <= lineNumber && lineNumber < this.endLineNumberExclusive;
	}

	/**
	 * Indicates if this line range is empty.
	 */
	get isEmpty(): boolean {
		return this.startLineNumber === this.endLineNumberExclusive;
	}

	/**
	 * Moves this line range by the given offset of line numbers.
	 */
	public delta(offset: number): LineRange {
		return new LineRange(this.startLineNumber + offset, this.endLineNumberExclusive + offset);
	}

	/**
	 * The number of lines this line range spans.
	 */
	public get length(): number {
		return this.endLineNumberExclusive - this.startLineNumber;
	}

	/**
	 * Creates a line range that combines this and the given line range.
	 */
	public join(other: LineRange): LineRange {
		return new LineRange(
			Math.min(this.startLineNumber, other.startLineNumber),
			Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive)
		);
	}

	public toString(): string {
		return `[${this.startLineNumber},${this.endLineNumberExclusive})`;
	}

	/**
	 * The resulting range is empty if the ranges do not intersect, but touch.
	 * If the ranges don't even touch, the result is undefined.
	 */
	public intersect(other: LineRange): LineRange | undefined {
		const startLineNumber = Math.max(this.startLineNumber, other.startLineNumber);
		const endLineNumberExclusive = Math.min(this.endLineNumberExclusive, other.endLineNumberExclusive);
		if (startLineNumber <= endLineNumberExclusive) {
			return new LineRange(startLineNumber, endLineNumberExclusive);
		}
		return undefined;
	}

	public intersectsStrict(other: LineRange): boolean {
		return this.startLineNumber < other.endLineNumberExclusive && other.startLineNumber < this.endLineNumberExclusive;
	}

	public overlapOrTouch(other: LineRange): boolean {
		return this.startLineNumber <= other.endLineNumberExclusive && other.startLineNumber <= this.endLineNumberExclusive;
	}

	public equals(b: LineRange): boolean {
		return this.startLineNumber === b.startLineNumber && this.endLineNumberExclusive === b.endLineNumberExclusive;
	}

	public toInclusiveRange(): Range | null {
		if (this.isEmpty) {
			return null;
		}
		return new Range(this.startLineNumber, 1, this.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER);
	}

	public toExclusiveRange(): Range {
		return new Range(this.startLineNumber, 1, this.endLineNumberExclusive, 1);
	}

	public mapToLineArray<T>(f: (lineNumber: number) => T): T[] {
		const result: T[] = [];
		for (let lineNumber = this.startLineNumber; lineNumber < this.endLineNumberExclusive; lineNumber++) {
			result.push(f(lineNumber));
		}
		return result;
	}
}
