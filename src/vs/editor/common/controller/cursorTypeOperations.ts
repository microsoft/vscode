/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { ReplaceCommand, ReplaceCommandWithoutChangingPosition, ReplaceCommandWithOffsetCursorState } from 'vs/editor/common/commands/replaceCommand';
import { SingleCursorState, CursorColumns, CursorConfiguration, ICursorSimpleModel, EditOperationResult, CommandResult } from 'vs/editor/common/controller/cursorCommon';
import { Range } from 'vs/editor/common/core/range';
import { ICommand, ITokenizedModel } from 'vs/editor/common/editorCommon';
import * as strings from 'vs/base/common/strings';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { Selection } from 'vs/editor/common/core/selection';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IndentAction } from 'vs/editor/common/modes/languageConfiguration';
import { SurroundSelectionCommand } from 'vs/editor/common/commands/surroundSelectionCommand';
import { IElectricAction } from 'vs/editor/common/modes/supports/electricCharacter';
import { getMapForWordSeparators, WordCharacterClass } from "vs/editor/common/controller/cursorWordOperations";

export class TypeOperations {

	public static indent(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			commands[i] = new CommandResult(
				new ShiftCommand(cursor.selection, {
					isUnshift: false,
					tabSize: config.tabSize,
					oneIndent: config.oneIndent,
					useTabStops: config.useTabStops
				}),
				false
			);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	public static outdent(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			commands[i] = new CommandResult(
				new ShiftCommand(cursor.selection, {
					isUnshift: true,
					tabSize: config.tabSize,
					oneIndent: config.oneIndent,
					useTabStops: config.useTabStops
				}),
				false
			);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	public static shiftIndent(config: CursorConfiguration, indentation: string, count?: number): string {
		count = count || 1;
		let desiredIndentCount = ShiftCommand.shiftIndentCount(indentation, indentation.length + count, config.tabSize);
		let newIndentation = '';
		for (let i = 0; i < desiredIndentCount; i++) {
			newIndentation += '\t';
		}

		return newIndentation;
	}

	public static unshiftIndent(config: CursorConfiguration, indentation: string, count?: number): string {
		count = count || 1;
		let desiredIndentCount = ShiftCommand.unshiftIndentCount(indentation, indentation.length + count, config.tabSize);
		let newIndentation = '';
		for (let i = 0; i < desiredIndentCount; i++) {
			newIndentation += '\t';
		}

		return newIndentation;
	}

	public static distributedPaste(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[], text: string[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			let selection = cursor.selection;
			commands[i] = new CommandResult(new ReplaceCommand(selection, text[i]), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	public static paste(config: CursorConfiguration, model: ICursorSimpleModel, cursors: SingleCursorState[], text: string, pasteOnNewLine: boolean): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
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
				commands[i] = new CommandResult(new ReplaceCommand(typeSelection, text), false);
			} else {
				commands[i] = new CommandResult(new ReplaceCommand(selection, text), false);
			}
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	private static _goodIndentForLine(config: CursorConfiguration, model: ITokenizedModel, lineNumber: number): string {
		let expectedIndentAction = LanguageConfigurationRegistry.getGoodIndentActionForLine(model, lineNumber);

		if (expectedIndentAction) {
			if (expectedIndentAction.action) {
				let indentation = expectedIndentAction.indentation;

				if (expectedIndentAction.action === IndentAction.Indent) {
					indentation = TypeOperations.shiftIndent(config, indentation);
				}

				if (expectedIndentAction.action === IndentAction.Outdent) {
					indentation = TypeOperations.unshiftIndent(config, indentation);
				}

				indentation = config.normalizeIndentation(indentation);

				if (indentation.length === 0) {
					return '';
				} else {
					return indentation;
				}
			}
			else {
				return expectedIndentAction.indentation;
			}
		}

		return null;
	}

	private static _replaceJumpToNextIndent(config: CursorConfiguration, model: ICursorSimpleModel, selection: Selection): ReplaceCommand {
		let typeText = '';

		let position = selection.getStartPosition();
		if (config.insertSpaces) {
			let visibleColumnFromColumn = CursorColumns.visibleColumnFromColumn2(config, model, position);
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

	public static tab(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			let selection = cursor.selection;

			if (selection.isEmpty()) {

				let lineText = model.getLineContent(selection.startLineNumber);

				if (/^\s*$/.test(lineText)) {
					let goodIndent = this._goodIndentForLine(config, model, selection.startLineNumber);
					goodIndent = goodIndent || '\t';
					let possibleTypeText = config.normalizeIndentation(goodIndent);
					if (!strings.startsWith(lineText, possibleTypeText)) {
						let command = new ReplaceCommand(new Range(selection.startLineNumber, 1, selection.startLineNumber, lineText.length + 1), possibleTypeText);
						commands[i] = new CommandResult(command, true);
						continue;
					}
				}

				commands[i] = new CommandResult(this._replaceJumpToNextIndent(config, model, selection), true);
			} else {
				if (selection.startLineNumber === selection.endLineNumber) {
					let lineMaxColumn = model.getLineMaxColumn(selection.startLineNumber);
					if (selection.startColumn !== 1 || selection.endColumn !== lineMaxColumn) {
						// This is a single line selection that is not the entire line
						commands[i] = new CommandResult(this._replaceJumpToNextIndent(config, model, selection), false);
						continue;
					}
				}

				commands[i] = new CommandResult(
					new ShiftCommand(selection, {
						isUnshift: false,
						tabSize: config.tabSize,
						oneIndent: config.oneIndent,
						useTabStops: config.useTabStops
					}),
					false
				);
			}
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	public static replacePreviousChar(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], txt: string, replaceCharCnt: number): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			if (!cursor.selection.isEmpty()) {
				// looks like https://github.com/Microsoft/vscode/issues/2773
				// where a cursor operation occured before a canceled composition
				// => ignore composition
				commands[i] = null;
				continue;
			}
			let pos = cursor.position;
			let startColumn = Math.max(1, pos.column - replaceCharCnt);
			let range = new Range(pos.lineNumber, startColumn, pos.lineNumber, pos.column);
			commands[i] = new CommandResult(new ReplaceCommand(range, txt), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}

	public static typeCommand(range: Range, text: string, keepPosition: boolean): ICommand {
		if (keepPosition) {
			return new ReplaceCommandWithoutChangingPosition(range, text);
		} else {
			return new ReplaceCommand(range, text);
		}
	}

	private static _enter(config: CursorConfiguration, model: ITokenizedModel, keepPosition: boolean, range: Range): CommandResult {
		let r = LanguageConfigurationRegistry.getEnterAction(model, range);
		let enterAction = r.enterAction;
		let indentation = r.indentation;

		let beforeText = '';

		if (!r.ignoreCurrentLine) {
			// textBeforeEnter doesn't match unIndentPattern.
			let goodIndent = this._goodIndentForLine(config, model, range.startLineNumber);

			if (goodIndent !== null && goodIndent === r.indentation) {
				if (enterAction.outdentCurrentLine) {
					goodIndent = TypeOperations.unshiftIndent(config, goodIndent);
				}

				let lineText = model.getLineContent(range.startLineNumber);
				if (config.normalizeIndentation(goodIndent) !== config.normalizeIndentation(indentation)) {
					beforeText = config.normalizeIndentation(goodIndent) + lineText.substring(indentation.length, range.startColumn - 1);
					indentation = goodIndent;
					range = new Range(range.startLineNumber, 1, range.endLineNumber, range.endColumn);
				}
			}
		}

		if (enterAction.removeText) {
			indentation = indentation.substring(0, indentation.length - enterAction.removeText);
		}

		let executeCommand: ICommand;
		if (enterAction.indentAction === IndentAction.None) {
			// Nothing special
			executeCommand = TypeOperations.typeCommand(range, beforeText + '\n' + config.normalizeIndentation(indentation + enterAction.appendText), keepPosition);

		} else if (enterAction.indentAction === IndentAction.Indent) {
			// Indent once
			executeCommand = TypeOperations.typeCommand(range, beforeText + '\n' + config.normalizeIndentation(indentation + enterAction.appendText), keepPosition);

		} else if (enterAction.indentAction === IndentAction.IndentOutdent) {
			// Ultra special
			let normalIndent = config.normalizeIndentation(indentation);
			let increasedIndent = config.normalizeIndentation(indentation + enterAction.appendText);

			let typeText = beforeText + '\n' + increasedIndent + '\n' + normalIndent;

			if (keepPosition) {
				executeCommand = new ReplaceCommandWithoutChangingPosition(range, typeText);
			} else {
				executeCommand = new ReplaceCommandWithOffsetCursorState(range, typeText, -1, increasedIndent.length - normalIndent.length);
			}
		} else if (enterAction.indentAction === IndentAction.Outdent) {
			let actualIndentation = TypeOperations.unshiftIndent(config, indentation);
			executeCommand = TypeOperations.typeCommand(range, beforeText + '\n' + config.normalizeIndentation(actualIndentation + enterAction.appendText), keepPosition);
		}

		return new CommandResult(executeCommand, true);
	}

	private static _isAutoClosingCloseCharType(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], ch: string): boolean {
		if (!config.autoClosingBrackets || !config.autoClosingPairsClose.hasOwnProperty(ch)) {
			return false;
		}

		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const selection = cursor.selection;

			if (!selection.isEmpty()) {
				return false;
			}

			const position = cursor.position;
			const lineText = model.getLineContent(position.lineNumber);
			const afterCharacter = lineText.charAt(position.column - 1);

			if (afterCharacter !== ch) {
				return false;
			}
		}

		return true;
	}

	private static _runAutoClosingCloseCharType(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], ch: string): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const position = cursor.position;
			const typeSelection = new Range(position.lineNumber, position.column, position.lineNumber, position.column + 1);
			commands[i] = new CommandResult(new ReplaceCommand(typeSelection, ch), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}

	private static _isAutoClosingOpenCharType(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], ch: string): boolean {
		if (!config.autoClosingBrackets || !config.autoClosingPairsOpen.hasOwnProperty(ch)) {
			return false;
		}

		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const selection = cursor.selection;
			if (!selection.isEmpty()) {
				return false;
			}

			const position = cursor.position;
			const lineText = model.getLineContent(position.lineNumber);

			// Do not auto-close ' or " after a word character
			if ((ch === '\'' || ch === '"') && position.column > 1) {
				const wordSeparators = getMapForWordSeparators(config.wordSeparators);
				const characterBeforeCode = lineText.charCodeAt(position.column - 2);
				const characterBeforeType = wordSeparators.get(characterBeforeCode);
				if (characterBeforeType === WordCharacterClass.Regular) {
					return false;
				}
			}

			// Only consider auto closing the pair if a space follows or if another autoclosed pair follows
			const characterAfter = lineText.charAt(position.column - 1);
			if (characterAfter) {
				const thisBraceIsSymmetric = (config.autoClosingPairsOpen[ch] === ch);

				let isBeforeCloseBrace = false;
				for (let otherCloseBrace in config.autoClosingPairsClose) {
					const otherBraceIsSymmetric = (config.autoClosingPairsOpen[otherCloseBrace] === otherCloseBrace);
					if (!thisBraceIsSymmetric && otherBraceIsSymmetric) {
						continue;
					}
					if (characterAfter === otherCloseBrace) {
						isBeforeCloseBrace = true;
						break;
					}
				}
				if (!isBeforeCloseBrace && !/\s/.test(characterAfter)) {
					return false;
				}
			}

			model.forceTokenization(position.lineNumber);
			const lineTokens = model.getLineTokens(position.lineNumber);

			let shouldAutoClosePair = false;
			try {
				shouldAutoClosePair = LanguageConfigurationRegistry.shouldAutoClosePair(ch, lineTokens, position.column);
			} catch (e) {
				onUnexpectedError(e);
			}

			if (!shouldAutoClosePair) {
				return false;
			}
		}

		return true;
	}

	private static _runAutoClosingOpenCharType(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], ch: string): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const selection = cursor.selection;
			const closeCharacter = config.autoClosingPairsOpen[ch];
			commands[i] = new CommandResult(
				new ReplaceCommandWithOffsetCursorState(selection, ch + closeCharacter, 0, -closeCharacter.length),
				false
			);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: false
		});
	}

	private static _isSurroundSelectionType(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], ch: string): boolean {
		if (!config.autoClosingBrackets || !config.surroundingPairs.hasOwnProperty(ch)) {
			return false;
		}

		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const selection = cursor.selection;

			if (selection.isEmpty()) {
				return false;
			}

			let selectionContainsOnlyWhitespace = true;

			for (let lineNumber = selection.startLineNumber; lineNumber <= selection.endLineNumber; lineNumber++) {
				const lineText = model.getLineContent(lineNumber);
				const startIndex = (lineNumber === selection.startLineNumber ? selection.startColumn - 1 : 0);
				const endIndex = (lineNumber === selection.endLineNumber ? selection.endColumn - 1 : lineText.length);
				const selectedText = lineText.substring(startIndex, endIndex);
				if (/[^ \t]/.test(selectedText)) {
					// this selected text contains something other than whitespace
					selectionContainsOnlyWhitespace = false;
					break;
				}
			}

			if (selectionContainsOnlyWhitespace) {
				return false;
			}
		}

		return true;
	}

	private static _runSurroundSelectionType(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], ch: string): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			const selection = cursor.selection;
			const closeCharacter = config.surroundingPairs[ch];
			commands[i] = new CommandResult(new SurroundSelectionCommand(selection, ch, closeCharacter), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	private static _typeInterceptorElectricChar(config: CursorConfiguration, model: ITokenizedModel, cursor: SingleCursorState, ch: string): EditOperationResult {
		if (!config.electricChars.hasOwnProperty(ch) || !cursor.selection.isEmpty()) {
			return null;
		}

		let position = cursor.position;
		model.forceTokenization(position.lineNumber);
		let lineTokens = model.getLineTokens(position.lineNumber);

		let electricAction: IElectricAction;
		try {
			electricAction = LanguageConfigurationRegistry.onElectricCharacter(ch, lineTokens, position.column);
		} catch (e) {
			onUnexpectedError(e);
		}

		if (!electricAction) {
			return null;
		}

		if (electricAction.appendText) {
			const command = new CommandResult(new ReplaceCommandWithOffsetCursorState(cursor.selection, ch + electricAction.appendText, 0, -electricAction.appendText.length), false);
			return new EditOperationResult([command], {
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: true
			});
		}

		if (electricAction.matchOpenBracket) {
			let endColumn = (lineTokens.getLineContent() + ch).lastIndexOf(electricAction.matchOpenBracket) + 1;
			let match = model.findMatchingBracketUp(electricAction.matchOpenBracket, {
				lineNumber: position.lineNumber,
				column: endColumn
			});

			if (match) {
				if (match.startLineNumber === position.lineNumber) {
					// matched something on the same line => no change in indentation
					return null;
				}
				let matchLine = model.getLineContent(match.startLineNumber);
				let matchLineIndentation = strings.getLeadingWhitespace(matchLine);
				let newIndentation = config.normalizeIndentation(matchLineIndentation);

				let lineText = model.getLineContent(position.lineNumber);
				let lineFirstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(position.lineNumber) || position.column;

				let prefix = lineText.substring(lineFirstNonBlankColumn - 1, position.column - 1);
				let typeText = newIndentation + prefix + ch;

				let typeSelection = new Range(position.lineNumber, 1, position.lineNumber, position.column);

				const command = new CommandResult(new ReplaceCommand(typeSelection, typeText), false);
				return new EditOperationResult([command], {
					shouldPushStackElementBefore: false,
					shouldPushStackElementAfter: true
				});
			}
		}

		return null;
	}

	public static typeWithInterceptors(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], ch: string): EditOperationResult {

		if (ch === '\n') {
			let commands: CommandResult[] = [];
			for (let i = 0, len = cursors.length; i < len; i++) {
				commands[i] = TypeOperations._enter(config, model, false, cursors[i].selection);
			}
			return new EditOperationResult(commands, {
				shouldPushStackElementBefore: true,
				shouldPushStackElementAfter: false,
			});
		}

		if (this._isAutoClosingCloseCharType(config, model, cursors, ch)) {
			return this._runAutoClosingCloseCharType(config, model, cursors, ch);
		}

		if (this._isAutoClosingOpenCharType(config, model, cursors, ch)) {
			return this._runAutoClosingOpenCharType(config, model, cursors, ch);
		}

		if (this._isSurroundSelectionType(config, model, cursors, ch)) {
			return this._runSurroundSelectionType(config, model, cursors, ch);
		}

		// Electric characters make sense only when dealing with a single cursor,
		// as multiple cursors typing brackets for example would interfer with bracket matching
		if (cursors.length === 1) {
			const r = this._typeInterceptorElectricChar(config, model, cursors[0], ch);
			if (r) {
				return r;
			}
		}

		return this.typeWithoutInterceptors(config, model, cursors, ch);
	}

	public static typeWithoutInterceptors(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[], str: string): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			commands[i] = new CommandResult(new ReplaceCommand(cursor.selection, str), false);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}

	public static lineInsertBefore(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			let lineNumber = cursor.position.lineNumber;

			if (lineNumber === 1) {
				commands[i] = new CommandResult(new ReplaceCommandWithoutChangingPosition(new Range(1, 1, 1, 1), '\n'), false);
			} else {
				lineNumber--;
				let column = model.getLineMaxColumn(lineNumber);

				commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
			}
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: false,
		});
	}

	public static lineInsertAfter(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			let position = cursor.position;
			let column = model.getLineMaxColumn(position.lineNumber);
			commands[i] = this._enter(config, model, false, new Range(position.lineNumber, column, position.lineNumber, column));
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: false,
		});
	}

	public static lineBreakInsert(config: CursorConfiguration, model: ITokenizedModel, cursors: SingleCursorState[]): EditOperationResult {
		let commands: CommandResult[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			const cursor = cursors[i];
			commands[i] = this._enter(config, model, true, cursor.selection);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: false,
		});
	}
}
