/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import * as strings from '../../../base/common/strings.js';
import { ReplaceCommand, ReplaceCommandWithOffsetCursorState, ReplaceCommandWithoutChangingPosition, ReplaceCommandThatPreservesSelection } from '../commands/replaceCommand.js';
import { ShiftCommand } from '../commands/shiftCommand.js';
import { SurroundSelectionCommand } from '../commands/surroundSelectionCommand.js';
import { CursorConfiguration, EditOperationResult, EditOperationType, ICursorSimpleModel, isQuote } from '../cursorCommon.js';
import { WordCharacterClass, getMapForWordSeparators } from '../core/wordCharacterClassifier.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { Position } from '../core/position.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../editorCommon.js';
import { ITextModel } from '../model.js';
import { EnterAction, IndentAction, StandardAutoClosingPairConditional } from '../languages/languageConfiguration.js';
import { getIndentationAtPosition } from '../languages/languageConfigurationRegistry.js';
import { IElectricAction } from '../languages/supports/electricCharacter.js';
import { EditorAutoClosingStrategy, EditorAutoIndentStrategy } from '../config/editorOptions.js';
import { createScopedLineTokens } from '../languages/supports.js';
import { getIndentActionForType, getIndentForEnter, getInheritIndentForLine } from '../languages/autoIndent.js';
import { getEnterAction } from '../languages/enterAction.js';

export class AutoIndentOperation {

	public static getEdits(config: CursorConfiguration, model: ITextModel, selections: Selection[], ch: string, isDoingComposition: boolean): EditOperationResult | undefined {
		if (!isDoingComposition && this._isAutoIndentType(config, model, selections)) {
			const indentationForSelections: { selection: Selection; indentation: string }[] = [];
			for (const selection of selections) {
				const indentation = this._findActualIndentationForSelection(config, model, selection, ch);
				if (indentation === null) {
					// Auto indentation failed
					return;
				}
				indentationForSelections.push({ selection, indentation });
			}
			const autoClosingPairClose = AutoClosingOpenCharTypeOperation.getAutoClosingPairClose(config, model, selections, ch, false);
			return this._getIndentationAndAutoClosingPairEdits(config, model, indentationForSelections, ch, autoClosingPairClose);
		}
		return;
	}

	private static _isAutoIndentType(config: CursorConfiguration, model: ITextModel, selections: Selection[]): boolean {
		if (config.autoIndent < EditorAutoIndentStrategy.Full) {
			return false;
		}
		for (let i = 0, len = selections.length; i < len; i++) {
			if (!model.tokenization.isCheapToTokenize(selections[i].getEndPosition().lineNumber)) {
				return false;
			}
		}
		return true;
	}

	private static _findActualIndentationForSelection(config: CursorConfiguration, model: ITextModel, selection: Selection, ch: string): string | null {
		const actualIndentation = getIndentActionForType(config, model, selection, ch, {
			shiftIndent: (indentation) => {
				return shiftIndent(config, indentation);
			},
			unshiftIndent: (indentation) => {
				return unshiftIndent(config, indentation);
			},
		}, config.languageConfigurationService);

		if (actualIndentation === null) {
			return null;
		}

		const currentIndentation = getIndentationAtPosition(model, selection.startLineNumber, selection.startColumn);
		if (actualIndentation === config.normalizeIndentation(currentIndentation)) {
			return null;
		}
		return actualIndentation;
	}

	private static _getIndentationAndAutoClosingPairEdits(config: CursorConfiguration, model: ITextModel, indentationForSelections: { selection: Selection; indentation: string }[], ch: string, autoClosingPairClose: string | null): EditOperationResult {
		const commands: ICommand[] = indentationForSelections.map(({ selection, indentation }) => {
			if (autoClosingPairClose !== null) {
				// Apply both auto closing pair edits and auto indentation edits
				const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, false);
				return new TypeWithIndentationAndAutoClosingCommand(indentationEdit, selection, ch, autoClosingPairClose);
			} else {
				// Apply only auto indentation edits
				const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, true);
				return typeCommand(indentationEdit.range, indentationEdit.text, false);
			}
		});
		const editOptions = { shouldPushStackElementBefore: true, shouldPushStackElementAfter: false };
		return new EditOperationResult(EditOperationType.TypingOther, commands, editOptions);
	}

	private static _getEditFromIndentationAndSelection(config: CursorConfiguration, model: ITextModel, indentation: string, selection: Selection, ch: string, includeChInEdit: boolean = true): { range: Range; text: string } {
		const startLineNumber = selection.startLineNumber;
		const firstNonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(startLineNumber);
		let text: string = config.normalizeIndentation(indentation);
		if (firstNonWhitespaceColumn !== 0) {
			const startLine = model.getLineContent(startLineNumber);
			text += startLine.substring(firstNonWhitespaceColumn - 1, selection.startColumn - 1);
		}
		text += includeChInEdit ? ch : '';
		const range = new Range(startLineNumber, 1, selection.endLineNumber, selection.endColumn);
		return { range, text };
	}
}

export class AutoClosingOvertypeOperation {

