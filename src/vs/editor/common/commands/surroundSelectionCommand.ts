/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import EditorCommon = require('vs/editor/common/editorCommon');

export class SurroundSelectionCommand implements EditorCommon.ICommand {
	private _range: EditorCommon.IEditorSelection;
	private _charBeforeSelection: string;
	private _charAfterSelection: string;

	constructor(range:EditorCommon.IEditorSelection, charBeforeSelection:string, charAfterSelection:string) {
		this._range = range;
		this._charBeforeSelection = charBeforeSelection;
		this._charAfterSelection = charAfterSelection;
	}

	public getEditOperations(model:EditorCommon.ITokenizedModel, builder:EditorCommon.IEditOperationBuilder): void {
		builder.addEditOperation(new Range(
			this._range.startLineNumber,
			this._range.startColumn,
			this._range.startLineNumber,
			this._range.startColumn
		), this._charBeforeSelection);

		builder.addEditOperation(new Range(
			this._range.endLineNumber,
			this._range.endColumn,
			this._range.endLineNumber,
			this._range.endColumn
		), this._charAfterSelection);
	}

	public computeCursorState(model: EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var firstOperationRange = inverseEditOperations[0].range;
		var secondOperationRange = inverseEditOperations[1].range;

		return new Selection(
			firstOperationRange.endLineNumber,
			firstOperationRange.endColumn,
			secondOperationRange.endLineNumber,
			secondOperationRange.endColumn - this._charAfterSelection.length
		);
	}
}
