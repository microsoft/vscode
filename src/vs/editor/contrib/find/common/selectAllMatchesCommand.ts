/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Selection} from 'vs/editor/common/core/selection';
import {ISelection} from 'vs/editor/common/editorCommon';
import * as editorCommon from 'vs/editor/common/editorCommon';

export class SelectAllMatchesCommand implements editorCommon.ICommand {

	private _editor:editorCommon.ICommonCodeEditor;
	private _ranges: editorCommon.IEditorRange[];

	constructor(editor:editorCommon.ICommonCodeEditor, ranges: editorCommon.IEditorRange[]) {
		this._editor = editor;
		this._ranges = ranges;
	}

	public getEditOperations(model:editorCommon.ITokenizedModel, builder:editorCommon.IEditOperationBuilder): void {
		if (this._ranges.length > 0) {
			// Collect all select operations
			let newSelections = new Array<ISelection>();
			for (var i = 0; i < this._ranges.length; i++) {
				newSelections.push({
						selectionStartLineNumber: this._ranges[i].startLineNumber,
						selectionStartColumn: this._ranges[i].startColumn,
						positionLineNumber: this._ranges[i].startLineNumber,
						positionColumn: this._ranges[i].endColumn
				});
			}

			this._editor.setSelections(newSelections);
		}
	}

	public computeCursorState(model:editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): editorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[inverseEditOperations.length - 1].range;
		return Selection.createSelection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
	}
}