	public static getEdits(prevEditOperationType: EditOperationType, config: CursorConfiguration, model: ITextModel, selections: Selection[], autoClosedCharacters: Range[], ch: string): EditOperationResult | undefined {
		if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
			return this._runAutoClosingOvertype(prevEditOperationType, selections, ch);
		}
		return;
	}

	private static _runAutoClosingOvertype(prevEditOperationType: EditOperationType, selections: Selection[], ch: string): EditOperationResult {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			const position = selection.getPosition();
			const typeSelection = new Range(position.lineNumber, position.column, position.lineNumber, position.column + 1);
			commands[i] = new ReplaceCommand(typeSelection, ch);
		}
		return new EditOperationResult(EditOperationType.TypingOther, commands, {
			shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, EditOperationType.TypingOther),
			shouldPushStackElementAfter: false
		});
	}
}

export class AutoClosingOvertypeWithInterceptorsOperation {

	public static getEdits(config: CursorConfiguration, model: ITextModel, selections: Selection[], autoClosedCharacters: Range[], ch: string): EditOperationResult | undefined {
		if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
			// Unfortunately, the close character is at this point "doubled", so we need to delete it...
			const commands = selections.map(s => new ReplaceCommand(new Range(s.positionLineNumber, s.positionColumn, s.positionLineNumber, s.positionColumn + 1), '', false));
			return new EditOperationResult(EditOperationType.TypingOther, commands, {
				shouldPushStackElementBefore: true,
				shouldPushStackElementAfter: false
			});
		}
		return;
	}
}

export class AutoClosingOpenCharTypeOperation {

	public static getEdits(config: CursorConfiguration, model: ITextModel, selections: Selection[], ch: string, chIsAlreadyTyped: boolean, isDoingComposition: boolean): EditOperationResult | undefined {
		if (!isDoingComposition) {
			const autoClosingPairClose = this.getAutoClosingPairClose(config, model, selections, ch, chIsAlreadyTyped);
			if (autoClosingPairClose !== null) {
				return this._runAutoClosingOpenCharType(selections, ch, chIsAlreadyTyped, autoClosingPairClose);
			}
		}
		return;
	}

