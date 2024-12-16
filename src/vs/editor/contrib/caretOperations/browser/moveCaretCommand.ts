/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';

export class MoveCaretCommand implements ICommand {

	private readonly _selection: Selection;
	private readonly _isMovingLeft: boolean;

	constructor(selection: Selection, isMovingLeft: boolean) {
		this._selection = selection;
		this._isMovingLeft = isMovingLeft;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		if (this._selection.startLineNumber !== this._selection.endLineNumber || this._selection.isEmpty()) {
			return;
		}
		const lineNumber = this._selection.startLineNumber;
		const startColumn = this._selection.startColumn;
		const endColumn = this._selection.endColumn;
		if (this._isMovingLeft && startColumn === 1) {
			return;
		}
		if (!this._isMovingLeft && endColumn === model.getLineMaxColumn(lineNumber)) {
			return;
		}

		if (this._isMovingLeft) {
			const rangeBefore = new Range(lineNumber, startColumn - 1, lineNumber, startColumn);
			const charBefore = model.getValueInRange(rangeBefore);
			builder.addEditOperation(rangeBefore, null);
			builder.addEditOperation(new Range(lineNumber, endColumn, lineNumber, endColumn), charBefore);
		} else {
			const rangeAfter = new Range(lineNumber, endColumn, lineNumber, endColumn + 1);
			const charAfter = model.getValueInRange(rangeAfter);
			builder.addEditOperation(rangeAfter, null);
			builder.addEditOperation(new Range(lineNumber, startColumn, lineNumber, startColumn), charAfter);
		}
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		if (this._isMovingLeft) {
			return new Selection(this._selection.startLineNumber, this._selection.startColumn - 1, this._selection.endLineNumber, this._selection.endColumn - 1);
		} else {
			return new Selection(this._selection.startLineNumber, this._selection.startColumn + 1, this._selection.endLineNumber, this._selection.endColumn + 1);
		}
	}
}
