/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Comparator, compareBy, equals, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Range } from 'vs/editor/common/core/range';
import { ILineChange } from 'vs/editor/common/diff/diffComputer';
import { ITextModel } from 'vs/editor/common/model';

/**
 * Represents an edit, expressed in whole lines:
 * At {@link LineRange.startLineNumber}, delete {@link LineRange.lineCount} many lines and insert {@link newLines}.
*/
export class LineEdit {
	constructor(
		public readonly range: LineRange,
		public readonly newLines: string[]
	) { }

	public equals(other: LineEdit): boolean {
		return this.range.equals(other.range) && equals(this.newLines, other.newLines);
	}

	public apply(model: ITextModel): void {
		new LineEdits([this]).apply(model);
	}
}

export class LineEdits {
	constructor(public readonly edits: readonly LineEdit[]) { }

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

	public getLines(model: ITextModel): string[] {
		const result = new Array(this.lineCount);
		for (let i = 0; i < this.lineCount; i++) {
			result[i] = model.getLineContent(this.startLineNumber + i);
		}
		return result;
	}
}

export class LineDiff {
	public static fromLineChange(lineChange: ILineChange, originalTextModel: ITextModel, modifiedTextModel: ITextModel): LineDiff {
		let originalRange: LineRange;
		if (lineChange.originalEndLineNumber === 0) {
			// Insertion
			originalRange = new LineRange(lineChange.originalStartLineNumber + 1, 0);
		} else {
			originalRange = new LineRange(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1);
		}

		let modifiedRange: LineRange;
		if (lineChange.modifiedEndLineNumber === 0) {
			// Insertion
			modifiedRange = new LineRange(lineChange.modifiedStartLineNumber + 1, 0);
		} else {
			modifiedRange = new LineRange(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1);
		}

		return new LineDiff(
			originalTextModel,
			originalRange,
			modifiedTextModel,
			modifiedRange,
		);
	}

	public static hull(lineDiffs: readonly LineDiff[]): LineDiff | undefined {
		if (lineDiffs.length === 0) {
			return undefined;
		}

		return new LineDiff(
			lineDiffs[0].originalTextModel,
			LineRange.join(lineDiffs.map((d) => d.originalRange))!,
			lineDiffs[0].modifiedTextModel,
			LineRange.join(lineDiffs.map((d) => d.modifiedRange))!,
		);
	}

	public static alignOriginalRange(lineDiffs: readonly LineDiff[]): LineDiff[] {
		if (lineDiffs.length === 0) {
			return [];
		}
		const originalRange = LineRange.join(lineDiffs.map((d) => d.originalRange))!;
		return lineDiffs.map(l => {
			const startDelta = originalRange.startLineNumber - l.originalRange.startLineNumber;
			const endDelta = originalRange.endLineNumberExclusive - l.originalRange.endLineNumberExclusive;
			return new LineDiff(
				l.originalTextModel,
				originalRange,
				l.modifiedTextModel,
				new LineRange(
					l.modifiedRange.startLineNumber + startDelta,
					l.modifiedRange.lineCount - startDelta + endDelta
				)
			);
		});
	}

	constructor(
		public readonly originalTextModel: ITextModel,
		public readonly originalRange: LineRange,
		public readonly modifiedTextModel: ITextModel,
		public readonly modifiedRange: LineRange,
	) {
	}

	public get resultingDeltaFromOriginalToModified(): number {
		return this.modifiedRange.endLineNumberExclusive - this.originalRange.endLineNumberExclusive;
	}

	private ensureSameOriginalModel(other: LineDiff): void {
		if (this.originalTextModel !== other.originalTextModel) {
			// Both changes must refer to the same original model
			throw new BugIndicatingError();
		}
	}

	public conflicts(other: LineDiff): boolean {
		this.ensureSameOriginalModel(other);
		return this.originalRange.touches(other.originalRange);
	}

	public isStrictBefore(other: LineDiff): boolean {
		this.ensureSameOriginalModel(other);
		return this.originalRange.endLineNumberExclusive <= other.originalRange.startLineNumber;
	}

	public getLineEdit(): LineEdit {
		return new LineEdit(
			this.originalRange,
			this.getModifiedLines()
		);
	}

	public getReverseLineEdit(): LineEdit {
		return new LineEdit(
			this.modifiedRange,
			this.getOriginalLines()
		);
	}

	private getModifiedLines(): string[] {
		return this.modifiedRange.getLines(this.modifiedTextModel);
	}