	private static _runAutoClosingOpenCharType(selections: Selection[], ch: string, chIsAlreadyTyped: boolean, autoClosingPairClose: string): EditOperationResult {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			commands[i] = new TypeWithAutoClosingCommand(selection, ch, !chIsAlreadyTyped, autoClosingPairClose);
		}
		return new EditOperationResult(EditOperationType.TypingOther, commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: false
		});
	}

	public static getAutoClosingPairClose(config: CursorConfiguration, model: ITextModel, selections: Selection[], ch: string, chIsAlreadyTyped: boolean): string | null {
		for (const selection of selections) {
			if (!selection.isEmpty()) {
				return null;
			}
		}
		// This method is called both when typing (regularly) and when composition ends
		// This means that we need to work with a text buffer where sometimes `ch` is not
		// there (it is being typed right now) or with a text buffer where `ch` has already been typed
		//
		// In order to avoid adding checks for `chIsAlreadyTyped` in all places, we will work
		// with two conceptual positions, the position before `ch` and the position after `ch`
		//
		const positions: { lineNumber: number; beforeColumn: number; afterColumn: number }[] = selections.map((s) => {
			const position = s.getPosition();
			if (chIsAlreadyTyped) {
				return { lineNumber: position.lineNumber, beforeColumn: position.column - ch.length, afterColumn: position.column };
			} else {
				return { lineNumber: position.lineNumber, beforeColumn: position.column, afterColumn: position.column };
			}
		});
		// Find the longest auto-closing open pair in case of multiple ending in `ch`
		// e.g. when having [f","] and [","], it picks [f","] if the character before is f
		const pair = this._findAutoClosingPairOpen(config, model, positions.map(p => new Position(p.lineNumber, p.beforeColumn)), ch);
		if (!pair) {
			return null;
		}
		let autoCloseConfig: EditorAutoClosingStrategy;
		let shouldAutoCloseBefore: (ch: string) => boolean;

		const chIsQuote = isQuote(ch);
		if (chIsQuote) {
			autoCloseConfig = config.autoClosingQuotes;
			shouldAutoCloseBefore = config.shouldAutoCloseBefore.quote;
		} else {
			const pairIsForComments = config.blockCommentStartToken ? pair.open.includes(config.blockCommentStartToken) : false;
			if (pairIsForComments) {
				autoCloseConfig = config.autoClosingComments;
				shouldAutoCloseBefore = config.shouldAutoCloseBefore.comment;
			} else {
				autoCloseConfig = config.autoClosingBrackets;
				shouldAutoCloseBefore = config.shouldAutoCloseBefore.bracket;
			}
		}
		if (autoCloseConfig === 'never') {
			return null;
		}
		// Sometimes, it is possible to have two auto-closing pairs that have a containment relationship
		// e.g. when having [(,)] and [(*,*)]
		// - when typing (, the resulting state is (|)
		// - when typing *, the desired resulting state is (*|*), not (*|*))
		const containedPair = this._findContainedAutoClosingPair(config, pair);
		const containedPairClose = containedPair ? containedPair.close : '';
		let isContainedPairPresent = true;

		for (const position of positions) {
			const { lineNumber, beforeColumn, afterColumn } = position;
			const lineText = model.getLineContent(lineNumber);
			const lineBefore = lineText.substring(0, beforeColumn - 1);
			const lineAfter = lineText.substring(afterColumn - 1);

			if (!lineAfter.startsWith(containedPairClose)) {
				isContainedPairPresent = false;
			}
			// Only consider auto closing the pair if an allowed character follows or if another autoclosed pair closing brace follows
			if (lineAfter.length > 0) {
				const characterAfter = lineAfter.charAt(0);
				const isBeforeCloseBrace = this._isBeforeClosingBrace(config, lineAfter);
				if (!isBeforeCloseBrace && !shouldAutoCloseBefore(characterAfter)) {
					return null;
				}
			}
			// Do not auto-close ' or " after a word character
			if (pair.open.length === 1 && (ch === '\'' || ch === '"') && autoCloseConfig !== 'always') {
				const wordSeparators = getMapForWordSeparators(config.wordSeparators, []);
				if (lineBefore.length > 0) {
					const characterBefore = lineBefore.charCodeAt(lineBefore.length - 1);
					if (wordSeparators.get(characterBefore) === WordCharacterClass.Regular) {
						return null;
					}
				}
			}
			if (!model.tokenization.isCheapToTokenize(lineNumber)) {
				// Do not force tokenization
				return null;
			}
			model.tokenization.forceTokenization(lineNumber);
			const lineTokens = model.tokenization.getLineTokens(lineNumber);
			const scopedLineTokens = createScopedLineTokens(lineTokens, beforeColumn - 1);
			if (!pair.shouldAutoClose(scopedLineTokens, beforeColumn - scopedLineTokens.firstCharOffset)) {
				return null;
			}
			// Typing for example a quote could either start a new string, in which case auto-closing is desirable
			// or it could end a previously started string, in which case auto-closing is not desirable
			//
			// In certain cases, it is really not possible to look at the previous token to determine
			// what would happen. That's why we do something really unusual, we pretend to type a different
			// character and ask the tokenizer what the outcome of doing that is: after typing a neutral
			// character, are we in a string (i.e. the quote would most likely end a string) or not?
			//
			const neutralCharacter = pair.findNeutralCharacter();
			if (neutralCharacter) {
				const tokenType = model.tokenization.getTokenTypeIfInsertingCharacter(lineNumber, beforeColumn, neutralCharacter);
				if (!pair.isOK(tokenType)) {
					return null;
				}
			}
		}
		if (isContainedPairPresent) {
			return pair.close.substring(0, pair.close.length - containedPairClose.length);
		} else {
			return pair.close;
		}
	}

	/**
	 * Find another auto-closing pair that is contained by the one passed in.
	 *
	 * e.g. when having [(,)] and [(*,*)] as auto-closing pairs
	 * this method will find [(,)] as a containment pair for [(*,*)]
	 */
	private static _findContainedAutoClosingPair(config: CursorConfiguration, pair: StandardAutoClosingPairConditional): StandardAutoClosingPairConditional | null {
		if (pair.open.length <= 1) {
			return null;
		}
		const lastChar = pair.close.charAt(pair.close.length - 1);
		// get candidates with the same last character as close
		const candidates = config.autoClosingPairs.autoClosingPairsCloseByEnd.get(lastChar) || [];
		let result: StandardAutoClosingPairConditional | null = null;
		for (const candidate of candidates) {
			if (candidate.open !== pair.open && pair.open.includes(candidate.open) && pair.close.endsWith(candidate.close)) {
				if (!result || candidate.open.length > result.open.length) {
					result = candidate;
				}
			}
		}
		return result;
	}

	/**
	 * Determine if typing `ch` at all `positions` in the `model` results in an
	 * auto closing open sequence being typed.
	 *
	 * Auto closing open sequences can consist of multiple characters, which
	 * can lead to ambiguities. In such a case, the longest auto-closing open
	 * sequence is returned.
	 */
	private static _findAutoClosingPairOpen(config: CursorConfiguration, model: ITextModel, positions: Position[], ch: string): StandardAutoClosingPairConditional | null {
		const candidates = config.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
		if (!candidates) {
			return null;
		}
		// Determine which auto-closing pair it is
		let result: StandardAutoClosingPairConditional | null = null;
		for (const candidate of candidates) {
			if (result === null || candidate.open.length > result.open.length) {
				let candidateIsMatch = true;
				for (const position of positions) {
					const relevantText = model.getValueInRange(new Range(position.lineNumber, position.column - candidate.open.length + 1, position.lineNumber, position.column));
					if (relevantText + ch !== candidate.open) {
						candidateIsMatch = false;
						break;
					}
				}
				if (candidateIsMatch) {
					result = candidate;
				}
			}
		}
		return result;
	}

	private static _isBeforeClosingBrace(config: CursorConfiguration, lineAfter: string) {
		// If the start of lineAfter can be interpretted as both a starting or ending brace, default to returning false
		const nextChar = lineAfter.charAt(0);
		const potentialStartingBraces = config.autoClosingPairs.autoClosingPairsOpenByStart.get(nextChar) || [];
		const potentialClosingBraces = config.autoClosingPairs.autoClosingPairsCloseByStart.get(nextChar) || [];

		const isBeforeStartingBrace = potentialStartingBraces.some(x => lineAfter.startsWith(x.open));
		const isBeforeClosingBrace = potentialClosingBraces.some(x => lineAfter.startsWith(x.close));

		return !isBeforeStartingBrace && isBeforeClosingBrace;
	}
}

