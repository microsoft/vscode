/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../base/common/errors.js';
import { LineRange } from '../core/lineRange.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { AbstractText, SingleTextEdit } from '../core/textEdit.js';

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
				new LineRange(lastOriginalEndLineNumber, m.original.startLineNumber),
				new LineRange(lastModifiedEndLineNumber, m.modified.startLineNumber),
			);
			if (!r.modified.isEmpty) {
				result.push(r);
			}
			lastOriginalEndLineNumber = m.original.endLineNumberExclusive;
			lastModifiedEndLineNumber = m.modified.endLineNumberExclusive;
		}
		const r = new LineRangeMapping(
			new LineRange(lastOriginalEndLineNumber, originalLineCount + 1),
			new LineRange(lastModifiedEndLineNumber, modifiedLineCount + 1),
		);
		if (!r.modified.isEmpty) {
			result.push(r);
		}
		return result;
	}

	public static clip(mapping: readonly LineRangeMapping[], originalRange: LineRange, modifiedRange: LineRange): LineRangeMapping[] {
		const result: LineRangeMapping[] = [];
		for (const m of mapping) {
			const original = m.original.intersect(originalRange);
			const modified = m.modified.intersect(modifiedRange);
			if (original && !original.isEmpty && modified && !modified.isEmpty) {
				result.push(new LineRangeMapping(original, modified));
			}
		}
		return result;
	}

	/**
	 * The line range in the original text model.
	 */
	public readonly original: LineRange;

	/**
	 * The line range in the modified text model.
	 */
	public readonly modified: LineRange;

	constructor(
		originalRange: LineRange,
		modifiedRange: LineRange
	) {
		this.original = originalRange;
		this.modified = modifiedRange;
	}


	public toString(): string {
		return `{${this.original.toString()}->${this.modified.toString()}}`;
	}

	public flip(): LineRangeMapping {
		return new LineRangeMapping(this.modified, this.original);
	}

	public join(other: LineRangeMapping): LineRangeMapping {
		return new LineRangeMapping(
			this.original.join(other.original),
			this.modified.join(other.modified)
		);
	}

	public get changedLineCount() {
		return Math.max(this.original.length, this.modified.length);
	}

	/**
	 * This method assumes that the LineRangeMapping describes a valid diff!
	 * I.e. if one range is empty, the other range cannot be the entire document.
	 * It avoids various problems when the line range points to non-existing line-numbers.
	*/
	public toRangeMapping(): RangeMapping {
		const origInclusiveRange = this.original.toInclusiveRange();
		const modInclusiveRange = this.modified.toInclusiveRange();
		if (origInclusiveRange && modInclusiveRange) {
			return new RangeMapping(origInclusiveRange, modInclusiveRange);
		} else if (this.original.startLineNumber === 1 || this.modified.startLineNumber === 1) {
			if (!(this.modified.startLineNumber === 1 && this.original.startLineNumber === 1)) {
				// If one line range starts at 1, the other one must start at 1 as well.
				throw new BugIndicatingError('not a valid diff');
			}

			// Because one range is empty and both ranges start at line 1, none of the ranges can cover all lines.
			// Thus, `endLineNumberExclusive` is a valid line number.
			return new RangeMapping(
				new Range(this.original.startLineNumber, 1, this.original.endLineNumberExclusive, 1),
				new Range(this.modified.startLineNumber, 1, this.modified.endLineNumberExclusive, 1),
			);
		} else {
			// We can assume here that both startLineNumbers are greater than 1.
			return new RangeMapping(
				new Range(this.original.startLineNumber - 1, Number.MAX_SAFE_INTEGER, this.original.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER),
				new Range(this.modified.startLineNumber - 1, Number.MAX_SAFE_INTEGER, this.modified.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER),
			);
		}
	}

	/**
	 * This method assumes that the LineRangeMapping describes a valid diff!
	 * I.e. if one range is empty, the other range cannot be the entire document.
	 * It avoids various problems when the line range points to non-existing line-numbers.
	*/
	public toRangeMapping2(original: string[], modified: string[]): RangeMapping {
		if (isValidLineNumber(this.original.endLineNumberExclusive, original)
			&& isValidLineNumber(this.modified.endLineNumberExclusive, modified)) {
			return new RangeMapping(
				new Range(this.original.startLineNumber, 1, this.original.endLineNumberExclusive, 1),
				new Range(this.modified.startLineNumber, 1, this.modified.endLineNumberExclusive, 1),
			);
		}

		if (!this.original.isEmpty && !this.modified.isEmpty) {
			return new RangeMapping(
				Range.fromPositions(
					new Position(this.original.startLineNumber, 1),
					normalizePosition(new Position(this.original.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), original)
				),
				Range.fromPositions(
					new Position(this.modified.startLineNumber, 1),
					normalizePosition(new Position(this.modified.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), modified)
				),
			);
		}

		if (this.original.startLineNumber > 1 && this.modified.startLineNumber > 1) {
			return new RangeMapping(
				Range.fromPositions(
					normalizePosition(new Position(this.original.startLineNumber - 1, Number.MAX_SAFE_INTEGER), original),
					normalizePosition(new Position(this.original.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), original)
				),
				Range.fromPositions(
					normalizePosition(new Position(this.modified.startLineNumber - 1, Number.MAX_SAFE_INTEGER), modified),
					normalizePosition(new Position(this.modified.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER), modified)
				),
			);
		}

		// Situation now: one range is empty and one range touches the last line and one range starts at line 1.
		// I don't think this can happen.

		throw new BugIndicatingError();
	}
}

