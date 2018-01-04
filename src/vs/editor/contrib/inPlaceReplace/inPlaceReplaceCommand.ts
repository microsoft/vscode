/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';

export class InPlaceReplaceCommand implements editorCommon.ICommand {

	private _editRange: Range;
	private _originalSelection: Selection;
	private _text: string;

	constructor(editRange: Range, originalSelection: Selection, text: string) {
		this._editRange = editRange;
		this._originalSelection = originalSelection;
		this._text = text;
	}

	public getEditOperations(model: ITextModel, builder: editorCommon.IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._editRange, this._text);
	}

	public computeCursorState(model: ITextModel, helper: editorCommon.ICursorStateComputerData): Selection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[0].range;

		if (!this._originalSelection.isEmpty()) {
			// Preserve selection and extends to typed text
			return new Selection(
				srcRange.endLineNumber,
				srcRange.endColumn - this._text.length,
				srcRange.endLineNumber,
				srcRange.endColumn
			);
		}

		return new Selection(
			srcRange.endLineNumber,
			Math.min(this._originalSelection.positionColumn, srcRange.endColumn),
			srcRange.endLineNumber,
			Math.min(this._originalSelection.positionColumn, srcRange.endColumn)
		);
	}
}
