/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Comparator, compareBy, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Constants } from 'vs/base/common/uint';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';

export class LineRange {
	public static readonly compareByStart: Comparator<LineRange> = compareBy(l => l.startLineNumber, numberComparator);

	public static join(ranges: LineRange[]): LineRange | undefined {
		if (ranges.length === 0) {
			return undefined;
		}

		let startLineNumber = Number.MAX_SAFE_INTEGER;
		let endLineNumber = 0;
		for (const range of ranges) {
			startLineNumber = Math.min(startLineNumber, range.startLineNumber);
			endLineNumber = Math.max(endLineNumber, range.startLineNumber + range.lineCount);
		}
		return new LineRange(startLineNumber, endLineNumber - startLineNumber);
	}

	static fromLineNumbers(startLineNumber: number, endExclusiveLineNumber: number): LineRange {
		return new LineRange(startLineNumber, endExclusiveLineNumber - startLineNumber);
	}

	constructor(
		public readonly startLineNumber: number,
		public readonly lineCount: number
	) {
		if (lineCount < 0) {
			throw new BugIndicatingError();
		}
	}

	public join(other: LineRange): LineRange {
		return new LineRange(Math.min(this.startLineNumber, other.startLineNumber), Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive) - this.startLineNumber);
	}

	public get endLineNumberExclusive(): number {
		return this.startLineNumber + this.lineCount;
	}

	public get isEmpty(): boolean {
		return this.lineCount === 0;
	}

	/**
	 * Returns false if there is at least one line between `this` and `other`.
	*/
	public touches(other: LineRange): boolean {
		return (
			this.endLineNumberExclusive >= other.startLineNumber &&
			other.endLineNumberExclusive >= this.startLineNumber
		);
	}

	public isAfter(range: LineRange): boolean {
		return this.startLineNumber >= range.endLineNumberExclusive;
	}

	public isBefore(range: LineRange): boolean {
		return range.startLineNumber >= this.endLineNumberExclusive;
	}

	public delta(lineDelta: number): LineRange {
		return new LineRange(this.startLineNumber + lineDelta, this.lineCount);
	}

	public toString() {
		return `[${this.startLineNumber},${this.endLineNumberExclusive})`;
	}

	public equals(originalRange: LineRange) {
		return this.startLineNumber === originalRange.startLineNumber && this.lineCount === originalRange.lineCount;
	}

	public contains(lineNumber: number): boolean {
		return this.startLineNumber <= lineNumber && lineNumber < this.endLineNumberExclusive;
	}

	public deltaEnd(delta: number): LineRange {
		return new LineRange(this.startLineNumber, this.lineCount + delta);
	}

	public deltaStart(lineDelta: number): LineRange {
		return new LineRange(this.startLineNumber + lineDelta, this.lineCount - lineDelta);
	}

	public getLines(model: ITextModel): string[] {
		const result = new Array(this.lineCount);
		for (let i = 0; i < this.lineCount; i++) {
			result[i] = model.getLineContent(this.startLineNumber + i);
		}
		return result;
	}

	public containsRange(range: LineRange): boolean {
		return this.startLineNumber <= range.startLineNumber && range.endLineNumberExclusive <= this.endLineNumberExclusive;
	}

	public toRange(): Range {
		return new Range(this.startLineNumber, 1, this.endLineNumberExclusive, 1);
	}

	public toInclusiveRange(): Range | undefined {
		if (this.isEmpty) {
			return undefined;
		}
		return new Range(this.startLineNumber, 1, this.endLineNumberExclusive - 1, Constants.MAX_SAFE_SMALL_INTEGER);
	}

	intersects(lineRange: LineRange) {
		return this.startLineNumber <= lineRange.endLineNumberExclusive
			&& lineRange.startLineNumber <= this.endLineNumberExclusive;
	}
}
