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

	constructor(
		private readonly _selection: Selection,
		private readonly _text: readonly string[],
		private readonly _tabSize: number,
		private readonly _overtype: boolean
	) { }

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const visibleColumn = CursorColumns.visibleColumnFromColumn(model.getLineContent(this._selection.startLineNumber), this._selection.startColumn, this._tabSize);
		const text = this._padTextToBlockWidth(visibleColumn);
		const lineCount = model.getLineCount();
		const ChosenReplaceCommand = this._overtype ? ReplaceOvertypeCommand : ReplaceCommand;

		for (let i = 0; i < text.length; i++) {
			const lineNumber = this._selection.endLineNumber + i;
			if (lineNumber > lineCount) {
				const endColumn = model.getLineMaxColumn(lineCount);
				const padding = ' '.repeat(visibleColumn);
				const appendedText = '\n' + padding + text.slice(i).join('\n' + padding);
				builder.addTrackedEditOperation(new Range(lineCount, endColumn, lineCount, endColumn), appendedText);
				break;
			}

			let range: Range;
			let lineText = text[i];
			if (i === 0) {
				range = this._selection;
			} else {
				const lineContent = model.getLineContent(lineNumber);
				const column = CursorColumns.columnFromVisibleColumn(lineContent, visibleColumn, this._tabSize);
				range = new Range(lineNumber, column, lineNumber, column);
				if (column === model.getLineMaxColumn(lineNumber)) {
					const endVisibleColumn = CursorColumns.visibleColumnFromColumn(lineContent, column, this._tabSize);
					lineText = ' '.repeat(Math.max(0, visibleColumn - endVisibleColumn)) + lineText;
				}
			}
			new ChosenReplaceCommand(range, lineText).getEditOperations(model, builder);
		}
	}

	private _padTextToBlockWidth(visibleColumn: number): string[] {
		const prefix = ' '.repeat(visibleColumn);
		const endVisibleColumns: number[] = [];
		let blockEndVisibleColumn = visibleColumn;

		for (const text of this._text) {
			const textWithPrefix = prefix + text;
			const endVisibleColumn = CursorColumns.visibleColumnFromColumn(textWithPrefix, textWithPrefix.length + 1, this._tabSize);
			endVisibleColumns.push(endVisibleColumn);
			blockEndVisibleColumn = Math.max(blockEndVisibleColumn, endVisibleColumn);
		}

		return this._text.map((text, index) => text + ' '.repeat(blockEndVisibleColumn - endVisibleColumns[index]));
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const operations = helper.getInverseEditOperations();
		return Selection.fromPositions(operations[operations.length - 1].range.getEndPosition());
	}
}
