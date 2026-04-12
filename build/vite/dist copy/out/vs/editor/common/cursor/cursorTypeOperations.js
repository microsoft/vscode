/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ShiftCommand } from '../commands/shiftCommand.js';
import { CompositionSurroundSelectionCommand } from '../commands/surroundSelectionCommand.js';
import { EditOperationResult, isQuote } from '../cursorCommon.js';
import { AutoClosingOpenCharTypeOperation, AutoClosingOvertypeOperation, AutoClosingOvertypeWithInterceptorsOperation, AutoIndentOperation, CompositionOperation, CompositionEndOvertypeOperation, EnterOperation, InterceptorElectricCharOperation, PasteOperation, shiftIndent, shouldSurroundChar, SimpleCharacterTypeOperation, SurroundSelectionOperation, TabOperation, TypeWithoutInterceptorsOperation, unshiftIndent } from './cursorTypeEditOperations.js';
export class TypeOperations {
    static indent(config, model, selections) {
        if (model === null || selections === null) {
            return [];
        }
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            commands[i] = new ShiftCommand(selections[i], {
                isUnshift: false,
                tabSize: config.tabSize,
                indentSize: config.indentSize,
                insertSpaces: config.insertSpaces,
                useTabStops: config.useTabStops,
                autoIndent: config.autoIndent
            }, config.languageConfigurationService);
        }
        return commands;
    }
    static outdent(config, model, selections) {
        const commands = [];
        for (let i = 0, len = selections.length; i < len; i++) {
            commands[i] = new ShiftCommand(selections[i], {
                isUnshift: true,
                tabSize: config.tabSize,
                indentSize: config.indentSize,
                insertSpaces: config.insertSpaces,
                useTabStops: config.useTabStops,
                autoIndent: config.autoIndent
            }, config.languageConfigurationService);
        }
        return commands;
    }
    static shiftIndent(config, indentation, count) {
        return shiftIndent(config, indentation, count);
    }
    static unshiftIndent(config, indentation, count) {
        return unshiftIndent(config, indentation, count);
    }
    static paste(config, model, selections, text, pasteOnNewLine, multicursorText) {
        return PasteOperation.getEdits(config, model, selections, text, pasteOnNewLine, multicursorText);
    }
    static tab(config, model, selections) {
        return TabOperation.getCommands(config, model, selections);
    }
    static compositionType(prevEditOperationType, config, model, selections, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
        return CompositionOperation.getEdits(prevEditOperationType, config, model, selections, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta);
    }
    /**
     * This is very similar with typing, but the character is already in the text buffer!
     */
    static compositionEndWithInterceptors(prevEditOperationType, config, model, compositions, selections, autoClosedCharacters) {
        if (!compositions) {
            // could not deduce what the composition did
            return null;
        }
        let insertedText = null;
        for (const composition of compositions) {
            if (insertedText === null) {
                insertedText = composition.insertedText;
            }
            else if (insertedText !== composition.insertedText) {
                // not all selections agree on what was typed
                return null;
            }
        }
        if (!insertedText || insertedText.length !== 1) {
            // we're only interested in the case where a single character was inserted
            return CompositionEndOvertypeOperation.getEdits(config, compositions);
        }
        const ch = insertedText;
        let hasDeletion = false;
        for (const composition of compositions) {
            if (composition.deletedText.length !== 0) {
                hasDeletion = true;
                break;
            }
        }
        if (hasDeletion) {
            // Check if this could have been a surround selection
            if (!shouldSurroundChar(config, ch) || !config.surroundingPairs.hasOwnProperty(ch)) {
                return null;
            }
            const isTypingAQuoteCharacter = isQuote(ch);
            for (const composition of compositions) {
                if (composition.deletedSelectionStart !== 0 || composition.deletedSelectionEnd !== composition.deletedText.length) {
                    // more text was deleted than was selected, so this could not have been a surround selection
                    return null;
                }
                if (/^[ \t]+$/.test(composition.deletedText)) {
                    // deleted text was only whitespace
                    return null;
                }
                if (isTypingAQuoteCharacter && isQuote(composition.deletedText)) {
                    // deleted text was a quote
                    return null;
                }
            }
            const positions = [];
            for (const selection of selections) {
                if (!selection.isEmpty()) {
                    return null;
                }
                positions.push(selection.getPosition());
            }
            if (positions.length !== compositions.length) {
                return null;
            }
            const commands = [];
            for (let i = 0, len = positions.length; i < len; i++) {
                commands.push(new CompositionSurroundSelectionCommand(positions[i], compositions[i].deletedText, config.surroundingPairs[ch]));
            }
            return new EditOperationResult(4 /* EditOperationType.TypingOther */, commands, {
                shouldPushStackElementBefore: true,
                shouldPushStackElementAfter: false
            });
        }
        const autoClosingOvertypeEdits = AutoClosingOvertypeWithInterceptorsOperation.getEdits(config, model, selections, autoClosedCharacters, ch);
        if (autoClosingOvertypeEdits !== undefined) {
            return autoClosingOvertypeEdits;
        }
        const autoClosingOpenCharEdits = AutoClosingOpenCharTypeOperation.getEdits(config, model, selections, ch, true, false);
        if (autoClosingOpenCharEdits !== undefined) {
            return autoClosingOpenCharEdits;
        }
        return CompositionEndOvertypeOperation.getEdits(config, compositions);
    }
    static typeWithInterceptors(isDoingComposition, prevEditOperationType, config, model, selections, autoClosedCharacters, ch) {
        const enterEdits = EnterOperation.getEdits(config, model, selections, ch, isDoingComposition);
        if (enterEdits !== undefined) {
            return enterEdits;
        }
        const autoIndentEdits = AutoIndentOperation.getEdits(config, model, selections, ch, isDoingComposition);
        if (autoIndentEdits !== undefined) {
            return autoIndentEdits;
        }
        const autoClosingOverTypeEdits = AutoClosingOvertypeOperation.getEdits(prevEditOperationType, config, model, selections, autoClosedCharacters, ch);
        if (autoClosingOverTypeEdits !== undefined) {
            return autoClosingOverTypeEdits;
        }
        const autoClosingOpenCharEdits = AutoClosingOpenCharTypeOperation.getEdits(config, model, selections, ch, false, isDoingComposition);
        if (autoClosingOpenCharEdits !== undefined) {
            return autoClosingOpenCharEdits;
        }
        const surroundSelectionEdits = SurroundSelectionOperation.getEdits(config, model, selections, ch, isDoingComposition);
        if (surroundSelectionEdits !== undefined) {
            return surroundSelectionEdits;
        }
        const interceptorElectricCharOperation = InterceptorElectricCharOperation.getEdits(prevEditOperationType, config, model, selections, ch, isDoingComposition);
        if (interceptorElectricCharOperation !== undefined) {
            return interceptorElectricCharOperation;
        }
        return SimpleCharacterTypeOperation.getEdits(config, prevEditOperationType, selections, ch, isDoingComposition);
    }
    static typeWithoutInterceptors(prevEditOperationType, config, model, selections, str) {
        return TypeWithoutInterceptorsOperation.getEdits(prevEditOperationType, selections, str);
    }
}
export class CompositionOutcome {
    constructor(deletedText, deletedSelectionStart, deletedSelectionEnd, insertedText, insertedSelectionStart, insertedSelectionEnd, insertedTextRange) {
        this.deletedText = deletedText;
        this.deletedSelectionStart = deletedSelectionStart;
        this.deletedSelectionEnd = deletedSelectionEnd;
        this.insertedText = insertedText;
        this.insertedSelectionStart = insertedSelectionStart;
        this.insertedSelectionEnd = insertedSelectionEnd;
        this.insertedTextRange = insertedTextRange;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3Vyc29yVHlwZU9wZXJhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2N1cnNvci9jdXJzb3JUeXBlT3BlcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0QsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUYsT0FBTyxFQUF1QixtQkFBbUIsRUFBeUMsT0FBTyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFNOUgsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLDRCQUE0QixFQUFFLDRDQUE0QyxFQUFFLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLCtCQUErQixFQUFFLGNBQWMsRUFBRSxnQ0FBZ0MsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFFLDRCQUE0QixFQUFFLDBCQUEwQixFQUFFLFlBQVksRUFBRSxnQ0FBZ0MsRUFBRSxhQUFhLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUVyYyxNQUFNLE9BQU8sY0FBYztJQUVuQixNQUFNLENBQUMsTUFBTSxDQUFDLE1BQTJCLEVBQUUsS0FBZ0MsRUFBRSxVQUE4QjtRQUNqSCxJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksVUFBVSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQzNDLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFlLEVBQUUsQ0FBQztRQUNoQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkQsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksWUFBWSxD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