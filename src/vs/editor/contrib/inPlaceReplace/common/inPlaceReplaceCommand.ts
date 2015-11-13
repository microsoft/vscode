/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {Selection} from 'vs/editor/common/core/selection';

export class InPlaceReplaceCommand implements EditorCommon.ICommand {

	private _editRange: EditorCommon.IEditorRange;
	private _originalSelection: EditorCommon.IEditorSelection;
	private _text:string;

	constructor(editRange: EditorCommon.IEditorRange, originalSelection: EditorCommon.IEditorSelection, text:string) {
		this._editRange = editRange;
		this._originalSelection = originalSelection;
		this._text = text;
	}

	public getEditOperations(model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder):void {
		builder.addEditOperation(this._editRange, this._text);
	}

	public computeCursorState(model:EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData):EditorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[0].range;

		if (!this._originalSelection.isEmpty()) {
			// Preserve selection and extends to typed text
			return Selection.createSelection(
				srcRange.endLineNumber,
				srcRange.endColumn - this._text.length,
				srcRange.endLineNumber,
				srcRange.endColumn
			);
		}

		return Selection.createSelection(
			srcRange.endLineNumber,
			Math.min(this._originalSelection.positionColumn, srcRange.endColumn),
			srcRange.endLineNumber,
			Math.min(this._originalSelection.positionColumn, srcRange.endColumn)
		);
	}
}
