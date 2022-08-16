/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';

export interface ILinesDiffComputer {
	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): ILinesDiff;
}

export interface ILinesDiffComputerOptions {
	ignoreTrimWhitespace: boolean;
	maxComputationTime: number;
}

export interface ILinesDiff {
	readonly quitEarly: boolean;
	readonly changes: LineRangeMapping[];
}

export class LineRangeMapping {
	constructor(
		readonly originalRange: LineRange,
		readonly modifiedRange: LineRange,
		/**
		 * Meaning of `undefined` unclear.
		*/
		readonly innerChanges: RangeMapping[] | undefined,
	) { }

	toString(): string {
		return `{${this.originalRange.toString()}->${this.modifiedRange.toString()}}`;
	}
}

export class RangeMapping {
	constructor(
		readonly originalRange: Range,
		readonly modifiedRange: Range,
	) { }

	toString(): string {
		return `{${this.originalRange.toString()}->${this.modifiedRange.toString()}}`;
	}
}

/**
 * 1-based.
*/
export class LineRange {
	constructor(public readonly startLineNumber: number, public readonly endLineNumberExclusive: number) { }

	get isEmpty(): boolean {
		return this.startLineNumber === this.endLineNumberExclusive;
	}

	public delta(offset: number): LineRange {
		return new LineRange(this.startLineNumber + offset, this.endLineNumberExclusive + offset);
	}

	public get length(): number {
		return this.endLineNumberExclusive - this.startLineNumber;
	}

	toString(): string {
		return `[${this.startLineNumber},${this.endLineNumberExclusive})`;
	}

	public join(other: LineRange): LineRange {
		return new LineRange(
			Math.min(this.startLineNumber, other.startLineNumber),
			Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive)
		);
	}
}
