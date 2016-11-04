/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';
import { CursorColumns, CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';
import { Range } from 'vs/editor/common/core/range';
import { ICommand, CursorChangeReason } from 'vs/editor/common/editorCommon';
import { MoveOperations } from 'vs/editor/common/controller/cursorMoveOperations';
import { CursorModelState } from 'vs/editor/common/controller/oneCursor';
import * as strings from 'vs/base/common/strings';

export class EditOperationResult {
	_editOperationBrand: void;

	readonly command: ICommand;
	readonly shouldPushStackElementBefore: boolean;
	readonly shouldPushStackElementAfter: boolean;
	readonly isAutoWhitespaceCommand: boolean;
	readonly shouldRevealHorizontal: boolean;
	readonly cursorPositionChangeReason: CursorChangeReason;

	constructor(
		command: ICommand,
		opts?: {
			shouldPushStackElementBefore: boolean;
			shouldPushStackElementAfter: boolean;
			isAutoWhitespaceCommand?: boolean;
			shouldRevealHorizontal?: boolean;
			cursorPositionChangeReason?: CursorChangeReason;
		}
	) {
		this.command = command;
		this.shouldPushStackElementBefore = false;
		this.shouldPushStackElementAfter = false;
		this.isAutoWhitespaceCommand = false;
		this.shouldRevealHorizontal = true;
		this.cursorPositionChangeReason = CursorChangeReason.NotSet;

		if (typeof opts !== 'undefined') {
			if (typeof opts.shouldPushStackElementBefore !== 'undefined') {
				this.shouldPushStackElementBefore = opts.shouldPushStackElementBefore;
			}
			if (typeof opts.shouldPushStackElementAfter !== 'undefined') {
				this.shouldPushStackElementAfter = opts.shouldPushStackElementAfter;
			}
			if (typeof opts.isAutoWhitespaceCommand !== 'undefined') {
				this.isAutoWhitespaceCommand = opts.isAutoWhitespaceCommand;
			}
			if (typeof opts.shouldRevealHorizontal !== 'undefined') {
				this.shouldRevealHorizontal = opts.shouldRevealHorizontal;
			}
			if (typeof opts.cursorPositionChangeReason !== 'undefined') {
				this.cursorPositionChangeReason = opts.cursorPositionChangeReason;
			}
		}
	}
}

export class DeleteOperations {

	public static deleteRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: CursorModelState): EditOperationResult {

		let deleteSelection: Range = cursor.selection;

		if (deleteSelection.isEmpty()) {
			let position = cursor.position;
			let rightOfPosition = MoveOperations.right(config, model, position.lineNumber, position.column);
			deleteSelection = new Range(
				rightOfPosition.lineNumber,
				rightOfPosition.column,
				position.lineNumber,
				position.column
			);
		}

		if (deleteSelection.isEmpty()) {
			// Probably at end of file => ignore
			return null;
		}

		let shouldPushStackElementBefore = false;
		if (deleteSelection.startLineNumber !== deleteSelection.endLineNumber) {
			shouldPushStackElementBefore = true;
		}

		return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), {
			shouldPushStackElementBefore: shouldPushStackElementBefore,
			shouldPushStackElementAfter: false
		});
	}

	public static deleteAllRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: CursorModelState): EditOperationResult {
		let selection = cursor.selection;

		if (selection.isEmpty()) {
			let position = cursor.position;
			let lineNumber = position.lineNumber;
			let column = position.column;
			let maxColumn = model.getLineMaxColumn(lineNumber);

			if (column === maxColumn) {
				// Ignore deleting at end of file
				return null;
			}

			let deleteSelection = new Range(lineNumber, column, lineNumber, maxColumn);
			if (!deleteSelection.isEmpty()) {
				return new EditOperationResult(new ReplaceCommand(deleteSelection, ''));
			}
		}

		return this.deleteRight(config, model, cursor);
	}

	public static autoClosingPairDelete(config: CursorConfiguration, model: ICursorSimpleModel, cursor: CursorModelState): EditOperationResult {
		if (!config.autoClosingBrackets) {
			return null;
		}

		if (!cursor.selection.isEmpty()) {
			return null;
		}

		let position = cursor.position;

		let lineText = model.getLineContent(position.lineNumber);
		let character = lineText[position.column - 2];

		if (!config.autoClosingPairsOpen.hasOwnProperty(character)) {
			return null;
		}

		let afterCharacter = lineText[position.column - 1];
		let closeCharacter = config.autoClosingPairsOpen[character];

		if (afterCharacter !== closeCharacter) {
			return null;
		}

		let deleteSelection = new Range(
			position.lineNumber,
			position.column - 1,
			position.lineNumber,
			position.column + 1
		);

		return new EditOperationResult(new ReplaceCommand(deleteSelection, ''));
	}

	public static deleteLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: CursorModelState): EditOperationResult {
		let r = this.autoClosingPairDelete(config, model, cursor);
		if (r) {
			// This was a case for an auto-closing pair delete
			return r;
		}

		let deleteSelection: Range = cursor.selection;

		if (deleteSelection.isEmpty()) {
			let position = cursor.position;

			if (config.useTabStops && position.column > 1) {
				let lineContent = model.getLineContent(position.lineNumber);

				let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
				let lastIndentationColumn = (
					firstNonWhitespaceIndex === -1
						? /* entire string is whitespace */lineContent.length + 1
						: firstNonWhitespaceIndex + 1
				);

				if (position.column <= lastIndentationColumn) {
					let fromVisibleColumn = CursorColumns.visibleColumnFromColumn2(config, model, position);
					let toVisibleColumn = CursorColumns.prevTabStop(fromVisibleColumn, config.tabSize);
					let toColumn = CursorColumns.columnFromVisibleColumn2(config, model, position.lineNumber, toVisibleColumn);
					deleteSelection = new Range(position.lineNumber, toColumn, position.lineNumber, position.column);
				} else {
					deleteSelection = new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column);
				}
			} else {
				let leftOfPosition = MoveOperations.left(config, model, position.lineNumber, position.column);
				deleteSelection = new Range(
					leftOfPosition.lineNumber,
					leftOfPosition.column,
					position.lineNumber,
					position.column
				);
			}
		}

		if (deleteSelection.isEmpty()) {
			// Probably at beginning of file => ignore
			return null;
		}

		let shouldPushStackElementBefore = false;
		if (deleteSelection.startLineNumber !== deleteSelection.endLineNumber) {
			shouldPushStackElementBefore = true;
		}

		return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), {
			shouldPushStackElementBefore: shouldPushStackElementBefore,
			shouldPushStackElementAfter: false
		});
	}

	public static deleteAllLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: CursorModelState): EditOperationResult {
		let r = this.autoClosingPairDelete(config, model, cursor);
		if (r) {
			// This was a case for an auto-closing pair delete
			return r;
		}

		let selection = cursor.selection;

		if (selection.isEmpty()) {
			let position = cursor.position;
			let lineNumber = position.lineNumber;
			let column = position.column;

			if (column === 1) {
				// Ignore deleting at beginning of line
				return null;
			}

			let deleteSelection = new Range(lineNumber, 1, lineNumber, column);
			if (!deleteSelection.isEmpty()) {
				return new EditOperationResult(new ReplaceCommand(deleteSelection, ''));
			}
		}

		return this.deleteLeft(config, model, cursor);
	}

	public static cut(config: CursorConfiguration, model: ICursorSimpleModel, cursor: CursorModelState, enableEmptySelectionClipboard: boolean): EditOperationResult {
		let selection = cursor.selection;

		if (selection.isEmpty()) {
			if (enableEmptySelectionClipboard) {
				// This is a full line cut

				let position = cursor.position;

				let startLineNumber: number,
					startColumn: number,
					endLineNumber: number,
					endColumn: number;

				if (position.lineNumber < model.getLineCount()) {
					// Cutting a line in the middle of the model
					startLineNumber = position.lineNumber;
					startColumn = 1;
					endLineNumber = position.lineNumber + 1;
					endColumn = 1;
				} else if (position.lineNumber > 1) {
					// Cutting the last line & there are more than 1 lines in the model
					startLineNumber = position.lineNumber - 1;
					startColumn = model.getLineMaxColumn(position.lineNumber - 1);
					endLineNumber = position.lineNumber;
					endColumn = model.getLineMaxColumn(position.lineNumber);
				} else {
					// Cutting the single line that the model contains
					startLineNumber = position.lineNumber;
					startColumn = 1;
					endLineNumber = position.lineNumber;
					endColumn = model.getLineMaxColumn(position.lineNumber);
				}

				let deleteSelection = new Range(
					startLineNumber,
					startColumn,
					endLineNumber,
					endColumn
				);

				if (!deleteSelection.isEmpty()) {
					return new EditOperationResult(new ReplaceCommand(deleteSelection, ''));
				} else {
					return null;
				}
			} else {
				// Cannot cut empty selection
				return null;
			}
		} else {
			// Delete left or right, they will both result in the selection being deleted
			return this.deleteRight(config, model, cursor);
		}
	}

}