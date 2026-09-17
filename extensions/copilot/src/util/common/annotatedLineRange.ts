/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineRange } from '../vs/editor/common/core/ranges/lineRange';

export class AnnotatedLineRange<T> extends LineRange {
	public static fromLineRange(range: LineRange): AnnotatedLineRange<void> {
		return new AnnotatedLineRange(range.startLineNumber, range.endLineNumberExclusive, undefined);
	}

	public static fromLineRangeWithData<T>(range: LineRange, data: T): AnnotatedLineRange<T> {
		return new AnnotatedLineRange(range.startLineNumber, range.endLineNumberExclusive, data);
	}

	constructor(
		startLineNumber: number,
		endLineNumberExclusive: number,
		public readonly data: T,
	) {
		super(startLineNumber, endLineNumberExclusive);
	}
}

export class AnnotatedLineRanges<T> {
	constructor(
		/**
		 * Have to be sorted and disjoined.
		*/
		public readonly ranges: readonly AnnotatedLineRange<T>[],
	) {
	}

	public getFilled(range: LineRange): AnnotatedLineRanges<T | void> {
		const filledRanges: AnnotatedLineRange<T | void>[] = [];
		let lastEndLineNumberExclusive = range.startLineNumber;
		for (const r of this.ranges) {
			if (r.startLineNumber > lastEndLineNumberExclusive) {
				filledRanges.push(new AnnotatedLineRange(lastEndLineNumberExclusive, r.startLineNumber, undefined));
			}
			filledRanges.push(r);
			lastEndLineNumberExclusive = r.endLineNumberExclusive;
		}
		if (lastEndLineNumberExclusive < range.endLineNumberExclusive) {
			filledRanges.push(new AnnotatedLineRange(lastEndLineNumberExclusive, range.endLineNumberExclusive, undefined));
		}
		return new AnnotatedLineRanges(filledRanges);
	}

	public intersects(range: LineRange): boolean {
		for (const r of this.ranges) {
			if (r.intersectsStrict(range)) {
				return true;
			}
		}
		return false;
	}

	public withAdded<T2>(range: AnnotatedLineRange<T2>): AnnotatedLineRanges<T | T2> {
		const newRanges: AnnotatedLineRange<T | T2>[] = [...this.ranges];
		newRanges.push(range);
		newRanges.sort((a, b) => a.startLineNumber - b.startLineNumber);
		return new AnnotatedLineRanges(newRanges);
	}
}
