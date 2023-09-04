/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, equals, numberComparator, tieBreakComparators } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { splitLines } from 'vs/base/common/strings';
import { Constants } from 'vs/base/common/uint';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { LineRangeEdit, RangeEdit } from 'vs/workbench/contrib/mergeEditor/browser/model/editing';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { DetailedLineRangeMapping, MappingAlignment } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { concatArrays } from 'vs/workbench/contrib/mergeEditor/browser/utils';

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
	public readonly isEqualChange = equals(this.input1Diffs, this.input2Diffs, (a, b) => a.getLineEdit().equals(b.getLineEdit()));

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
		return this.smartCombineInputs(1) !== undefined;
	}

	public get isOrderRelevant(): boolean {
		const input1 = this.smartCombineInputs(1);
		const input2 = this.smartCombineInputs(2);
		if (!input1 || !input2) {
			return false;
		}
		return !input1.equals(input2);
	}

	public getEditForBase(state: ModifiedBaseRangeState): { edit: LineRangeEdit | undefined; effectiveState: ModifiedBaseRangeState } {
		const diffs: { diff: DetailedLineRangeMapping; inputNumber: InputNumber }[] = [];
		if (state.includesInput1 && this.input1CombinedDiff) {
			diffs.push({ diff: this.input1CombinedDiff, inputNumber: 1 });
		}
		if (state.includesInput2 && this.input2CombinedDiff) {
			diffs.push({ diff: this.input2CombinedDiff, inputNumber: 2 });
		}

		if (diffs.length === 0) {
			return { edit: undefined, effectiveState: ModifiedBaseRangeState.base };
		}
		if (diffs.length === 1) {
			return { edit: diffs[0].diff.getLineEdit(), effectiveState: ModifiedBaseRangeState.base.withInputValue(diffs[0].inputNumber, true, false) };
		}

		if (state.kind !== ModifiedBaseRangeStateKind.both) {
			throw new BugIndicatingError();
		}

		const smartCombinedEdit = state.smartCombination ? this.smartCombineInputs(state.firstInput) : this.dumbCombineInputs(state.firstInput);
		if (smartCombinedEdit) {
			return { edit: smartCombinedEdit, effectiveState: state };
		}

		return {
			edit: diffs[getOtherInputNumber(state.firstInput) - 1].diff.getLineEdit(),
			effectiveState: ModifiedBaseRangeState.base.withInputValue(
				getOtherInputNumber(state.firstInput),
				true,
				false
			),
		};
	}

	private smartInput1LineRangeEdit: LineRangeEdit | undefined | null = null;
	private smartInput2LineRangeEdit: LineRangeEdit | undefined | null = null;

	private smartCombineInputs(firstInput: 1 | 2): LineRangeEdit | undefined {
		if (firstInput === 1 && this.smartInput1LineRangeEdit !== null) {
			return this.smartInput1LineRangeEdit;
		} else if (firstInput === 2 && this.smartInput2LineRangeEdit !== null) {
			return this.smartInput2LineRangeEdit;
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
			this.smartInput1LineRangeEdit = result;
		} else {
			this.smartInput2LineRangeEdit = result;
		}
		return result;
	}

	private dumbInput1LineRangeEdit: LineRangeEdit | undefined | null = null;
	private dumbInput2LineRangeEdit: LineRangeEdit | undefined | null = null;

	private dumbCombineInputs(firstInput: 1 | 2): LineRangeEdit | undefined {
		if (firstInput === 1 && this.dumbInput1LineRangeEdit !== null) {
			return this.dumbInput1LineRangeEdit;
		} else if (firstInput === 2 && this.dumbInput2LineRangeEdit !== null) {
			return this.dumbInput2LineRangeEdit;
		}

		let input1Lines = this.input1Range.getLines(this.input1TextModel);
		let input2Lines = this.input2Range.getLines(this.input2TextModel);
		if (firstInput === 2) {
			[input1Lines, input2Lines] = [input2Lines, input1Lines];
		}

		const result = new LineRangeEdit(this.baseRange, input1Lines.concat(input2Lines));
		if (firstInput === 1) {
			this.dumbInput1LineRangeEdit = result;
		} else {
			this.dumbInput2LineRangeEdit = result;
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
			textModel.getLineMaxColumn(range.startLineNumber - 1)
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
		if (lines[0] !== '') {
			return undefined;
		}
		lines.shift();
	}
	if (endsLineAfter) {
		if (lines[lines.length - 1] !== '') {
			return undefined;
		}
		lines.pop();
	}
	return new LineRangeEdit(range, lines);
}

export enum ModifiedBaseRangeStateKind {
	base,
	input1,
	input2,
	both,
	unrecognized,
}

export type InputNumber = 1 | 2;

export function getOtherInputNumber(inputNumber: InputNumber): InputNumber {
	return inputNumber === 1 ? 2 : 1;
}

export abstract class AbstractModifiedBaseRangeState {
	constructor() { }

	abstract get kind(): ModifiedBaseRangeStateKind;

	public get includesInput1(): boolean { return false; }
	public get includesInput2(): boolean { return false; }

	public includesInput(inputNumber: InputNumber): boolean {
		return inputNumber === 1 ? this.includesInput1 : this.includesInput2;
	}

	public isInputIncluded(inputNumber: InputNumber): boolean {
		return inputNumber === 1 ? this.includesInput1 : this.includesInput2;
	}

	public abstract toString(): string;

	public abstract swap(): ModifiedBaseRangeState;

	public abstract withInputValue(inputNumber: InputNumber, value: boolean, smartCombination?: boolean): ModifiedBaseRangeState;

	public abstract equals(other: ModifiedBaseRangeState): boolean;

