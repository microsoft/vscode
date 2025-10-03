/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, concatArrays, numberComparator } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { assertFn, checkAdjacentItems } from '../../../../../base/common/assert.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { LineRangeEdit } from './editing.js';
import { MergeEditorLineRange } from './lineRange.js';
import { addLength, lengthBetweenPositions, rangeContainsPosition, rangeIsBeforeOrTouching } from './rangeUtils.js';

/**
 * Represents a mapping of an input line range to an output line range.
*/
export class LineRangeMapping {
	public static join(mappings: readonly LineRangeMapping[]): LineRangeMapping | undefined {
		return mappings.reduce<undefined | LineRangeMapping>((acc, cur) => acc ? acc.join(cur) : cur, undefined);
	}
	constructor(
		public readonly inputRange: MergeEditorLineRange,
		public readonly outputRange: MergeEditorLineRange
	) { }

	public extendInputRange(extendedInputRange: MergeEditorLineRange): LineRangeMapping {
		if (!extendedInputRange.containsRange(this.inputRange)) {
			throw new BugIndicatingError();
		}

		const startDelta = extendedInputRange.startLineNumber - this.inputRange.startLineNumber;
		const endDelta = extendedInputRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
		return new LineRangeMapping(
			extendedInputRange,
			MergeEditorLineRange.fromLength(
				this.outputRange.startLineNumber + startDelta,
				this.outputRange.length - startDelta + endDelta
			)
		);
	}

	public join(other: LineRangeMapping): LineRangeMapping {
		return new LineRangeMapping(
			this.inputRange.join(other.inputRange),
			this.outputRange.join(other.outputRange)
		);
	}

	public get resultingDeltaFromOriginalToModified(): number {
		return this.outputRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
	}

	public toString(): string {
		return `${this.inputRange.toString()} -> ${this.outputRange.toString()}`;
	}

	public addOutputLineDelta(delta: number): LineRangeMapping {
		return new LineRangeMapping(
			this.inputRange,
			this.outputRange.delta(delta)
		);
	}

	public addInputLineDelta(delta: number): LineRangeMapping {
		return new LineRangeMapping(
			this.inputRange.delta(delta),
			this.outputRange
		);
	}

	public reverse(): LineRangeMapping {
		return new LineRangeMapping(this.outputRange, this.inputRange);
	}
}

/**
* Represents a total monotonous mapping of line ranges in one document to another document.
*/
export class DocumentLineRangeMap {
	public static betweenOutputs(
		inputToOutput1: readonly LineRangeMapping[],
		inputToOutput2: readonly LineRangeMapping[],
		inputLineCount: number
	): DocumentLineRangeMap {
		const alignments = MappingAlignment.compute(inputToOutput1, inputToOutput2);
		const mappings = alignments.map((m) => new LineRangeMapping(m.output1Range, m.output2Range));
		return new DocumentLineRangeMap(mappings, inputLineCount);
	}

	constructor(
		/**
		 * The line range mappings that define this document mapping.
		 * The space between two input ranges must equal the space between two output ranges.
		 * These holes act as dense sequence of 1:1 line mappings.
		*/
		public readonly lineRangeMappings: LineRangeMapping[],
		public readonly inputLineCount: number
	) {
		assertFn(() => {
			return checkAdjacentItems(lineRangeMappings,
				(m1, m2) => m1.inputRange.isBefore(m2.inputRange) && m1.outputRange.isBefore(m2.outputRange) &&
					m2.inputRange.startLineNumber - m1.inputRange.endLineNumberExclusive === m2.outputRange.startLineNumber - m1.outputRange.endLineNumberExclusive,
			);
		});
	}

	public project(lineNumber: number): LineRangeMapping {
		const lastBefore = findLast(this.lineRangeMappings, r => r.inputRange.startLineNumber <= lineNumber);
		if (!lastBefore) {
			return new LineRangeMapping(
				MergeEditorLineRange.fromLength(lineNumber, 1),
				MergeEditorLineRange.fromLength(lineNumber, 1)
			);
		}

		if (lastBefore.inputRange.contains(lineNumber)) {
			return lastBefore;
		}
		const containingRange = MergeEditorLineRange.fromLength(lineNumber, 1);
		const mappedRange = MergeEditorLineRange.fromLength(
			lineNumber +
			lastBefore.outputRange.endLineNumberExclusive -
			lastBefore.inputRange.endLineNumberExclusive,
			1
		);
		return new LineRangeMapping(containingRange, mappedRange);
	}

