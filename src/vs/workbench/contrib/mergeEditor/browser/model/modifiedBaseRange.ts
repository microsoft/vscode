/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { ITextModel } from 'vs/editor/common/model';
import { DetailedLineRangeMapping, MappingAlignment } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { tieBreakComparators, compareBy, numberComparator } from 'vs/base/common/arrays';
import { splitLines } from 'vs/base/common/strings';
import { Constants } from 'vs/base/common/uint';
import { LineRangeEdit, RangeEdit } from 'vs/workbench/contrib/mergeEditor/browser/model/editing';
import { concatArrays, elementAtOrUndefined } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';

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
				a.inputRange,
				baseTextModel,
				a.output1Range,
				input1TextModel,
				a.output1LineMappings,
				a.output2Range,
				input2TextModel,
				a.output2LineMappings
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

		/**
		 * From base to input1
		*/
		public readonly input1Diffs: readonly DetailedLineRangeMapping[],
		public readonly input2Range: LineRange,
		public readonly input2TextModel: ITextModel,

		/**
		 * From base to input2
		*/
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

	public get canBeCombined(): boolean {
		return this.combineInputs(1) !== undefined;
	}

	public get isOrderRelevant(): boolean {
		const input1 = this.combineInputs(1);
		const input2 = this.combineInputs(2);
		if (!input1 || !input2) {
			return false;
		}
		return !input1.equals(input2);
	}

	public getEditForBase(state: ModifiedBaseRangeState): { edit: LineRangeEdit | undefined; effectiveState: ModifiedBaseRangeState } {
		const diffs = concatArrays(
			state.input1 && this.input1CombinedDiff ? [{ diff: this.input1CombinedDiff, inputNumber: 1 as const }] : [],
			state.input2 && this.input2CombinedDiff ? [{ diff: this.input2CombinedDiff, inputNumber: 2 as const }] : [],
		);

		if (state.input2First) {
			diffs.reverse();
		}

		const firstDiff = elementAtOrUndefined(diffs, 0);
		const secondDiff = elementAtOrUndefined(diffs, 1);

		if (!firstDiff) {
			return { edit: undefined, effectiveState: ModifiedBaseRangeState.default };
		}
		if (!secondDiff) {
			return { edit: firstDiff.diff.getLineEdit(), effectiveState: ModifiedBaseRangeState.default.withInputValue(firstDiff.inputNumber, true) };
		}

		const result = this.combineInputs(state.input2First ? 2 : 1);
		if (result) {
			return { edit: result, effectiveState: state };
		}

		return {
			edit: secondDiff.diff.getLineEdit(),
			effectiveState: ModifiedBaseRangeState.default.withInputValue(
				secondDiff.inputNumber,
				true
			),
		};
	}

	private input1LineRangeEdit: LineRangeEdit | undefined | null = null;
	private input2LineRangeEdit: LineRangeEdit | undefined | null = null;

	private combineInputs(firstInput: 1 | 2): LineRangeEdit | undefined {
		if (firstInput === 1 && this.input1LineRangeEdit !== null) {
			return this.input1LineRangeEdit;
		} else if (firstInput === 2 && this.input2LineRangeEdit !== null) {
			return this.input2LineRangeEdit;
		}

		const combinedDiffs = concatArrays(
			this.input1Diffs.flatMap((diffs) =>
				diffs.rangeMappings.map((diff) => ({ diff, input: 1 as const }))
			),
			this.input2Diffs.flatMap((diffs) =>
				diffs.rangeMappings.map((diff) => ({ diff, input: 2 as const }))
			)
		).sort(
			tieBreakComparators(
				compareBy((d) => d.diff.inputRange, Range.compareRangesUsingStarts),
				compareBy((d) => (d.input === firstInput ? 1 : 2), numberComparator)
			)
		);

		const sortedEdits = combinedDiffs.map(d => {
			const sourceTextModel = d.input === 1 ? this.input1TextModel : this.input2TextModel;
			return new RangeEdit(d.diff.inputRange, sourceTextModel.getValueInRange(d.diff.outputRange));
		});

		const result = editsToLineRangeEdit(this.baseRange, sortedEdits, this.baseTextModel);
		if (firstInput === 1) {
			this.input1LineRangeEdit = result;
		} else {
			this.input2LineRangeEdit = result;
		}
		return result;
	}
}

function editsToLineRangeEdit(range: LineRange, sortedEdits: RangeEdit[], textModel: ITextModel): LineRangeEdit | undefined {
	let text = '';
	const startsLineBefore = range.startLineNumber > 1;
	let currentPosition = startsLineBefore
		? new Position(
			range.startLineNumber - 1,
			Constants.MAX_SAFE_SMALL_INTEGER
		)
		: new Position(range.startLineNumber, 1);

	for (const edit of sortedEdits) {
		const diffStart = edit.range.getStartPosition();
		if (!currentPosition.isBeforeOrEqual(diffStart)) {
			return undefined;
		}
		let originalText = textModel.getValueInRange(Range.fromPositions(currentPosition, diffStart));
		if (diffStart.lineNumber > textModel.getLineCount()) {
			// assert diffStart.lineNumber === textModel.getLineCount() + 1
			// getValueInRange doesn't include this virtual line break, as the document ends the line before.
			// endsLineAfter will be false.
			originalText += '\n';
		}
		text += originalText;
		text += edit.newText;
		currentPosition = edit.range.getEndPosition();
	}

	const endsLineAfter = range.endLineNumberExclusive <= textModel.getLineCount();
	const end = endsLineAfter ? new Position(
		range.endLineNumberExclusive,
		1
	) : new Position(range.endLineNumberExclusive - 1, Constants.MAX_SAFE_SMALL_INTEGER);

	const originalText = textModel.getValueInRange(
		Range.fromPositions(currentPosition, end)
	);
	text += originalText;

	const lines = splitLines(text);
	if (startsLineBefore) {
		lines.shift();
	}
	if (endsLineAfter) {
		lines.pop();
	}
	return new LineRangeEdit(range, lines);
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

	public swap(): ModifiedBaseRangeState {
		return new ModifiedBaseRangeState(
			this.input2,
			this.input1,
			!this.input2First,
			this.conflicting
		);
	}

	public toggle(inputNumber: 1 | 2): ModifiedBaseRangeState {
		if (inputNumber === 1) {
			return this.withInput1(!this.input1);
		} else {
			return this.withInput2(!this.input2);
		}
	}

	public get isEmpty(): boolean {
		return !this.input1 && !this.input2;
	}

	public toString(): string {
		const arr: string[] = [];
		if (this.input1) {
			arr.push('1✓');
		}
		if (this.input2) {
			arr.push('2✓');
		}
		if (this.input2First) {
			arr.reverse();
		}
		if (this.conflicting) {
			arr.push('conflicting');
		}
		return arr.join(',');
	}

	equals(other: ModifiedBaseRangeState): boolean {
		return (
			this.input1 === other.input1 &&
			this.input2 === other.input2 &&
			this.input2First === other.input2First &&
			this.conflicting === other.conflicting
		);
	}
}

export const enum InputState {
	excluded = 0,
	first = 1,
	second = 2,
	conflicting = 3
}
