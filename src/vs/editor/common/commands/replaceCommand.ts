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
		const startPosition = this._range.getStartPosition();
		const endPosition = this._range.getEndPosition();
		const rangeEndOffset = model.getOffsetAt(endPosition);
		const endOffset = rangeEndOffset + this._text.length + (this._range.isEmpty() ? 0 : - 1);
		const endOfLine = model.getEndOfLineSequence() === EndOfLineSequence.CRLF ? '\r\n' : '\n';
		const lastCharacterRange = Range.fromPositions(model.getPositionAt(endOffset - 1), model.getPositionAt(endOffset));
		const lastCharacter = model.getValueInRange(lastCharacterRange);
		const newEndOffset = lastCharacter === endOfLine ? endOffset - 1 : endOffset;
		const replaceRange = Range.fromPositions(startPosition, model.getPositionAt(newEndOffset));
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
		const startPosition = this._range.getStartPosition();
		const endPosition = this._range.getEndPosition();
		const endLineNumber = endPosition.lineNumber;
		const potentialEndOffset = model.getOffsetAt(endPosition) + this._text.length + (this._range.isEmpty() ? 0 : - 1);
		const potentialEndPosition = model.getPositionAt(potentialEndOffset);
		let newEndPosition: Position;
		if (potentialEndPosition.lineNumber > endLineNumber) {
			newEndPosition = new Position(endLineNumber, model.getLineMaxColumn(endLineNumber));
		} else {
			newEndPosition = potentialEndPosition;
		}
		const replaceRange = Range.fromPositions(startPosition, newEndPosition);
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
		const startPosition = this._range.getStartPosition();
		const endOffset = model.getOffsetAt(startPosition) + 2 * text.length;
		let endPosition = model.getPositionAt(endOffset);
		if (endPosition.lineNumber > this._range.endLineNumber) {
			endPosition = new Position(this._range.endLineNumber, model.getLineMaxColumn(this._range.endLineNumber));
		}
		const replaceRange = Range.fromPositions(startPosition, endPosition);
		builder.addTrackedEditOperation(replaceRange, text);
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