export class SurroundSelectionOperation {

	public static getEdits(config: CursorConfiguration, model: ITextModel, selections: Selection[], ch: string, isDoingComposition: boolean): EditOperationResult | undefined {
		if (!isDoingComposition && this._isSurroundSelectionType(config, model, selections, ch)) {
			return this._runSurroundSelectionType(config, selections, ch);
		}
		return;
	}

	private static _runSurroundSelectionType(config: CursorConfiguration, selections: Selection[], ch: string): EditOperationResult {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			const closeCharacter = config.surroundingPairs[ch];
			commands[i] = new SurroundSelectionCommand(selection, ch, closeCharacter);
		}
		return new EditOperationResult(EditOperationType.Other, commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	private static _isSurroundSelectionType(config: CursorConfiguration, model: ITextModel, selections: Selection[], ch: string): boolean {
		if (!shouldSurroundChar(config, ch) || !config.surroundingPairs.hasOwnProperty(ch)) {
			return false;
		}
		const isTypingAQuoteCharacter = isQuote(ch);
		for (const selection of selections) {
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
			if (isTypingAQuoteCharacter && selection.startLineNumber === selection.endLineNumber && selection.startColumn + 1 === selection.endColumn) {
				const selectionText = model.getValueInRange(selection);
				if (isQuote(selectionText)) {
					// Typing a quote character on top of another quote character
					// => disable surround selection type
					return false;
				}
			}
		}
		return true;
	}
}

export class InterceptorElectricCharOperation {

	public static getEdits(prevEditOperationType: EditOperationType, config: CursorConfiguration, model: ITextModel, selections: Selection[], ch: string, isDoingComposition: boolean): EditOperationResult | undefined {
		// Electric characters make sense only when dealing with a single cursor,
		// as multiple cursors typing brackets for example would interfer with bracket matching
		if (!isDoingComposition && this._isTypeInterceptorElectricChar(config, model, selections)) {
			const r = this._typeInterceptorElectricChar(prevEditOperationType, config, model, selections[0], ch);
			if (r) {
				return r;
			}
		}
		return;
	}

	private static _isTypeInterceptorElectricChar(config: CursorConfiguration, model: ITextModel, selections: Selection[]) {
		if (selections.length === 1 && model.tokenization.isCheapToTokenize(selections[0].getEndPosition().lineNumber)) {
			return true;
		}
		return false;
	}

	private static _typeInterceptorElectricChar(prevEditOperationType: EditOperationType, config: CursorConfiguration, model: ITextModel, selection: Selection, ch: string): EditOperationResult | null {
		if (!config.electricChars.hasOwnProperty(ch) || !selection.isEmpty()) {
			return null;
		}
		const position = selection.getPosition();
		model.tokenization.forceTokenization(position.lineNumber);
		const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
		let electricAction: IElectricAction | null;
		try {
			electricAction = config.onElectricCharacter(ch, lineTokens, position.column);
		} catch (e) {
			onUnexpectedError(e);
			return null;
		}
		if (!electricAction) {
			return null;
		}
		if (electricAction.matchOpenBracket) {
			const endColumn = (lineTokens.getLineContent() + ch).lastIndexOf(electricAction.matchOpenBracket) + 1;
			const match = model.bracketPairs.findMatchingBracketUp(electricAction.matchOpenBracket, {
				lineNumber: position.lineNumber,
				column: endColumn
			}, 500 /* give at most 500ms to compute */);
			if (match) {
				if (match.startLineNumber === position.lineNumber) {
					// matched something on the same line => no change in indentation
					return null;
				}
				const matchLine = model.getLineContent(match.startLineNumber);
				const matchLineIndentation = strings.getLeadingWhitespace(matchLine);
				const newIndentation = config.normalizeIndentation(matchLineIndentation);
				const lineText = model.getLineContent(position.lineNumber);
				const lineFirstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(position.lineNumber) || position.column;
				const prefix = lineText.substring(lineFirstNonBlankColumn - 1, position.column - 1);
				const typeText = newIndentation + prefix + ch;
				const typeSelection = new Range(position.lineNumber, 1, position.lineNumber, position.column);
				const command = new ReplaceCommand(typeSelection, typeText);
				return new EditOperationResult(getTypingOperation(typeText, prevEditOperationType), [command], {
					shouldPushStackElementBefore: false,
					shouldPushStackElementAfter: true
				});
			}
		}
		return null;
	}
}

export class SimpleCharacterTypeOperation {

