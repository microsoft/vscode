/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { Selection, SelectionDirection } from '../core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../editorCommon.js';
import { ITextModel } from '../model.js';

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
		const initialStartPosition = this._range.getStartPosition();
		const initialEndPosition = this._range.getEndPosition();
		const initialEndLineNumber = initialEndPosition.lineNumber;
		const offsetDelta = this._text.length + (this._range.isEmpty() ? 0 : -1);
		let endPosition = addPositiveOffsetToModelPosition(model, initialEndPosition, offsetDelta);
		if (endPosition.lineNumber > initialEndLineNumber) {
			endPosition = new Position(initialEndLineNumber, model.getLineMaxColumn(initialEndLineNumber));
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

export class ReplaceOvertypeCommandOnCompositionEnd implements ICommand {

	private readonly _range: Range;

	constructor(range: Range) {
		this._range = range;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const text = model.getValueInRange(this._range);
		const initialEndPosition = this._range.getEndPosition();
		const initialEndLineNumber = initialEndPosition.lineNumber;
		let endPosition = addPositiveOffsetToModelPosition(model, initialEndPosition, text.length);
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

function addPositiveOffsetToModelPosition(model: ITextModel, position: Position, offset: number): Position {
	if (offset < 0) {
		throw new Error('Unexpected negative delta');
	}
	const lineCount = model.getLineCount();
	let endPosition = new Position(lineCount, model.getLineMaxColumn(lineCount));
	for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
		if (lineNumber === position.lineNumber) {
			const futureOffset = offset - model.getLineMaxColumn(position.lineNumber) + position.column;
			if (futureOffset <= 0) {
				endPosition = new Position(position.lineNumber, position.column + offset);
				break;
			}
			offset = futureOffset;
		} else {
			const futureOffset = offset - model.getLineMaxColumn(lineNumber);
			if (futureOffset <= 0) {
				endPosition = new Position(lineNumber, offset);
				break;
			}
			offset = futureOffset;
		}
	}
	return endPosition;
}
