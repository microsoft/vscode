/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { ReplaceCommand, ReplaceCommandWithoutChangingPosition, ReplaceCommandWithOffsetCursorState } from 'vs/editor/common/commands/replaceCommand';
import { CursorColumns, CursorConfiguration, ICursorSimpleModel, EditOperationResult } from 'vs/editor/common/controller/cursorCommon';
import { Range } from 'vs/editor/common/core/range';
import { ICommand, ITokenizedModel } from 'vs/editor/common/editorCommon';
import * as strings from 'vs/base/common/strings';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { Selection } from 'vs/editor/common/core/selection';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IndentAction } from 'vs/editor/common/modes/languageConfiguration';
import { SurroundSelectionCommand } from 'vs/editor/common/commands/surroundSelectionCommand';
import { IElectricAction } from 'vs/editor/common/modes/supports/electricCharacter';
import { getMapForWordSeparators, WordCharacterClass } from 'vs/editor/common/controller/wordCharacterClassifier';

export class TypeOperations {

	public static indent(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[]): ICommand[] {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = new ShiftCommand(selections[i], {
				isUnshift: false,
				tabSize: config.tabSize,
				oneIndent: config.oneIndent,
				useTabStops: config.useTabStops
			});
		}
		return commands;
	}

	public static outdent(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[]): ICommand[] {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = new ShiftCommand(selections[i], {
				isUnshift: true,
				tabSize: config.tabSize,
				oneIndent: config.oneIndent,
				useTabStops: config.useTabStops
			});
		}
		return commands;
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

	private static _distributedPaste(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[], text: string[]): EditOperationResult {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = new ReplaceCommand(selections[i], text[i]);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	private static _simplePaste(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[], text: string, pasteOnNewLine: boolean): EditOperationResult {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			let position = selection.getPosition();

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
				commands[i] = new ReplaceCommand(typeSelection, text);
			} else {
				commands[i] = new ReplaceCommand(selection, text);
			}
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	private static _distributePasteToCursors(selections: Selection[], pasteOnNewLine: boolean, text: string): string[] {
		if (pasteOnNewLine) {
			return null;
		}

		if (selections.length === 1) {
			return null;
		}

		for (let i = 0; i < selections.length; i++) {
			if (selections[i].startLineNumber !== selections[i].endLineNumber) {
				return null;
			}
		}

		let pastePieces = text.split(/\r\n|\r|\n/);
		if (pastePieces.length !== selections.length) {
			return null;
		}

		return pastePieces;
	}

	public static paste(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[], pasteOnNewLine: boolean, text: string): EditOperationResult {
		const distributedPaste = this._distributePasteToCursors(selections, pasteOnNewLine, text);

		if (distributedPaste) {
			selections = selections.sort(Range.compareRangesUsingStarts);
			return this._distributedPaste(config, model, selections, distributedPaste);
		} else {
			return this._simplePaste(config, model, selections, text, pasteOnNewLine);
		}
	}

	private static _goodIndentForLine(config: CursorConfiguration, model: ITokenizedModel, lineNumber: number): string {
		let action;
		let indentation;
		let expectedIndentAction = LanguageConfigurationRegistry.getInheritIndentForLine(model, lineNumber, false);

		if (expectedIndentAction) {
			action = expectedIndentAction.action;
			indentation = expectedIndentAction.indentation;
		} else if (lineNumber > 1) {
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
				return null;
			}

			let maxColumn = model.getLineMaxColumn(lastLineNumber);
			let expectedEnterAction = LanguageConfigurationRegistry.getEnterAction(model, new Range(lastLineNumber, maxColumn, lastLineNumber, maxColumn));
			if (expectedEnterAction) {
				indentation = expectedEnterAction.indentation;
				action = expectedEnterAction.enterAction;
				if (action) {
					indentation += action.appendText;
				}
			}
		}

		if (action) {
			if (action === IndentAction.Indent) {
				indentation = TypeOperations.shiftIndent(config, indentation);
			}

			if (action === IndentAction.Outdent) {
				indentation = TypeOperations.unshiftIndent(config, indentation);
			}

			indentation = config.normalizeIndentation(indentation);
		}

		if (!indentation) {
			return null;
		}

		return indentation;
	}

	private static _replaceJumpToNextIndent(config: CursorConfiguration, model: ICursorSimpleModel, selection: Selection, insertsAutoWhitespace: boolean): ReplaceCommand {
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

		return new ReplaceCommand(selection, typeText, insertsAutoWhitespace);
	}

	public static tab(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[]): ICommand[] {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];

			if (selection.isEmpty()) {

				let lineText = model.getLineContent(selection.startLineNumber);

				if (/^\s*$/.test(lineText) && model.isCheapToTokenize(selection.startLineNumber)) {
					let goodIndent = this._goodIndentForLine(config, model, selection.startLineNumber);
					goodIndent = goodIndent || '\t';
					let possibleTypeText = config.normalizeIndentation(goodIndent);
					if (!strings.startsWith(lineText, possibleTypeText)) {
						commands[i] = new ReplaceCommand(new Range(selection.startLineNumber, 1, selection.startLineNumber, lineText.length + 1), possibleTypeText, true);
						continue;
					}
				}

				commands[i] = this._replaceJumpToNextIndent(config, model, selection, true);
			} else {
				if (selection.startLineNumber === selection.endLineNumber) {
					let lineMaxColumn = model.getLineMaxColumn(selection.startLineNumber);
					if (selection.startColumn !== 1 || selection.endColumn !== lineMaxColumn) {
						// This is a single line selection that is not the entire line
						commands[i] = this._replaceJumpToNextIndent(config, model, selection, false);
						continue;
					}
				}

				commands[i] = new ShiftCommand(selection, {
					isUnshift: false,
					tabSize: config.tabSize,
					oneIndent: config.oneIndent,
					useTabStops: config.useTabStops
				});
			}
		}
		return commands;
	}

	public static replacePreviousChar(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], txt: string, replaceCharCnt: number): EditOperationResult {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			if (!selection.isEmpty()) {
				// looks like https://github.com/Microsoft/vscode/issues/2773
				// where a cursor operation occurred before a canceled composition
				// => ignore composition
				commands[i] = null;
				continue;
			}
			let pos = selection.getPosition();
			let startColumn = Math.max(1, pos.column - replaceCharCnt);
			let range = new Range(pos.lineNumber, startColumn, pos.lineNumber, pos.column);
			commands[i] = new ReplaceCommand(range, txt);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}

	private static _typeCommand(range: Range, text: string, keepPosition: boolean): ICommand {
		if (keepPosition) {
			return new ReplaceCommandWithoutChangingPosition(range, text, true);
		} else {
			return new ReplaceCommand(range, text, true);
		}
	}

	private static _enter(config: CursorConfiguration, model: ITokenizedModel, keepPosition: boolean, range: Range): ICommand {
		if (!model.isCheapToTokenize(range.getStartPosition().lineNumber)) {
			let lineText = model.getLineContent(range.startLineNumber);
			let indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);
			return TypeOperations._typeCommand(range, '\n' + config.normalizeIndentation(indentation), keepPosition);
		}

		let r = LanguageConfigurationRegistry.getEnterAction(model, range);
		if (r) {
			let enterAction = r.enterAction;
			let indentation = r.indentation;

			if (enterAction.indentAction === IndentAction.None) {
				// Nothing special
				return TypeOperations._typeCommand(range, '\n' + config.normalizeIndentation(indentation + enterAction.appendText), keepPosition);

			} else if (enterAction.indentAction === IndentAction.Indent) {
				// Indent once
				return TypeOperations._typeCommand(range, '\n' + config.normalizeIndentation(indentation + enterAction.appendText), keepPosition);

			} else if (enterAction.indentAction === IndentAction.IndentOutdent) {
				// Ultra special
				let normalIndent = config.normalizeIndentation(indentation);
				let increasedIndent = config.normalizeIndentation(indentation + enterAction.appendText);

				let typeText = '\n' + increasedIndent + '\n' + normalIndent;

				if (keepPosition) {
					return new ReplaceCommandWithoutChangingPosition(range, typeText, true);
				} else {
					return new ReplaceCommandWithOffsetCursorState(range, typeText, -1, increasedIndent.length - normalIndent.length, true);
				}
			} else if (enterAction.indentAction === IndentAction.Outdent) {
				let actualIndentation = TypeOperations.unshiftIndent(config, indentation);
				return TypeOperations._typeCommand(range, '\n' + config.normalizeIndentation(actualIndentation + enterAction.appendText), keepPosition);
			}
		}

		// no enter rules applied, we should check indentation rules then.
		let ir = LanguageConfigurationRegistry.getIndentForEnter(model, range, {
			unshiftIndent: (indent) => {
				return TypeOperations.unshiftIndent(config, indent);
			},
			shiftIndent: (indent) => {
				return TypeOperations.shiftIndent(config, indent);
			},
			normalizeIndentation: (indent) => {
				return config.normalizeIndentation(indent);
			}
		}, config.autoIndent);

		let lineText = model.getLineContent(range.startLineNumber);
		let indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);

		if (ir) {
			let oldEndViewColumn = CursorColumns.visibleColumnFromColumn2(config, model, range.getEndPosition());
			let oldEndColumn = range.endColumn;

			let beforeText = '\n';
			if (indentation !== config.normalizeIndentation(ir.beforeEnter)) {
				beforeText = config.normalizeIndentation(ir.beforeEnter) + lineText.substring(indentation.length, range.startColumn - 1) + '\n';
				range = new Range(range.startLineNumber, 1, range.endLineNumber, range.endColumn);
			}

			let newLineContent = model.getLineContent(range.endLineNumber);
			let firstNonWhitespace = strings.firstNonWhitespaceIndex(newLineContent);
			if (firstNonWhitespace >= 0) {
				range = range.setEndPosition(range.endLineNumber, Math.max(range.endColumn, firstNonWhitespace + 1));
			} else {
				range = range.setEndPosition(range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
			}

			if (keepPosition) {
				return new ReplaceCommandWithoutChangingPosition(range, beforeText + config.normalizeIndentation(ir.afterEnter), true);
			} else {
				let offset = 0;
				if (oldEndColumn <= firstNonWhitespace + 1) {
					if (!config.insertSpaces) {
						oldEndViewColumn = Math.ceil(oldEndViewColumn / config.tabSize);
					}
					offset = Math.min(oldEndViewColumn + 1 - config.normalizeIndentation(ir.afterEnter).length - 1, 0);
				}
				return new ReplaceCommandWithOffsetCursorState(range, beforeText + config.normalizeIndentation(ir.afterEnter), 0, offset, true);
			}

		} else {
			return TypeOperations._typeCommand(range, '\n' + config.normalizeIndentation(indentation), keepPosition);
		}
	}

	private static _isAutoIndentType(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[]): boolean {
		if (!config.autoIndent) {
			return false;
		}

		for (let i = 0, len = selections.length; i < len; i++) {
			if (!model.isCheapToTokenize(selections[i].getEndPosition().lineNumber)) {
				return false;
			}
		}

		return true;
	}

	private static _runAutoIndentType(config: CursorConfiguration, model: ITokenizedModel, range: Range, ch: string): ICommand {
		let currentIndentation = LanguageConfigurationRegistry.getIndentationAtPosition(model, range.startLineNumber, range.startColumn);
		let actualIndentation = LanguageConfigurationRegistry.getIndentActionForType(model, range, ch, {
			shiftIndent: (indentation) => {
				return TypeOperations.shiftIndent(config, indentation);
			},
			unshiftIndent: (indentation) => {
				return TypeOperations.unshiftIndent(config, indentation);
			},
		});

		if (actualIndentation === null) {
			return null;
		}

		if (actualIndentation !== config.normalizeIndentation(currentIndentation)) {
			let firstNonWhitespace = model.getLineFirstNonWhitespaceColumn(range.startLineNumber);
			if (firstNonWhitespace === 0) {
				return TypeOperations._typeCommand(
					new Range(range.startLineNumber, 0, range.endLineNumber, range.endColumn),
					config.normalizeIndentation(actualIndentation) + ch,
					false
				);
			} else {
				return TypeOperations._typeCommand(
					new Range(range.startLineNumber, 0, range.endLineNumber, range.endColumn),
					config.normalizeIndentation(actualIndentation) +
					model.getLineContent(range.startLineNumber).substring(firstNonWhitespace - 1, range.startColumn - 1) + ch,
					false
				);
			}
		}

		return null;
	}

	private static _isAutoClosingCloseCharType(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], ch: string): boolean {
		if (!config.autoClosingBrackets || !config.autoClosingPairsClose.hasOwnProperty(ch)) {
			return false;
		}

		const isEqualPair = (ch === config.autoClosingPairsClose[ch]);

		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];

			if (!selection.isEmpty()) {
				return false;
			}

			const position = selection.getPosition();
			const lineText = model.getLineContent(position.lineNumber);
			const afterCharacter = lineText.charAt(position.column - 1);

			if (afterCharacter !== ch) {
				return false;
			}

			if (isEqualPair) {
				const lineTextBeforeCursor = lineText.substr(0, position.column - 1);
				const chCntBefore = this._countNeedlesInHaystack(lineTextBeforeCursor, ch);
				if (chCntBefore % 2 === 0) {
					return false;
				}
			}
		}

		return true;
	}

	private static _countNeedlesInHaystack(haystack: string, needle: string): number {
		let cnt = 0;
		let lastIndex = -1;
		while ((lastIndex = haystack.indexOf(needle, lastIndex + 1)) !== -1) {
			cnt++;
		}
		return cnt;
	}

	private static _runAutoClosingCloseCharType(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], ch: string): EditOperationResult {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			const position = selection.getPosition();
			const typeSelection = new Range(position.lineNumber, position.column, position.lineNumber, position.column + 1);
			commands[i] = new ReplaceCommand(typeSelection, ch);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}

	private static _isAutoClosingOpenCharType(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], ch: string): boolean {
		if (!config.autoClosingBrackets || !config.autoClosingPairsOpen.hasOwnProperty(ch)) {
			return false;
		}

		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			if (!selection.isEmpty()) {
				return false;
			}

			const position = selection.getPosition();
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

			if (!model.isCheapToTokenize(position.lineNumber)) {
				// Do not force tokenization
				return false;
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

	private static _runAutoClosingOpenCharType(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], ch: string): EditOperationResult {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			const closeCharacter = config.autoClosingPairsOpen[ch];
			commands[i] = new ReplaceCommandWithOffsetCursorState(selection, ch + closeCharacter, 0, -closeCharacter.length);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: false
		});
	}

	private static _isSurroundSelectionType(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], ch: string): boolean {
		if (!config.autoClosingBrackets || !config.surroundingPairs.hasOwnProperty(ch)) {
			return false;
		}

		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];

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

	private static _runSurroundSelectionType(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], ch: string): EditOperationResult {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			const closeCharacter = config.surroundingPairs[ch];
			commands[i] = new SurroundSelectionCommand(selection, ch, closeCharacter);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	private static _isTypeInterceptorElectricChar(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[]) {
		if (selections.length === 1 && model.isCheapToTokenize(selections[0].getEndPosition().lineNumber)) {
			return true;
		}
		return false;
	}

	private static _typeInterceptorElectricChar(config: CursorConfiguration, model: ITokenizedModel, selection: Selection, ch: string): EditOperationResult {
		if (!config.electricChars.hasOwnProperty(ch) || !selection.isEmpty()) {
			return null;
		}

		let position = selection.getPosition();
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
			const command = new ReplaceCommandWithOffsetCursorState(selection, ch + electricAction.appendText, 0, -electricAction.appendText.length);
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

				const command = new ReplaceCommand(typeSelection, typeText);
				return new EditOperationResult([command], {
					shouldPushStackElementBefore: false,
					shouldPushStackElementAfter: true
				});
			}
		}

		return null;
	}

	public static typeWithInterceptors(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], ch: string): EditOperationResult {

		if (ch === '\n') {
			let commands: ICommand[] = [];
			for (let i = 0, len = selections.length; i < len; i++) {
				commands[i] = TypeOperations._enter(config, model, false, selections[i]);
			}
			return new EditOperationResult(commands, {
				shouldPushStackElementBefore: true,
				shouldPushStackElementAfter: false,
			});
		}

		if (this._isAutoIndentType(config, model, selections)) {
			let indentCommand = this._runAutoIndentType(config, model, selections[0], ch);
			if (indentCommand) {
				return new EditOperationResult([indentCommand], {
					shouldPushStackElementBefore: true,
					shouldPushStackElementAfter: false,
				});
			}
		}

		if (this._isAutoClosingCloseCharType(config, model, selections, ch)) {
			return this._runAutoClosingCloseCharType(config, model, selections, ch);
		}

		if (this._isAutoClosingOpenCharType(config, model, selections, ch)) {
			return this._runAutoClosingOpenCharType(config, model, selections, ch);
		}

		if (this._isSurroundSelectionType(config, model, selections, ch)) {
			return this._runSurroundSelectionType(config, model, selections, ch);
		}

		// Electric characters make sense only when dealing with a single cursor,
		// as multiple cursors typing brackets for example would interfer with bracket matching
		if (this._isTypeInterceptorElectricChar(config, model, selections)) {
			const r = this._typeInterceptorElectricChar(config, model, selections[0], ch);
			if (r) {
				return r;
			}
		}

		return this.typeWithoutInterceptors(config, model, selections, ch);
	}

	public static typeWithoutInterceptors(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[], str: string): EditOperationResult {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = new ReplaceCommand(selections[i], str);
		}
		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}

	public static lineInsertBefore(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[]): ICommand[] {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			let lineNumber = selections[i].positionLineNumber;

			if (lineNumber === 1) {
				commands[i] = new ReplaceCommandWithoutChangingPosition(new Range(1, 1, 1, 1), '\n');
			} else {
				lineNumber--;
				let column = model.getLineMaxColumn(lineNumber);

				commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
			}
		}
		return commands;
	}

	public static lineInsertAfter(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[]): ICommand[] {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const lineNumber = selections[i].positionLineNumber;
			let column = model.getLineMaxColumn(lineNumber);
			commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
		}
		return commands;
	}

	public static lineBreakInsert(config: CursorConfiguration, model: ITokenizedModel, selections: Selection[]): ICommand[] {
		let commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = this._enter(config, model, true, selections[i]);
		}
		return commands;
	}
}