	public static getEdits(prevEditOperationType: EditOperationType, selections: Selection[], ch: string): EditOperationResult {
		// A simple character type
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = new ReplaceCommand(selections[i], ch);
		}

		const opType = getTypingOperation(ch, prevEditOperationType);
		return new EditOperationResult(opType, commands, {
			shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, opType),
			shouldPushStackElementAfter: false
		});
	}
}

export class EnterOperation {

	public static getEdits(config: CursorConfiguration, model: ITextModel, selections: Selection[], ch: string, isDoingComposition: boolean): EditOperationResult | undefined {
		if (!isDoingComposition && ch === '\n') {
			const commands: ICommand[] = [];
			for (let i = 0, len = selections.length; i < len; i++) {
				commands[i] = this._enter(config, model, false, selections[i]);
			}
			return new EditOperationResult(EditOperationType.TypingOther, commands, {
				shouldPushStackElementBefore: true,
				shouldPushStackElementAfter: false,
			});
		}
		return;
	}

	private static _enter(config: CursorConfiguration, model: ITextModel, keepPosition: boolean, range: Range): ICommand {
		if (config.autoIndent === EditorAutoIndentStrategy.None) {
			return typeCommand(range, '\n', keepPosition);
		}
		if (!model.tokenization.isCheapToTokenize(range.getStartPosition().lineNumber) || config.autoIndent === EditorAutoIndentStrategy.Keep) {
			const lineText = model.getLineContent(range.startLineNumber);
			const indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);
			return typeCommand(range, '\n' + config.normalizeIndentation(indentation), keepPosition);
		}
		const r = getEnterAction(config.autoIndent, model, range, config.languageConfigurationService);
		if (r) {
			if (r.indentAction === IndentAction.None) {
				// Nothing special
				return typeCommand(range, '\n' + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);

			} else if (r.indentAction === IndentAction.Indent) {
				// Indent once
				return typeCommand(range, '\n' + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);

			} else if (r.indentAction === IndentAction.IndentOutdent) {
				// Ultra special
				const normalIndent = config.normalizeIndentation(r.indentation);
				const increasedIndent = config.normalizeIndentation(r.indentation + r.appendText);
				const typeText = '\n' + increasedIndent + '\n' + normalIndent;
				if (keepPosition) {
					return new ReplaceCommandWithoutChangingPosition(range, typeText, true);
				} else {
					return new ReplaceCommandWithOffsetCursorState(range, typeText, -1, increasedIndent.length - normalIndent.length, true);
				}
			} else if (r.indentAction === IndentAction.Outdent) {
				const actualIndentation = unshiftIndent(config, r.indentation);
				return typeCommand(range, '\n' + config.normalizeIndentation(actualIndentation + r.appendText), keepPosition);
			}
		}

		const lineText = model.getLineContent(range.startLineNumber);
		const indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);

		if (config.autoIndent >= EditorAutoIndentStrategy.Full) {
			const ir = getIndentForEnter(config.autoIndent, model, range, {
				unshiftIndent: (indent) => {
					return unshiftIndent(config, indent);
				},
				shiftIndent: (indent) => {
					return shiftIndent(config, indent);
				},
				normalizeIndentation: (indent) => {
					return config.normalizeIndentation(indent);
				}
			}, config.languageConfigurationService);

			if (ir) {
				let oldEndViewColumn = config.visibleColumnFromColumn(model, range.getEndPosition());
				const oldEndColumn = range.endColumn;
				const newLineContent = model.getLineContent(range.endLineNumber);
				const firstNonWhitespace = strings.firstNonWhitespaceIndex(newLineContent);
				if (firstNonWhitespace >= 0) {
					range = range.setEndPosition(range.endLineNumber, Math.max(range.endColumn, firstNonWhitespace + 1));
				} else {
					range = range.setEndPosition(range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
				}
				if (keepPosition) {
					return new ReplaceCommandWithoutChangingPosition(range, '\n' + config.normalizeIndentation(ir.afterEnter), true);
				} else {
					let offset = 0;
					if (oldEndColumn <= firstNonWhitespace + 1) {
						if (!config.insertSpaces) {
							oldEndViewColumn = Math.ceil(oldEndViewColumn / config.indentSize);
						}
						offset = Math.min(oldEndViewColumn + 1 - config.normalizeIndentation(ir.afterEnter).length - 1, 0);
					}
					return new ReplaceCommandWithOffsetCursorState(range, '\n' + config.normalizeIndentation(ir.afterEnter), 0, offset, true);
				}
			}
		}
		return typeCommand(range, '\n' + config.normalizeIndentation(indentation), keepPosition);
	}


	public static lineInsertBefore(config: CursorConfiguration, model: ITextModel | null, selections: Selection[] | null): ICommand[] {
		if (model === null || selections === null) {
			return [];
		}
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			let lineNumber = selections[i].positionLineNumber;
			if (lineNumber === 1) {
				commands[i] = new ReplaceCommandWithoutChangingPosition(new Range(1, 1, 1, 1), '\n');
			} else {
				lineNumber--;
				const column = model.getLineMaxColumn(lineNumber);

				commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
			}
		}
		return commands;
	}

	public static lineInsertAfter(config: CursorConfiguration, model: ITextModel | null, selections: Selection[] | null): ICommand[] {
		if (model === null || selections === null) {
			return [];
		}
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const lineNumber = selections[i].positionLineNumber;
			const column = model.getLineMaxColumn(lineNumber);
			commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
		}
		return commands;
	}

	public static lineBreakInsert(config: CursorConfiguration, model: ITextModel, selections: Selection[]): ICommand[] {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = this._enter(config, model, true, selections[i]);
		}
		return commands;
	}
}

