/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';

export class ReplaceCommand implements editorCommon.ICommand {

	private _range: Range;
	private _text: string;

	constructor(range: Range, text: string) {
		this._range = range;
		this._text = text;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
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

export class ReplaceCommandWithoutChangingPosition implements editorCommon.ICommand {

	private _range: Range;
	private _text: string;

	constructor(range: Range, text: string) {
		this._range = range;
		this._text = text;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
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

export class ReplaceCommandWithOffsetCursorState implements editorCommon.ICommand {

	private _range: Range;
	private _text: string;
	private _columnDeltaOffset: number;
	private _lineNumberDeltaOffset: number;

	constructor(range: Range, text: string, lineNumberDeltaOffset: number, columnDeltaOffset: number) {
		this._range = range;
		this._text = text;
		this._columnDeltaOffset = columnDeltaOffset;
		this._lineNumberDeltaOffset = lineNumberDeltaOffset;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
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

export class ReplaceCommandThatPreservesSelection implements editorCommon.ICommand {

	private _range: Range;
	private _text: string;
	private _initialSelection: Selection;
	private _selectionId: string;

	constructor(editRange: Range, text: string, initialSelection: Selection) {
		this._range = editRange;
		this._text = text;
		this._initialSelection = initialSelection;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addEditOperation(this._range, this._text);
		this._selectionId = builder.trackSelection(this._initialSelection);
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId);
	}
}
