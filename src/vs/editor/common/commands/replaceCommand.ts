/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';

export class ReplaceCommand implements editorCommon.ICommand {

	private _range: editorCommon.IEditorRange;
	private _text: string;

	constructor(range: editorCommon.IEditorRange, text: string) {
		this._range = range;
		this._text = text;
	}

	public getText():string {
		return this._text;
	}

	public getRange():editorCommon.IEditorRange {
		return this._range;
	}

	public setRange(newRange:editorCommon.IEditorRange): void {
		this._range = newRange;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addEditOperation(this._range, this._text);
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): editorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[0].range;
		return new Selection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
	}
}

export class ReplaceCommandWithoutChangingPosition extends ReplaceCommand {

	constructor(range: editorCommon.IEditorRange, text: string) {
		super(range, text);
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): editorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[0].range;
		return new Selection(
			srcRange.startLineNumber,
			srcRange.startColumn,
			srcRange.startLineNumber,
			srcRange.startColumn
		);
	}
}

export class ReplaceCommandWithOffsetCursorState extends ReplaceCommand {

	private _columnDeltaOffset: number;
	private _lineNumberDeltaOffset: number;

	constructor(range: editorCommon.IEditorRange, text: string, lineNumberDeltaOffset: number, columnDeltaOffset: number) {
		super(range, text);
		this._columnDeltaOffset = columnDeltaOffset;
		this._lineNumberDeltaOffset = lineNumberDeltaOffset;
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): editorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[0].range;
		return new Selection(
			srcRange.endLineNumber + this._lineNumberDeltaOffset,
			srcRange.endColumn + this._columnDeltaOffset,
			srcRange.endLineNumber + this._lineNumberDeltaOffset,
			srcRange.endColumn + this._columnDeltaOffset
		);
	}
}

export class ReplaceCommandThatPreservesSelection extends ReplaceCommand {

	private _initialSelection: editorCommon.IEditorSelection;
	private _selectionId: string;

	constructor(editRange: editorCommon.IEditorRange, text: string, initialSelection: editorCommon.IEditorSelection) {
		super(editRange, text);
		this._initialSelection = initialSelection;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		super.getEditOperations(model, builder);

		this._selectionId = builder.trackSelection(this._initialSelection);
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): editorCommon.IEditorSelection {
		return helper.getTrackedSelection(this._selectionId);
	}
}