export class PasteOperation {

	public static getEdits(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[], text: string, pasteOnNewLine: boolean, multicursorText: string[]) {
		const distributedPaste = this._distributePasteToCursors(config, selections, text, pasteOnNewLine, multicursorText);
		if (distributedPaste) {
			selections = selections.sort(Range.compareRangesUsingStarts);
			return this._distributedPaste(config, model, selections, distributedPaste);
		} else {
			return this._simplePaste(config, model, selections, text, pasteOnNewLine);
		}
	}

	private static _distributePasteToCursors(config: CursorConfiguration, selections: Selection[], text: string, pasteOnNewLine: boolean, multicursorText: string[]): string[] | null {
		if (pasteOnNewLine) {
			return null;
		}
		if (selections.length === 1) {
			return null;
		}
		if (multicursorText && multicursorText.length === selections.length) {
			return multicursorText;
		}
		if (config.multiCursorPaste === 'spread') {
			// Try to spread the pasted text in case the line count matches the cursor count
			// Remove trailing \n if present
			if (text.charCodeAt(text.length - 1) === CharCode.LineFeed) {
				text = text.substring(0, text.length - 1);
			}
			// Remove trailing \r if present
			if (text.charCodeAt(text.length - 1) === CharCode.CarriageReturn) {
				text = text.substring(0, text.length - 1);
			}
			const lines = strings.splitLines(text);
			if (lines.length === selections.length) {
				return lines;
			}
		}
		return null;
	}

	private static _distributedPaste(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[], text: string[]): EditOperationResult {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = new ReplaceCommand(selections[i], text[i]);
		}
		return new EditOperationResult(EditOperationType.Other, commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}

	private static _simplePaste(config: CursorConfiguration, model: ICursorSimpleModel, selections: Selection[], text: string, pasteOnNewLine: boolean): EditOperationResult {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			const position = selection.getPosition();
			if (pasteOnNewLine && !selection.isEmpty()) {
				pasteOnNewLine = false;
			}
			if (pasteOnNewLine && text.indexOf('\n') !== text.length - 1) {
				pasteOnNewLine = false;
			}
			if (pasteOnNewLine) {
				// Paste entire line at the beginning of line
				const typeSelection = new Range(position.lineNumber, 1, position.lineNumber, 1);
				commands[i] = new ReplaceCommandThatPreservesSelection(typeSelection, text, selection, true);
			} else {
				commands[i] = new ReplaceCommand(selection, text);
			}
		}
		return new EditOperationResult(EditOperationType.Other, commands, {
			shouldPushStackElementBefore: true,
			shouldPushStackElementAfter: true
		});
	}
}

export class CompositionOperation {

	public static getEdits(prevEditOperationType: EditOperationType, config: CursorConfiguration, model: ITextModel, selections: Selection[], text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number) {
		const commands = selections.map(selection => this._compositionType(model, selection, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta));
		return new EditOperationResult(EditOperationType.TypingOther, commands, {
			shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, EditOperationType.TypingOther),
			shouldPushStackElementAfter: false
		});
	}

	private static _compositionType(model: ITextModel, selection: Selection, text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number): ICommand | null {
		if (!selection.isEmpty()) {
			// looks like https://github.com/microsoft/vscode/issues/2773
			// where a cursor operation occurred before a canceled composition
			// => ignore composition
			return null;
		}
		const pos = selection.getPosition();
		const startColumn = Math.max(1, pos.column - replacePrevCharCnt);
		const endColumn = Math.min(model.getLineMaxColumn(pos.lineNumber), pos.column + replaceNextCharCnt);
		const range = new Range(pos.lineNumber, startColumn, pos.lineNumber, endColumn);
		const oldText = model.getValueInRange(range);
		if (oldText === text && positionDelta === 0) {
			// => ignore composition that doesn't do anything
			return null;
		}
		return new ReplaceCommandWithOffsetCursorState(range, text, 0, positionDelta);
	}
}

export class TypeWithoutInterceptorsOperation {

	public static getEdits(prevEditOperationType: EditOperationType, selections: Selection[], str: string): EditOperationResult {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			commands[i] = new ReplaceCommand(selections[i], str);
		}
		const opType = getTypingOperation(str, prevEditOperationType);
		return new EditOperationResult(opType, commands, {
			shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, opType),
			shouldPushStackElementAfter: false
		});
	}
}

