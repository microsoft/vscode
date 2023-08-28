/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';

export interface ILinesDiffComputer {
	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): LinesDiff;
}

export interface ILinesDiffComputerOptions {
	readonly ignoreTrimWhitespace: boolean;
	readonly maxComputationTimeMs: number;
	readonly computeMoves: boolean;
}

export class LinesDiff {
	constructor(
		readonly changes: readonly LineRangeMapping[],

		/**
		 * Sorted by original line ranges.
		 * The original line ranges and the modified line ranges must be disjoint (but can be touching).
		 */
		readonly moves: readonly MovedText[],

		/**
		 * Indicates if the time out was reached.
		 * In that case, the diffs might be an approximation and the user should be asked to rerun the diff with more time.
		 */
		readonly hitTimeout: boolean,
	) {
	}
}

/**
 * Maps a line range in the original text model to a line range in the modified text model.
 */
export class LineRangeMapping {
	public static inverse(mapping: readonly LineRangeMapping[], originalLineCount: number, modifiedLineCount: number): LineRangeMapping[] {
		const result: LineRangeMapping[] = [];
		let lastOriginalEndLineNumber = 1;
		let lastModifiedEndLineNumber = 1;

		for (const m of mapping) {
			const r = new LineRangeMapping(
				new LineRange(lastOriginalEndLineNumber, m.originalRange.startLineNumber),
				new LineRange(lastModifiedEndLineNumber, m.modifiedRange.startLineNumber),
				undefined
			);
			if (!r.modifiedRange.isEmpty) {
				result.push(r);
			}
			lastOriginalEndLineNumber = m.originalRange.endLineNumberExclusive;
			lastModifiedEndLineNumber = m.modifiedRange.endLineNumberExclusive;
		}
		const r = new LineRangeMapping(
			new LineRange(lastOriginalEndLineNumber, originalLineCount + 1),
			new LineRange(lastModifiedEndLineNumber, modifiedLineCount + 1),
			undefined
		);
		if (!r.modifiedRange.isEmpty) {
			result.push(r);
		}
		return result;
	}

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
	 * The original range of each range mapping should be contained in the original line range (same for modified), exceptions are new-lines.
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

	public get changedLineCount() {
		return Math.max(this.originalRange.length, this.modifiedRange.length);
	}

	public flip(): LineRangeMapping {
		return new LineRangeMapping(this.modifiedRange, this.originalRange, this.innerChanges?.map(c => c.flip()));
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

	public flip(): RangeMapping {
		return new RangeMapping(this.modifiedRange, this.originalRange);
	}
}

// TODO@hediet: Make LineRangeMapping extend from this!
export class SimpleLineRangeMapping {
	constructor(
		public readonly original: LineRange,
		public readonly modified: LineRange,
	) {
	}

	public toString(): string {
		return `{${this.original.toString()}->${this.modified.toString()}}`;
	}

	public flip(): SimpleLineRangeMapping {
		return new SimpleLineRangeMapping(this.modified, this.original);
	}

	public join(other: SimpleLineRangeMapping): SimpleLineRangeMapping {
		return new SimpleLineRangeMapping(
			this.original.join(other.original),
			this.modified.join(other.modified),
		);
	}
}

export class MovedText {
	public readonly lineRangeMapping: SimpleLineRangeMapping;

	/**
	 * The diff from the original text to the moved text.
	 * Must be contained in the original/modified line range.
	 * Can be empty if the text didn't change (only moved).
	 */
	public readonly changes: readonly LineRangeMapping[];

	constructor(
		lineRangeMapping: SimpleLineRangeMapping,
		changes: readonly LineRangeMapping[],
	) {
		this.lineRangeMapping = lineRangeMapping;
		this.changes = changes;
	}

	public flip(): MovedText {
		return new MovedText(this.lineRangeMapping.flip(), this.changes.map(c => c.flip()));
	}
}
