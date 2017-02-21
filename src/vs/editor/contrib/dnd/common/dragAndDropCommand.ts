/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';


export class DragAndDropCommand implements editorCommon.ICommand {

	private selection: Selection;
	private targetPosition: Position;
	private targetSelection: Selection;

	constructor(selection: Selection, targetPosition: Position) {
		this.selection = selection;
		this.targetPosition = targetPosition;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		let text = model.getValueInRange(this.selection);
		builder.addEditOperation(this.selection, null);
		builder.addEditOperation(new Range(this.targetPosition.lineNumber, this.targetPosition.column, this.targetPosition.lineNumber, this.targetPosition.column), text);

		if (this.targetPosition.lineNumber >= this.selection.endLineNumber) {
			this.targetSelection = new Selection(
				this.targetPosition.lineNumber - this.selection.endLineNumber + this.selection.startLineNumber,
				this.targetPosition.column,
				this.targetPosition.lineNumber,
				this.selection.startLineNumber === this.selection.endLineNumber ?
					this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
					this.selection.endColumn
			);
		} else {
			this.targetSelection = new Selection(
				this.targetPosition.lineNumber,
				this.targetPosition.column,
				this.targetPosition.lineNumber + this.selection.endLineNumber - this.selection.startLineNumber,
				this.selection.startLineNumber === this.selection.endLineNumber ?
					this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
					this.selection.endColumn
			);
		}
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
		return this.targetSelection;
	}
}