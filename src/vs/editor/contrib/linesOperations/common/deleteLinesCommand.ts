/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';


export class DeleteLinesCommand implements EditorCommon.ICommand {

	public static createFromSelection(selection:EditorCommon.IEditorSelection): DeleteLinesCommand {
		var endLineNumber = selection.endLineNumber;
		if (selection.startLineNumber < selection.endLineNumber && selection.endColumn === 1) {
			endLineNumber -= 1;
		}
		return new DeleteLinesCommand(selection.startLineNumber, endLineNumber, selection.positionColumn);
	}

	private startLineNumber:number;
	private endLineNumber:number;
	private restoreCursorToColumn:number;

	constructor(startLineNumber:number, endLineNumber:number, restoreCursorToColumn:number) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.restoreCursorToColumn = restoreCursorToColumn;
	}

	public getEditOperations(model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder):void {
		if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
			// Model is empty
			return;
		}

		var startLineNumber = this.startLineNumber;
		var endLineNumber = this.endLineNumber;

		var startColumn = 1;
		var endColumn = model.getLineMaxColumn(endLineNumber);
		if (endLineNumber < model.getLineCount()) {
			endLineNumber += 1;
			endColumn = 1;
		} else if (startLineNumber > 1) {
			startLineNumber -= 1;
			startColumn = model.getLineMaxColumn(startLineNumber);
		}

		builder.addEditOperation(new Range(startLineNumber, startColumn, endLineNumber, endColumn), null);
	}

	public computeCursorState(model:EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData):EditorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[0].range;
		return Selection.createSelection(
			srcRange.endLineNumber,
			this.restoreCursorToColumn,
			srcRange.endLineNumber,
			this.restoreCursorToColumn
		);
	}
}
