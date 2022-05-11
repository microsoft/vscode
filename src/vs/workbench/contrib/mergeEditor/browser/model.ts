/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue, compareBy, numberComparator } from 'vs/base/common/arrays';
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
				text: e.newLines.map(l => l + '\n').join(),
			})),
			() => null
		);
	}
}

export class LineEdit<T = void> {
	constructor(
		public readonly range: LineRange,
		public readonly newLines: string[],
		public readonly data: T
	) { }
}

export class MergeableDiff {
	public static fromDiffs(
		diffs1: readonly LineDiff[],
		diffs2: readonly LineDiff[]
	): MergeableDiff[] {
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

		const result = new Array<MergeableDiff>();

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
					new MergeableDiff(moreConflictingWith, otherConflictingWith)
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
					new MergeableDiff(otherConflictingWith, moreConflictingWith)
				);
			} else {
				break;
			}
		}

		result.reverse();

		return result;
	}

	public readonly originalRange = LineRange.hull(
		this.input1Diffs
			.map((d) => d.originalRange)
			.concat(this.input2Diffs.map((d) => d.originalRange))
	)!;

	constructor(
		public readonly input1Diffs: readonly LineDiff[],
		public readonly input2Diffs: readonly LineDiff[]
	) { }

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

	public static hull(lineDiffs: LineDiff[]): LineDiff | undefined {
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

	constructor(
		public readonly originalTextModel: ITextModel,
		public readonly originalRange: LineRange,
		public readonly modifiedTextModel: ITextModel,
		public readonly modifiedRange: LineRange,
	) {
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
