/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue, compareBy, equals, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Range } from 'vs/editor/common/core/range';
import { ILineChange } from 'vs/editor/common/diff/diffComputer';
import { ITextModel } from 'vs/editor/common/model';

export class LineEdits {
	constructor(public readonly edits: readonly LineEdit[]) {

	}

	public apply(model: ITextModel): void {
		model.pushEditOperations(
			null,
			this.edits.map((e) => ({
				range: new Range(e.range.startLineNumber, 1, e.range.endLineNumberExclusive, 1),
				text: e.newLines.map(l => l + '\n').join(''),
			})),
			() => null
		);
	}
}

export class LineEdit<T = void> {
	equals(other: LineEdit<any>) {
		return this.range.equals(other.range) && equals(this.newLines, other.newLines);
	}

	constructor(
		public readonly range: LineRange,
		public readonly newLines: string[],
		public readonly data: T
	) { }
}

export class ConflictGroup {
	/**
	 * diffs1 and diffs2 together with the conflict relation form a bipartite graph.
	 * This method computes strongly connected components of that graph while maintaining the side of each diff.
	*/
	public static partitionDiffs(
		originalTextModel: ITextModel,
		input1TextModel: ITextModel,
		diffs1: readonly LineDiff[],
		input2TextModel: ITextModel,
		diffs2: readonly LineDiff[]
	): ConflictGroup[] {
		const compareByStartLineNumber = compareBy<LineDiff, number>(
			(d) => d.originalRange.startLineNumber,
			numberComparator
		);

		const queueDiffs1 = new ArrayQueue(
			diffs1.slice().sort(compareByStartLineNumber)
		);
		const queueDiffs2 = new ArrayQueue(
			diffs2.slice().sort(compareByStartLineNumber)
		);

		const result = new Array<ConflictGroup>();

		while (true) {
			const lastDiff1 = queueDiffs1.peekLast();
			const lastDiff2 = queueDiffs2.peekLast();

			if (
				lastDiff1 &&
				(!lastDiff2 ||
					lastDiff1.originalRange.startLineNumber >=
					lastDiff2.originalRange.startLineNumber)
			) {
				queueDiffs1.removeLast();

				const otherConflictingWith =
					queueDiffs2.takeFromEndWhile((d) => d.conflicts(lastDiff1)) || [];

				const singleLinesDiff = LineDiff.hull(otherConflictingWith);

				const moreConflictingWith =
					(singleLinesDiff &&
						queueDiffs1.takeFromEndWhile((d) =>
							d.conflicts(singleLinesDiff)
						)) ||
					[];
				moreConflictingWith.push(lastDiff1);

				result.push(
					new ConflictGroup(
						originalTextModel,
						input1TextModel,
						moreConflictingWith,
						queueDiffs1.peekLast()?.resultingDeltaFromOriginalToModified ?? 0,
						input2TextModel,
						otherConflictingWith,
						queueDiffs2.peekLast()?.resultingDeltaFromOriginalToModified ?? 0,
					)
				);
			} else if (lastDiff2) {
				queueDiffs2.removeLast();

				const otherConflictingWith =
					queueDiffs1.takeFromEndWhile((d) => d.conflicts(lastDiff2)) || [];

				const singleLinesDiff = LineDiff.hull(otherConflictingWith);

				const moreConflictingWith =
					(singleLinesDiff &&
						queueDiffs2.takeFromEndWhile((d) =>
							d.conflicts(singleLinesDiff)
						)) ||
					[];
				moreConflictingWith.push(lastDiff2);

				result.push(
					new ConflictGroup(
						originalTextModel,
						input1TextModel,
						otherConflictingWith,
						queueDiffs1.peekLast()?.resultingDeltaFromOriginalToModified ?? 0,
						input2TextModel,
						moreConflictingWith,
						queueDiffs2.peekLast()?.resultingDeltaFromOriginalToModified ?? 0,
					)
				);
			} else {
				break;
			}
		}

		result.reverse();

		return result;
	}

	public readonly input1FullDiff = LineDiff.hull(this.input1Diffs);
	public readonly input2FullDiff = LineDiff.hull(this.input2Diffs);

	public readonly totalOriginalRange: LineRange;
	public readonly totalInput1Range: LineRange;
	public readonly totalInput2Range: LineRange;

