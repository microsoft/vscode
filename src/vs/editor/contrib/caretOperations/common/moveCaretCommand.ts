/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder, ITokenizedModel } from 'vs/editor/common/editorCommon';

export class MoveCaretCommand implements ICommand {

	private _selection: Selection;
	private _isMovingLeft: boolean;

	private _cutStartIndex: number;
	private _cutEndIndex: number;
	private _moved: boolean;

	private _selectionId: string;

	constructor(selection: Selection, isMovingLeft: boolean) {
		this._selection = selection;
		this._isMovingLeft = isMovingLeft;
	}

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
		var s = this._selection;
		this._selectionId = builder.trackSelection(s);
		if (s.startLineNumber !== s.endLineNumber) {
			return;
		}
		if (this._isMovingLeft && s.startColumn === 0) {
			return;
		} else if (!this._isMovingLeft && s.endColumn === model.getLineMaxColumn(s.startLineNumber)) {
			return;
		}

		var lineNumber = s.selectionStartLineNumber;
		var lineContent = model.getLineContent(lineNumber);

		var left;
		var middle;
		var right;

		if (this._isMovingLeft) {
			left = lineContent.substring(0, s.startColumn - 2);
			middle = lineContent.substring(s.startColumn - 1, s.endColumn - 1);
			right = lineContent.substring(s.startColumn - 2, s.startColumn - 1) + lineContent.substring(s.endColumn - 1);
		} else {
			left = lineContent.substring(0, s.startColumn - 1) + lineContent.substring(s.endColumn - 1, s.endColumn);
			middle = lineContent.substring(s.startColumn - 1, s.endColumn - 1);
			right = lineContent.substring(s.endColumn);
		}

		var newLineContent = left + middle + right;

		builder.addEditOperation(new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)), null);
		builder.addEditOperation(new Range(lineNumber, 1, lineNumber, 1), newLineContent);

		this._cutStartIndex = s.startColumn + (this._isMovingLeft ? -1 : 1);
		this._cutEndIndex = this._cutStartIndex + s.endColumn - s.startColumn;
		this._moved = true;
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		var result = helper.getTrackedSelection(this._selectionId);
		if (this._moved) {
			result = result.setStartPosition(result.startLineNumber, this._cutStartIndex);
			result = result.setEndPosition(result.startLineNumber, this._cutEndIndex);
		}
		return result;
	}
}
