/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Comparator, compareBy, equals, findLast, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';

/**
 * Represents an edit, expressed in whole lines:
 * At {@link LineRange.startLineNumber}, delete {@link LineRange.lineCount} many lines and insert {@link newLines}.
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
	public static hull(lineDiffs: readonly LineRangeMapping[]): LineRangeMapping | undefined {
		if (lineDiffs.length === 0) {
			return undefined;
		}

		return new LineRangeMapping(
			lineDiffs[0].inputTextModel,
			LineRange.join(lineDiffs.map((d) => d.inputRange))!,
			lineDiffs[0].outputTextModel,
			LineRange.join(lineDiffs.map((d) => d.outputRange))!,
			[]
		);
	}

	public static alignOriginalRange(lineDiffs: readonly LineRangeMapping[]): LineRangeMapping[] {
		if (lineDiffs.length === 0) {
			return [];
		}
		const originalRange = LineRange.join(lineDiffs.map((d) => d.inputRange))!;
		return lineDiffs.map(l => l.extendInputRange(originalRange));
	}

	public readonly innerRangeMappings: readonly RangeMapping[];

	constructor(
		public readonly inputTextModel: ITextModel,
		public readonly inputRange: LineRange,
		public readonly outputTextModel: ITextModel,
		public readonly outputRange: LineRange,
		innerRangeMappings?: readonly RangeMapping[],
	) {
		this.innerRangeMappings = innerRangeMappings
			? innerRangeMappings
			: [
				new RangeMapping(
					this.inputRange.toRange(),
					this.outputRange.toRange()
				),
			];
	}

	public extendInputRange(extendedOriginalRange: LineRange): LineRangeMapping {
		if (!extendedOriginalRange.containsRange(this.inputRange)) {
			throw new BugIndicatingError();
		}

		const startDelta = extendedOriginalRange.startLineNumber - this.inputRange.startLineNumber;
		const endDelta = extendedOriginalRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
		return new LineRangeMapping(
			this.inputTextModel,
			extendedOriginalRange,
			this.outputTextModel,
			new LineRange(
				this.outputRange.startLineNumber + startDelta,
				this.outputRange.lineCount - startDelta + endDelta
			),
			this.innerRangeMappings,
		);
	}

	public get resultingDeltaFromOriginalToModified(): number {
		return this.outputRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
	}

	private ensureSameInputModel(other: LineRangeMapping): void {
		if (this.inputTextModel !== other.inputTextModel) {
			// Both changes must refer to the same original model
			throw new BugIndicatingError();
		}
	}

	public isStrictBefore(other: LineRangeMapping): boolean {
		this.ensureSameInputModel(other);
		return this.inputRange.endLineNumberExclusive <= other.inputRange.startLineNumber;
	}

	public getLineEdit(): LineRangeEdit {
		return new LineRangeEdit(
			this.inputRange,
			this.getOutputLines()
		);
	}

	public getReverseLineEdit(): LineRangeEdit {
		return new LineRangeEdit(
			this.outputRange,
			this.getInputLines()
		);
	}

	private getOutputLines(): string[] {
		return this.outputRange.getLines(this.outputTextModel);
	}

	private getInputLines(): string[] {
		return this.inputRange.getLines(this.inputTextModel);
	}

	public addOutputLineDelta(delta: number): LineRangeMapping {
		return new LineRangeMapping(
			this.inputTextModel,
			this.inputRange,
			this.outputTextModel,
			this.outputRange.delta(delta),
			this.innerRangeMappings.map(d => d.addOutputLineDelta(delta))
		);
	}
}

export class RangeMapping {
	constructor(public readonly inputRange: Range, public readonly outputRange: Range) {
	}

	toString(): string {
		return `${this.inputRange.toString()} -> ${this.outputRange.toString()}`;
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
		baseTextModel: ITextModel,
		input1TextModel: ITextModel,
		diffs1: readonly LineRangeMapping[],
		input2TextModel: ITextModel,
		diffs2: readonly LineRangeMapping[]
	): ModifiedBaseRange[] {
		const compareByStartLineNumber = compareBy<LineRangeMapping, number>(
			(d) => d.inputRange.startLineNumber,
			numberComparator
		);

		const diffs = diffs1
			.map((diff) => ({ source: 0 as 0 | 1, diff }))
			.concat(diffs2.map((diff) => ({ source: 1 as const, diff })));

		diffs.sort(compareBy(d => d.diff, compareByStartLineNumber));

		const currentDiffs = [
			new Array<LineRangeMapping>(),
			new Array<LineRangeMapping>(),
		];
		const deltaFromBaseToInput = [0, 0];

		const result = new Array<ModifiedBaseRange>();

		function pushAndReset() {
			if (currentDiffs[0].length === 0 && currentDiffs[1].length === 0) {
				return;
			}
			result.push(new ModifiedBaseRange(
				baseTextModel,
				input1TextModel,
				currentDiffs[0],
				deltaFromBaseToInput[0],
				input2TextModel,
				currentDiffs[1],
				deltaFromBaseToInput[1],
			));
			currentDiffs[0] = [];
			currentDiffs[1] = [];
		}

		let currentRange: LineRange | undefined;

		for (const diff of diffs) {
			const range = diff.diff.inputRange;
			if (currentRange && !currentRange.touches(range)) {
				pushAndReset();
				currentRange = undefined;
			}
			deltaFromBaseToInput[diff.source] = diff.diff.resultingDeltaFromOriginalToModified;
			currentRange = currentRange ? currentRange.join(range) : range;
			currentDiffs[diff.source].push(diff.diff);
		}
		pushAndReset();

		return result;
	}

	public readonly input1CombinedDiff = LineRangeMapping.hull(this.input1Diffs);
	public readonly input2CombinedDiff = LineRangeMapping.hull(this.input2Diffs);

	public readonly baseRange: LineRange;
	public readonly input1Range: LineRange;
	public readonly input2Range: LineRange;

	constructor(
		public readonly baseTextModel: ITextModel,
		public readonly input1TextModel: ITextModel,
		public readonly input1Diffs: readonly LineRangeMapping[],
		input1DeltaLineCount: number,
		public readonly input2TextModel: ITextModel,
		public readonly input2Diffs: readonly LineRangeMapping[],
		input2DeltaLineCount: number,
	) {
		if (this.input1Diffs.length === 0 && this.input2Diffs.length === 0) {
			throw new BugIndicatingError('must have at least one diff');
		}

		const input1Diff =
			this.input1CombinedDiff ||
			new LineRangeMapping(
				baseTextModel,
				this.input2CombinedDiff!.inputRange,
				input1TextModel,
				this.input2CombinedDiff!.inputRange.delta(input1DeltaLineCount),
				[]
			);

		const input2Diff =
			this.input2CombinedDiff ||
			new LineRangeMapping(
				baseTextModel,
				this.input1CombinedDiff!.inputRange,
				input1TextModel,
				this.input1CombinedDiff!.inputRange.delta(input2DeltaLineCount),
				[]
			);

		const results = LineRangeMapping.alignOriginalRange([input1Diff, input2Diff]);
		this.baseRange = results[0].inputRange;
		this.input1Range = results[0].outputRange;
		this.input2Range = results[1].outputRange;
	}

	public getInputRange(inputNumber: 1 | 2): LineRange {
		return inputNumber === 1 ? this.input1Range : this.input2Range;
	}

	public getInputDiffs(inputNumber: 1 | 2): readonly LineRangeMapping[] {
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

	public getInput(inputNumber: 1 | 2): ToggleState {
		if (this.conflicting) {
			return ToggleState.conflicting;
		}
		if (inputNumber === 1) {
			return !this.input1 ? ToggleState.unset : this.input2First ? ToggleState.second : ToggleState.first;
		} else {
			return !this.input2 ? ToggleState.unset : !this.input2First ? ToggleState.second : ToggleState.first;
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

	public toggleInput1(): ModifiedBaseRangeState {
		return this.withInput1(!this.input1);
	}

	public toggleInput2(): ModifiedBaseRangeState {
		return this.withInput2(!this.input2);
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

export const enum ToggleState {
	unset = 0,
	first = 1,
	second = 2,
	conflicting = 3,
}

export class DocumentMapping {
	public static fromDiffs(
		diffs1: readonly LineRangeMapping[],
		diffs2: readonly LineRangeMapping[],
		inputLineCount: number
	): DocumentMapping {
		const compareByStartLineNumber = compareBy<LineRangeMapping, number>(
			(d) => d.inputRange.startLineNumber,
			numberComparator
		);

		const diffs = diffs1
			.map((diff) => ({ source: 0 as 0 | 1, diff }))
			.concat(diffs2.map((diff) => ({ source: 1 as const, diff })));

		diffs.sort(compareBy((d) => d.diff, compareByStartLineNumber));

		const currentDiffs = [new Array<LineRangeMapping>(), new Array<LineRangeMapping>()];
		const deltaFromBaseToInput = [0, 0];

		const result = new Array<SimpleLineRangeMapping>();

		function pushAndReset(baseRange: LineRange) {
			const input1Range = LineRange.join(currentDiffs[0].map(d => d.outputRange)) || baseRange.delta(deltaFromBaseToInput[0]);
			const input1BaseRange = LineRange.join(currentDiffs[0].map(d => d.inputRange)) || baseRange;
			const mapping1 = new SimpleLineRangeMapping(input1BaseRange, input1Range);

			const input2Range = LineRange.join(currentDiffs[1].map(d => d.outputRange)) || baseRange.delta(deltaFromBaseToInput[1]);
			const input2BaseRange = LineRange.join(currentDiffs[1].map(d => d.inputRange)) || baseRange;
			const mapping2 = new SimpleLineRangeMapping(input2BaseRange, input2Range);

			result.push(
				new SimpleLineRangeMapping(
					mapping1.extendInputRange(currentInputRange!).outputRange,
					mapping2.extendInputRange(currentInputRange!).outputRange
				)
			);
			currentDiffs[0] = [];
			currentDiffs[1] = [];
		}

		let currentInputRange: LineRange | undefined;

		for (const diff of diffs) {
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

		return new DocumentMapping(result, inputLineCount);
	}

	public getOutputLine(inputLineNumber: number): number | SimpleLineRangeMapping {
		const lastBefore = findLast(this.lineRangeMappings, r => r.inputRange.startLineNumber <= inputLineNumber);
		if (lastBefore) {
			if (lastBefore.inputRange.contains(inputLineNumber)) {
				return lastBefore;
			}
			return inputLineNumber + lastBefore.outputRange.endLineNumberExclusive - lastBefore.inputRange.endLineNumberExclusive;
		}
		return inputLineNumber;
	}

	public getInputLine(outputLineNumber: number): number | SimpleLineRangeMapping {
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
		public readonly lineRangeMappings: SimpleLineRangeMapping[],
		public readonly inputLineCount: number
	) { }
}

export class SimpleLineRangeMapping {
	constructor(
		public readonly inputRange: LineRange,
		public readonly outputRange: LineRange
	) { }

	public extendInputRange(extendedInputRange: LineRange): SimpleLineRangeMapping {
		if (!extendedInputRange.containsRange(this.inputRange)) {
			throw new BugIndicatingError();
		}

		const startDelta = extendedInputRange.startLineNumber - this.inputRange.startLineNumber;
		const endDelta = extendedInputRange.endLineNumberExclusive - this.inputRange.endLineNumberExclusive;
		return new SimpleLineRangeMapping(
			extendedInputRange,
			new LineRange(
				this.outputRange.startLineNumber + startDelta,
				this.outputRange.lineCount - startDelta + endDelta
			)
		);
	}
}

