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
}

export class LinesDiff {
	constructor(
		readonly changes: readonly LineRangeMapping[],

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
	public static inverse(mapping: LineRangeMapping[], originalLineCount: number, modifiedLineCount: number): LineRangeMapping[] {
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
