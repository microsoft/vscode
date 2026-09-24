/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CursorColumns } from '../core/cursorColumns.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../editorCommon.js';
import { ITextModel } from '../model.js';
import { ReplaceCommand, ReplaceOvertypeCommand } from './replaceCommand.js';

export class ColumnSelectionPasteCommand implements ICommand {

	private _lastEmptyRowSelectionId: string | undefined;

	constructor(
		private readonly _selection: Selection,
		private readonly _text: readonly string[],
		private readonly _tabSize: number,
		private readonly _overtype: boolean
	) { }

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const selection = this._selection;
		const visibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(selection.startLineNumber), selection.startColumn, this._tabSize);
		const isMultilineSelection = selection.startLineNumber !== selection.endLineNumber;
		const lineCount = model.getLineCount();
		const ChosenReplaceCommand = this._overtype ? ReplaceOvertypeCommand : ReplaceCommand;

		for (let i = 0; i < this._text.length; i++) {
			const lineNumber = selection.startLineNumber + i;
			if (lineNumber > lineCount) {
				const endColumn = model.getLineMaxColumn(lineCount);
				builder.addTrackedEditOperation(new Range(lineCount, endColumn, lineCount, endColumn), '\n' + this._text.slice(i).join('\n'));
				break;
			}

			let range: Range;
			if (isMultilineSelection) {
				range = new Range(
					lineNumber, i === 0 ? selection.startColumn : 1,
					lineNumber, lineNumber === selection.endLineNumber ? selection.endColumn : model.getLineMaxColumn(lineNumber)
				);
			} else if (i === 0) {
				range = selection;
			} else {
				const column = CursorColumns.columnFromVisibleColumn(model.getLineContent(lineNumber), visibleColumn, this._tabSize);
				range = new Range(lineNumber, column, lineNumber, column);
			}
			if (i === this._text.length - 1 && this._text[i].length === 0 && range.isEmpty()) {
				this._lastEmptyRowSelectionId = builder.trackSelection(Selection.fromPositions(range.getStartPosition()));
			}
			new ChosenReplaceCommand(range, this._text[i]).getEditOperations(model, builder);
		}
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		if (this._lastEmptyRowSelectionId !== undefined) {
			return helper.getTrackedSelection(this._lastEmptyRowSelectionId);
		}
		const operations = helper.getInverseEditOperations();
		return Selection.fromPositions(operations[operations.length - 1].range.getEndPosition());
	}
}
