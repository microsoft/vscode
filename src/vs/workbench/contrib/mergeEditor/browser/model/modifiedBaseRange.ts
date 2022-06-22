/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { ITextModel } from 'vs/editor/common/model';
import { DetailedLineRangeMapping, MappingAlignment } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';

/**
 * Describes modifications in input 1 and input 2 for a specific range in base.
 *
 * The UI offers a mechanism to either apply all changes from input 1 or input 2 or both.
 *
 * Immutable.
*/
export class ModifiedBaseRange {
	public static fromDiffs(
		diffs1: readonly DetailedLineRangeMapping[],
		diffs2: readonly DetailedLineRangeMapping[],
		baseTextModel: ITextModel,
		input1TextModel: ITextModel,
		input2TextModel: ITextModel
	): ModifiedBaseRange[] {
		const alignments = MappingAlignment.compute(diffs1, diffs2);
		return alignments.map(
			(a) => new ModifiedBaseRange(
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
		public readonly input2Diffs: readonly DetailedLineRangeMapping[]
	) {
		if (this.input1Diffs.length === 0 && this.input2Diffs.length === 0) {
			throw new BugIndicatingError('must have at least one diff');
		}
	}

	public getInputRange(inputNumber: 1 | 2): LineRange {
		return inputNumber === 1 ? this.input1Range : this.input2Range;
	}

	public getInputCombinedDiff(inputNumber: 1 | 2): DetailedLineRangeMapping | undefined {
		return inputNumber === 1 ? this.input1CombinedDiff : this.input2CombinedDiff;
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
		public readonly conflicting: boolean
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
			false
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
	conflicting = 3
}
