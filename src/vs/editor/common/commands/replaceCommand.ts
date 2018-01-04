/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';

export class ReplaceCommand implements editorCommon.ICommand {

	private readonly _range: Range;
	private readonly _text: string;
	public readonly insertsAutoWhitespace: boolean;

	constructor(range: Range, text: string, insertsAutoWhitespace: boolean = false) {
		this._range = range;
		this._text = text;
		this.insertsAutoWhitespace = insertsAutoWhitespace;
	}

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
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

	private readonly _range: Range;
	private readonly _text: string;
	public readonly insertsAutoWhitespace: boolean;

	constructor(range: Range, text: string, insertsAutoWhitespace: boolean = false) {
		this._range = range;
		this._text = text;
		this.insertsAutoWhitespace = insertsAutoWhitespace;
	}

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
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

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._range, this._text);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
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

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addEditOperation(this._range, this._text);
		this._selectionId = builder.trackSelection(this._initialSelection);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId);
	}
}
