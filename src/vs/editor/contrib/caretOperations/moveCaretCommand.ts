/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';

export class MoveCaretCommand implements ICommand {

	private readonly _selection: Selection;
	private readonly _isMovingLeft: boolean;

	private _cutStartIndex: number;
	private _cutEndIndex: number;
	private _moved: boolean;

	private _selectionId: string | null;

	constructor(selection: Selection, isMovingLeft: boolean) {
		this._selection = selection;
		this._isMovingLeft = isMovingLeft;
		this._cutStartIndex = -1;
		this._cutEndIndex = -1;
		this._moved = false;
		this._selectionId = null;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		let s = this._selection;
		this._selectionId = builder.trackSelection(s);
		if (s.startLineNumber !== s.endLineNumber) {
			return;
		}
		if (this._isMovingLeft && s.startColumn === 0) {
			return;
		} else if (!this._isMovingLeft && s.endColumn === model.getLineMaxColumn(s.startLineNumber)) {
			return;
		}

		let lineNumber = s.selectionStartLineNumber;
		let lineContent = model.getLineContent(lineNumber);

		let left: string;
		let middle: string;
		let right: string;

		if (this._isMovingLeft) {
			left = lineContent.substring(0, s.startColumn - 2);
			middle = lineContent.substring(s.startColumn - 1, s.endColumn - 1);
			right = lineContent.substring(s.startColumn - 2, s.startColumn - 1) + lineContent.substring(s.endColumn - 1);
		} else {
			left = lineContent.substring(0, s.startColumn - 1) + lineContent.substring(s.endColumn - 1, s.endColumn);
			middle = lineContent.substring(s.startColumn - 1, s.endColumn - 1);
			right = lineContent.substring(s.endColumn);
		}

		let newLineContent = left + middle + right;

		builder.addEditOperation(new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)), null);
		builder.addEditOperation(new Range(lineNumber, 1, lineNumber, 1), newLineContent);

		this._cutStartIndex = s.startColumn + (this._isMovingLeft ? -1 : 1);
		this._cutEndIndex = this._cutStartIndex + s.endColumn - s.startColumn;
		this._moved = true;
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		let result = helper.getTrackedSelection(this._selectionId!);
		if (this._moved) {
			result = result.setStartPosition(result.startLineNumber, this._cutStartIndex);
			result = result.setEndPosition(result.startLineNumber, this._cutEndIndex);
		}
		return result;
	}
}
