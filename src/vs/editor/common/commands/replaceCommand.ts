/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { Selection, SelectionDirection } from '../core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../editorCommon.js';
import { EndOfLineSequence, ITextModel } from '../model.js';

export class ReplaceCommand implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	public readonly insertsAutoWhitespace: boolean;

	constructor(range: Range, text: string, insertsAutoWhitespace: boolean = false) {
		this._range = range;
		this._text = text;
		this.insertsAutoWhitespace = insertsAutoWhitespace;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;
		return Selection.fromPositions(srcRange.getEndPosition());
	}
}

export class ReplaceOvertypeCommand implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	public readonly insertsAutoWhitespace: boolean;

	constructor(range: Range, text: string, insertsAutoWhitespace: boolean = false) {
		this._range = range;
		this._text = text;
		this.insertsAutoWhitespace = insertsAutoWhitespace;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const intialStartPosition = this._range.getStartPosition();
		const initialEndPosition = this._range.getEndPosition();
		const offsetDelta = this._text.length + (this._range.isEmpty() ? 0 : - 1);
		const candidateEndPosition: Position = addPositiveDeltaToModelPosition(model, initialEndPosition, offsetDelta);
		const candidateSecondToEndPosition = previousModelPosition(model, candidateEndPosition);
		const endOfLine = model.getEndOfLineSequence() === EndOfLineSequence.CRLF ? '\r\n' : '\n';
		const lastCharacterRange = Range.fromPositions(candidateSecondToEndPosition, candidateEndPosition);
		const lastCharacter = model.getValueInRange(lastCharacterRange);
		const endPosition = lastCharacter === endOfLine ? candidateSecondToEndPosition : candidateEndPosition;
		const replaceRange = Range.fromPositions(intialStartPosition, endPosition);
		builder.addTrackedEditOperation(replaceRange, this._text);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;
		return Selection.fromPositions(srcRange.getEndPosition());
	}
}

export class OvertypePasteCommand implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	public readonly insertsAutoWhitespace: boolean;

	constructor(range: Range, text: string, insertsAutoWhitespace: boolean = false) {
		this._range = range;
		this._text = text;
		this.insertsAutoWhitespace = insertsAutoWhitespace;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const initialStartPosition = this._range.getStartPosition();
		const initialEndPosition = this._range.getEndPosition();
		const endLineNumber = initialEndPosition.lineNumber;
		const offsetDelta = this._text.length + (this._range.isEmpty() ? 0 : - 1);
		const candidateEndPosition = addPositiveDeltaToModelPosition(model, initialEndPosition, offsetDelta);
		let endPosition: Position;
		if (candidateEndPosition.lineNumber > endLineNumber) {
			endPosition = new Position(endLineNumber, model.getLineMaxColumn(endLineNumber));
		} else {
			endPosition = candidateEndPosition;
		}
		const replaceRange = Range.fromPositions(initialStartPosition, endPosition);
		builder.addTrackedEditOperation(replaceRange, this._text);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;
		return Selection.fromPositions(srcRange.getEndPosition());
	}
}

export class ReplaceCommandThatSelectsText implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;

	constructor(range: Range, text: string) {
		this._range = range;
		this._text = text;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;
		return Selection.fromRange(srcRange, SelectionDirection.LTR);
	}
}

export class ReplaceCommandWithoutChangingPosition implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	public readonly insertsAutoWhitespace: boolean;

	constructor(range: Range, text: string, insertsAutoWhitespace: boolean = false) {
		this._range = range;
		this._text = text;
		this.insertsAutoWhitespace = insertsAutoWhitespace;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;
		return Selection.fromPositions(srcRange.getStartPosition());
	}
}

export class ReplaceCommandWithOffsetCursorState implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	private readonly _columnDeltaOffset: number;
	private readonly _lineNumberDeltaOffset: number;
	public readonly insertsAutoWhitespace: boolean;

	constructor(range: Range, text: string, lineNumberDeltaOffset: number, columnDeltaOffset: number, insertsAutoWhitespace: boolean = false) {
		this._range = range;
		this._text = text;
		this._columnDeltaOffset = columnDeltaOffset;
		this._lineNumberDeltaOffset = lineNumberDeltaOffset;
		this.insertsAutoWhitespace = insertsAutoWhitespace;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;
		return Selection.fromPositions(srcRange.getEndPosition().delta(this._lineNumberDeltaOffset, this._columnDeltaOffset));
	}
}

export class ReplaceOvertypeCommandInComposition implements ICommand {

	private readonly _range: Range;

	constructor(range: Range) {
		this._range = range;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const text = model.getValueInRange(this._range);
		const initialEndPosition = this._range.getEndPosition();
		const initialEndLineNumber = initialEndPosition.lineNumber;
		let endPosition = addPositiveDeltaToModelPosition(model, initialEndPosition, text.length);
		if (endPosition.lineNumber > initialEndLineNumber) {
			endPosition = new Position(initialEndLineNumber, model.getLineMaxColumn(initialEndLineNumber));
		}
		const replaceRange = Range.fromPositions(initialEndPosition, endPosition);
		builder.addTrackedEditOperation(replaceRange, '');
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const srcRange = inverseEditOperations[0].range;
		return Selection.fromPositions(srcRange.getEndPosition());
	}
}

export class ReplaceCommandThatPreservesSelection implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	private readonly _initialSelection: Selection;
	private readonly _forceMoveMarkers: boolean;
	private _selectionId: string | null;

	constructor(editRange: Range, text: string, initialSelection: Selection, forceMoveMarkers: boolean = false) {
		this._range = editRange;
		this._text = text;
		this._initialSelection = initialSelection;
		this._forceMoveMarkers = forceMoveMarkers;
		this._selectionId = null;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text, this._forceMoveMarkers);
		this._selectionId = builder.trackSelection(this._initialSelection);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId!);
	}
}

function addPositiveDeltaToModelPosition(model: ITextModel, position: Position, delta: number): Position {
	if (delta < 0) {
		throw new Error('Unexpected negative delta');
	}
	const lineCount = model.getLineCount();
	let endPosition: Position | undefined;
	for (let potentialEndLineNumber = position.lineNumber; potentialEndLineNumber <= lineCount; potentialEndLineNumber++) {
		if (potentialEndLineNumber === position.lineNumber) {
			const futureDelta = delta - model.getLineMaxColumn(position.lineNumber) - position.column;
			if (futureDelta <= 0) {
				endPosition = new Position(position.lineNumber, position.column + delta);
				break;
			}
			delta = futureDelta;
		} else {
			const futureDelta = delta - model.getLineMaxColumn(potentialEndLineNumber);
			if (futureDelta <= 0) {
				endPosition = new Position(potentialEndLineNumber, delta);
				break;
			}
			delta = futureDelta;
		}
	}
	return endPosition ?? new Position(lineCount, model.getLineMaxColumn(lineCount));
}

function previousModelPosition(model: ITextModel, position: Position): Position {
	let previousPosition: Position;
	if (position.column > 1) {
		previousPosition = new Position(position.lineNumber, position.column - 1);
	} else {
		if (position.lineNumber > 1) {
			previousPosition = new Position(position.lineNumber - 1, model.getLineMaxColumn(position.lineNumber - 1));
		} else {
			previousPosition = new Position(1, 1);
		}
	}
	return previousPosition;
}
