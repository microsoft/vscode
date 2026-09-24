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
				const padding = ' '.repeat(visibleColumn);
				const text = '\n' + padding + this._text.slice(i).join('\n' + padding);
				builder.addTrackedEditOperation(new Range(lineCount, endColumn, lineCount, endColumn), text);
				break;
			}

			let range: Range;
			let text = this._text[i];
			if (isMultilineSelection) {
				range = new Range(
					lineNumber, i === 0 ? selection.startColumn : 1,
					lineNumber, lineNumber === selection.endLineNumber ? selection.endColumn : model.getLineMaxColumn(lineNumber)
				);
			} else if (i === 0) {
				range = selection;
			} else {
				const lineContent = model.getLineContent(lineNumber);
				const column = CursorColumns.columnFromVisibleColumn(lineContent, visibleColumn, this._tabSize);
				range = new Range(lineNumber, column, lineNumber, column);
				if (column === lineContent.length + 1) {
					const endVisibleColumn = CursorColumns.visibleColumnFromColumn(lineContent, column, this._tabSize);
					text = ' '.repeat(Math.max(0, visibleColumn - endVisibleColumn)) + text;
				}
			}
			if (i === this._text.length - 1 && text.length === 0 && range.isEmpty()) {
				this._lastEmptyRowSelectionId = builder.trackSelection(Selection.fromPositions(range.getStartPosition()));
			}
			new ChosenReplaceCommand(range, text).getEditOperations(model, builder);
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
