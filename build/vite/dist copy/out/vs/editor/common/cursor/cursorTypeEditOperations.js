/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../../../base/common/errors.js';
import * as strings from '../../../base/common/strings.js';
import { ReplaceCommand, ReplaceCommandWithOffsetCursorState, ReplaceCommandWithoutChangingPosition, ReplaceCommandThatPreservesSelection, ReplaceOvertypeCommand, ReplaceOvertypeCommandOnCompositionEnd } from '../commands/replaceCommand.js';
import { ShiftCommand } from '../commands/shiftCommand.js';
import { SurroundSelectionCommand } from '../commands/surroundSelectionCommand.js';
import { EditOperationResult, isQuote } from '../cursorCommon.js';
import { getMapForWordSeparators } from '../core/wordCharacterClassifier.js';
import { Range } from '../core/range.js';
import { Position } from '../core/position.js';
import { IndentAction } from '../languages/languageConfiguration.js';
import { getIndentationAtPosition } from '../languages/languageConfigurationRegistry.js';
import { createScopedLineTokens } from '../languages/supports.js';
import { getIndentActionForType, getIndentForEnter, getInheritIndentForLine } from '../languages/autoIndent.js';
import { getEnterAction } from '../languages/enterAction.js';
export class AutoIndentOperation {
    static getEdits(config, model, selections, ch, isDoingComposition) {
        if (!isDoingComposition && this._isAutoIndentType(config, model, selections)) {
            const indentationForSelections = [];
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
    static _isAutoIndentType(config, model, selections) {
        if (config.autoIndent < 4 /* EditorAutoIndentStrategy.Full */) {
            return false;
        }
        for (let i = 0, len = selections.length; i < len; i++) {
            if (!model.tokenization.isCheapToTokenize(selections[i].getEndPosition().lineNumber)) {
                return false;
            }
        }
        return true;
    }
    static _findActualIndentationForSelection(config, model, selection, ch) {
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
    static _getIndentationAndAutoClosingPairEdits(config, model, indentationForSelections, ch, autoClosingPairClose) {
        const commands = indentationForSelections.map(({ selection, indentation }) => {
            if (autoClosingPairClose !== null) {
                // Apply both auto closing pair edits and auto indentation edits
                const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, false);
                return new TypeWithIndentationAndAutoClosingCommand(indentationEdit, selection, ch, autoClosingPairClose);
            }
            else {
                // Apply only auto indentation edits
                const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, true);
                return typeCommand(indentationEdit.range, indentationEdit.text, false);
            }
        });
        const editOptions = { shouldPushStackElementBefore: true, shouldPushStackElementAfter: false };
        return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, editOptions);
    }
    static _getEditFromIndentationAndSelection(config, model, indentation, selection, ch, includeChInEdit = true) {
        const startLineNumber = selection.startLineNumber;
        const firstNonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(startLineNumber);
        let text = config.normalizeIndentation(indentation);
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
    static getEdits(prevEditOperationType, config, model, selections, autoClosedCharacters, ch) {
        if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
            return this._runAutoClosingOvertype(prevEditOperationType, selections, ch);
        }
        return;
    }
    static _runAutoClosingOvertype(prevEditOperationType, selections, ch) {
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            const selection = selections[i];
            const position = selection.getPosition();
            const typeSelection = new Range(position.lineNumber, position.column, position.lineNumber, position.column + 1);
            commands[i] = new ReplaceCommand(typeSelection, ch);
        }
        return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, {
            shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, 4 /* EditOperationType.TypingOther */),
            shouldPushStackElementAfter: false
        });
    }
}
export class AutoClosingOvertypeWithInterceptorsOperation {
    static getEdits(config, model, selections, autoClosedCharacters, ch) {
        if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
            // Unfortunately, the close character is at this point "doubled", so we need to delete it...
            const commands = selections.map(s => new ReplaceCommand(new Range(s.positionLineNumber, s.positionColumn, s.positionLineNumber, s.positionColumn + 1), '', false));
            return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, {
                shouldPushStackElementBefore: true,
                shouldPushStackElementAfter: false
            });
        }
        return;
    }
}
export class AutoClosingOpenCharTypeOperation {
    static getEdits(config, model, selections, ch, chIsAlreadyTyped, isDoingComposition) {
        if (!isDoingComposition) {
            const autoClosingPairClose = this.getAutoClosingPairClose(config, model, selections, ch, chIsAlreadyTyped);
            if (autoClosingPairClose !== null) {
                return this._runAutoClosingOpenCharType(selections, ch, chIsAlreadyTyped, autoClosingPairClose);
            }
        }
        return;
    }
    static _runAutoClosingOpenCharType(selections, ch, chIsAlreadyTyped, autoClosingPairClose) {
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            const selection = selections[i];
            commands[i] = new TypeWithAutoClosingCommand(selection, ch, !chIsAlreadyTyped, autoClosingPairClose);
        }
        return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, {
            shouldPushStackElementBefore: true,
            shouldPushStackElementAfter: false
        });
    }
    static getAutoClosingPairClose(config, model, selections, ch, chIsAlreadyTyped) {
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
        const positions = selections.map((s) => {
            const position = s.getPosition();
            if (chIsAlreadyTyped) {
                return { lineNumber: position.lineNumber, beforeColumn: position.column - ch.length, afterColumn: position.column };
            }
            else {
                return { lineNumber: position.lineNumber, beforeColumn: position.column, afterColumn: position.column };
            }
        });
        // Find the longest auto-closing open pair in case of multiple ending in `ch`
        // e.g. when having [f","] and [","], it picks [f","] if the character before is f
        const pair = this._findAutoClosingPairOpen(config, model, positions.map(p => new Position(p.lineNumber, p.beforeColumn)), ch);
        if (!pair) {
            return null;
        }
        let autoCloseConfig;
        let shouldAutoCloseBefore;
        const chIsQuote = isQuote(ch);
        if (chIsQuote) {
            autoCloseConfig = config.autoClosingQuotes;
            shouldAutoCloseBefore = config.shouldAutoCloseBefore.quote;
        }
        else {
            const pairIsForComments = config.blockCommentStartToken ? pair.open.includes(config.blockCommentStartToken) : false;
            if (pairIsForComments) {
                autoCloseConfig = config.autoClosingComments;
                shouldAutoCloseBefore = config.shouldAutoCloseBefore.comment;
            }
            else {
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
                    if (wordSeparators.get(characterBefore) === 0 /* WordCharacterClass.Regular */) {
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
        }
        else {
            return pair.close;
        }
    }
    /**
     * Find another auto-closing pair that is contained by the one passed in.
     *
     * e.g. when having [(,)] and [(*,*)] as auto-closing pairs
     * this method will find [(,)] as a containment pair for [(*,*)]
     */
    static _findContainedAutoClosingPair(config, pair) {
        if (pair.open.length <= 1) {
            return null;
        }
        const lastChar = pair.close.charAt(pair.close.length - 1);
        // get candidates with the same last character as close
        const candidates = config.autoClosingPairs.autoClosingPairsCloseByEnd.get(lastChar) || [];
        let result = null;
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
    static _findAutoClosingPairOpen(config, model, positions, ch) {
        const candidates = config.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
        if (!candidates) {
            return null;
        }
        // Determine which auto-closing pair it is
        let result = null;
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
    static _isBeforeClosingBrace(config, lineAfter) {
        // If the start of lineAfter can be interpretted as both a starting or ending brace, default to returning false
        const nextChar = lineAfter.charAt(0);
        const potentialStartingBraces = config.autoClosingPairs.autoClosingPairsOpenByStart.get(nextChar) || [];
        const potentialClosingBraces = config.autoClosingPairs.autoClosingPairsCloseByStart.get(nextChar) || [];
        const isBeforeStartingBrace = potentialStartingBraces.some(x => lineAfter.startsWith(x.open));
        const isBeforeClosingBrace = potentialClosingBraces.some(x => lineAfter.startsWith(x.close));
        return !isBeforeStartingBrace && isBeforeClosingBrace;
    }
}
export class CompositionEndOvertypeOperation {
    static getEdits(config, compositions) {
        const isOvertypeMode = config.inputMode === 'overtype';
        if (!isOvertypeMode) {
            return null;
        }
        const commands = compositions.map(composition => new ReplaceOvertypeCommandOnCompositionEnd(composition.insertedTextRange));
        return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, {
            shouldPushStackElementBefore: true,
            shouldPushStackElementAfter: false
        });
    }
}
export class SurroundSelectionOperation {
    static getEdits(config, model, selections, ch, isDoingComposition) {
        if (!isDoingComposition && this._isSurroundSelectionType(config, model, selections, ch)) {
            return this._runSurroundSelectionType(config, selections, ch);
        }
        return;
    }
    static _runSurroundSelectionType(config, selections, ch) {
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            const selection = selections[i];
            const closeCharacter = config.surroundingPairs[ch];
            commands[i] = new SurroundSelectionCommand(selection, ch, closeCharacter);
        }
        return new EditOperationResult(0 /* EditOperationType.Other */, commands, {
            shouldPushStackElementBefore: true,
            shouldPushStackElementAfter: true
        });
    }
    static _isSurroundSelectionType(config, model, selections, ch) {
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
    static getEdits(prevEditOperationType, config, model, selections, ch, isDoingComposition) {
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
    static _isTypeInterceptorElectricChar(config, model, selections) {
        if (selections.length === 1 && model.tokenization.isCheapToTokenize(selections[0].getEndPosition().lineNumber)) {
            return true;
        }
        return false;
    }
    static _typeInterceptorElectricChar(prevEditOperationType, config, model, selection, ch) {
        if (!config.electricChars.hasOwnProperty(ch) || !selection.isEmpty()) {
            return null;
        }
        const position = selection.getPosition();
        model.tokenization.forceTokenization(position.lineNumber);
        const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
        let electricAction;
        try {
            electricAction = config.onElectricCharacter(ch, lineTokens, position.column);
        }
        catch (e) {
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
    static getEdits(config, prevEditOperationType, selections, ch, isDoingComposition) {
        // A simple character type
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            const ChosenReplaceCommand = config.inputMode === 'overtype' && !isDoingComposition ? ReplaceOvertypeCommand : ReplaceCommand;
            commands[i] = new ChosenReplaceCommand(selections[i], ch);
        }
        const opType = getTypingOperation(ch, prevEditOperationType);
        return new EditOperationResult(opType, commands, {
            shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, opType),
            shouldPushStackElementAfter: false
        });
    }
}
export class EnterOperation {
    static getEdits(config, model, selections, ch, isDoingComposition) {
        if (!isDoingComposition && ch === '\n') {
            const commands = [];
            for (let i = 0, len = selections.length; i < len; i++) {
                commands[i] = this._enter(config, model, false, selections[i]);
            }
            return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, {
                shouldPushStackElementBefore: true,
                shouldPushStackElementAfter: false,
            });
        }
        return;
    }
    static _enter(config, model, keepPosition, range) {
        if (config.autoIndent === 0 /* EditorAutoIndentStrategy.None */) {
            return typeCommand(range, '\n', keepPosition);
        }
        if (!model.tokenization.isCheapToTokenize(range.getStartPosition().lineNumber) || config.autoIndent === 1 /* EditorAutoIndentStrategy.Keep */) {
            const lineText = model.getLineContent(range.startLineNumber);
            const indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);
            return typeCommand(range, '\n' + config.normalizeIndentation(indentation), keepPosition);
        }
        const r = getEnterAction(config.autoIndent, model, range, config.languageConfigurationService);
        if (r) {
            if (r.indentAction === IndentAction.None) {
                // Nothing special
                return typeCommand(range, '\n' + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);
            }
            else if (r.indentAction === IndentAction.Indent) {
                // Indent once
                return typeCommand(range, '\n' + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);
            }
            else if (r.indentAction === IndentAction.IndentOutdent) {
                // Ultra special
                const normalIndent = config.normalizeIndentation(r.indentation);
                const increasedIndent = config.normalizeIndentation(r.indentation + r.appendText);
                const typeText = '\n' + increasedIndent + '\n' + normalIndent;
                if (keepPosition) {
                    return new ReplaceCommandWithoutChangingPosition(range, typeText, true);
                }
                else {
                    return new ReplaceCommandWithOffsetCursorState(range, typeText, -1, increasedIndent.length - normalIndent.length, true);
                }
            }
            else if (r.indentAction === IndentAction.Outdent) {
                const actualIndentation = unshiftIndent(config, r.indentation);
                return typeCommand(range, '\n' + config.normalizeIndentation(actualIndentation + r.appendText), keepPosition);
            }
        }
        const lineText = model.getLineContent(range.startLineNumber);
        const indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);
        if (config.autoIndent >= 4 /* EditorAutoIndentStrategy.Full */) {
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
                }
                else {
                    range = range.setEndPosition(range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
                }
                if (keepPosition) {
                    return new ReplaceCommandWithoutChangingPosition(range, '\n' + config.normalizeIndentation(ir.afterEnter), true);
                }
                else {
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
    static lineInsertBefore(config, model, selections) {
        if (model === null || selections === null) {
            return [];
        }
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            let lineNumber = selections[i].positionLineNumber;
            if (lineNumber === 1) {
                commands[i] = new ReplaceCommandWithoutChangingPosition(new Range(1, 1, 1, 1), '\n');
            }
            else {
                lineNumber--;
                const column = model.getLineMaxColumn(lineNumber);
                commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
            }
        }
        return commands;
    }
    static lineInsertAfter(config, model, selections) {
        if (model === null || selections === null) {
            return [];
        }
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            const lineNumber = selections[i].positionLineNumber;
            const column = model.getLineMaxColumn(lineNumber);
            commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
        }
        return commands;
    }
    static lineBreakInsert(config, model, selections) {
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            commands[i] = this._enter(config, model, true, selections[i]);
        }
        return commands;
    }
}
export class PasteOperation {
    static getEdits(config, model, selections, text, pasteOnNewLine, multicursorText) {
        const distributedPaste = this._distributePasteToCursors(config, selections, text, pasteOnNewLine, multicursorText);
        if (distributedPaste) {
            selections = selections.sort(Range.compareRangesUsingStarts);
            return this._distributedPaste(config, model, selections, distributedPaste);
        }
        else {
            return this._simplePaste(config, model, selections, text, pasteOnNewLine);
        }
    }
    static _distributePasteToCursors(config, selections, text, pasteOnNewLine, multicursorText) {
        if (selections.length === 1) {
            return null;
        }
        if (multicursorText && multicursorText.length === selections.length) {
            return multicursorText;
        }
        if (pasteOnNewLine) {
            return null;
        }
        if (config.multiCursorPaste === 'spread') {
            // Try to spread the pasted text in case the line count matches the cursor count
            // Remove trailing \n if present
            if (text.charCodeAt(text.length - 1) === 10 /* CharCode.LineFeed */) {
                text = text.substring(0, text.length - 1);
            }
            // Remove trailing \r if present
            if (text.charCodeAt(text.length - 1) === 13 /* CharCode.CarriageReturn */) {
                text = text.substring(0, text.length - 1);
            }
            const lines = strings.splitLines(text);
            if (lines.length === selections.length) {
                return lines;
            }
        }
        return null;
    }
    static _distributedPaste(config, model, selections, text) {
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            const shouldOvertypeOnPaste = config.overtypeOnPaste && config.inputMode === 'overtype';
            const ChosenReplaceCommand = shouldOvertypeOnPaste ? ReplaceOvertypeCommand : ReplaceCommand;
            commands[i] = new ChosenReplaceCommand(selections[i], text[i]);
        }
        return new EditOperationResult(0 /* EditOperationType.Other */, commands, {
            shouldPushStackElementBefore: true,
            shouldPushStackElementAfter: true
        });
    }
    static _simplePaste(config, model, selections, text, pasteOnNewLine) {
        const commands = [];
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
            }
            else {
                const shouldOvertypeOnPaste = config.overtypeOnPaste && config.inputMode === 'overtype';
                const ChosenReplaceCommand = shouldOvertypeOnPaste ? ReplaceOvertypeCommand : ReplaceCommand;
                commands[i] = new ChosenReplaceCommand(selection, text);
            }
        }
        return new EditOperationResult(0 /* EditOperationType.Other */, commands, {
            shouldPushStackElementBefore: true,
            shouldPushStackElementAfter: true
        });
    }
}
export class CompositionOperation {
    static getEdits(prevEditOperationType, config, model, selections, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
        const commands = selections.map(selection => this._compositionType(model, selection, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta));
        return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, {
            shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, 4 /* EditOperationType.TypingOther */),
            shouldPushStackElementAfter: false
        });
    }
    static _compositionType(model, selection, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
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
        return new ReplaceCommandWithOffsetCursorState(range, text, 0, positionDelta);
    }
}
export class TypeWithoutInterceptorsOperation {
    static getEdits(prevEditOperationType, selections, str) {
        const commands = [];
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
    static getCommands(config, model, selections) {
        const commands = [];
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
            }
            else {
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
    static _goodIndentForLine(config, model, lineNumber) {
        let action = null;
        let indentation = '';
        const expectedIndentAction = getInheritIndentForLine(config.autoIndent, model, lineNumber, false, config.languageConfigurationService);
        if (expectedIndentAction) {
            action = expectedIndentAction.action;
            indentation = expectedIndentAction.indentation;
        }
        else if (lineNumber > 1) {
            let lastLineNumber;
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
    static _replaceJumpToNextIndent(config, model, selection, insertsAutoWhitespace) {
        let typeText = '';
        const position = selection.getStartPosition();
        if (config.insertSpaces) {
            const visibleColumnFromColumn = config.visibleColumnFromColumn(model, position);
            const indentSize = config.indentSize;
            const spacesCnt = indentSize - (visibleColumnFromColumn % indentSize);
            for (let i = 0; i < spacesCnt; i++) {
                typeText += ' ';
            }
        }
        else {
            typeText = '\t';
        }
        return new ReplaceCommand(selection, typeText, insertsAutoWhitespace);
    }
}
export class BaseTypeWithAutoClosingCommand extends ReplaceCommandWithOffsetCursorState {
    constructor(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter) {
        super(selection, text, lineNumberDeltaOffset, columnDeltaOffset);
        this._openCharacter = openCharacter;
        this._closeCharacter = closeCharacter;
        this.closeCharacterRange = null;
        this.enclosingRange = null;
    }
    _computeCursorStateWithRange(model, range, helper) {
        this.closeCharacterRange = new Range(range.startLineNumber, range.endColumn - this._closeCharacter.length, range.endLineNumber, range.endColumn);
        this.enclosingRange = new Range(range.startLineNumber, range.endColumn - this._openCharacter.length - this._closeCharacter.length, range.endLineNumber, range.endColumn);
        return super.computeCursorState(model, helper);
    }
}
class TypeWithAutoClosingCommand extends BaseTypeWithAutoClosingCommand {
    constructor(selection, openCharacter, insertOpenCharacter, closeCharacter) {
        const text = (insertOpenCharacter ? openCharacter : '') + closeCharacter;
        const lineNumberDeltaOffset = 0;
        const columnDeltaOffset = -closeCharacter.length;
        super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
    }
    computeCursorState(model, helper) {
        const inverseEditOperations = helper.getInverseEditOperations();
        const range = inverseEditOperations[0].range;
        return this._computeCursorStateWithRange(model, range, helper);
    }
}
class TypeWithIndentationAndAutoClosingCommand extends BaseTypeWithAutoClosingCommand {
    constructor(autoIndentationEdit, selection, openCharacter, closeCharacter) {
        const text = openCharacter + closeCharacter;
        const lineNumberDeltaOffset = 0;
        const columnDeltaOffset = openCharacter.length;
        super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
        this._autoIndentationEdit = autoIndentationEdit;
        this._autoClosingEdit = { range: selection, text };
    }
    getEditOperations(model, builder) {
        builder.addTrackedEditOperation(this._autoIndentationEdit.range, this._autoIndentationEdit.text);
        builder.addTrackedEditOperation(this._autoClosingEdit.range, this._autoClosingEdit.text);
    }
    computeCursorState(model, helper) {
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
function getTypingOperation(typedText, previousTypingOperation) {
    if (typedText === ' ') {
        return previousTypingOperation === 5 /* EditOperationType.TypingFirstSpace */
            || previousTypingOperation === 6 /* EditOperationType.TypingConsecutiveSpace */
            ? 6 /* EditOperationType.TypingConsecutiveSpace */
            : 5 /* EditOperationType.TypingFirstSpace */;
    }
    return 4 /* EditOperationType.TypingOther */;
}
function shouldPushStackElementBetween(previousTypingOperation, typingOperation) {
    if (isTypingOperation(previousTypingOperation) && !isTypingOperation(typingOperation)) {
        // Always set an undo stop before non-type operations
        return true;
    }
    if (previousTypingOperation === 5 /* EditOperationType.TypingFirstSpace */) {
        // `abc |d`: No undo stop
        // `abc  |d`: Undo stop
        return false;
    }
    // Insert undo stop between different operation types
    return normalizeOperationType(previousTypingOperation) !== normalizeOperationType(typingOperation);
}
function normalizeOperationType(type) {
    return (type === 6 /* EditOperationType.TypingConsecutiveSpace */ || type === 5 /* EditOperationType.TypingFirstSpace */)
        ? 'space'
        : type;
}
function isTypingOperation(type) {
    return type === 4 /* EditOperationType.TypingOther */
        || type === 5 /* EditOperationType.TypingFirstSpace */
        || type === 6 /* EditOperationType.TypingConsecutiveSpace */;
}
function isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch) {
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
        const beforeCharacter = position.column > 2 ? lineText.charCodeAt(position.column - 2) : 0 /* CharCode.Null */;
        if (beforeCharacter === 92 /* CharCode.Backslash */ && chIsQuote) {
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
function typeCommand(range, text, keepPosition) {
    if (keepPosition) {
        return new ReplaceCommandWithoutChangingPosition(range, text, true);
    }
    else {
        return new ReplaceCommand(range, text, true);
    }
}
export function shiftIndent(config, indentation, count) {
    count = count || 1;
    return ShiftCommand.shiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}
export function unshiftIndent(config, indentation, count) {
    count = count || 1;
    return ShiftCommand.unshiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}
export function shouldSurroundChar(config, ch) {
    if (isQuote(ch)) {
        return (config.autoSurround === 'quotes' || config.autoSurround === 'languageDefined');
    }
    else {
        // Character is a bracket
        return (config.autoSurround === 'brackets' || config.autoSurround === 'languageDefined');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yVHlwZUVkaXRPcGVyYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9jdXJzb3IvY3Vyc29yVHlwZUVkaXRPcGVyYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sS0FBSyxPQUFPLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxtQ0FBbUMsRUFBRSxxQ0FBcUMsRUFBRSxvQ0FBb0MsRUFBRSxzQkFBc0IsRUFBRSxzQ0FBc0MsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pQLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRixPQUFPLEVBQXVCLG1CQUFtQixFQUF5QyxPQUFPLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5SCxPQUFPLEVBQXNCLHVCQUF1QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDakcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRXpDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUcvQyxPQUFPLEVBQWUsWUFBWSxFQUFzQyxNQUFNLHVDQUF1QyxDQUFDO0FBQ3RILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBR3pGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ2hILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUc3RCxNQUFNLE9BQU8sbUJBQW1CO0lBRXhCLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBMkIsRUFBRSxLQUFpQixFQUFFLFVBQXVCLEVBQUUsRUFBVSxFQUFFLGtCQUEyQjtRQUN0SSxJQUFJLENBQUMsa0JBQWtCLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUM5RSxNQUFNLHdCQUF3QixHQUFvRCxFQUFFLENBQUM7WUFDckYsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDcEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUMxRixJQUFJLFdBQVcsS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDMUIsMEJBQTBCO29CQUMxQixPQUFPO2dCQUNSLENBQUM7Z0JBQ0Qsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDM0QsQ0FBQztZQUNELE1BQU0sb0JBQW9CLEdBQUcsZ0NBQWdDLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVILE9BQU8sSUFBSSxDQUFDLHNDQUFzQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsRUFBRSxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDdkgsQ0FBQztRQUNELE9BQU87SUFDUixDQUFDO0lBRU8sTUFBTSxDQUFDLGlCQUFpQixDQUFDLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxVQUF1QjtRQUN2RyxJQUFJLE1BQU0sQ0FBQyxVQUFVLHdDQUFnQyxFQUFFLENBQUM7WUFDdkQsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUN0RixPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRU8sTUFBTSxDQUFDLGtDQUFrQyxDQUFDLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxTQUFvQixFQUFFLEVBQVU7UUFDakksTUFBTSxpQkFBaUIsR0FBRyxzQkFBc0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUU7WUFDOUUsV0FBVyxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUU7Z0JBQzVCLE9BQU8sV0FBVyxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztZQUN6QyxDQUFDO1lBQ0QsYUFBYSxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUU7Z0JBQzlCLE9BQU8sYUFBYSxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztZQUMzQyxDQUFDO1NBQ0QsRUFBRSxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUV4QyxJQUFJLGlCQUFpQixLQUFLLElBQUksRUFBRSxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE1BQU0sa0JBQWtCLEdBQUcsd0JBQXdCLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxlQUFlLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdHLElBQUksaUJBQWlCLEtBQUssTUFBTSxDQUFDLG9CQUFvQixDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztZQUMzRSxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLGlCQUFpQixDQUFDO0lBQzFCLENBQUM7SUFFTyxNQUFNLENBQUMsc0NBQXNDLENBQUMsTUFBMkIsRUFBRSxLQUFpQixFQUFFLHdCQUF5RSxFQUFFLEVBQVUsRUFBRSxvQkFBbUM7UUFDL04sTUFBTSxRQUFRLEdBQWUsd0JBQXdCLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRTtZQUN4RixJQUFJLG9CQUFvQixLQUFLLElBQUksRUFBRSxDQUFDO2dCQUNuQyxnRUFBZ0U7Z0JBQ2hFLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNuSCxPQUFPLElBQUksd0NBQXdDLENBQUMsZUFBZSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUMzRyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1Asb0NBQW9DO2dCQUNwQyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsbUNBQW1DLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbEgsT0FBTyxXQUFXLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxlQUFlLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3hFLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sV0FBVyxHQUFHLEVBQUUsNEJBQTRCLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLEtBQUssRUFBRSxDQUFDO1FBQy9GLE9BQU8sSUFBSSxtQkFBbUIsd0NBQWdDLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBRU8sTUFBTSxDQUFDLG1DQUFtQyxDQUFDLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxXQUFtQixFQUFFLFNBQW9CLEVBQUUsRUFBVSxFQUFFLGtCQUEyQixJQUFJO1FBQ3hMLE1BQU0sZUFBZSxHQUFHLFNBQVMsQ0FBQyxlQUFlLENBQUM7UUFDbEQsTUFBTSx3QkFBd0IsR0FBRyxLQUFLLENBQUMsK0JBQStCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDeEYsSUFBSSxJQUFJLEdBQVcsTUFBTSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzVELElBQUksd0JBQXdCLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDcEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN4RCxJQUFJLElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyx3QkFBd0IsR0FBRyxDQUFDLEVBQUUsU0FBUyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RixDQUFDO1FBQ0QsSUFBSSxJQUFJLGVBQWUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDbEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsZUFBZSxFQUFFLENBQUMsRUFBRSxTQUFTLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMxRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3hCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyw0QkFBNEI7SUFFakMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxxQkFBd0MsRUFBRSxNQUEyQixFQUFFLEtBQWlCLEVBQUUsVUFBdUIsRUFBRSxvQkFBNkIsRUFBRSxFQUFVO1FBQ2xMLElBQUkscUJBQXFCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsb0JBQW9CLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNoRixPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUUsQ0FBQztRQUNELE9BQU87SUFDUixDQUFDO0lBRU8sTUFBTSxDQUFDLHVCQUF1QixDQUFDLHFCQUF3QyxFQUFFLFVBQXVCLEVBQUUsRUFBVTtRQUNuSCxNQUFNLFFBQVEsR0FBZSxFQUFFLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQyxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDekMsTUFBTSxhQUFhLEdBQUcsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNoSCxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxjQUFjLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFDRCxPQUFPLElBQUksbUJBQW1CLHdDQUFnQyxRQUFRLEVBQUU7WUFDdkUsNEJBQTRCLEVBQUUsNkJBQTZCLENBQUMscUJBQXFCLHdDQUFnQztZQUNqSCwyQkFBMkIsRUFBRSxLQUFLO1NBQ2xDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyw0Q0FBNEM7SUFFakQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUEyQixFQUFFLEtBQWlCLEVBQUUsVUFBdUIsRUFBRSxvQkFBNkIsRUFBRSxFQUFVO1FBQ3hJLElBQUkscUJBQXFCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsb0JBQW9CLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNoRiw0RkFBNEY7WUFDNUYsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ25LLE9BQU8sSUFBSSxtQkFBbUIsd0NBQWdDLFFBQVEsRUFBRTtnQkFDdkUsNEJBQTRCLEVBQUUsSUFBSTtnQkFDbEMsMkJBQTJCLEVBQUUsS0FBSzthQUNsQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBQ0QsT0FBTztJQUNSLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxnQ0FBZ0M7SUFFckMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUEyQixFQUFFLEtBQWlCLEVBQUUsVUFBdUIsRUFBRSxFQUFVLEVBQUUsZ0JBQXlCLEVBQUUsa0JBQTJCO1FBQ2pLLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzNHLElBQUksb0JBQW9CLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQ25DLE9BQU8sSUFBSSxDQUFDLDJCQUEyQixDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUNqRyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU87SUFDUixDQUFDO0lBRU8sTUFBTSxDQUFDLDJCQUEyQixDQUFDLFVBQXVCLEVBQUUsRUFBVSxFQUFFLGdCQUF5QixFQUFFLG9CQUE0QjtRQUN0SSxNQUFNLFFBQVEsR0FBZSxFQUFFLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSwwQkFBMEIsQ0FBQyxTQUFTLEVBQUUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUN0RyxDQUFDO1FBQ0QsT0FBTyxJQUFJLG1CQUFtQix3Q0FBZ0MsUUFBUSxFQUFFO1lBQ3ZFLDRCQUE0QixFQUFFLElBQUk7WUFDbEMsMkJBQTJCLEVBQUUsS0FBSztTQUNsQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU0sTUFBTSxDQUFDLHVCQUF1QixDQUFDLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxVQUF1QixFQUFFLEVBQVUsRUFBRSxnQkFBeUI7UUFDbkosS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNwQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQzFCLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7UUFDRCwrRUFBK0U7UUFDL0UsaUZBQWlGO1FBQ2pGLDhGQUE4RjtRQUM5RixFQUFFO1FBQ0YscUZBQXFGO1FBQ3JGLHNGQUFzRjtRQUN0RixFQUFFO1FBQ0YsTUFBTSxTQUFTLEdBQXdFLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUMzRyxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDakMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN0QixPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3JILENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN6RyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSCw2RUFBNkU7UUFDN0Usa0ZBQWtGO1FBQ2xGLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlILElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksZUFBMEMsQ0FBQztRQUMvQyxJQUFJLHFCQUE4QyxDQUFDO1FBRW5ELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5QixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsZUFBZSxHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQztZQUMzQyxxQkFBcUIsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDO1FBQzVELENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDcEgsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO2dCQUN2QixlQUFlLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDO2dCQUM3QyxxQkFBcUIsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDO1lBQzlELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxlQUFlLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDO2dCQUM3QyxxQkFBcUIsR0FBRyxNQUFNLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDO1lBQzlELENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxlQUFlLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDakMsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsZ0dBQWdHO1FBQ2hHLHFDQUFxQztRQUNyQyw4Q0FBOEM7UUFDOUMsb0VBQW9FO1FBQ3BFLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkUsTUFBTSxrQkFBa0IsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNwRSxJQUFJLHNCQUFzQixHQUFHLElBQUksQ0FBQztRQUVsQyxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxHQUFHLFFBQVEsQ0FBQztZQUMzRCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xELE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFlBQVksR0FBRyxDQUFDLENBQUMsQ0FBQztZQUMzRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUV0RCxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7Z0JBQy9DLHNCQUFzQixHQUFHLEtBQUssQ0FBQztZQUNoQyxDQUFDO1lBQ0QsMEhBQTBIO1lBQzFILElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxjQUFjLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDM0MsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUN6RSxJQUFJLENBQUMsa0JBQWtCLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO29CQUNuRSxPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO1lBQ0YsQ0FBQztZQUNELGtEQUFrRDtZQUNsRCxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxJQUFJLElBQUksRUFBRSxLQUFLLEdBQUcsQ0FBQyxJQUFJLGVBQWUsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDM0YsTUFBTSxjQUFjLEdBQUcsdUJBQXVCLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDMUUsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUMzQixNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQ3JFLElBQUksY0FBYyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsdUNBQStCLEVBQUUsQ0FBQzt3QkFDeEUsT0FBTyxJQUFJLENBQUM7b0JBQ2IsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZELDRCQUE0QjtnQkFDNUIsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBQ0QsS0FBSyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNqRCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNoRSxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDLFVBQVUsRUFBRSxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDOUUsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLEVBQUUsWUFBWSxHQUFHLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7Z0JBQzlGLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELHNHQUFzRztZQUN0RywyRkFBMkY7WUFDM0YsRUFBRTtZQUNGLHlGQUF5RjtZQUN6RiwrRkFBK0Y7WUFDL0YsNEZBQTRGO1lBQzVGLHdGQUF3RjtZQUN4RixFQUFFO1lBQ0YsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNyRCxJQUFJLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3RCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsZ0NBQWdDLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUNsSCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO29CQUMzQixPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDNUIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDL0UsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDbkIsQ0FBQztJQUNGLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNLLE1BQU0sQ0FBQyw2QkFBNkIsQ0FBQyxNQUEyQixFQUFFLElBQXdDO1FBQ2pILElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDM0IsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDMUQsdURBQXVEO1FBQ3ZELE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzFGLElBQUksTUFBTSxHQUE4QyxJQUFJLENBQUM7UUFDN0QsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNwQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2hILElBQUksQ0FBQyxNQUFNLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDM0QsTUFBTSxHQUFHLFNBQVMsQ0FBQztnQkFDcEIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNLLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxNQUEyQixFQUFFLEtBQWlCLEVBQUUsU0FBcUIsRUFBRSxFQUFVO1FBQ3hILE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0UsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELDBDQUEwQztRQUMxQyxJQUFJLE1BQU0sR0FBOEMsSUFBSSxDQUFDO1FBQzdELEtBQUssTUFBTSxTQUFTLElBQUksVUFBVSxFQUFFLENBQUM7WUFDcEMsSUFBSSxNQUFNLEtBQUssSUFBSSxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ25FLElBQUksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO2dCQUM1QixLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUNsQyxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDOUosSUFBSSxZQUFZLEdBQUcsRUFBRSxLQUFLLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDMUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO3dCQUN6QixNQUFNO29CQUNQLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxJQUFJLGdCQUFnQixFQUFFLENBQUM7b0JBQ3RCLE1BQU0sR0FBRyxTQUFTLENBQUM7Z0JBQ3BCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxNQUEyQixFQUFFLFNBQWlCO1FBQ2xGLCtHQUErRztRQUMvRyxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sdUJBQXVCLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEcsTUFBTSxzQkFBc0IsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUV4RyxNQUFNLHFCQUFxQixHQUFHLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDOUYsTUFBTSxvQkFBb0IsR0FBRyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRTdGLE9BQU8sQ0FBQyxxQkFBcUIsSUFBSSxvQkFBb0IsQ0FBQztJQUN2RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sK0JBQStCO0lBRXBDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBMkIsRUFBRSxZQUFrQztRQUNyRixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxLQUFLLFVBQVUsQ0FBQztRQUN2RCxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDckIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLElBQUksc0NBQXNDLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUM1SCxPQUFPLElBQUksbUJBQW1CLHdDQUFnQyxRQUFRLEVBQUU7WUFDdkUsNEJBQTRCLEVBQUUsSUFBSTtZQUNsQywyQkFBMkIsRUFBRSxLQUFLO1NBQ2xDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTywwQkFBMEI7SUFFL0IsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUEyQixFQUFFLEtBQWlCLEVBQUUsVUFBdUIsRUFBRSxFQUFVLEVBQUUsa0JBQTJCO1FBQ3RJLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxJQUFJLENBQUMsd0JBQXdCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUN6RixPQUFPLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFDRCxPQUFPO0lBQ1IsQ0FBQztJQUVPLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxNQUEyQixFQUFFLFVBQXVCLEVBQUUsRUFBVTtRQUN4RyxNQUFNLFFBQVEsR0FBZSxFQUFFLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkQsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksd0JBQXdCLENBQUMsU0FBUyxFQUFFLEVBQUUsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUMzRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLG1CQUFtQixrQ0FBMEIsUUFBUSxFQUFFO1lBQ2pFLDRCQUE0QixFQUFFLElBQUk7WUFDbEMsMkJBQTJCLEVBQUUsSUFBSTtTQUNqQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sTUFBTSxDQUFDLHdCQUF3QixDQUFDLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxVQUF1QixFQUFFLEVBQVU7UUFDMUgsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNwRixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1QyxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ3BDLElBQUksU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQ3pCLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztZQUNELElBQUksK0JBQStCLEdBQUcsSUFBSSxDQUFDO1lBQzNDLEtBQUssSUFBSSxVQUFVLEdBQUcsU0FBUyxDQUFDLGVBQWUsRUFBRSxVQUFVLElBQUksU0FBUyxDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsRUFBRSxDQUFDO2dCQUN0RyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNsRCxNQUFNLFVBQVUsR0FBRyxDQUFDLFVBQVUsS0FBSyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlGLE1BQU0sUUFBUSxHQUFHLENBQUMsVUFBVSxLQUFLLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3RHLE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUM5RCxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztvQkFDakMsOERBQThEO29CQUM5RCwrQkFBK0IsR0FBRyxLQUFLLENBQUM7b0JBQ3hDLE1BQU07Z0JBQ1AsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLCtCQUErQixFQUFFLENBQUM7Z0JBQ3JDLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztZQUNELElBQUksdUJBQXVCLElBQUksU0FBUyxDQUFDLGVBQWUsS0FBSyxTQUFTLENBQUMsYUFBYSxJQUFJLFNBQVMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxLQUFLLFNBQVMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDM0ksTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDdkQsSUFBSSxPQUFPLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztvQkFDNUIsNkRBQTZEO29CQUM3RCxxQ0FBcUM7b0JBQ3JDLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGdDQUFnQztJQUVyQyxNQUFNLENBQUMsUUFBUSxDQUFDLHFCQUF3QyxFQUFFLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxVQUF1QixFQUFFLEVBQVUsRUFBRSxrQkFBMkI7UUFDaEwseUVBQXlFO1FBQ3pFLHVGQUF1RjtRQUN2RixJQUFJLENBQUMsa0JBQWtCLElBQUksSUFBSSxDQUFDLDhCQUE4QixDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUMzRixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMscUJBQXFCLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDckcsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDUCxPQUFPLENBQUMsQ0FBQztZQUNWLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTztJQUNSLENBQUM7SUFFTyxNQUFNLENBQUMsOEJBQThCLENBQUMsTUFBMkIsRUFBRSxLQUFpQixFQUFFLFVBQXVCO1FBQ3BILElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNoSCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTyxNQUFNLENBQUMsNEJBQTRCLENBQUMscUJBQXdDLEVBQUUsTUFBMkIsRUFBRSxLQUFpQixFQUFFLFNBQW9CLEVBQUUsRUFBVTtRQUNySyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUN0RSxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDekMsS0FBSyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pFLElBQUksY0FBc0MsQ0FBQztRQUMzQyxJQUFJLENBQUM7WUFDSixjQUFjLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3JCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksY0FBYyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDckMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxVQUFVLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0RyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRTtnQkFDdkYsVUFBVSxFQUFFLFFBQVEsQ0FBQyxVQUFVO2dCQUMvQixNQUFNLEVBQUUsU0FBUzthQUNqQixFQUFFLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1lBQzVDLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1gsSUFBSSxLQUFLLENBQUMsZUFBZSxLQUFLLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDbkQsaUVBQWlFO29CQUNqRSxPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO2dCQUNELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUM5RCxNQUFNLG9CQUFvQixHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDckUsTUFBTSxjQUFjLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQ3pFLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUMzRCxNQUFNLHVCQUF1QixHQUFHLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQztnQkFDOUcsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDcEYsTUFBTSxRQUFRLEdBQUcsY0FBYyxHQUFHLE1BQU0sR0FBRyxFQUFFLENBQUM7Z0JBQzlDLE1BQU0sYUFBYSxHQUFHLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM5RixNQUFNLE9BQU8sR0FBRyxJQUFJLGNBQWMsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQzVELE9BQU8sSUFBSSxtQkFBbUIsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUscUJBQXFCLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUM5Riw0QkFBNEIsRUFBRSxLQUFLO29CQUNuQywyQkFBMkIsRUFBRSxJQUFJO2lCQUNqQyxDQUFDLENBQUM7WUFDSixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDRCQUE0QjtJQUVqQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQTJCLEVBQUUscUJBQXdDLEVBQUUsVUFBdUIsRUFBRSxFQUFVLEVBQUUsa0JBQTJCO1FBQzdKLDBCQUEwQjtRQUMxQixNQUFNLFFBQVEsR0FBZSxFQUFFLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELE1BQU0sb0JBQW9CLEdBQUcsTUFBTSxDQUFDLFNBQVMsS0FBSyxVQUFVLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQztZQUM5SCxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0QsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBQzdELE9BQU8sSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFO1lBQ2hELDRCQUE0QixFQUFFLDZCQUE2QixDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQztZQUMxRiwyQkFBMkIsRUFBRSxLQUFLO1NBQ2xDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxjQUFjO0lBRW5CLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBMkIsRUFBRSxLQUFpQixFQUFFLFVBQXVCLEVBQUUsRUFBVSxFQUFFLGtCQUEyQjtRQUN0SSxJQUFJLENBQUMsa0JBQWtCLElBQUksRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3hDLE1BQU0sUUFBUSxHQUFlLEVBQUUsQ0FBQztZQUNoQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3ZELFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7WUFDRCxPQUFPLElBQUksbUJBQW1CLHdDQUFnQyxRQUFRLEVBQUU7Z0JBQ3ZFLDRCQUE0QixFQUFFLElBQUk7Z0JBQ2xDLDJCQUEyQixFQUFFLEtBQUs7YUFDbEMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU87SUFDUixDQUFDO0lBRU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUEyQixFQUFFLEtBQWlCLEVBQUUsWUFBcUIsRUFBRSxLQUFZO1FBQ3hHLElBQUksTUFBTSxDQUFDLFVBQVUsMENBQWtDLEVBQUUsQ0FBQztZQUN6RCxPQUFPLFdBQVcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxNQUFNLENBQUMsVUFBVSwwQ0FBa0MsRUFBRSxDQUFDO1lBQ3ZJLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzdELE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDL0YsT0FBTyxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDMUYsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDL0YsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNQLElBQUksQ0FBQyxDQUFDLFlBQVksS0FBSyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzFDLGtCQUFrQjtnQkFDbEIsT0FBTyxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFFM0csQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxZQUFZLEtBQUssWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNuRCxjQUFjO2dCQUNkLE9BQU8sV0FBVyxDQUFDLEtBQUssRUFBRSxJQUFJLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBRTNHLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsWUFBWSxLQUFLLFlBQVksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDMUQsZ0JBQWdCO2dCQUNoQixNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUNoRSxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ2xGLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxlQUFlLEdBQUcsSUFBSSxHQUFHLFlBQVksQ0FBQztnQkFDOUQsSUFBSSxZQUFZLEVBQUUsQ0FBQztvQkFDbEIsT0FBTyxJQUFJLHFDQUFxQyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pFLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPLElBQUksbUNBQW1DLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsTUFBTSxHQUFHLFlBQVksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pILENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksQ0FBQyxDQUFDLFlBQVksS0FBSyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3BELE1BQU0saUJBQWlCLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQy9ELE9BQU8sV0FBVyxDQUFDLEtBQUssRUFBRSxJQUFJLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUMvRyxDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzdELE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFL0YsSUFBSSxNQUFNLENBQUMsVUFBVSx5Q0FBaUMsRUFBRSxDQUFDO1lBQ3hELE1BQU0sRUFBRSxHQUFHLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtnQkFDN0QsYUFBYSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7b0JBQ3pCLE9BQU8sYUFBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDdEMsQ0FBQztnQkFDRCxXQUFXLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRTtvQkFDdkIsT0FBTyxXQUFXLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO2dCQUNELG9CQUFvQixFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7b0JBQ2hDLE9BQU8sTUFBTSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM1QyxDQUFDO2FBQ0QsRUFBRSxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUV4QyxJQUFJLEVBQUUsRUFBRSxDQUFDO2dCQUNSLElBQUksZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLHVCQUF1QixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztnQkFDckYsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztnQkFDckMsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sa0JBQWtCLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUMzRSxJQUFJLGtCQUFrQixJQUFJLENBQUMsRUFBRSxDQUFDO29CQUM3QixLQUFLLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0RyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsS0FBSyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hHLENBQUM7Z0JBQ0QsSUFBSSxZQUFZLEVBQUUsQ0FBQztvQkFDbEIsT0FBTyxJQUFJLHFDQUFxQyxDQUFDLEtBQUssRUFBRSxJQUFJLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbEgsQ0FBQztxQkFBTSxDQUFDO29CQUNQLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztvQkFDZixJQUFJLFlBQVksSUFBSSxrQkFBa0IsR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDNUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQzs0QkFDMUIsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7d0JBQ3BFLENBQUM7d0JBQ0QsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDcEcsQ0FBQztvQkFDRCxPQUFPLElBQUksbUNBQW1DLENBQUMsS0FBSyxFQUFFLElBQUksR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzNILENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sV0FBVyxDQUFDLEtBQUssRUFBRSxJQUFJLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzFGLENBQUM7SUFHTSxNQUFNLENBQUMsZ0JBQWdCLENBQUMsTUFBMkIsRUFBRSxLQUF3QixFQUFFLFVBQThCO1FBQ25ILElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxVQUFVLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDM0MsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQWUsRUFBRSxDQUFDO1FBQ2hDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2RCxJQUFJLFVBQVUsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUM7WUFDbEQsSUFBSSxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3RCLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLHFDQUFxQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3RGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxVQUFVLEVBQUUsQ0FBQztnQkFDYixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBRWxELFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDcEcsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRU0sTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUEyQixFQUFFLEtBQXdCLEVBQUUsVUFBOEI7UUFDbEgsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLFVBQVUsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUMzQyxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBZSxFQUFFLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQztZQUNwRCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbEQsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNwRyxDQUFDO1FBQ0QsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVNLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBMkIsRUFBRSxLQUFpQixFQUFFLFVBQXVCO1FBQ3BHLE1BQU0sUUFBUSxHQUFlLEVBQUUsQ0FBQztRQUNoQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkQsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxjQUFjO0lBRW5CLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBMkIsRUFBRSxLQUF5QixFQUFFLFVBQXVCLEVBQUUsSUFBWSxFQUFFLGNBQXVCLEVBQUUsZUFBeUI7UUFDdkssTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ25ILElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUN0QixVQUFVLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUM3RCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzVFLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUMzRSxDQUFDO0lBQ0YsQ0FBQztJQUVPLE1BQU0sQ0FBQyx5QkFBeUIsQ0FBQyxNQUEyQixFQUFFLFVBQXVCLEVBQUUsSUFBWSxFQUFFLGNBQXVCLEVBQUUsZUFBeUI7UUFDOUosSUFBSSxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzdCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksZUFBZSxJQUFJLGVBQWUsQ0FBQyxNQUFNLEtBQUssVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3JFLE9BQU8sZUFBZSxDQUFDO1FBQ3hCLENBQUM7UUFDRCxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksTUFBTSxDQUFDLGdCQUFnQixLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzFDLGdGQUFnRjtZQUNoRixnQ0FBZ0M7WUFDaEMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLCtCQUFzQixFQUFFLENBQUM7Z0JBQzVELElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzNDLENBQUM7WUFDRCxnQ0FBZ0M7WUFDaEMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLHFDQUE0QixFQUFFLENBQUM7Z0JBQ2xFLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzNDLENBQUM7WUFDRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3hDLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTyxNQUFNLENBQUMsaUJBQWlCLENBQUMsTUFBMkIsRUFBRSxLQUF5QixFQUFFLFVBQXVCLEVBQUUsSUFBYztRQUMvSCxNQUFNLFFBQVEsR0FBZSxFQUFFLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELE1BQU0scUJBQXFCLEdBQUcsTUFBTSxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUMsU0FBUyxLQUFLLFVBQVUsQ0FBQztZQUN4RixNQUFNLG9CQUFvQixHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDO1lBQzdGLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDO1FBQ0QsT0FBTyxJQUFJLG1CQUFtQixrQ0FBMEIsUUFBUSxFQUFFO1lBQ2pFLDRCQUE0QixFQUFFLElBQUk7WUFDbEMsMkJBQTJCLEVBQUUsSUFBSTtTQUNqQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUEyQixFQUFFLEtBQXlCLEVBQUUsVUFBdUIsRUFBRSxJQUFZLEVBQUUsY0FBdUI7UUFDakosTUFBTSxRQUFRLEdBQWUsRUFBRSxDQUFDO1FBQ2hDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2RCxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEMsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3pDLElBQUksY0FBYyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQzVDLGNBQWMsR0FBRyxLQUFLLENBQUM7WUFDeEIsQ0FBQztZQUNELElBQUksY0FBYyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDOUQsY0FBYyxHQUFHLEtBQUssQ0FBQztZQUN4QixDQUFDO1lBQ0QsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDcEIsNkNBQTZDO2dCQUM3QyxNQUFNLGFBQWEsR0FBRyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNoRixRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxvQ0FBb0MsQ0FBQyxhQUFhLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM5RixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLENBQUMsZUFBZSxJQUFJLE1BQU0sQ0FBQyxTQUFTLEtBQUssVUFBVSxDQUFDO2dCQUN4RixNQUFNLG9CQUFvQixHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDO2dCQUM3RixRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDekQsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLElBQUksbUJBQW1CLGtDQUEwQixRQUFRLEVBQUU7WUFDakUsNEJBQTRCLEVBQUUsSUFBSTtZQUNsQywyQkFBMkIsRUFBRSxJQUFJO1NBQ2pDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxvQkFBb0I7SUFFekIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxxQkFBd0MsRUFBRSxNQUEyQixFQUFFLEtBQWlCLEVBQUUsVUFBdUIsRUFBRSxJQUFZLEVBQUUsa0JBQTBCLEVBQUUsa0JBQTBCLEVBQUUsYUFBcUI7UUFDcE8sTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQ25KLE9BQU8sSUFBSSxtQkFBbUIsd0NBQWdDLFFBQVEsRUFBRTtZQUN2RSw0QkFBNEIsRUFBRSw2QkFBNkIsQ0FBQyxxQkFBcUIsd0NBQWdDO1lBQ2pILDJCQUEyQixFQUFFLEtBQUs7U0FDbEMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFpQixFQUFFLFNBQW9CLEVBQUUsSUFBWSxFQUFFLGtCQUEwQixFQUFFLGtCQUEwQixFQUFFLGFBQXFCO1FBQ25LLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUMxQiw2REFBNkQ7WUFDN0Qsa0VBQWtFO1lBQ2xFLHdCQUF3QjtZQUN4QixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDcEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxHQUFHLENBQUMsTUFBTSxHQUFHLGtCQUFrQixDQUFDLENBQUM7UUFDcEcsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRixPQUFPLElBQUksbUNBQW1DLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDL0UsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGdDQUFnQztJQUVyQyxNQUFNLENBQUMsUUFBUSxDQUFDLHFCQUF3QyxFQUFFLFVBQXVCLEVBQUUsR0FBVztRQUNwRyxNQUFNLFFBQVEsR0FBZSxFQUFFLENBQUM7UUFDaEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZELFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdEQsQ0FBQztRQUNELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBQzlELE9BQU8sSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFO1lBQ2hELDRCQUE0QixFQUFFLDZCQUE2QixDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQztZQUMxRiwyQkFBMkIsRUFBRSxLQUFLO1NBQ2xDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxZQUFZO0lBRWpCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBMkIsRUFBRSxLQUFpQixFQUFFLFVBQXVCO1FBQ2hHLE1BQU0sUUFBUSxHQUFlLEVBQUUsQ0FBQztRQUNoQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkQsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLElBQUksU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQ3pCLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUNqRSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztvQkFDL0YsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLGVBQWUsQ0FBQyxDQUFDO29CQUNuRixVQUFVLEdBQUcsVUFBVSxJQUFJLElBQUksQ0FBQztvQkFDaEMsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ2pFLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQzt3QkFDNUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksY0FBYyxDQUFDLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxlQUFlLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDbEosU0FBUztvQkFDVixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM3RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxTQUFTLENBQUMsZUFBZSxLQUFLLFNBQVMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDM0QsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQztvQkFDeEUsSUFBSSxTQUFTLENBQUMsV0FBVyxLQUFLLENBQUMsSUFBSSxTQUFTLENBQUMsU0FBUyxLQUFLLGFBQWEsRUFBRSxDQUFDO3dCQUMxRSw4REFBOEQ7d0JBQzlELFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQzdFLFNBQVM7b0JBQ1YsQ0FBQztnQkFDRixDQUFDO2dCQUNELFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLFlBQVksQ0FBQyxTQUFTLEVBQUU7b0JBQ3pDLFNBQVMsRUFBRSxLQUFLO29CQUNoQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU87b0JBQ3ZCLFVBQVUsRUFBRSxNQUFNLENBQUMsVUFBVTtvQkFDN0IsWUFBWSxFQUFFLE1BQU0sQ0FBQyxZQUFZO29CQUNqQyxXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVc7b0JBQy9CLFVBQVUsRUFBRSxNQUFNLENBQUMsVUFBVTtpQkFDN0IsRUFBRSxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUN6QyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFTyxNQUFNLENBQUMsa0JBQWtCLENBQUMsTUFBMkIsRUFBRSxLQUFpQixFQUFFLFVBQWtCO1FBQ25HLElBQUksTUFBTSxHQUFzQyxJQUFJLENBQUM7UUFDckQsSUFBSSxXQUFXLEdBQVcsRUFBRSxDQUFDO1FBQzdCLE1BQU0sb0JBQW9CLEdBQUcsdUJBQXVCLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUN2SSxJQUFJLG9CQUFvQixFQUFFLENBQUM7WUFDMUIsTUFBTSxHQUFHLG9CQUFvQixDQUFDLE1BQU0sQ0FBQztZQUNyQyxXQUFXLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxDQUFDO1FBQ2hELENBQUM7YUFBTSxJQUFJLFVBQVUsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMzQixJQUFJLGNBQXNCLENBQUM7WUFDM0IsS0FBSyxjQUFjLEdBQUcsVUFBVSxHQUFHLENBQUMsRUFBRSxjQUFjLElBQUksQ0FBQyxFQUFFLGNBQWMsRUFBRSxFQUFFLENBQUM7Z0JBQzdFLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ3RELE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNsRSxJQUFJLGdCQUFnQixJQUFJLENBQUMsRUFBRSxDQUFDO29CQUMzQixNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxjQUFjLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hCLHNDQUFzQztnQkFDdEMsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBQ0QsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sbUJBQW1CLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLGNBQWMsRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1lBQzNLLElBQUksbUJBQW1CLEVBQUUsQ0FBQztnQkFDekIsV0FBVyxHQUFHLG1CQUFtQixDQUFDLFdBQVcsR0FBRyxtQkFBbUIsQ0FBQyxVQUFVLENBQUM7WUFDaEYsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSSxNQUFNLEtBQUssWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNwQyxXQUFXLEdBQUcsV0FBVyxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztZQUNoRCxDQUFDO1lBQ0QsSUFBSSxNQUFNLEtBQUssWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNyQyxXQUFXLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztZQUNsRCxDQUFDO1lBQ0QsV0FBVyxHQUFHLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE9BQU8sV0FBVyxDQUFDO0lBQ3BCLENBQUM7SUFFTyxNQUFNLENBQUMsd0JBQXdCLENBQUMsTUFBMkIsRUFBRSxLQUF5QixFQUFFLFNBQW9CLEVBQUUscUJBQThCO1FBQ25KLElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNsQixNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUM5QyxJQUFJLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN6QixNQUFNLHVCQUF1QixHQUFHLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDaEYsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztZQUNyQyxNQUFNLFNBQVMsR0FBRyxVQUFVLEdBQUcsQ0FBQyx1QkFBdUIsR0FBRyxVQUFVLENBQUMsQ0FBQztZQUN0RSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3BDLFFBQVEsSUFBSSxHQUFHLENBQUM7WUFDakIsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsUUFBUSxHQUFHLElBQUksQ0FBQztRQUNqQixDQUFDO1FBQ0QsT0FBTyxJQUFJLGNBQWMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixDQUFDLENBQUM7SUFDdkUsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDhCQUErQixTQUFRLG1DQUFtQztJQU90RixZQUFZLFNBQW9CLEVBQUUsSUFBWSxFQUFFLHFCQUE2QixFQUFFLGlCQUF5QixFQUFFLGFBQXFCLEVBQUUsY0FBc0I7UUFDdEosS0FBSyxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUscUJBQXFCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsY0FBYyxHQUFHLGFBQWEsQ0FBQztRQUNwQyxJQUFJLENBQUMsZUFBZSxHQUFHLGNBQWMsQ0FBQztRQUN0QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0lBQzVCLENBQUM7SUFFUyw0QkFBNEIsQ0FBQyxLQUFpQixFQUFFLEtBQVksRUFBRSxNQUFnQztRQUN2RyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pKLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3pLLE9BQU8sS0FBSyxDQUFDLGtCQUFrQixDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNoRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLDBCQUEyQixTQUFRLDhCQUE4QjtJQUV0RSxZQUFZLFNBQW9CLEVBQUUsYUFBcUIsRUFBRSxtQkFBNEIsRUFBRSxjQUFzQjtRQUM1RyxNQUFNLElBQUksR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGNBQWMsQ0FBQztRQUN6RSxNQUFNLHFCQUFxQixHQUFHLENBQUMsQ0FBQztRQUNoQyxNQUFNLGlCQUFpQixHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztRQUNqRCxLQUFLLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDakcsQ0FBQztJQUVlLGtCQUFrQixDQUFDLEtBQWlCLEVBQUUsTUFBZ0M7UUFDckYsTUFBTSxxQkFBcUIsR0FBRyxNQUFNLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUNoRSxNQUFNLEtBQUssR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDN0MsT0FBTyxJQUFJLENBQUMsNEJBQTRCLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNoRSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLHdDQUF5QyxTQUFRLDhCQUE4QjtJQUtwRixZQUFZLG1CQUFtRCxFQUFFLFNBQW9CLEVBQUUsYUFBcUIsRUFBRSxjQUFzQjtRQUNuSSxNQUFNLElBQUksR0FBRyxhQUFhLEdBQUcsY0FBYyxDQUFDO1FBQzVDLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztRQUMvQyxLQUFLLENBQUMsU0FBUyxFQUFFLElBQUksRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDaEcsSUFBSSxDQUFDLG9CQUFvQixHQUFHLG1CQUFtQixDQUFDO1FBQ2hELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDcEQsQ0FBQztJQUVlLGlCQUFpQixDQUFDLEtBQWlCLEVBQUUsT0FBOEI7UUFDbEYsT0FBTyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMxRixDQUFDO0lBRWUsa0JBQWtCLENBQUMsS0FBaUIsRUFBRSxNQUFnQztRQUNyRixNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ2hFLElBQUkscUJBQXFCLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sSUFBSSxLQUFLLENBQUMsOENBQThDLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQzlDLE1BQU0sTUFBTSxHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUM5QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDaEUsQ0FBQztDQUNEO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxTQUFpQixFQUFFLHVCQUEwQztJQUN4RixJQUFJLFNBQVMsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUN2QixPQUFPLHVCQUF1QiwrQ0FBdUM7ZUFDakUsdUJBQXVCLHFEQUE2QztZQUN2RSxDQUFDO1lBQ0QsQ0FBQywyQ0FBbUMsQ0FBQztJQUN2QyxDQUFDO0lBRUQsNkNBQXFDO0FBQ3RDLENBQUM7QUFFRCxTQUFTLDZCQUE2QixDQUFDLHVCQUEwQyxFQUFFLGVBQWtDO0lBQ3BILElBQUksaUJBQWlCLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDdkYscURBQXFEO1FBQ3JELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNELElBQUksdUJBQXVCLCtDQUF1QyxFQUFFLENBQUM7UUFDcEUseUJBQXlCO1FBQ3pCLHVCQUF1QjtRQUN2QixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxxREFBcUQ7SUFDckQsT0FBTyxzQkFBc0IsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLHNCQUFzQixDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ3BHLENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUFDLElBQXVCO0lBQ3RELE9BQU8sQ0FBQyxJQUFJLHFEQUE2QyxJQUFJLElBQUksK0NBQXVDLENBQUM7UUFDeEcsQ0FBQyxDQUFDLE9BQU87UUFDVCxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ1QsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsSUFBdUI7SUFDakQsT0FBTyxJQUFJLDBDQUFrQztXQUN6QyxJQUFJLCtDQUF1QztXQUMzQyxJQUFJLHFEQUE2QyxDQUFDO0FBQ3ZELENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxVQUF1QixFQUFFLG9CQUE2QixFQUFFLEVBQVU7SUFDaEosSUFBSSxNQUFNLENBQUMsbUJBQW1CLEtBQUssT0FBTyxFQUFFLENBQUM7UUFDNUMsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQywrQkFBK0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUN0RSxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDdkQsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUMxQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDekMsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDM0QsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzVELElBQUksY0FBYyxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQzNCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELDRDQUE0QztRQUM1QyxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUIsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFjLENBQUM7UUFDdkcsSUFBSSxlQUFlLGdDQUF1QixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ3pELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELHlEQUF5RDtRQUN6RCxJQUFJLE1BQU0sQ0FBQyxtQkFBbUIsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUMzQyxJQUFJLEtBQUssR0FBRyxLQUFLLENBQUM7WUFDbEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxHQUFHLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ25FLE1BQU0sbUJBQW1CLEdBQUcsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BELElBQUksUUFBUSxDQUFDLFVBQVUsS0FBSyxtQkFBbUIsQ0FBQyxlQUFlLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxtQkFBbUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDeEgsS0FBSyxHQUFHLElBQUksQ0FBQztvQkFDYixNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsS0FBWSxFQUFFLElBQVksRUFBRSxZQUFxQjtJQUNyRSxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQ2xCLE9BQU8sSUFBSSxxQ0FBcUMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JFLENBQUM7U0FBTSxDQUFDO1FBQ1AsT0FBTyxJQUFJLGNBQWMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzlDLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxVQUFVLFdBQVcsQ0FBQyxNQUEyQixFQUFFLFdBQW1CLEVBQUUsS0FBYztJQUMzRixLQUFLLEdBQUcsS0FBSyxJQUFJLENBQUMsQ0FBQztJQUNuQixPQUFPLFlBQVksQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxNQUFNLEdBQUcsS0FBSyxFQUFFLE1BQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDbEksQ0FBQztBQUVELE1BQU0sVUFBVSxhQUFhLENBQUMsTUFBMkIsRUFBRSxXQUFtQixFQUFFLEtBQWM7SUFDN0YsS0FBSyxHQUFHLEtBQUssSUFBSSxDQUFDLENBQUM7SUFDbkIsT0FBTyxZQUFZLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsTUFBTSxHQUFHLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQ3BJLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsTUFBMkIsRUFBRSxFQUFVO0lBQ3pFLElBQUksT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDakIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxZQUFZLEtBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxZQUFZLEtBQUssaUJBQWlCLENBQUMsQ0FBQztJQUN4RixDQUFDO1NBQU0sQ0FBQztRQUNQLHlCQUF5QjtRQUN6QixPQUFPLENBQUMsTUFBTSxDQUFDLFlBQVksS0FBSyxVQUFVLElBQUksTUFBTSxDQUFDLFlBQVksS0FBSyxpQkFBaUIsQ0FBQyxDQUFDO0lBQzFGLENBQUM7QUFDRixDQUFDIn0=