	private getOriginalLines(): string[] {
		return this.originalRange.getLines(this.originalTextModel);
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
		diffs1: readonly LineDiff[],
		input2TextModel: ITextModel,
		diffs2: readonly LineDiff[]
	): ModifiedBaseRange[] {
		const compareByStartLineNumber = compareBy<LineDiff, number>(
			(d) => d.originalRange.startLineNumber,
			numberComparator
		);

		const diffs = diffs1
			.map((diff) => ({ source: 0 as 0 | 1, diff }))
			.concat(diffs2.map((diff) => ({ source: 1 as const, diff })));

		diffs.sort(compareBy(d => d.diff, compareByStartLineNumber));

		const currentDiffs = [
			new Array<LineDiff>(),
			new Array<LineDiff>(),
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
			const range = diff.diff.originalRange;
			if (currentRange && !currentRange.touches(range)) {
				pushAndReset();
			}
			deltaFromBaseToInput[diff.source] = diff.diff.resultingDeltaFromOriginalToModified;
			currentRange = currentRange ? currentRange.join(range) : range;
			currentDiffs[diff.source].push(diff.diff);
		}
		pushAndReset();

		return result;
	}

	public readonly input1CombinedDiff = LineDiff.hull(this.input1Diffs);
	public readonly input2CombinedDiff = LineDiff.hull(this.input2Diffs);

	public readonly baseRange: LineRange;
	public readonly input1Range: LineRange;
	public readonly input2Range: LineRange;

	constructor(
		public readonly baseTextModel: ITextModel,
		public readonly input1TextModel: ITextModel,
		public readonly input1Diffs: readonly LineDiff[],
		input1DeltaLineCount: number,
		public readonly input2TextModel: ITextModel,
		public readonly input2Diffs: readonly LineDiff[],
		input2DeltaLineCount: number,
	) {
		if (this.input1Diffs.length === 0 && this.input2Diffs.length === 0) {
			throw new BugIndicatingError('must have at least one diff');
		}

		const input1Diff =
			this.input1CombinedDiff ||
			new LineDiff(
				baseTextModel,
				this.input2CombinedDiff!.originalRange,
				input1TextModel,
				this.input2CombinedDiff!.originalRange.delta(input1DeltaLineCount)
			);

		const input2Diff =
			this.input2CombinedDiff ||
			new LineDiff(
				baseTextModel,
				this.input1CombinedDiff!.originalRange,
				input1TextModel,
				this.input1CombinedDiff!.originalRange.delta(input2DeltaLineCount)
			);

		const results = LineDiff.alignOriginalRange([input1Diff, input2Diff]);
		this.baseRange = results[0].originalRange;
		this.input1Range = results[0].modifiedRange;
		this.input2Range = results[1].modifiedRange;
	}

	public getInputRange(inputNumber: 1 | 2): LineRange {
		return inputNumber === 1 ? this.input1Range : this.input2Range;
	}

	public getInputDiffs(inputNumber: 1 | 2): readonly LineDiff[] {
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

	public getInput(inputNumber: 1 | 2): boolean | undefined {
		if (this.conflicting) {
			return undefined;
		}
		if (inputNumber === 1) {
			return this.input1;
		} else {
			return this.input2;
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

/*
export class LineMappings {
	public static fromDiffs(
		diffs1: readonly LineDiff[],
		diffs2: readonly LineDiff[],
		inputLineCount: number,
	): LineMappings {
		const compareByStartLineNumber = compareBy<LineDiff, number>(
			(d) => d.originalRange.startLineNumber,
			numberComparator
		);

		const diffs = diffs1
			.map((diff) => ({ source: 0 as 0 | 1, diff }))
			.concat(diffs2.map((diff) => ({ source: 1 as const, diff })));

		diffs.sort(compareBy(d => d.diff, compareByStartLineNumber));

		const currentDiffs = [
			new Array<LineDiff>(),
			new Array<LineDiff>(),
		];
		let deltaFromBaseToInput = [0, 0];

		const result = new Array<ModifiedBaseRange>();

		function pushAndReset() {
			result.push(LineMapping.create(
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
			const range = diff.diff.originalRange;
			if (currentRange && !currentRange.touches(range)) {
				pushAndReset();
			}
			deltaFromBaseToInput[diff.source] = diff.diff.resultingDeltaFromOriginalToModified;
			currentRange = currentRange ? currentRange.join(range) : range;
			currentDiffs[diff.source].push(diff.diff);
		}
		pushAndReset();

		return result;
	}

	constructor(private readonly lineMappings: LineMapping[]) {}
}

// A lightweight ModifiedBaseRange. Maybe they can be united?
export class LineMapping {
	public static create(input: LineDiff, ): LineMapping {

	}

	constructor(
		public readonly inputRange: LineRange,
		public readonly resultRange: LineRange
	) { }
}
*/