export class TabOperation {

	public static getCommands(config: CursorConfiguration, model: ITextModel, selections: Selection[]) {
		const commands: ICommand[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];
			if (selection.isEmpty()) {
				const lineText = model.getLineContent(selection.startLineNumber);
				if (/^\s*$/.test(lineText) && model.tokenization.isCheapToTokenize(selection.startLineNumber)) {
					let goodIndent = this._goodIndentForLine(config, model, selection.startLineNumber);
					goodIndent = goodIndent || '\t';
					const possibleTypeText = config.normalizeIndentation(goodIndent);
					if (!lineText.startsWith(possibleTypeText)) {
						commands[i] = new ReplaceCommand(new Range(selection.startLineNumber, 1, selection.startLineNumber, lineText.length + 1), possibleTypeText, true);
						continue;
					}
				}
				commands[i] = this._replaceJumpToNextIndent(config, model, selection, true);
			} else {
				if (selection.startLineNumber === selection.endLineNumber) {
					const lineMaxColumn = model.getLineMaxColumn(selection.startLineNumber);
					if (selection.startColumn !== 1 || selection.endColumn !== lineMaxColumn) {
						// This is a single line selection that is not the entire line
						commands[i] = this._replaceJumpToNextIndent(config, model, selection, false);
						continue;
					}
				}
				commands[i] = new ShiftCommand(selection, {
					isUnshift: false,
					tabSize: config.tabSize,
					indentSize: config.indentSize,
					insertSpaces: config.insertSpaces,
					useTabStops: config.useTabStops,
					autoIndent: config.autoIndent
				}, config.languageConfigurationService);
			}
		}
		return commands;
	}

	private static _goodIndentForLine(config: CursorConfiguration, model: ITextModel, lineNumber: number): string | null {
		let action: IndentAction | EnterAction | null = null;
		let indentation: string = '';
		const expectedIndentAction = getInheritIndentForLine(config.autoIndent, model, lineNumber, false, config.languageConfigurationService);
		if (expectedIndentAction) {
			action = expectedIndentAction.action;
			indentation = expectedIndentAction.indentation;
		} else if (lineNumber > 1) {
			let lastLineNumber: number;
			for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
				const lineText = model.getLineContent(lastLineNumber);
				const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineText);
				if (nonWhitespaceIdx >= 0) {
					break;
				}
			}
			if (lastLineNumber < 1) {
				// No previous line with content found
				return null;
			}
			const maxColumn = model.getLineMaxColumn(lastLineNumber);
			const expectedEnterAction = getEnterAction(config.autoIndent, model, new Range(lastLineNumber, maxColumn, lastLineNumber, maxColumn), config.languageConfigurationService);
			if (expectedEnterAction) {
				indentation = expectedEnterAction.indentation + expectedEnterAction.appendText;
			}
		}
		if (action) {
			if (action === IndentAction.Indent) {
				indentation = shiftIndent(config, indentation);
			}
			if (action === IndentAction.Outdent) {
				indentation = unshiftIndent(config, indentation);
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
		const position = selection.getStartPosition();
		if (config.insertSpaces) {
			const visibleColumnFromColumn = config.visibleColumnFromColumn(model, position);
			const indentSize = config.indentSize;
			const spacesCnt = indentSize - (visibleColumnFromColumn % indentSize);
			for (let i = 0; i < spacesCnt; i++) {
				typeText += ' ';
			}
		} else {
			typeText = '\t';
		}
		return new ReplaceCommand(selection, typeText, insertsAutoWhitespace);
	}
}

export class BaseTypeWithAutoClosingCommand extends ReplaceCommandWithOffsetCursorState {

	private readonly _openCharacter: string;
	private readonly _closeCharacter: string;
	public closeCharacterRange: Range | null;
	public enclosingRange: Range | null;

	constructor(selection: Selection, text: string, lineNumberDeltaOffset: number, columnDeltaOffset: number, openCharacter: string, closeCharacter: string) {
		super(selection, text, lineNumberDeltaOffset, columnDeltaOffset);
		this._openCharacter = openCharacter;
		this._closeCharacter = closeCharacter;
		this.closeCharacterRange = null;
		this.enclosingRange = null;
	}

	protected _computeCursorStateWithRange(model: ITextModel, range: Range, helper: ICursorStateComputerData): Selection {
		this.closeCharacterRange = new Range(range.startLineNumber, range.endColumn - this._closeCharacter.length, range.endLineNumber, range.endColumn);
		this.enclosingRange = new Range(range.startLineNumber, range.endColumn - this._openCharacter.length - this._closeCharacter.length, range.endLineNumber, range.endColumn);
		return super.computeCursorState(model, helper);
	}
}

class TypeWithAutoClosingCommand extends BaseTypeWithAutoClosingCommand {

	constructor(selection: Selection, openCharacter: string, insertOpenCharacter: boolean, closeCharacter: string) {
		const text = (insertOpenCharacter ? openCharacter : '') + closeCharacter;
		const lineNumberDeltaOffset = 0;
		const columnDeltaOffset = -closeCharacter.length;
		super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
	}

