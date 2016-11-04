/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';
import { CursorMoveHelper, CursorMove, CursorMoveConfiguration, ICursorMoveHelperModel } from 'vs/editor/common/controller/cursorMoveHelper';
import { Range } from 'vs/editor/common/core/range';
import { ICommand } from 'vs/editor/common/editorCommon';
import { MoveOperations } from 'vs/editor/common/controller/cursorMoveOperations';
import { CursorModelState } from 'vs/editor/common/controller/oneCursor';
import * as strings from 'vs/base/common/strings';

export class EditOperationResult {
	_editOperationBrand: void;

	readonly command: ICommand;
	readonly shouldPushStackElementBefore: boolean;
	readonly shouldPushStackElementAfter: boolean;
	readonly isAutoWhitespaceCommand: boolean;

	constructor(
		command: ICommand,
		shouldPushStackElementBefore: boolean,
		shouldPushStackElementAfter: boolean,
		isAutoWhitespaceCommand: boolean
	) {
		this.command = command;
		this.shouldPushStackElementBefore = shouldPushStackElementBefore;
		this.shouldPushStackElementAfter = shouldPushStackElementAfter;
		this.isAutoWhitespaceCommand = isAutoWhitespaceCommand;
	}
}

export class DeleteOperations {

	public static deleteRight(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState): EditOperationResult {

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

		return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), shouldPushStackElementBefore, false, false);
	}

	public static deleteAllRight(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState): EditOperationResult {
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
				return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), false, false, false);
			}
		}

		return this.deleteRight(config, model, cursor);
	}

	public static autoClosingPairDelete(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState): EditOperationResult {
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

		return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), false, false, false);
	}

	public static deleteLeft(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState): EditOperationResult {
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
					let fromVisibleColumn = CursorMove.visibleColumnFromColumn2(config, model, position);
					let toVisibleColumn = CursorMoveHelper.prevTabColumn(fromVisibleColumn, config.tabSize);
					let toColumn = CursorMove.columnFromVisibleColumn2(config, model, position.lineNumber, toVisibleColumn);
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

		return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), shouldPushStackElementBefore, false, false);
	}

	public static deleteAllLeft(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState): EditOperationResult {
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
				return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), false, false, false);
			}
		}

		return this.deleteLeft(config, model, cursor);
	}

}