	public get outputLineCount(): number {
		const last = this.lineRangeMappings.at(-1);
		const diff = last ? last.outputRange.endLineNumberExclusive - last.inputRange.endLineNumberExclusive : 0;
		return this.inputLineCount + diff;
	}

	public reverse(): DocumentLineRangeMap {
		return new DocumentLineRangeMap(
			this.lineRangeMappings.map(r => r.reverse()),
			this.outputLineCount
		);
	}
}

/**
 * Aligns two mappings with a common input range.
 */
export class MappingAlignment<T extends LineRangeMapping> {
	public static compute<T extends LineRangeMapping>(
		fromInputToOutput1: readonly T[],
		fromInputToOutput2: readonly T[]
	): MappingAlignment<T>[] {
		const compareByStartLineNumber = compareBy<LineRangeMapping, number>(
			(d) => d.inputRange.startLineNumber,
			numberComparator
		);

		const combinedDiffs = concatArrays(
			fromInputToOutput1.map((diff) => ({ source: 0 as const, diff })),
			fromInputToOutput2.map((diff) => ({ source: 1 as const, diff }))
		).sort(compareBy((d) => d.diff, compareByStartLineNumber));

		const currentDiffs = [new Array<T>(), new Array<T>()];
		const deltaFromBaseToInput = [0, 0];

		const alignments = new Array<MappingAlignment<T>>();

		function pushAndReset(inputRange: MergeEditorLineRange) {
			const mapping1 = LineRangeMapping.join(currentDiffs[0]) || new LineRangeMapping(inputRange, inputRange.delta(deltaFromBaseToInput[0]));
			const mapping2 = LineRangeMapping.join(currentDiffs[1]) || new LineRangeMapping(inputRange, inputRange.delta(deltaFromBaseToInput[1]));

			alignments.push(
				new MappingAlignment(
					currentInputRange!,
					mapping1.extendInputRange(currentInputRange!).outputRange,
					currentDiffs[0],
					mapping2.extendInputRange(currentInputRange!).outputRange,
					currentDiffs[1]
				)
			);
			currentDiffs[0] = [];
			currentDiffs[1] = [];
		}

		let currentInputRange: MergeEditorLineRange | undefined;

		for (const diff of combinedDiffs) {
			const range = diff.diff.inputRange;
			if (currentInputRange && !currentInputRange.intersectsOrTouches(range)) {
				pushAndReset(currentInputRange);
				currentInputRange = undefined;
			}
			deltaFromBaseToInput[diff.source] =
				diff.diff.resultingDeltaFromOriginalToModified;
			currentInputRange = currentInputRange ? currentInputRange.join(range) : range;
			currentDiffs[diff.source].push(diff.diff);
		}
		if (currentInputRange) {
			pushAndReset(currentInputRange);
		}

		return alignments;
	}

	constructor(
		public readonly inputRange: MergeEditorLineRange,
		public readonly output1Range: MergeEditorLineRange,
		public readonly output1LineMappings: T[],
		public readonly output2Range: MergeEditorLineRange,
		public readonly output2LineMappings: T[],
	) {
	}

	public toString(): string {
		return `${this.output1Range} <- ${this.inputRange} -> ${this.output2Range}`;
	}
}

/**
 * A line range mapping with inner range mappings.
*/
export class DetailedLineRangeMapping extends LineRangeMapping {
	public static override join(mappings: readonly DetailedLineRangeMapping[]): DetailedLineRangeMapping | undefined {
		return mappings.reduce<undefined | DetailedLineRangeMapping>((acc, cur) => acc ? acc.join(cur) : cur, undefined);
	}

	public readonly rangeMappings: readonly RangeMapping[];

	constructor(
		inputRange: MergeEditorLineRange,
		public readonly inputTextModel: ITextModel,
		outputRange: MergeEditorLineRange,
		public readonly outputTextModel: ITextModel,
		rangeMappings?: readonly RangeMapping[],
	) {
		super(inputRange, outputRange);

		this.rangeMappings = rangeMappings || [new RangeMapping(this.inputRange.toExclusiveRange(), this.outputRange.toExclusiveRange())];
	}

	public override addOutputLineDelta(delta: number): DetailedLineRangeMapping {
		return new DetailedLineRangeMapping(
			this.inputRange,
			this.inputTextModel,
			this.outputRange.delta(delta),
			this.outputTextModel,
			this.rangeMappings.map(d => d.addOutputLineDelta(delta))
		);
	}

