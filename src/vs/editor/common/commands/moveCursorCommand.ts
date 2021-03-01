/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';

export class MoveCursorCommand implements ICommand {

	private readonly _toPosition: Position;

	constructor(toPosition: Position) {
		this._toPosition = toPosition;
	}

	computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return new Selection(this._toPosition.lineNumber, this._toPosition.column, this._toPosition.lineNumber, this._toPosition.column);
	}

	getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		// Have to add fake operation so the computeCursorState will be executed
		const range = Range.fromPositions(this._toPosition, this._toPosition.delta(0, 1));
		const text = model.getValueInRange(range);
		builder.addEditOperation(range, text);
	}
}
