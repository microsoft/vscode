/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';

export interface ILinesDiffComputer {
	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): ILinesDiff;
}

export interface ILinesDiffComputerOptions {
	readonly ignoreTrimWhitespace: boolean;
	readonly maxComputationTimeMs: number;
}

export interface ILinesDiff {
	readonly quitEarly: boolean;
	readonly changes: LineRangeMapping[];
}

/**
 * Maps a line range in the original text model to a line range in the modified text model.
 */
export class LineRangeMapping {
	/**
	 * The line range in the original text model.
	 */
	public readonly originalRange: LineRange;

	/**
	 * The line range in the modified text model.
	 */
	public readonly modifiedRange: LineRange;

	/**
	 * If inner changes have not been computed, this is set to undefined.
	 * Otherwise, it represents the character-level diff in this line range.
	 * The original range of each range mapping should be contained in the original line range (same for modified).
	 * Must not be an empty array.
	 */
	public readonly innerChanges: RangeMapping[] | undefined;

	constructor(
		originalRange: LineRange,
		modifiedRange: LineRange,
		innerChanges: RangeMapping[] | undefined,
	) {
		this.originalRange = originalRange;
		this.modifiedRange = modifiedRange;
		this.innerChanges = innerChanges;
	}

	public toString(): string {
		return `{${this.originalRange.toString()}->${this.modifiedRange.toString()}}`;
	}
}

/**
 * Maps a range in the original text model to a range in the modified text model.
 */
export class RangeMapping {
	/**
	 * The original range.
	 */
	readonly originalRange: Range;

	/**
	 * The modified range.
	 */
	readonly modifiedRange: Range;

	constructor(
		originalRange: Range,

		modifiedRange: Range,
	) {
		this.originalRange = originalRange;
		this.modifiedRange = modifiedRange;
	}

	public toString(): string {
		return `{${this.originalRange.toString()}->${this.modifiedRange.toString()}}`;
	}
}

/**
 * A range of lines (1-based).
 */
export class LineRange {
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
		this.startLineNumber = startLineNumber;
		this.endLineNumberExclusive = endLineNumberExclusive;
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
}