	constructor(
		public readonly originalTextModel: ITextModel,
		public readonly input1TextModel: ITextModel,
		public readonly input1Diffs: readonly LineDiff[],
		public readonly input1DeltaLineCount: number,
		public readonly input2TextModel: ITextModel,
		public readonly input2Diffs: readonly LineDiff[],
		public readonly input2DeltaLineCount: number,
	) {
		if (this.input1Diffs.length === 0 && this.input2Diffs.length === 0) {
			throw new BugIndicatingError('must have at least one diff');
		}

		const input1Diff =
			this.input1FullDiff ||
			new LineDiff(
				originalTextModel,
				this.input2FullDiff!.originalRange,
				input1TextModel,
				this.input2FullDiff!.originalRange.delta(input1DeltaLineCount)
			);

		const input2Diff =
			this.input2FullDiff ||
			new LineDiff(
				originalTextModel,
				this.input1FullDiff!.originalRange,
				input1TextModel,
				this.input1FullDiff!.originalRange.delta(input2DeltaLineCount)
			);

		const results = LineDiff.alignOriginalRegion([input1Diff, input2Diff]);
		this.totalOriginalRange = results[0].originalRange;
		this.totalInput1Range = results[0].modifiedRange;
		this.totalInput2Range = results[1].modifiedRange;
	}

	public get isConflicting(): boolean {
		return this.input1Diffs.length > 0 && this.input2Diffs.length > 0;
	}

	public getInput1LineEdit(): LineEdit | undefined {
		if (this.input1Diffs.length === 0) {
			return undefined;
		}
		if (this.input1Diffs.length === 1) {
			return this.input1Diffs[0].getLineEdit();
		} else {
			throw new Error('Method not implemented.');
		}
	}

	public getInput2LineEdit(): LineEdit | undefined {
		if (this.input2Diffs.length === 0) {
			return undefined;
		}
		if (this.input2Diffs.length === 1) {
			return this.input2Diffs[0].getLineEdit();
		} else {
			throw new Error('Method not implemented.');
		}
	}
}

export class LineRange {
	public static hull(ranges: LineRange[]): LineRange | undefined {
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

	public get endLineNumberExclusive(): number {
		return this.startLineNumber + this.lineCount;
	}

	public get isEmpty(): boolean {
		return this.lineCount === 0;
	}

	public intersects(other: LineRange): boolean {
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
			LineRange.hull(lineDiffs.map((d) => d.originalRange))!,
			lineDiffs[0].modifiedTextModel,
			LineRange.hull(lineDiffs.map((d) => d.modifiedRange))!,
		);
	}

	public static alignOriginalRegion(lineDiffs: readonly LineDiff[]): LineDiff[] {
		if (lineDiffs.length === 0) {
			return [];
		}
		const originalRange = LineRange.hull(lineDiffs.map((d) => d.originalRange))!;
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
		return this.originalRange.intersects(other.originalRange);
	}

	public isStrictBefore(other: LineDiff): boolean {
		this.ensureSameOriginalModel(other);
		return this.originalRange.endLineNumberExclusive <= other.originalRange.startLineNumber;
	}

	public getLineEdit(): LineEdit {
		return new LineEdit(
			this.originalRange,
			this.getModifiedLines(),
			undefined
		);
	}

	public getReverseLineEdit(): LineEdit {
		return new LineEdit(
			this.modifiedRange,
			this.getOriginalLines(),
			undefined
		);
	}

	private getModifiedLines(): string[] {
		const result = new Array(this.modifiedRange.lineCount);
		for (let i = 0; i < this.modifiedRange.lineCount; i++) {
			result[i] = this.modifiedTextModel.getLineContent(this.modifiedRange.startLineNumber + i);
		}
		return result;
	}

	private getOriginalLines(): string[] {
		const result = new Array(this.originalRange.lineCount);
		for (let i = 0; i < this.originalRange.lineCount; i++) {
			result[i] = this.originalTextModel.getLineContent(this.originalRange.startLineNumber + i);
		}
		return result;
	}
}


export class MergeState {
	constructor(
		public readonly input1: boolean,
		public readonly input2: boolean,
		public readonly input2First: boolean
	) { }

	public withInput1(value: boolean): MergeState {
		return new MergeState(
			value,
			this.input2,
			value && this.isEmpty ? false : this.input2First
		);
	}

	public withInput2(value: boolean): MergeState {
		return new MergeState(
			this.input1,
			value,
			value && this.isEmpty ? true : this.input2First
		);
	}

	public toggleInput1(): MergeState {
		return this.withInput1(!this.input1);
	}

	public toggleInput2(): MergeState {
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