	public override computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		const range = inverseEditOperations[0].range;
		return this._computeCursorStateWithRange(model, range, helper);
	}
}

class TypeWithIndentationAndAutoClosingCommand extends BaseTypeWithAutoClosingCommand {

	private readonly _autoIndentationEdit: { range: Range; text: string };
	private readonly _autoClosingEdit: { range: Range; text: string };

	constructor(autoIndentationEdit: { range: Range; text: string }, selection: Selection, openCharacter: string, closeCharacter: string) {
		const text = openCharacter + closeCharacter;
		const lineNumberDeltaOffset = 0;
		const columnDeltaOffset = openCharacter.length;
		super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
		this._autoIndentationEdit = autoIndentationEdit;
		this._autoClosingEdit = { range: selection, text };
	}

	public override getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		builder.addTrackedEditOperation(this._autoIndentationEdit.range, this._autoIndentationEdit.text);
		builder.addTrackedEditOperation(this._autoClosingEdit.range, this._autoClosingEdit.text);
	}

	public override computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		const inverseEditOperations = helper.getInverseEditOperations();
		if (inverseEditOperations.length !== 2) {
			throw new Error('There should be two inverse edit operations!');
		}
		const range1 = inverseEditOperations[0].range;
		const range2 = inverseEditOperations[1].range;
		const range = range1.plusRange(range2);
		return this._computeCursorStateWithRange(model, range, helper);
	}
}

function getTypingOperation(typedText: string, previousTypingOperation: EditOperationType): EditOperationType {
	if (typedText === ' ') {
		return previousTypingOperation === EditOperationType.TypingFirstSpace
			|| previousTypingOperation === EditOperationType.TypingConsecutiveSpace
			? EditOperationType.TypingConsecutiveSpace
			: EditOperationType.TypingFirstSpace;
	}

	return EditOperationType.TypingOther;
}

function shouldPushStackElementBetween(previousTypingOperation: EditOperationType, typingOperation: EditOperationType): boolean {
	if (isTypingOperation(previousTypingOperation) && !isTypingOperation(typingOperation)) {
		// Always set an undo stop before non-type operations
		return true;
	}
	if (previousTypingOperation === EditOperationType.TypingFirstSpace) {
		// `abc |d`: No undo stop
		// `abc  |d`: Undo stop
		return false;
	}
	// Insert undo stop between different operation types
	return normalizeOperationType(previousTypingOperation) !== normalizeOperationType(typingOperation);
}

function normalizeOperationType(type: EditOperationType): EditOperationType | 'space' {
	return (type === EditOperationType.TypingConsecutiveSpace || type === EditOperationType.TypingFirstSpace)
		? 'space'
		: type;
}

function isTypingOperation(type: EditOperationType): boolean {
	return type === EditOperationType.TypingOther
		|| type === EditOperationType.TypingFirstSpace
		|| type === EditOperationType.TypingConsecutiveSpace;
}

function isAutoClosingOvertype(config: CursorConfiguration, model: ITextModel, selections: Selection[], autoClosedCharacters: Range[], ch: string): boolean {
	if (config.autoClosingOvertype === 'never') {
		return false;
	}
	if (!config.autoClosingPairs.autoClosingPairsCloseSingleChar.has(ch)) {
		return false;
	}
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
		// Do not over-type quotes after a backslash
		const chIsQuote = isQuote(ch);
		const beforeCharacter = position.column > 2 ? lineText.charCodeAt(position.column - 2) : CharCode.Null;
		if (beforeCharacter === CharCode.Backslash && chIsQuote) {
			return false;
		}
		// Must over-type a closing character typed by the editor
		if (config.autoClosingOvertype === 'auto') {
			let found = false;
			for (let j = 0, lenJ = autoClosedCharacters.length; j < lenJ; j++) {
				const autoClosedCharacter = autoClosedCharacters[j];
				if (position.lineNumber === autoClosedCharacter.startLineNumber && position.column === autoClosedCharacter.startColumn) {
					found = true;
					break;
				}
			}
			if (!found) {
				return false;
			}
		}
	}
	return true;
}

function typeCommand(range: Range, text: string, keepPosition: boolean): ICommand {
	if (keepPosition) {
		return new ReplaceCommandWithoutChangingPosition(range, text, true);
	} else {
		return new ReplaceCommand(range, text, true);
	}
}

export function shiftIndent(config: CursorConfiguration, indentation: string, count?: number): string {
	count = count || 1;
	return ShiftCommand.shiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}

export function unshiftIndent(config: CursorConfiguration, indentation: string, count?: number): string {
	count = count || 1;
	return ShiftCommand.unshiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}

export function shouldSurroundChar(config: CursorConfiguration, ch: string): boolean {
	if (isQuote(ch)) {
		return (config.autoSurround === 'quotes' || config.autoSurround === 'languageDefined');
	} else {
		// Character is a bracket
		return (config.autoSurround === 'brackets' || config.autoSurround === 'languageDefined');
	}
}
