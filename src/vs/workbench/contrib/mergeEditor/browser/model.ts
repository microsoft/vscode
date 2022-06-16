/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Comparator, compareBy, equals, findLast, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { concatArrays } from 'vs/workbench/contrib/mergeEditor/browser/utils';

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

	public isAfter(modifiedRange: LineRange): boolean {
		return this.startLineNumber >= modifiedRange.endLineNumberExclusive;
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
}

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

	public getOutputLine(inputLineNumber: number): number | LineRangeMapping {
		const lastBefore = findLast(this.lineRangeMappings, r => r.inputRange.startLineNumber <= inputLineNumber);
		if (lastBefore) {
			if (lastBefore.inputRange.contains(inputLineNumber)) {
				return lastBefore;
			}
			return inputLineNumber + lastBefore.outputRange.endLineNumberExclusive - lastBefore.inputRange.endLineNumberExclusive;
		}
		return inputLineNumber;
	}

	public getInputLine(outputLineNumber: number): number | LineRangeMapping {
		const lastBefore = findLast(this.lineRangeMappings, r => r.outputRange.startLineNumber <= outputLineNumber);
		if (lastBefore) {
			if (lastBefore.outputRange.contains(outputLineNumber)) {
				return lastBefore;
			}
			return outputLineNumber + lastBefore.inputRange.endLineNumberExclusive - lastBefore.outputRange.endLineNumberExclusive;
		}
		return outputLineNumber;
	}

	constructor(
		public readonly lineRangeMappings: LineRangeMapping[],
		public readonly inputLineCount: number
	) { }
}

/**
 * Represents an edit, expressed in whole lines:
 * At (before) {@link LineRange.startLineNumber}, delete {@link LineRange.lineCount} many lines and insert {@link newLines}.
*/
export class LineRangeEdit {
	constructor(
		public readonly range: LineRange,
		public readonly newLines: string[]
	) { }

	public equals(other: LineRangeEdit): boolean {
		return this.range.equals(other.range) && equals(this.newLines, other.newLines);
	}

	public apply(model: ITextModel): void {
		new LineEdits([this]).apply(model);
	}
}

export class RangeEdit {
	constructor(
		public readonly range: Range,
		public readonly newText: string
	) { }

	public equals(other: RangeEdit): boolean {
		return Range.equalsRange(this.range, other.range) && this.newText === other.newText;
	}
}

export class LineEdits {
	constructor(public readonly edits: readonly LineRangeEdit[]) { }

	public apply(model: ITextModel): void {
		model.pushEditOperations(
			null,
			this.edits.map((e) => {
				if (e.range.endLineNumberExclusive <= model.getLineCount()) {
					return {
						range: new Range(e.range.startLineNumber, 1, e.range.endLineNumberExclusive, 1),
						text: e.newLines.map(s => s + '\n').join(''),
					};
				}

				if (e.range.startLineNumber === 1) {
					return {
						range: new Range(1, 1, model.getLineCount(), Number.MAX_SAFE_INTEGER),
						text: e.newLines.join('\n'),
					};
				}

				return {
					range: new Range(e.range.startLineNumber - 1, Number.MAX_SAFE_INTEGER, model.getLineCount(), Number.MAX_SAFE_INTEGER),
					text: e.newLines.map(s => '\n' + s).join(''),
				};
			}),
			() => null
		);
	}
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

/**
 * Describes modifications in input 1 and input 2 for a specific range in base.
 *
 * The UI offers a mechanism to either apply all changes from input 1 or input 2 or both.
 *
 * Immutable.
*/
export class ModifiedBaseRange {
	/**
	 * diffs1 and diffs2 together with the conflict relation form a bipartite graph.
	 * This method computes strongly connected components of that graph while maintaining the side of each diff.
	*/
	public static fromDiffs(
		diffs1: readonly DetailedLineRangeMapping[],
		diffs2: readonly DetailedLineRangeMapping[],
		baseTextModel: ITextModel,
		input1TextModel: ITextModel,
		input2TextModel: ITextModel,
	): ModifiedBaseRange[] {
		const alignments = MappingAlignment.compute(diffs1, diffs2);
		return alignments.map(
			(a) =>
				new ModifiedBaseRange(
					a.baseRange,
					baseTextModel,
					a.input1Range,
					input1TextModel,
					a.input1LineMappings,
					a.input2Range,
					input2TextModel,
					a.input2LineMappings
				)
		);
	}

	public readonly input1CombinedDiff = DetailedLineRangeMapping.join(this.input1Diffs);
	public readonly input2CombinedDiff = DetailedLineRangeMapping.join(this.input2Diffs);


	constructor(
		public readonly baseRange: LineRange,
		public readonly baseTextModel: ITextModel,
		public readonly input1Range: LineRange,
		public readonly input1TextModel: ITextModel,
		public readonly input1Diffs: readonly DetailedLineRangeMapping[],
		public readonly input2Range: LineRange,
		public readonly input2TextModel: ITextModel,
		public readonly input2Diffs: readonly DetailedLineRangeMapping[],
	) {
		if (this.input1Diffs.length === 0 && this.input2Diffs.length === 0) {
			throw new BugIndicatingError('must have at least one diff');
		}
	}

	public getInputRange(inputNumber: 1 | 2): LineRange {
		return inputNumber === 1 ? this.input1Range : this.input2Range;
	}

	public getInputDiffs(inputNumber: 1 | 2): readonly DetailedLineRangeMapping[] {
		return inputNumber === 1 ? this.input1Diffs : this.input2Diffs;
	}

	public get isConflicting(): boolean {
		return this.input1Diffs.length > 0 && this.input2Diffs.length > 0;
	}
}

export class ModifiedBaseRangeState {
	public static readonly default = new ModifiedBaseRangeState(false, false, false, false);
	public static readonly conflicting = new ModifiedBaseRangeState(false, false, false, true);

	private constructor(
		public readonly input1: boolean,
		public readonly input2: boolean,
		public readonly input2First: boolean,
		public readonly conflicting: boolean,
	) { }

	public getInput(inputNumber: 1 | 2): InputState {
		if (this.conflicting) {
			return InputState.conflicting;
		}
		if (inputNumber === 1) {
			return !this.input1 ? InputState.excluded : this.input2First ? InputState.second : InputState.first;
		} else {
			return !this.input2 ? InputState.excluded : !this.input2First ? InputState.second : InputState.first;
		}
	}

	public withInputValue(inputNumber: 1 | 2, value: boolean): ModifiedBaseRangeState {
		return inputNumber === 1 ? this.withInput1(value) : this.withInput2(value);
	}

	public withInput1(value: boolean): ModifiedBaseRangeState {
		return new ModifiedBaseRangeState(
			value,
			this.input2,
			value !== this.input2 ? this.input2 : this.input2First,
			false,
		);
	}

	public withInput2(value: boolean): ModifiedBaseRangeState {
		return new ModifiedBaseRangeState(
			this.input1,
			value,
			value !== this.input1 ? value : this.input2First,
			false
		);
	}

	public get isEmpty(): boolean {
		return !this.input1 && !this.input2;
	}

	public toString(): string {
		const arr: ('1' | '2')[] = [];
		if (this.input1) {
			arr.push('1');
		}
		if (this.input2) {
			arr.push('2');
		}
		if (this.input2First) {
			arr.reverse();
		}
		return arr.join(',');
	}
}

export const enum InputState {
	excluded = 0,
	first = 1,
	second = 2,
	conflicting = 3,
}
