/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';
import { SingleCursorState, CursorColumns, CursorConfiguration, ICursorSimpleModel, EditOperationResult, CommandResult } from 'vs/editor/common/controller/cursorCommon';
import { Range } from 'vs/editor/common/core/range';
import { MoveOperations } from 'vs/editor/common/controller/cursorMoveOperations';
import * as strings from 'vs/base/common/strings';

export class DeleteOperations {

	public static deleteRight(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		let shouldPushStackElementBefore = false;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];

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
				commands[i] = null;
				continue;
			}

			if (deleteSelection.startLineNumber !== deleteSelection.endLineNumber) {
				shouldPushStackElementBefore = true;
			}

			commands[i] = new CommandResult(new ReplaceCommand(deleteSelection, ''), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: shouldPushStackElementBefore,
			shouldPushStackElementAfter: false
		});
	}

	private static _isAutoClosingPairDelete(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[]): boolean {
		if (!config.autoClosingBrackets) {
			return false;
		}

		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const selection = cursor.selection;
			const position = cursor.position;

			if (!selection.isEmpty()) {
				return false;
			}

			const lineText = model.getLineContent(position.lineNumber);
			const character = lineText[position.column - 2];

			if (!config.autoClosingPairsOpen.hasOwnProperty(character)) {
				return false;
			}

			const afterCharacter = lineText[position.column - 1];
			const closeCharacter = config.autoClosingPairsOpen[character];

			if (afterCharacter !== closeCharacter) {
				return false;
			}
		}

		return true;
	}

	private static _runAutoClosingPairDelete(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const position = cursor.position;
			const deleteSelection = new Range(
				position.lineNumber,
				position.column - 1,
				position.lineNumber,
				position.column + 1
			);
			commands[i] = new CommandResult(new ReplaceCommand(deleteSelection, ''), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: false
		});
	}

	public static deleteLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[]): EditOperationResult {

		if (this._isAutoClosingPairDelete(config, model, cursors)) {
			return this._runAutoClosingPairDelete(config, model, cursors);
		}

		let commands: CommandResult[] = [];
		let shouldPushStackElementBefore = false;
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];

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
				commands[i] = null;
				continue;
			}

			if (deleteSelection.startLineNumber !== deleteSelection.endLineNumber) {
				shouldPushStackElementBefore = true;
			}

			commands[i] = new CommandResult(new ReplaceCommand(deleteSelection, ''), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: shouldPushStackElementBefore,
			shouldPushStackElementAfter: false
		});
	}

	public static cut(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[], enableEmptySelectionClipboard: boolean): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
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
						commands[i] = new CommandResult(new ReplaceCommand(deleteSelection, ''), false);
					} else {
						commands[i] = null;
					}
				} else {
					// Cannot cut empty selection
					commands[i] = null;
				}
			} else {
				commands[i] = new CommandResult(new ReplaceCommand(selection, ''), false);
			}
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

}