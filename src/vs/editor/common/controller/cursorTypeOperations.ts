/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';
import { CursorMove, CursorMoveConfiguration, ICursorMoveHelperModel } from 'vs/editor/common/controller/cursorMoveHelper';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/editorCommon';
import { CursorModelState } from 'vs/editor/common/controller/oneCursor';
import * as strings from 'vs/base/common/strings';
import { EditOperationResult } from 'vs/editor/common/controller/cursorDeleteOperations';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { Selection } from 'vs/editor/common/core/selection';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ITokenizedModel } from 'vs/editor/common/editorCommon';
import { IndentAction } from 'vs/editor/common/modes/languageConfiguration';

export class TypeOperations {

	public static indent(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState): EditOperationResult {
		return new EditOperationResult(
			new ShiftCommand(cursor.selection, {
				isUnshift: false,
				tabSize: config.tabSize,
				oneIndent: config.oneIndent
			}), {
				shouldPushStackElementBefore: true,
				shouldPushStackElementAfter: true,
				shouldRevealHorizontal: false
			}
		);
	}

	public static outdent(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState): EditOperationResult {
		return new EditOperationResult(
			new ShiftCommand(cursor.selection, {
				isUnshift: true,
				tabSize: config.tabSize,
				oneIndent: config.oneIndent
			}), {
				shouldPushStackElementBefore: true,
				shouldPushStackElementAfter: true,
				shouldRevealHorizontal: false
			}
		);
	}

	public static paste(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState, text: string, pasteOnNewLine: boolean): EditOperationResult {
		let position = cursor.position;
		let selection = cursor.selection;

		if (pasteOnNewLine && text.indexOf('\n') !== text.length - 1) {
			pasteOnNewLine = false;
		}
		if (pasteOnNewLine && selection.startLineNumber !== selection.endLineNumber) {
			pasteOnNewLine = false;
		}
		if (pasteOnNewLine && selection.startColumn === model.getLineMinColumn(selection.startLineNumber) && selection.endColumn === model.getLineMaxColumn(selection.startLineNumber)) {
			pasteOnNewLine = false;
		}

		if (pasteOnNewLine) {
			// Paste entire line at the beginning of line

			let typeSelection = new Range(position.lineNumber, 1, position.lineNumber, 1);
			return new EditOperationResult(new ReplaceCommand(typeSelection, text), {
				shouldPushStackElementBefore: true,
				shouldPushStackElementAfter: true,
				cursorPositionChangeReason: CursorChangeReason.Paste
			});
		}

		return new EditOperationResult(new ReplaceCommand(selection, text), {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true,
			cursorPositionChangeReason: CursorChangeReason.Paste
		});
	}

	private static _goodIndentForLine(config: CursorMoveConfiguration, model: ITokenizedModel, lineNumber: number): string {
		let lastLineNumber = lineNumber - 1;

		for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
			let lineText = model.getLineContent(lastLineNumber);
			let nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineText);
			if (nonWhitespaceIdx >= 0) {
				break;
			}
		}

		if (lastLineNumber < 1) {
			// No previous line with content found
			return '\t';
		}

		let r = LanguageConfigurationRegistry.getEnterActionAtPosition(model, lastLineNumber, model.getLineMaxColumn(lastLineNumber));

		let indentation: string;
		if (r.enterAction.indentAction === IndentAction.Outdent) {
			let desiredIndentCount = ShiftCommand.unshiftIndentCount(r.indentation, r.indentation.length, config.tabSize);
			indentation = '';
			for (let i = 0; i < desiredIndentCount; i++) {
				indentation += '\t';
			}
			indentation = config.normalizeIndentation(indentation);
		} else {
			indentation = r.indentation;
		}

		let result = indentation + r.enterAction.appendText;
		if (result.length === 0) {
			// good position is at column 1, but we gotta do something...
			return '\t';
		}
		return result;
	}

	private static _replaceJumpToNextIndent(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, selection: Selection): ReplaceCommand {
		let typeText = '';

		let position = selection.getStartPosition();
		if (config.insertSpaces) {
			let visibleColumnFromColumn = CursorMove.visibleColumnFromColumn2(config, model, position);
			let tabSize = config.tabSize;
			let spacesCnt = tabSize - (visibleColumnFromColumn % tabSize);
			for (let i = 0; i < spacesCnt; i++) {
				typeText += ' ';
			}
		} else {
			typeText = '\t';
		}

		return new ReplaceCommand(selection, typeText);
	}

	public static tab(config: CursorMoveConfiguration, model: ITokenizedModel, cursor: CursorModelState): EditOperationResult {
		let selection = cursor.selection;

		if (selection.isEmpty()) {

			let lineText = model.getLineContent(selection.startLineNumber);

			if (/^\s*$/.test(lineText)) {
				let possibleTypeText = config.normalizeIndentation(this._goodIndentForLine(config, model, selection.startLineNumber));
				if (!strings.startsWith(lineText, possibleTypeText)) {
					let command = new ReplaceCommand(new Range(selection.startLineNumber, 1, selection.startLineNumber, lineText.length + 1), possibleTypeText);
					return new EditOperationResult(command, {
						shouldPushStackElementBefore: false,
						shouldPushStackElementAfter: false,
						isAutoWhitespaceCommand: true
					});
				}
			}

			return new EditOperationResult(this._replaceJumpToNextIndent(config, model, selection), {
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: false,
				isAutoWhitespaceCommand: true
			});
		} else {
			if (selection.startLineNumber === selection.endLineNumber) {
				let lineMaxColumn = model.getLineMaxColumn(selection.startLineNumber);
				if (selection.startColumn !== 1 || selection.endColumn !== lineMaxColumn) {
					// This is a single line selection that is not the entire line
					return new EditOperationResult(this._replaceJumpToNextIndent(config, model, selection));
				}
			}

			return this.indent(config, model, cursor);
		}
	}
}
