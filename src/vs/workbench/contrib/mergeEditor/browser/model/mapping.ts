/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, findLast, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { concatArrays } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { LineRange } from './lineRange';
import { LineRangeEdit } from './editing';

export class LineRangeMapping {
	public static join(mappings: readonly LineRangeMapping[]): LineRangeMapping | undefined {
		return mappings.reduce<undefined | LineRangeMapping>((acc, cur) => acc ? acc.join(cur) : cur, undefined);
	}

	constructor(
		public readonly inputRange: LineRange,
		public readonly outputRange: LineRange
	) { }

	public extendInputRange(extendedInputRange: LineRange): LineRangeMapping {
		if (!extendedInputRange.containsRange(this.inputRange)) {
			throw new BugIndicatingError();
		}

		const startDelta = extendedInputRange.startLineNumber - this.inputRange.startLineNumber;
		const endDelta = extendedInputRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
		return new LineRangeMapping(
			extendedInputRange,
			new LineRange(
				this.outputRange.startLineNumber + startDelta,
				this.outputRange.lineCount - startDelta + endDelta
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

	public getRange(direction: MappingDirection): LineRange {
		return direction === MappingDirection.input ? this.inputRange : this.outputRange;
	}
}

export function getOppositeDirection(direction: MappingDirection): MappingDirection {
	return direction === MappingDirection.input ? MappingDirection.output : MappingDirection.input;
}

export const enum MappingDirection {
	input = 0,
	output = 1,
}

export class MappingAlignment<T extends LineRangeMapping> {
	public static compute<T extends LineRangeMapping>(
		fromBaseToInput1: readonly T[],
		fromBaseToInput2: readonly T[]
	): MappingAlignment<T>[] {
		const compareByStartLineNumber = compareBy<LineRangeMapping, number>(
			(d) => d.inputRange.startLineNumber,
			numberComparator
		);

		const combinedDiffs = concatArrays(
			fromBaseToInput1.map((diff) => ({ source: 0 as const, diff })),
			fromBaseToInput2.map((diff) => ({ source: 1 as const, diff }))
		).sort(compareBy((d) => d.diff, compareByStartLineNumber));

		const currentDiffs = [new Array<T>(), new Array<T>()];
		const deltaFromBaseToInput = [0, 0];

		const alignments = new Array<MappingAlignment<T>>();

		function pushAndReset(baseRange: LineRange) {
			const mapping1 = LineRangeMapping.join(currentDiffs[0]) || new LineRangeMapping(baseRange, baseRange.delta(deltaFromBaseToInput[0]));
			const mapping2 = LineRangeMapping.join(currentDiffs[1]) || new LineRangeMapping(baseRange, baseRange.delta(deltaFromBaseToInput[1]));

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

		let currentInputRange: LineRange | undefined;

		for (const diff of combinedDiffs) {
			const range = diff.diff.inputRange;
			if (currentInputRange && !currentInputRange.touches(range)) {
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
		public readonly baseRange: LineRange,
		public readonly input1Range: LineRange,
		public readonly input1LineMappings: T[],
		public readonly input2Range: LineRange,
		public readonly input2LineMappings: T[],
	) {
	}

	toString(): string {
		return `${this.input1Range} <- ${this.baseRange} -> ${this.input2Range}`;
	}
}

export class DocumentMapping {
	public static betweenOutputs(
		inputToOutput1: readonly LineRangeMapping[],
		inputToOutput2: readonly LineRangeMapping[],
		inputLineCount: number
	): DocumentMapping {
		const alignments = MappingAlignment.compute(inputToOutput1, inputToOutput2);
		const mappings = alignments.map((m) => new LineRangeMapping(m.input1Range, m.input2Range));
		return new DocumentMapping(mappings, inputLineCount);
	}

	public getMappingContaining(lineNumber: number, containingDirection: MappingDirection): LineRangeMapping {
		const mapTo = getOppositeDirection(containingDirection);
		const lastBefore = findLast(this.lineRangeMappings, r => r.getRange(containingDirection).startLineNumber <= lineNumber);
		if (lastBefore) {
			if (lastBefore.getRange(containingDirection).contains(lineNumber)) {
				return lastBefore;
			}
			const containingRange = new LineRange(lineNumber, 1);
			const mappedRange = new LineRange(
				lineNumber +
				lastBefore.getRange(mapTo).endLineNumberExclusive -
				lastBefore.getRange(containingDirection).endLineNumberExclusive,
				1
			);

			return containingDirection === MappingDirection.input
				? new LineRangeMapping(containingRange, mappedRange)
				: new LineRangeMapping(mappedRange, containingRange);
		}
		return new LineRangeMapping(
			new LineRange(lineNumber, 1),
			new LineRange(lineNumber, 1)
		);
	}

	constructor(
		public readonly lineRangeMappings: LineRangeMapping[],
		public readonly inputLineCount: number
	) { }
}

export class DetailedLineRangeMapping extends LineRangeMapping {
	public static override join(mappings: readonly DetailedLineRangeMapping[]): DetailedLineRangeMapping | undefined {
		return mappings.reduce<undefined | DetailedLineRangeMapping>((acc, cur) => acc ? acc.join(cur) : cur, undefined);
	}

	public readonly rangeMappings: readonly RangeMapping[];

	constructor(
		inputRange: LineRange,
		public readonly inputTextModel: ITextModel,
		outputRange: LineRange,
		public readonly outputTextModel: ITextModel,
		rangeMappings?: readonly RangeMapping[],
	) {
		super(inputRange, outputRange);

		this.rangeMappings = rangeMappings || [new RangeMapping(this.inputRange.toRange(), this.outputRange.toRange())];
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
}
