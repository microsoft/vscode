/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DetailedLineRangeMapping, LineRangeMapping } from './rangeMapping.js';

export interface ILinesDiffComputer {
	computeDiff(originalLines: string[], modifiedLines: string[], options: ILinesDiffComputerOptions): LinesDiff;
}

export interface ILinesDiffComputerOptions {
	readonly ignoreTrimWhitespace: boolean;
	readonly maxComputationTimeMs: number;
	readonly computeMoves: boolean;
	readonly extendToSubwords?: boolean;
}

export class LinesDiff {
	constructor(
		readonly changes: readonly DetailedLineRangeMapping[],

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

export class MovedText {
	public readonly lineRangeMapping: LineRangeMapping;

	/**
	 * The diff from the original text to the moved text.
	 * Must be contained in the original/modified line range.
	 * Can be empty if the text didn't change (only moved).
	 */
	public readonly changes: readonly DetailedLineRangeMapping[];

	constructor(
		lineRangeMapping: LineRangeMapping,
		changes: readonly DetailedLineRangeMapping[],
	) {
		this.lineRangeMapping = lineRangeMapping;
		this.changes = changes;
	}

	public flip(): MovedText {
		return new MovedText(this.lineRangeMapping.flip(), this.changes.map(c => c.flip()));
	}
}
