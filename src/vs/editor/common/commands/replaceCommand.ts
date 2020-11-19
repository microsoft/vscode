/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';

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
		let inverseEditOperations = helper.getInverseEditOperations();
		let srcRange = inverseEditOperations[0].range;
		return new Selection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
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
		return new Selection(srcRange.startLineNumber, srcRange.startColumn, srcRange.endLineNumber, srcRange.endColumn);
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
		let inverseEditOperations = helper.getInverseEditOperations();
		let srcRange = inverseEditOperations[0].range;
		return new Selection(
			srcRange.startLineNumber,
			srcRange.startColumn,
			srcRange.startLineNumber,
			srcRange.startColumn
		);
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
		let inverseEditOperations = helper.getInverseEditOperations();
		let srcRange = inverseEditOperations[0].range;
		return new Selection(
			srcRange.endLineNumber + this._lineNumberDeltaOffset,
			srcRange.endColumn + this._columnDeltaOffset,
			srcRange.endLineNumber + this._lineNumberDeltaOffset,
			srcRange.endColumn + this._columnDeltaOffset
		);
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

export class ReplaceCommandThatModifiesSelection implements ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	private readonly _initialSelection: Selection;
	private readonly _initialText: string;
	private readonly _forceMoveMarkers: boolean;

	constructor(editRange: Range, text: string, initialSelection: Selection, initialText: string, forceMoveMarkers: boolean = false) {
		this._range = editRange;
		this._text = text;
		this._initialSelection = initialSelection;
		this._initialText = initialText;
		this._forceMoveMarkers = forceMoveMarkers;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text, this._forceMoveMarkers);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		let start = 0;
		let end = 0;
		let modifiedLines = this._text.split('\n');
		let initialLines = this._initialText.split('\n');

		if (this._initialSelection.selectionStartLineNumber < this._initialSelection.positionLineNumber ||
			(this._initialSelection.selectionStartLineNumber === this._initialSelection.positionLineNumber &&
				this._initialSelection.selectionStartColumn < this._initialSelection.positionColumn)) {
			start = this._initialSelection.selectionStartColumn;
			end = this._initialSelection.positionColumn + (modifiedLines[modifiedLines.length - 1].length - initialLines[initialLines.length - 1].length);
		} else if (this._initialSelection.selectionStartLineNumber > this._initialSelection.positionLineNumber ||
			(this._initialSelection.selectionStartLineNumber === this._initialSelection.positionLineNumber &&
				this._initialSelection.selectionStartColumn > this._initialSelection.positionColumn)) {
			end = this._initialSelection.positionColumn;
			start = this._initialSelection.selectionStartColumn + (modifiedLines[modifiedLines.length - 1].length - initialLines[initialLines.length - 1].length);
		} else {
			start = this._initialSelection.selectionStartColumn;
			end = this._initialSelection.positionColumn;
		}

		return new Selection(this._initialSelection.selectionStartLineNumber, start, this._initialSelection.positionLineNumber, end);
	}
}
