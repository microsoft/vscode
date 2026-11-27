/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { countEOL } from '../../../common/core/misc/eolCounter.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';

interface IEditOperation {
	range: Range;
	text: string;
}

export class ReplaceAllCommand implements ICommand {

	private readonly _editorSelection: Selection;
	private _resultingEditorSelection: Selection | null;
	private readonly _ranges: Range[];
	private readonly _replaceStrings: string[];

	constructor(editorSelection: Selection, ranges: Range[], replaceStrings: string[]) {
		this._editorSelection = editorSelection;
		this._ranges = ranges;
		this._replaceStrings = replaceStrings;
		this._resultingEditorSelection = null;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		if (this._ranges.length > 0) {
			// Collect all edit operations
			const ops: IEditOperation[] = [];
			for (let i = 0; i < this._ranges.length; i++) {
				ops.push({
					range: this._ranges[i],
					text: this._replaceStrings[i]
				});
			}

			// Sort them in ascending order by range starts
			ops.sort((o1, o2) => {
				return Range.compareRangesUsingStarts(o1.range, o2.range);
			});

			// Merge operations that touch each other
			const resultOps: IEditOperation[] = [];
			let previousOp = ops[0];
			for (let i = 1; i < ops.length; i++) {
				if (previousOp.range.endLineNumber === ops[i].range.startLineNumber && previousOp.range.endColumn === ops[i].range.startColumn) {
					// These operations are one after another and can be merged
					previousOp.range = previousOp.range.plusRange(ops[i].range);
					previousOp.text = previousOp.text + ops[i].text;
				} else {
					resultOps.push(previousOp);
					previousOp = ops[i];
				}
			}
			resultOps.push(previousOp);

			for (const op of resultOps) {
				builder.addEditOperation(op.range, op.text);
			}

			// Don't use `builder.trackSelection`: the text buffer combines 1000 or more untracked edits
			// into a single edit to avoid huge temporary allocations, and a tracked selection can't follow
			// the separate replacements through it (#221826). Map the selection through them instead.
			this._resultingEditorSelection = mapSelection(model, this._editorSelection, resultOps);
		}
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return this._resultingEditorSelection!;
	}
}

/**
 * Maps `selection` through `ops` like `IEditOperationBuilder.trackSelection` does when the edits
 * are applied separately: the ends of a non-empty selection stick to the selected text, and an
 * empty selection sticks to the text after it, unless it is at the end of a line.
 */
function mapSelection(model: ITextModel, selection: Selection, ops: IEditOperation[]): Selection {
	const stickEmptyToPrevious = selection.isEmpty() && selection.startColumn === model.getLineMaxColumn(selection.startLineNumber);
	const start = mapPosition(model, selection.getStartPosition(), stickEmptyToPrevious, ops);
	const end = mapPosition(model, selection.getEndPosition(), !selection.isEmpty() || stickEmptyToPrevious, ops);
	return Selection.createWithDirection(start.lineNumber, start.column, end.lineNumber, end.column, selection.getDirection());
}

/**
 * Maps `position` through the sorted, non-touching `ops` the same way a tracked range
 * marker is moved by each of them (see `nodeAcceptEdit` in intervalTree.ts).
 */
function mapPosition(model: ITextModel, position: Position, stickToPreviousCharacter: boolean, ops: IEditOperation[]): Position {
	// The end of the last operation before `position`, before and after the edits
	let oldEnd = new Position(1, 1);
	let newEnd = oldEnd;
	const moveUnchanged = (p: Position) => p.lineNumber === oldEnd.lineNumber
		? new Position(newEnd.lineNumber, newEnd.column + p.column - oldEnd.column)
		: new Position(p.lineNumber + newEnd.lineNumber - oldEnd.lineNumber, p.column);

	for (const op of ops) {
		const start = op.range.getStartPosition();
		if (position.isBefore(start)) {
			break;
		}
		const end = op.range.getEndPosition();
		const newStart = moveUnchanged(start);
		if (position.isBeforeOrEqual(end)) {
			// A position in the replaced range keeps its offset into the range if the new text is long enough.
			// At the end of the range, it only does so when it sticks to the previous character.
			const offset = model.getOffsetAt(position) - model.getOffsetAt(start);
			const newText = op.text.replace(/\r\n|\r|\n/g, model.getEOL());
			if (offset < newText.length && (position.isBefore(end) || stickToPreviousCharacter)) {
				// Like the model, put an offset between `\r` and `\n` at the end of the line
				const isInCRLF = newText.charCodeAt(offset - 1) === CharCode.CarriageReturn && newText.charCodeAt(offset) === CharCode.LineFeed;
				return endOfText(newStart, newText.substring(0, isInCRLF ? offset - 1 : offset));
			}
			return endOfText(newStart, op.text);
		}
		oldEnd = end;
		newEnd = endOfText(newStart, op.text);
	}
	return moveUnchanged(position);
}

function endOfText(start: Position, text: string): Position {
	const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
	return eolCount === 0
		? new Position(start.lineNumber, start.column + firstLineLength)
		: new Position(start.lineNumber + eolCount, lastLineLength + 1);
}