	public override addInputLineDelta(delta: number): DetailedLineRangeMapping {
		return new DetailedLineRangeMapping(
			this.inputRange.delta(delta),
			this.inputTextModel,
			this.outputRange,
			this.outputTextModel,
			this.rangeMappings.map(d => d.addInputLineDelta(delta))
		);
	}

	public override join(other: DetailedLineRangeMapping): DetailedLineRangeMapping {
		return new DetailedLineRangeMapping(
			this.inputRange.join(other.inputRange),
			this.inputTextModel,
			this.outputRange.join(other.outputRange),
			this.outputTextModel,
		);
	}

	public getLineEdit(): LineRangeEdit {
		return new LineRangeEdit(this.inputRange, this.getOutputLines());
	}

	public getReverseLineEdit(): LineRangeEdit {
		return new LineRangeEdit(this.outputRange, this.getInputLines());
	}

	private getOutputLines(): string[] {
		return this.outputRange.getLines(this.outputTextModel);
	}

	private getInputLines(): string[] {
		return this.inputRange.getLines(this.inputTextModel);
	}
}

/**
 * Represents a mapping of an input range to an output range.
*/
export class RangeMapping {
	constructor(public readonly inputRange: Range, public readonly outputRange: Range) {
	}
	toString(): string {
		function rangeToString(range: Range) {
			// TODO@hediet make this the default Range.toString
			return `[${range.startLineNumber}:${range.startColumn}, ${range.endLineNumber}:${range.endColumn})`;
		}

		return `${rangeToString(this.inputRange)} -> ${rangeToString(this.outputRange)}`;
	}

	addOutputLineDelta(deltaLines: number): RangeMapping {
		return new RangeMapping(
			this.inputRange,
			new Range(
				this.outputRange.startLineNumber + deltaLines,
				this.outputRange.startColumn,
				this.outputRange.endLineNumber + deltaLines,
				this.outputRange.endColumn
			)
		);
	}

	addInputLineDelta(deltaLines: number): RangeMapping {
		return new RangeMapping(
			new Range(
				this.inputRange.startLineNumber + deltaLines,
				this.inputRange.startColumn,
				this.inputRange.endLineNumber + deltaLines,
				this.inputRange.endColumn
			),
			this.outputRange,
		);
	}

	reverse(): RangeMapping {
		return new RangeMapping(this.outputRange, this.inputRange);
	}
}

/**
* Represents a total monotonous mapping of ranges in one document to another document.
*/
export class DocumentRangeMap {
	constructor(
		/**
		 * The line range mappings that define this document mapping.
		 * Can have holes.
		*/
		public readonly rangeMappings: RangeMapping[],
		public readonly inputLineCount: number
	) {
		assertFn(() => checkAdjacentItems(
			rangeMappings,
			(m1, m2) =>
				rangeIsBeforeOrTouching(m1.inputRange, m2.inputRange) &&
				rangeIsBeforeOrTouching(m1.outputRange, m2.outputRange) /*&&
				lengthBetweenPositions(m1.inputRange.getEndPosition(), m2.inputRange.getStartPosition()).equals(
					lengthBetweenPositions(m1.outputRange.getEndPosition(), m2.outputRange.getStartPosition())
				)*/
		));
	}

	public project(position: Position): RangeMapping {
		const lastBefore = findLast(this.rangeMappings, r => r.inputRange.getStartPosition().isBeforeOrEqual(position));
		if (!lastBefore) {
			return new RangeMapping(
				Range.fromPositions(position, position),
				Range.fromPositions(position, position)
			);
		}

		if (rangeContainsPosition(lastBefore.inputRange, position)) {
			return lastBefore;
		}

		const dist = lengthBetweenPositions(lastBefore.inputRange.getEndPosition(), position);
		const outputPos = addLength(lastBefore.outputRange.getEndPosition(), dist);

		return new RangeMapping(
			Range.fromPositions(position),
			Range.fromPositions(outputPos)
		);
	}

	public projectRange(range: Range): RangeMapping {
		const start = this.project(range.getStartPosition());
		const end = this.project(range.getEndPosition());
		return new RangeMapping(
			start.inputRange.plusRange(end.inputRange),
			start.outputRange.plusRange(end.outputRange)
		);
	}

	public get outputLineCount(): number {
		const last = this.rangeMappings.at(-1);
		const diff = last ? last.outputRange.endLineNumber - last.inputRange.endLineNumber : 0;
		return this.inputLineCount + diff;
	}

	public reverse(): DocumentRangeMap {
		return new DocumentRangeMap(
			this.rangeMappings.map(m => m.reverse()),
			this.outputLineCount
		);
	}
}
