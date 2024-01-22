/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';

export interface IOffsetRange {
	readonly start: number;
	readonly endExclusive: number;
}

/**
 * A range of offsets (0-based).
*/
export class OffsetRange implements IOffsetRange {
	public static addRange(range: OffsetRange, sortedRanges: OffsetRange[]): void {
		let i = 0;
		while (i < sortedRanges.length && sortedRanges[i].endExclusive < range.start) {
			i++;
		}
		let j = i;
		while (j < sortedRanges.length && sortedRanges[j].start <= range.endExclusive) {
			j++;
		}
		if (i === j) {
			sortedRanges.splice(i, 0, range);
		} else {
			const start = Math.min(range.start, sortedRanges[i].start);
			const end = Math.max(range.endExclusive, sortedRanges[j - 1].endExclusive);
			sortedRanges.splice(i, j - i, new OffsetRange(start, end));
		}
	}

	public static tryCreate(start: number, endExclusive: number): OffsetRange | undefined {
		if (start > endExclusive) {
			return undefined;
		}
		return new OffsetRange(start, endExclusive);
	}

	public static ofLength(length: number): OffsetRange {
		return new OffsetRange(0, length);
	}

	public static ofStartAndLength(start: number, length: number): OffsetRange {
		return new OffsetRange(start, start + length);
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

	public deltaStart(offset: number): OffsetRange {
		return new OffsetRange(this.start + offset, this.endExclusive);
	}

	public deltaEnd(offset: number): OffsetRange {
		return new OffsetRange(this.start, this.endExclusive + offset);
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
	public intersect(other: OffsetRange): OffsetRange | undefined {
		const start = Math.max(this.start, other.start);
		const end = Math.min(this.endExclusive, other.endExclusive);
		if (start <= end) {
			return new OffsetRange(start, end);
		}
		return undefined;
	}

	public intersects(other: OffsetRange): boolean {
		const start = Math.max(this.start, other.start);
		const end = Math.min(this.endExclusive, other.endExclusive);
		return start < end;
	}

	public intersectsOrTouches(other: OffsetRange): boolean {
		const start = Math.max(this.start, other.start);
		const end = Math.min(this.endExclusive, other.endExclusive);
		return start <= end;
	}

	public isBefore(other: OffsetRange): boolean {
		return this.endExclusive <= other.start;
	}

	public isAfter(other: OffsetRange): boolean {
		return this.start >= other.endExclusive;
	}

	public slice<T>(arr: T[]): T[] {
		return arr.slice(this.start, this.endExclusive);
	}

	public substring(str: string): string {
		return str.substring(this.start, this.endExclusive);
	}

	/**
	 * Returns the given value if it is contained in this instance, otherwise the closest value that is contained.
	 * The range must not be empty.
	 */
	public clip(value: number): number {
		if (this.isEmpty) {
			throw new BugIndicatingError(`Invalid clipping range: ${this.toString()}`);
		}
		return Math.max(this.start, Math.min(this.endExclusive - 1, value));
	}

	/**
	 * Returns `r := value + k * length` such that `r` is contained in this range.
	 * The range must not be empty.
	 *
	 * E.g. `[5, 10).clipCyclic(10) === 5`, `[5, 10).clipCyclic(11) === 6` and `[5, 10).clipCyclic(4) === 9`.
	 */
	public clipCyclic(value: number): number {
		if (this.isEmpty) {
			throw new BugIndicatingError(`Invalid clipping range: ${this.toString()}`);
		}
		if (value < this.start) {
			return this.endExclusive - ((this.start - value) % this.length);
		}
		if (value >= this.endExclusive) {
			return this.start + ((value - this.start) % this.length);
		}
		return value;
	}

	public map<T>(f: (offset: number) => T): T[] {
		const result: T[] = [];
		for (let i = this.start; i < this.endExclusive; i++) {
			result.push(f(i));
		}
		return result;
	}

	public forEach(f: (offset: number) => void): void {
		for (let i = this.start; i < this.endExclusive; i++) {
			f(i);
		}
	}
}

export class OffsetRangeSet {
	private readonly _sortedRanges: OffsetRange[] = [];

	public addRange(range: OffsetRange): void {
		let i = 0;
		while (i < this._sortedRanges.length && this._sortedRanges[i].endExclusive < range.start) {
			i++;
		}
		let j = i;
		while (j < this._sortedRanges.length && this._sortedRanges[j].start <= range.endExclusive) {
			j++;
		}
		if (i === j) {
			this._sortedRanges.splice(i, 0, range);
		} else {
			const start = Math.min(range.start, this._sortedRanges[i].start);
			const end = Math.max(range.endExclusive, this._sortedRanges[j - 1].endExclusive);
			this._sortedRanges.splice(i, j - i, new OffsetRange(start, end));
		}
	}

	public toString(): string {
		return this._sortedRanges.map(r => r.toString()).join(', ');
	}

	/**
	 * Returns of there is a value that is contained in this instance and the given range.
	 */
	public intersectsStrict(other: OffsetRange): boolean {
		// TODO use binary search
		let i = 0;
		while (i < this._sortedRanges.length && this._sortedRanges[i].endExclusive <= other.start) {
			i++;
		}
		return i < this._sortedRanges.length && this._sortedRanges[i].start < other.endExclusive;
	}

	public intersectWithRange(other: OffsetRange): OffsetRangeSet {
		// TODO use binary search + slice
		const result = new OffsetRangeSet();
		for (const range of this._sortedRanges) {
			const intersection = range.intersect(other);
			if (intersection) {
				result.addRange(intersection);
			}
		}
		return result;
	}

	public intersectWithRangeLength(other: OffsetRange): number {
		return this.intersectWithRange(other).length;
	}

	public get length(): number {
		return this._sortedRanges.reduce((prev, cur) => prev + cur.length, 0);
	}
}
