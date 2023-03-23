/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';

/**
 * A range of offsets (0-based).
*/
export class OffsetRange {
	public static tryCreate(start: number, endExclusive: number): OffsetRange | undefined {
		if (start > endExclusive) {
			return undefined;
		}
		return new OffsetRange(start, endExclusive);
	}

	constructor(public readonly start: number, public readonly endExclusive: number) {
		if (start > endExclusive) {
			throw new BugIndicatingError(`Invalid range: ${this.toString()}`);
		}
	}

	get isEmpty(): boolean {
		return this.start === this.endExclusive;
	}

	public delta(offset: number): OffsetRange {
		return new OffsetRange(this.start + offset, this.endExclusive + offset);
	}

	public get length(): number {
		return this.endExclusive - this.start;
	}

	public toString() {
		return `[${this.start}, ${this.endExclusive})`;
	}

	public equals(other: OffsetRange): boolean {
		return this.start === other.start && this.endExclusive === other.endExclusive;
	}

	public containsRange(other: OffsetRange): boolean {
		return this.start <= other.start && other.endExclusive <= this.endExclusive;
	}

	public contains(offset: number): boolean {
		return this.start <= offset && offset < this.endExclusive;
	}

	/**
	 * for all numbers n: range1.contains(n) or range2.contains(n) => range1.join(range2).contains(n)
	 * The joined range is the smallest range that contains both ranges.
	 */
	public join(other: OffsetRange): OffsetRange {
		return new OffsetRange(Math.min(this.start, other.start), Math.max(this.endExclusive, other.endExclusive));
	}

	/**
	 * for all numbers n: range1.contains(n) and range2.contains(n) <=> range1.intersect(range2).contains(n)
	 *
	 * The resulting range is empty if the ranges do not intersect, but touch.
	 * If the ranges don't even touch, the result is undefined.
	 */
	public intersect(seq1Range: OffsetRange): OffsetRange | undefined {
		const start = Math.max(this.start, seq1Range.start);
		const end = Math.min(this.endExclusive, seq1Range.endExclusive);
		if (start <= end) {
			return new OffsetRange(start, end);
		}
		return undefined;
	}
}
