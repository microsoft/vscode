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
	private copy: boolean;

	constructor(selection: Selection, targetPosition: Position, copy: boolean) {
		this.selection = selection;
		this.targetPosition = targetPosition;
		this.copy = copy;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		let text = model.getValueInRange(this.selection);
		if (!this.copy) {
			builder.addEditOperation(this.selection, null);
		}
		builder.addEditOperation(new Range(this.targetPosition.lineNumber, this.targetPosition.column, this.targetPosition.lineNumber, this.targetPosition.column), text);

		if (this.selection.containsPosition(this.targetPosition)) {
			this.targetSelection = this.selection;
			return;
		}

		if (this.copy) {
			this.targetSelection = new Selection(
				this.targetPosition.lineNumber,
				this.targetPosition.column,
				this.selection.endLineNumber - this.selection.startLineNumber + this.targetPosition.lineNumber,
				this.selection.startLineNumber === this.selection.endLineNumber ?
					this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
					this.selection.endColumn
			);
			return;
		}

		if (this.targetPosition.lineNumber > this.selection.endLineNumber) {
			// Drag the selection downwards
			this.targetSelection = new Selection(
				this.targetPosition.lineNumber - this.selection.endLineNumber + this.selection.startLineNumber,
				this.targetPosition.column,
				this.targetPosition.lineNumber,
				this.selection.startLineNumber === this.selection.endLineNumber ?
					this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
					this.selection.endColumn
			);
			return;
		}

		if (this.targetPosition.lineNumber < this.selection.endLineNumber) {
			// Drag the selection upwards
			this.targetSelection = new Selection(
				this.targetPosition.lineNumber,
				this.targetPosition.column,
				this.targetPosition.lineNumber + this.selection.endLineNumber - this.selection.startLineNumber,
				this.selection.startLineNumber === this.selection.endLineNumber ?
					this.targetPosition.column + this.selection.endColumn - this.selection.startColumn :
					this.selection.endColumn
			);
			return;
		}

		// The target position is at the same line as the selection's end position.
		if (this.selection.endColumn <= this.targetPosition.column) {
			// The target position is after the selection's end position
			this.targetSelection = new Selection(
				this.targetPosition.lineNumber - this.selection.endLineNumber + this.selection.startLineNumber,
				this.selection.startLineNumber === this.selection.endLineNumber ?
					this.targetPosition.column - this.selection.endColumn + this.selection.startColumn :
					this.targetPosition.column - this.selection.endColumn + this.selection.startColumn,
				this.targetPosition.lineNumber,
				this.selection.startLineNumber === this.selection.endLineNumber ?
					this.targetPosition.column :
					this.selection.endColumn
			);
		} else {
			// The target position is before the selection's end postion. Since the selection doesn't contain the target position, the selection is one-line and target position is before this selection.
			this.targetSelection = new Selection(
				this.targetPosition.lineNumber - this.selection.endLineNumber + this.selection.startLineNumber,
				this.targetPosition.column,
				this.targetPosition.lineNumber,
				this.targetPosition.column + this.selection.endColumn - this.selection.startColumn
			);
		}
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
		return this.targetSelection;
	}
}