function normalizePosition(position: Position, content: string[]): Position {
	if (position.lineNumber < 1) {
		return new Position(1, 1);
	}
	if (position.lineNumber > content.length) {
		return new Position(content.length, content[content.length - 1].length + 1);
	}
	const line = content[position.lineNumber - 1];
	if (position.column > line.length + 1) {
		return new Position(position.lineNumber, line.length + 1);
	}
	return position;
}

function isValidLineNumber(lineNumber: number, lines: string[]): boolean {
	return lineNumber >= 1 && lineNumber <= lines.length;
}

/**
 * Maps a line range in the original text model to a line range in the modified text model.
 * Also contains inner range mappings.
 */
export class DetailedLineRangeMapping extends LineRangeMapping {
	public static fromRangeMappings(rangeMappings: RangeMapping[]): DetailedLineRangeMapping {
		const originalRange = LineRange.join(rangeMappings.map(r => LineRange.fromRangeInclusive(r.originalRange)));
		const modifiedRange = LineRange.join(rangeMappings.map(r => LineRange.fromRangeInclusive(r.modifiedRange)));
		return new DetailedLineRangeMapping(originalRange, modifiedRange, rangeMappings);
	}

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
		innerChanges: RangeMapping[] | undefined
	) {
		super(originalRange, modifiedRange);
		this.innerChanges = innerChanges;
	}

	public override flip(): DetailedLineRangeMapping {
		return new DetailedLineRangeMapping(this.modified, this.original, this.innerChanges?.map(c => c.flip()));
	}

	public withInnerChangesFromLineRanges(): DetailedLineRangeMapping {
		return new DetailedLineRangeMapping(this.original, this.modified, [this.toRangeMapping()]);
	}
}

/**
 * Maps a range in the original text model to a range in the modified text model.
 */
export class RangeMapping {
	public static assertSorted(rangeMappings: RangeMapping[]): void {
		for (let i = 1; i < rangeMappings.length; i++) {
			const previous = rangeMappings[i - 1];
			const current = rangeMappings[i];
			if (!(
				previous.originalRange.getEndPosition().isBeforeOrEqual(current.originalRange.getStartPosition())
				&& previous.modifiedRange.getEndPosition().isBeforeOrEqual(current.modifiedRange.getStartPosition())
			)) {
				throw new BugIndicatingError('Range mappings must be sorted');
			}
		}
	}

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
		modifiedRange: Range
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

	/**
	 * Creates a single text edit that describes the change from the original to the modified text.
	*/
	public toTextEdit(modified: AbstractText): SingleTextEdit {
		const newText = modified.getValueOfRange(this.modifiedRange);
		return new SingleTextEdit(this.originalRange, newText);
	}
}
