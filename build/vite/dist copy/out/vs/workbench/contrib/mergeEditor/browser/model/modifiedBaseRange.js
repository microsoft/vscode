/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, concatArrays, equals, numberComparator, tieBreakComparators } from '../../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { splitLines } from '../../../../../base/common/strings.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LineRangeEdit, RangeEdit } from './editing.js';
import { DetailedLineRangeMapping, MappingAlignment } from './mapping.js';
/**
 * Describes modifications in input 1 and input 2 for a specific range in base.
 *
 * The UI offers a mechanism to either apply all changes from input 1 or input 2 or both.
 *
 * Immutable.
*/
export class ModifiedBaseRange {
    static fromDiffs(diffs1, diffs2, baseTextModel, input1TextModel, input2TextModel) {
        const alignments = MappingAlignment.compute(diffs1, diffs2);
        return alignments.map((a) => new ModifiedBaseRange(a.inputRange, baseTextModel, a.output1Range, input1TextModel, a.output1LineMappings, a.output2Range, input2TextModel, a.output2LineMappings));
    }
    constructor(baseRange, baseTextModel, input1Range, input1TextModel, 
    /**
     * From base to input1
    */
    input1Diffs, input2Range, input2TextModel, 
    /**
     * From base to input2
    */
    input2Diffs) {
        this.baseRange = baseRange;
        this.baseTextModel = baseTextModel;
        this.input1Range = input1Range;
        this.input1TextModel = input1TextModel;
        this.input1Diffs = input1Diffs;
        this.input2Range = input2Range;
        this.input2TextModel = input2TextModel;
        this.input2Diffs = input2Diffs;
        this.input1CombinedDiff = DetailedLineRangeMapping.join(this.input1Diffs);
        this.input2CombinedDiff = DetailedLineRangeMapping.join(this.input2Diffs);
        this.isEqualChange = equals(this.input1Diffs, this.input2Diffs, (a, b) => a.getLineEdit().equals(b.getLineEdit()));
        this.smartInput1LineRangeEdit = null;
        this.smartInput2LineRangeEdit = null;
        this.dumbInput1LineRangeEdit = null;
        this.dumbInput2LineRangeEdit = null;
        if (this.input1Diffs.length === 0 && this.input2Diffs.length === 0) {
            throw new BugIndicatingError('must have at least one diff');
        }
    }
    getInputRange(inputNumber) {
        return inputNumber === 1 ? this.input1Range : this.input2Range;
    }
    getInputCombinedDiff(inputNumber) {
        return inputNumber === 1 ? this.input1CombinedDiff : this.input2CombinedDiff;
    }
    getInputDiffs(inputNumber) {
        return inputNumber === 1 ? this.input1Diffs : this.input2Diffs;
    }
    get isConflicting() {
        return this.input1Diffs.length > 0 && this.input2Diffs.length > 0;
    }
    get canBeCombined() {
        return this.smartCombineInputs(1) !== undefined;
    }
    get isOrderRelevant() {
        const input1 = this.smartCombineInputs(1);
        const input2 = this.smartCombineInputs(2);
        if (!input1 || !input2) {
            return false;
        }
        return !input1.equals(input2);
    }
    getEditForBase(state) {
        const diffs = [];
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
            effectiveState: ModifiedBaseRangeState.base.withInputValue(getOtherInputNumber(state.firstInput), true, false),
        };
    }
    smartCombineInputs(firstInput) {
        if (firstInput === 1 && this.smartInput1LineRangeEdit !== null) {
            return this.smartInput1LineRangeEdit;
        }
        else if (firstInput === 2 && this.smartInput2LineRangeEdit !== null) {
            return this.smartInput2LineRangeEdit;
        }
        const combinedDiffs = concatArrays(this.input1Diffs.flatMap((diffs) => diffs.rangeMappings.map((diff) => ({ diff, input: 1 }))), this.input2Diffs.flatMap((diffs) => diffs.rangeMappings.map((diff) => ({ diff, input: 2 })))).sort(tieBreakComparators(compareBy((d) => d.diff.inputRange, Range.compareRangesUsingStarts), compareBy((d) => (d.input === firstInput ? 1 : 2), numberComparator)));
        const sortedEdits = combinedDiffs.map(d => {
            const sourceTextModel = d.input === 1 ? this.input1TextModel : this.input2TextModel;
            return new RangeEdit(d.diff.inputRange, sourceTextModel.getValueInRange(d.diff.outputRange));
        });
        const result = editsToLineRangeEdit(this.baseRange, sortedEdits, this.baseTextModel);
        if (firstInput === 1) {
            this.smartInput1LineRangeEdit = result;
        }
        else {
            this.smartInput2LineRangeEdit = result;
        }
        return result;
    }
    dumbCombineInputs(firstInput) {
        if (firstInput === 1 && this.dumbInput1LineRangeEdit !== null) {
            return this.dumbInput1LineRangeEdit;
        }
        else if (firstInput === 2 && this.dumbInput2LineRangeEdit !== null) {
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
        }
        else {
            this.dumbInput2LineRangeEdit = result;
        }
        return result;
    }
}
function editsToLineRangeEdit(range, sortedEdits, textModel) {
    let text = '';
    const startsLineBefore = range.startLineNumber > 1;
    let currentPosition = startsLineBefore
        ? new Position(range.startLineNumber - 1, textModel.getLineMaxColumn(range.startLineNumber - 1))
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
    const end = endsLineAfter ? new Position(range.endLineNumberExclusive, 1) : new Position(range.endLineNumberExclusive - 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */);
    const originalText = textModel.getValueInRange(Range.fromPositions(currentPosition, end));
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
export var ModifiedBaseRangeStateKind;
(function (ModifiedBaseRangeStateKind) {
    ModifiedBaseRangeStateKind[ModifiedBaseRangeStateKind["base"] = 0] = "base";
    ModifiedBaseRangeStateKind[ModifiedBaseRangeStateKind["input1"] = 1] = "input1";
    ModifiedBaseRangeStateKind[ModifiedBaseRangeStateKind["input2"] = 2] = "input2";
    ModifiedBaseRangeStateKind[ModifiedBaseRangeStateKind["both"] = 3] = "both";
    ModifiedBaseRangeStateKind[ModifiedBaseRangeStateKind["unrecognized"] = 4] = "unrecognized";
})(ModifiedBaseRangeStateKind || (ModifiedBaseRangeStateKind = {}));
export function getOtherInputNumber(inputNumber) {
    return inputNumber === 1 ? 2 : 1;
}
export class AbstractModifiedBaseRangeState {
    constructor() { }
    get includesInput1() { return false; }
    get includesInput2() { return false; }
    includesInput(inputNumber) {
        return inputNumber === 1 ? this.includesInput1 : this.includesInput2;
    }
    isInputIncluded(inputNumber) {
        return inputNumber === 1 ? this.includesInput1 : this.includesInput2;
    }
    toggle(inputNumber) {
        return this.withInputValue(inputNumber, !this.includesInput(inputNumber), true);
    }
    getInput(inputNumber) {
        if (!this.isInputIncluded(inputNumber)) {
            return 0 /* InputState.excluded */;
        }
        return 1 /* InputState.first */;
    }
}
export class ModifiedBaseRangeStateBase extends AbstractModifiedBaseRangeState {
    get kind() { return ModifiedBaseRangeStateKind.base; }
    toString() { return 'base'; }
    swap() { return this; }
    withInputValue(inputNumber, value, smartCombination = false) {
        if (inputNumber === 1) {
            return value ? new ModifiedBaseRangeStateInput1() : this;
        }
        else {
            return value ? new ModifiedBaseRangeStateInput2() : this;
        }
    }
    equals(other) {
        return other.kind === ModifiedBaseRangeStateKind.base;
    }
}
export class ModifiedBaseRangeStateInput1 extends AbstractModifiedBaseRangeState {
    get kind() { return ModifiedBaseRangeStateKind.input1; }
    get includesInput1() { return true; }
    toString() { return '1✓'; }
    swap() { return new ModifiedBaseRangeStateInput2(); }
    withInputValue(inputNumber, value, smartCombination = false) {
        if (inputNumber === 1) {
            return value ? this : new ModifiedBaseRangeStateBase();
        }
        else {
            return value ? new ModifiedBaseRangeStateBoth(1, smartCombination) : new ModifiedBaseRangeStateInput2();
        }
    }
    equals(other) {
        return other.kind === ModifiedBaseRangeStateKind.input1;
    }
}
export class ModifiedBaseRangeStateInput2 extends AbstractModifiedBaseRangeState {
    get kind() { return ModifiedBaseRangeStateKind.input2; }
    get includesInput2() { return true; }
    toString() { return '2✓'; }
    swap() { return new ModifiedBaseRangeStateInput1(); }
    withInputValue(inputNumber, value, smartCombination = false) {
        if (inputNumber === 2) {
            return value ? this : new ModifiedBaseRangeStateBase();
        }
        else {
            return value ? new ModifiedBaseRangeStateBoth(2, smartCombination) : new ModifiedBaseRangeStateInput2();
        }
    }
    equals(other) {
        return other.kind === ModifiedBaseRangeStateKind.input2;
    }
}
export class ModifiedBaseRangeStateBoth extends AbstractModifiedBaseRangeState {
    constructor(firstInput, smartCombination) {
        super();
        this.firstInput = firstInput;
        this.smartCombination = smartCombination;
    }
    get kind() { return ModifiedBaseRangeStateKind.both; }
    get includesInput1() { return true; }
    get includesInput2() { return true; }
    toString() {
        return '2✓';
    }
    swap() { return new ModifiedBaseRangeStateBoth(getOtherInputNumber(this.firstInput), this.smartCombination); }
    withInputValue(inputNumber, value, smartCombination = false) {
        if (value) {
            return this;
        }
        return inputNumber === 1 ? new ModifiedBaseRangeStateInput2() : new ModifiedBaseRangeStateInput1();
    }
    equals(other) {
        return other.kind === ModifiedBaseRangeStateKind.both && this.firstInput === other.firstInput && this.smartCombination === other.smartCombination;
    }
    getInput(inputNumber) {
        return inputNumber === this.firstInput ? 1 /* InputState.first */ : 2 /* InputState.second */;
    }
}
export class ModifiedBaseRangeStateUnrecognized extends AbstractModifiedBaseRangeState {
    get kind() { return ModifiedBaseRangeStateKind.unrecognized; }
    toString() { return 'unrecognized'; }
    swap() { return this; }
    withInputValue(inputNumber, value, smartCombination = false) {
        if (!value) {
            return this;
        }
        return inputNumber === 1 ? new ModifiedBaseRangeStateInput1() : new ModifiedBaseRangeStateInput2();
    }
    equals(other) {
        return other.kind === ModifiedBaseRangeStateKind.unrecognized;
    }
}
export var ModifiedBaseRangeState;
(function (ModifiedBaseRangeState) {
    ModifiedBaseRangeState.base = new ModifiedBaseRangeStateBase();
    ModifiedBaseRangeState.unrecognized = new ModifiedBaseRangeStateUnrecognized();
})(ModifiedBaseRangeState || (ModifiedBaseRangeState = {}));
export var InputState;
(function (InputState) {
    InputState[InputState["excluded"] = 0] = "excluded";
    InputState[InputState["first"] = 1] = "first";
    InputState[InputState["second"] = 2] = "second";
    InputState[InputState["unrecognized"] = 3] = "unrecognized";
})(InputState || (InputState = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kaWZpZWRCYXNlUmFuZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL21vZGVsL21vZGlmaWVkQmFzZVJhbmdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDekUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRXhELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUUxRTs7Ozs7O0VBTUU7QUFDRixNQUFNLE9BQU8saUJBQWlCO0lBQ3RCLE1BQU0sQ0FBQyxTQUFTLENBQ3RCLE1BQTJDLEVBQzNDLE1BQTJDLEVBQzNDLGFBQXlCLEVBQ3pCLGVBQTJCLEVBQzNCLGVBQTJCO1FBRTNCLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDNUQsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUNwQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxpQkFBaUIsQ0FDM0IsQ0FBQyxDQUFDLFVBQVUsRUFDWixhQUFhLEVBQ2IsQ0FBQyxDQUFDLFlBQVksRUFDZCxlQUFlLEVBQ2YsQ0FBQyxDQUFDLG1CQUFtQixFQUNyQixDQUFDLENBQUMsWUFBWSxFQUNkLGVBQWUsRUFDZixDQUFDLENBQUMsbUJBQW1CLENBQ3JCLENBQ0QsQ0FBQztJQUNILENBQUM7SUFNRCxZQUNpQixTQUErQixFQUMvQixhQUF5QixFQUN6QixXQUFpQyxFQUNqQyxlQUEyQjtJQUUzQzs7TUFFRTtJQUNjLFdBQWdELEVBQ2hELFdBQWlDLEVBQ2pDLGVBQTJCO0lBRTNDOztNQUVFO0lBQ2MsV0FBZ0Q7UUFmaEQsY0FBUyxHQUFULFNBQVMsQ0FBc0I7UUFDL0Isa0JBQWEsR0FBYixhQUFhLENBQVk7UUFDekIsZ0JBQVcsR0FBWCxXQUFXLENBQXNCO1FBQ2pDLG9CQUFlLEdBQWYsZUFBZSxDQUFZO1FBSzNCLGdCQUFXLEdBQVgsV0FBVyxDQUFxQztRQUNoRCxnQkFBVyxHQUFYLFdBQVcsQ0FBc0I7UUFDakMsb0JBQWUsR0FBZixlQUFlLENBQVk7UUFLM0IsZ0JBQVcsR0FBWCxXQUFXLENBQXFDO1FBRWhFLElBQUksQ0FBQyxrQkFBa0IsR0FBRyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxrQkFBa0IsR0FBRyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuSCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxDQUFDO1FBQ3JDLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUM7UUFDckMsSUFBSSxDQUFDLHVCQUF1QixHQUFHLElBQUksQ0FBQztRQUNwQyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDO1FBQ3BDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3BFLE1BQU0sSUFBSSxrQkFBa0IsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQzdELENBQUM7SUFDRixDQUFDO0lBRU0sYUFBYSxDQUFDLFdBQWtCO1FBQ3RDLE9BQU8sV0FBVyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUNoRSxDQUFDO0lBRU0sb0JBQW9CLENBQUMsV0FBa0I7UUFDN0MsT0FBTyxXQUFXLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztJQUM5RSxDQUFDO0lBRU0sYUFBYSxDQUFDLFdBQWtCO1FBQ3RDLE9BQU8sV0FBVyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUNoRSxDQUFDO0lBRUQsSUFBVyxhQUFhO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRUQsSUFBVyxhQUFhO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxLQUFLLFNBQVMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsSUFBVyxlQUFlO1FBQ3pCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3hCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFTSxjQUFjLENBQUMsS0FBNkI7UUFDbEQsTUFBTSxLQUFLLEdBQW1FLEVBQUUsQ0FBQztRQUNqRixJQUFJLEtBQUssQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDckQsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUNyRCxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRCxDQUFDO1FBRUQsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxzQkFBc0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN6RSxDQUFDO1FBQ0QsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxjQUFjLEVBQUUsc0JBQXNCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzdJLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssMEJBQTBCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDcEQsTUFBTSxJQUFJLGtCQUFrQixFQUFFLENBQUM7UUFDaEMsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hJLElBQUksaUJBQWlCLEVBQUUsQ0FBQztZQUN2QixPQUFPLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsQ0FBQztRQUMzRCxDQUFDO1FBRUQsT0FBTztZQUNOLElBQUksRUFBRSxLQUFLLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDekUsY0FBYyxFQUFFLHNCQUFzQixDQUFDLElBQUksQ0FBQyxjQUFjLENBQ3pELG1CQUFtQixDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFDckMsSUFBSSxFQUNKLEtBQUssQ0FDTDtTQUNELENBQUM7SUFDSCxDQUFDO0lBS08sa0JBQWtCLENBQUMsVUFBaUI7UUFDM0MsSUFBSSxVQUFVLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyx3QkFBd0IsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNoRSxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztRQUN0QyxDQUFDO2FBQU0sSUFBSSxVQUFVLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyx3QkFBd0IsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN2RSxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztRQUN0QyxDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUcsWUFBWSxDQUNqQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQ2xDLEtBQUssQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFVLEVBQUUsQ0FBQyxDQUFDLENBQ2hFLEVBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUNsQyxLQUFLLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBVSxFQUFFLENBQUMsQ0FBQyxDQUNoRSxDQUNELENBQUMsSUFBSSxDQUNMLG1CQUFtQixDQUNsQixTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxFQUNuRSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsQ0FDcEUsQ0FDRCxDQUFDO1FBRUYsTUFBTSxXQUFXLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN6QyxNQUFNLGVBQWUsR0FBRyxDQUFDLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQztZQUNwRixPQUFPLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLGVBQWUsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3JGLElBQUksVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxNQUFNLENBQUM7UUFDeEMsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsTUFBTSxDQUFDO1FBQ3hDLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFLTyxpQkFBaUIsQ0FBQyxVQUFpQjtRQUMxQyxJQUFJLFVBQVUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLHVCQUF1QixLQUFLLElBQUksRUFBRSxDQUFDO1lBQy9ELE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDO1FBQ3JDLENBQUM7YUFBTSxJQUFJLFVBQVUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLHVCQUF1QixLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3RFLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDO1FBQ3JDLENBQUM7UUFFRCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbEUsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xFLElBQUksVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3RCLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3pELENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUNsRixJQUFJLFVBQVUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QixJQUFJLENBQUMsdUJBQXVCLEdBQUcsTUFBTSxDQUFDO1FBQ3ZDLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLHVCQUF1QixHQUFHLE1BQU0sQ0FBQztRQUN2QyxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBQ0Q7QUFFRCxTQUFTLG9CQUFvQixDQUFDLEtBQTJCLEVBQUUsV0FBd0IsRUFBRSxTQUFxQjtJQUN6RyxJQUFJLElBQUksR0FBRyxFQUFFLENBQUM7SUFDZCxNQUFNLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDO0lBQ25ELElBQUksZUFBZSxHQUFHLGdCQUFnQjtRQUNyQyxDQUFDLENBQUMsSUFBSSxRQUFRLENBQ2IsS0FBSyxDQUFDLGVBQWUsR0FBRyxDQUFDLEVBQ3pCLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUNyRDtRQUNELENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRTFDLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7UUFDaEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ2hELElBQUksQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDakQsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELElBQUksWUFBWSxHQUFHLFNBQVMsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxlQUFlLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUM5RixJQUFJLFNBQVMsQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUM7WUFDckQsK0RBQStEO1lBQy9ELGlHQUFpRztZQUNqRywrQkFBK0I7WUFDL0IsWUFBWSxJQUFJLElBQUksQ0FBQztRQUN0QixDQUFDO1FBQ0QsSUFBSSxJQUFJLFlBQVksQ0FBQztRQUNyQixJQUFJLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUNyQixlQUFlLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUMvQyxDQUFDO0lBRUQsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLHNCQUFzQixJQUFJLFNBQVMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUMvRSxNQUFNLEdBQUcsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksUUFBUSxDQUN2QyxLQUFLLENBQUMsc0JBQXNCLEVBQzVCLENBQUMsQ0FDRCxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEdBQUcsQ0FBQyxvREFBbUMsQ0FBQztJQUVyRixNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsZUFBZSxDQUM3QyxLQUFLLENBQUMsYUFBYSxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FDekMsQ0FBQztJQUNGLElBQUksSUFBSSxZQUFZLENBQUM7SUFFckIsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQy9CLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QixJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQztZQUNyQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2YsQ0FBQztJQUNELElBQUksYUFBYSxFQUFFLENBQUM7UUFDbkIsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQztZQUNwQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUNELE9BQU8sSUFBSSxhQUFhLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ3hDLENBQUM7QUFFRCxNQUFNLENBQU4sSUFBWSwwQkFNWDtBQU5ELFdBQVksMEJBQTBCO0lBQ3JDLDJFQUFJLENBQUE7SUFDSiwrRUFBTSxDQUFBO0lBQ04sK0VBQU0sQ0FBQTtJQUNOLDJFQUFJLENBQUE7SUFDSiwyRkFBWSxDQUFBO0FBQ2IsQ0FBQyxFQU5XLDBCQUEwQixLQUExQiwwQkFBMEIsUUFNckM7QUFJRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsV0FBd0I7SUFDM0QsT0FBTyxXQUFXLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsQyxDQUFDO0FBRUQsTUFBTSxPQUFnQiw4QkFBOEI7SUFDbkQsZ0JBQWdCLENBQUM7SUFJakIsSUFBVyxjQUFjLEtBQWMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3RELElBQVcsY0FBYyxLQUFjLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUUvQyxhQUFhLENBQUMsV0FBd0I7UUFDNUMsT0FBTyxXQUFXLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQ3RFLENBQUM7SUFFTSxlQUFlLENBQUMsV0FBd0I7UUFDOUMsT0FBTyxXQUFXLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQ3RFLENBQUM7SUFVTSxNQUFNLENBQUMsV0FBd0I7UUFDckMsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDakYsQ0FBQztJQUVNLFFBQVEsQ0FBQyxXQUFrQjtRQUNqQyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ3hDLG1DQUEyQjtRQUM1QixDQUFDO1FBQ0QsZ0NBQXdCO0lBQ3pCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTywwQkFBMkIsU0FBUSw4QkFBOEI7SUFDN0UsSUFBYSxJQUFJLEtBQXNDLE9BQU8sMEJBQTBCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNoRixRQUFRLEtBQWEsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ3JDLElBQUksS0FBNkIsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBRS9DLGNBQWMsQ0FBQyxXQUF3QixFQUFFLEtBQWMsRUFBRSxtQkFBNEIsS0FBSztRQUN6RyxJQUFJLFdBQVcsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSw0QkFBNEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDMUQsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSw0QkFBNEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDMUQsQ0FBQztJQUNGLENBQUM7SUFFZSxNQUFNLENBQUMsS0FBNkI7UUFDbkQsT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLElBQUksQ0FBQztJQUN2RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sNEJBQTZCLFNBQVEsOEJBQThCO0lBQy9FLElBQWEsSUFBSSxLQUF3QyxPQUFPLDBCQUEwQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDcEcsSUFBYSxjQUFjLEtBQWMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hELFFBQVEsS0FBYSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDMUIsSUFBSSxLQUE2QixPQUFPLElBQUksNEJBQTRCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFN0UsY0FBYyxDQUFDLFdBQXdCLEVBQUUsS0FBYyxFQUFFLG1CQUE0QixLQUFLO1FBQ3pHLElBQUksV0FBVyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksMEJBQTBCLEVBQUUsQ0FBQztRQUN4RCxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLDBCQUEwQixDQUFDLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLDRCQUE0QixFQUFFLENBQUM7UUFDekcsQ0FBQztJQUNGLENBQUM7SUFFZSxNQUFNLENBQUMsS0FBNkI7UUFDbkQsT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLE1BQU0sQ0FBQztJQUN6RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sNEJBQTZCLFNBQVEsOEJBQThCO0lBQy9FLElBQWEsSUFBSSxLQUF3QyxPQUFPLDBCQUEwQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDcEcsSUFBYSxjQUFjLEtBQWMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hELFFBQVEsS0FBYSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDMUIsSUFBSSxLQUE2QixPQUFPLElBQUksNEJBQTRCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFdEYsY0FBYyxDQUFDLFdBQXdCLEVBQUUsS0FBYyxFQUFFLG1CQUE0QixLQUFLO1FBQ2hHLElBQUksV0FBVyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksMEJBQTBCLEVBQUUsQ0FBQztRQUN4RCxDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLDBCQUEwQixDQUFDLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLDRCQUE0QixFQUFFLENBQUM7UUFDekcsQ0FBQztJQUNGLENBQUM7SUFFZSxNQUFNLENBQUMsS0FBNkI7UUFDbkQsT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLE1BQU0sQ0FBQztJQUN6RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sMEJBQTJCLFNBQVEsOEJBQThCO0lBQzdFLFlBQ2lCLFVBQXVCLEVBQ3ZCLGdCQUF5QjtRQUV6QyxLQUFLLEVBQUUsQ0FBQztRQUhRLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDdkIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFTO0lBRzFDLENBQUM7SUFFRCxJQUFhLElBQUksS0FBc0MsT0FBTywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hHLElBQWEsY0FBYyxLQUFjLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN2RCxJQUFhLGNBQWMsS0FBYyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFaEQsUUFBUTtRQUNkLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVlLElBQUksS0FBNkIsT0FBTyxJQUFJLDBCQUEwQixDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFL0ksY0FBYyxDQUFDLFdBQXdCLEVBQUUsS0FBYyxFQUFFLG1CQUE0QixLQUFLO1FBQ2hHLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLFdBQVcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksNEJBQTRCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSw0QkFBNEIsRUFBRSxDQUFDO0lBQ3BHLENBQUM7SUFFZSxNQUFNLENBQUMsS0FBNkI7UUFDbkQsT0FBTyxLQUFLLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLGdCQUFnQixLQUFLLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQztJQUNuSixDQUFDO0lBRWUsUUFBUSxDQUFDLFdBQWtCO1FBQzFDLE9BQU8sV0FBVyxLQUFLLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQywwQkFBa0IsQ0FBQywwQkFBa0IsQ0FBQztJQUMvRSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sa0NBQW1DLFNBQVEsOEJBQThCO0lBQ3JGLElBQWEsSUFBSSxLQUE4QyxPQUFPLDBCQUEwQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDaEcsUUFBUSxLQUFhLE9BQU8sY0FBYyxDQUFDLENBQUMsQ0FBQztJQUM3QyxJQUFJLEtBQTZCLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUV4RCxjQUFjLENBQUMsV0FBd0IsRUFBRSxLQUFjLEVBQUUsbUJBQTRCLEtBQUs7UUFDaEcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTyxXQUFXLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLDRCQUE0QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksNEJBQTRCLEVBQUUsQ0FBQztJQUNwRyxDQUFDO0lBRWUsTUFBTSxDQUFDLEtBQTZCO1FBQ25ELE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSywwQkFBMEIsQ0FBQyxZQUFZLENBQUM7SUFDL0QsQ0FBQztDQUNEO0FBSUQsTUFBTSxLQUFXLHNCQUFzQixDQUd0QztBQUhELFdBQWlCLHNCQUFzQjtJQUN6QiwyQkFBSSxHQUFHLElBQUksMEJBQTBCLEVBQUUsQ0FBQztJQUN4QyxtQ0FBWSxHQUFHLElBQUksa0NBQWtDLEVBQUUsQ0FBQztBQUN0RSxDQUFDLEVBSGdCLHNCQUFzQixLQUF0QixzQkFBc0IsUUFHdEM7QUFFRCxNQUFNLENBQU4sSUFBa0IsVUFLakI7QUFMRCxXQUFrQixVQUFVO0lBQzNCLG1EQUFZLENBQUE7SUFDWiw2Q0FBUyxDQUFBO0lBQ1QsK0NBQVUsQ0FBQTtJQUNWLDJEQUFnQixDQUFBO0FBQ2pCLENBQUMsRUFMaUIsVUFBVSxLQUFWLFVBQVUsUUFLM0IifQ==