	public toggle(inputNumber: InputNumber) {
		return this.withInputValue(inputNumber, !this.includesInput(inputNumber), true);
	}

	public getInput(inputNumber: 1 | 2): InputState {
		if (!this.isInputIncluded(inputNumber)) {
			return InputState.excluded;
		}
		return InputState.first;
	}
}

export class ModifiedBaseRangeStateBase extends AbstractModifiedBaseRangeState {
	override get kind(): ModifiedBaseRangeStateKind.base { return ModifiedBaseRangeStateKind.base; }
	public override toString(): string { return 'base'; }
	public override swap(): ModifiedBaseRangeState { return this; }

	public override withInputValue(inputNumber: InputNumber, value: boolean, smartCombination: boolean = false): ModifiedBaseRangeState {
		if (inputNumber === 1) {
			return value ? new ModifiedBaseRangeStateInput1() : this;
		} else {
			return value ? new ModifiedBaseRangeStateInput2() : this;
		}
	}

	public override equals(other: ModifiedBaseRangeState): boolean {
		return other.kind === ModifiedBaseRangeStateKind.base;
	}
}

export class ModifiedBaseRangeStateInput1 extends AbstractModifiedBaseRangeState {
	override get kind(): ModifiedBaseRangeStateKind.input1 { return ModifiedBaseRangeStateKind.input1; }
	override get includesInput1(): boolean { return true; }
	public toString(): string { return '1✓'; }
	public override swap(): ModifiedBaseRangeState { return new ModifiedBaseRangeStateInput2(); }

	public override withInputValue(inputNumber: InputNumber, value: boolean, smartCombination: boolean = false): ModifiedBaseRangeState {
		if (inputNumber === 1) {
			return value ? this : new ModifiedBaseRangeStateBase();
		} else {
			return value ? new ModifiedBaseRangeStateBoth(1, smartCombination) : new ModifiedBaseRangeStateInput2();
		}
	}

	public override equals(other: ModifiedBaseRangeState): boolean {
		return other.kind === ModifiedBaseRangeStateKind.input1;
	}
}

export class ModifiedBaseRangeStateInput2 extends AbstractModifiedBaseRangeState {
	override get kind(): ModifiedBaseRangeStateKind.input2 { return ModifiedBaseRangeStateKind.input2; }
	override get includesInput2(): boolean { return true; }
	public toString(): string { return '2✓'; }
	public override swap(): ModifiedBaseRangeState { return new ModifiedBaseRangeStateInput1(); }

	public withInputValue(inputNumber: InputNumber, value: boolean, smartCombination: boolean = false): ModifiedBaseRangeState {
		if (inputNumber === 2) {
			return value ? this : new ModifiedBaseRangeStateBase();
		} else {
			return value ? new ModifiedBaseRangeStateBoth(2, smartCombination) : new ModifiedBaseRangeStateInput2();
		}
	}

	public override equals(other: ModifiedBaseRangeState): boolean {
		return other.kind === ModifiedBaseRangeStateKind.input2;
	}
}

export class ModifiedBaseRangeStateBoth extends AbstractModifiedBaseRangeState {
	constructor(
		public readonly firstInput: InputNumber,
		public readonly smartCombination: boolean
	) {
		super();
	}

	override get kind(): ModifiedBaseRangeStateKind.both { return ModifiedBaseRangeStateKind.both; }
	override get includesInput1(): boolean { return true; }
	override get includesInput2(): boolean { return true; }

	public toString(): string {
		return '2✓';
	}

	public override swap(): ModifiedBaseRangeState { return new ModifiedBaseRangeStateBoth(getOtherInputNumber(this.firstInput), this.smartCombination); }

	public withInputValue(inputNumber: InputNumber, value: boolean, smartCombination: boolean = false): ModifiedBaseRangeState {
		if (value) {
			return this;
		}
		return inputNumber === 1 ? new ModifiedBaseRangeStateInput2() : new ModifiedBaseRangeStateInput1();
	}

	public override equals(other: ModifiedBaseRangeState): boolean {
		return other.kind === ModifiedBaseRangeStateKind.both && this.firstInput === other.firstInput && this.smartCombination === other.smartCombination;
	}

	public override getInput(inputNumber: 1 | 2): InputState {
		return inputNumber === this.firstInput ? InputState.first : InputState.second;
	}
}

export class ModifiedBaseRangeStateUnrecognized extends AbstractModifiedBaseRangeState {
	override get kind(): ModifiedBaseRangeStateKind.unrecognized { return ModifiedBaseRangeStateKind.unrecognized; }
	public override toString(): string { return 'unrecognized'; }
	public override swap(): ModifiedBaseRangeState { return this; }

	public withInputValue(inputNumber: InputNumber, value: boolean, smartCombination: boolean = false): ModifiedBaseRangeState {
		if (!value) {
			return this;
		}
		return inputNumber === 1 ? new ModifiedBaseRangeStateInput1() : new ModifiedBaseRangeStateInput2();
	}

	public override equals(other: ModifiedBaseRangeState): boolean {
		return other.kind === ModifiedBaseRangeStateKind.unrecognized;
	}
}

export type ModifiedBaseRangeState = ModifiedBaseRangeStateBase | ModifiedBaseRangeStateInput1 | ModifiedBaseRangeStateInput2 | ModifiedBaseRangeStateInput2 | ModifiedBaseRangeStateBoth | ModifiedBaseRangeStateUnrecognized;

export namespace ModifiedBaseRangeState {
	export const base = new ModifiedBaseRangeStateBase();
	export const unrecognized = new ModifiedBaseRangeStateUnrecognized();
}

export const enum InputState {
	excluded = 0,
	first = 1,
	second = 2,
	unrecognized = 3
}
