/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';

export class DeleteLinesCommand implements ICommand {

	private startLineNumber: number;
	private endLineNumber: number;
	private restoreCursorToColumn: number;

	constructor(startLineNumber: number, endLineNumber: number, restoreCursorToColumn: number) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.restoreCursorToColumn = restoreCursorToColumn;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
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

		builder.addTrackedEditOperation(new Range(startLineNumber, startColumn, endLineNumber, endColumn), null);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[0].range;
		return new Selection(
			srcRange.endLineNumber,
			this.restoreCursorToColumn,
			srcRange.endLineNumber,
			this.restoreCursorToColumn
		);
	}
}
