/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from '../../../base/common/strings.js';
import { IndentAction } from './languageConfiguration.js';
import { IndentationContextProcessor, isLanguageDifferentFromLineStart, ProcessedIndentRulesSupport } from './supports/indentationLineProcessor.js';
/**
 * Get nearest preceding line which doesn't match unIndentPattern or contains all whitespace.
 * Result:
 * -1: run into the boundary of embedded languages
 * 0: every line above are invalid
 * else: nearest preceding line of the same language
 */
function getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport) {
    const languageId = model.tokenization.getLanguageIdAtPosition(lineNumber, 0);
    if (lineNumber > 1) {
        let lastLineNumber;
        let resultLineNumber = -1;
        for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
            if (model.tokenization.getLanguageIdAtPosition(lastLineNumber, 0) !== languageId) {
                return resultLineNumber;
            }
            const text = model.getLineContent(lastLineNumber);
            if (processedIndentRulesSupport.shouldIgnore(lastLineNumber) || /^\s+$/.test(text) || text === '') {
                resultLineNumber = lastLineNumber;
                continue;
            }
            return lastLineNumber;
        }
    }
    return -1;
}
/**
 * Get inherited indentation from above lines.
 * 1. Find the nearest preceding line which doesn't match unIndentedLinePattern.
 * 2. If this line matches indentNextLinePattern or increaseIndentPattern, it means that the indent level of `lineNumber` should be 1 greater than this line.
 * 3. If this line doesn't match any indent rules
 *   a. check whether the line above it matches indentNextLinePattern
 *   b. If not, the indent level of this line is the result
 *   c. If so, it means the indent of this line is *temporary*, go upward utill we find a line whose indent is not temporary (the same workflow a -> b -> c).
 * 4. Otherwise, we fail to get an inherited indent from aboves. Return null and we should not touch the indent of `lineNumber`
 *
 * This function only return the inherited indent based on above lines, it doesn't check whether current line should decrease or not.
 */
export function getInheritIndentForLine(autoIndent, model, lineNumber, honorIntentialIndent = true, languageConfigurationService) {
    if (autoIndent < 4 /* EditorAutoIndentStrategy.Full */) {
        return null;
    }
    const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.tokenization.getLanguageId()).indentRulesSupport;
    if (!indentRulesSupport) {
        return null;
    }
    const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentRulesSupport, languageConfigurationService);
    if (lineNumber <= 1) {
        return {
            indentation: '',
            action: null
        };
    }
    // Use no indent if this is the first non-blank line
    for (let priorLineNumber = lineNumber - 1; priorLineNumber > 0; priorLineNumber--) {
        if (model.getLineContent(priorLineNumber) !== '') {
            break;
        }
        if (priorLineNumber === 1) {
            return {
                indentation: '',
                action: null
            };
        }
    }
    const precedingUnIgnoredLine = getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport);
    if (precedingUnIgnoredLine < 0) {
        return null;
    }
    else if (precedingUnIgnoredLine < 1) {
        return {
            indentation: '',
            action: null
        };
    }
    if (processedIndentRulesSupport.shouldIncrease(precedingUnIgnoredLine) || processedIndentRulesSupport.shouldIndentNextLine(precedingUnIgnoredLine)) {
        const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
        return {
            indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
            action: IndentAction.Indent,
            line: precedingUnIgnoredLine
        };
    }
    else if (processedIndentRulesSupport.shouldDecrease(precedingUnIgnoredLine)) {
        const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
        return {
            indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
            action: null,
            line: precedingUnIgnoredLine
        };
    }
    else {
        // precedingUnIgnoredLine can not be ignored.
        // it doesn't increase indent of following lines
        // it doesn't increase just next line
        // so current line is not affect by precedingUnIgnoredLine
        // and then we should get a correct inheritted indentation from above lines
        if (precedingUnIgnoredLine === 1) {
            return {
                indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
                action: null,
                line: precedingUnIgnoredLine
            };
        }
        const previousLine = precedingUnIgnoredLine - 1;
        const previousLineIndentMetadata = indentRulesSupport.getIndentMetadata(model.getLineContent(previousLine));
        if (!(previousLineIndentMetadata & (1 /* IndentConsts.INCREASE_MASK */ | 2 /* IndentConsts.DECREASE_MASK */)) &&
            (previousLineIndentMetadata & 4 /* IndentConsts.INDENT_NEXTLINE_MASK */)) {
            let stopLine = 0;
            for (let i = previousLine - 1; i > 0; i--) {
                if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
                    continue;
                }
                stopLine = i;
                break;
            }
            return {
                indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
                action: null,
                line: stopLine + 1
            };
        }
        if (honorIntentialIndent) {
            return {
                indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
                action: null,
                line: precedingUnIgnoredLine
            };
        }
        else {
            // search from precedingUnIgnoredLine until we find one whose indent is not temporary
            for (let i = precedingUnIgnoredLine; i > 0; i--) {
                if (processedIndentRulesSupport.shouldIncrease(i)) {
                    return {
                        indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
                        action: IndentAction.Indent,
                        line: i
                    };
                }
                else if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
                    let stopLine = 0;
                    for (let j = i - 1; j > 0; j--) {
                        if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
                            continue;
                        }
                        stopLine = j;
                        break;
                    }
                    return {
                        indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
                        action: null,
                        line: stopLine + 1
                    };
                }
                else if (processedIndentRulesSupport.shouldDecrease(i)) {
                    return {
                        indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
                        action: null,
                        line: i
                    };
                }
            }
            return {
                indentation: strings.getLeadingWhitespace(model.getLineContent(1)),
                action: null,
                line: 1
            };
        }
    }
}
export function getGoodIndentForLine(autoIndent, virtualModel, languageId, lineNumber, indentConverter, languageConfigurationService) {
    if (autoIndent < 4 /* EditorAutoIndentStrategy.Full */) {
        return null;
    }
    const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
    if (!richEditSupport) {
        return null;
    }
    const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
    if (!indentRulesSupport) {
        return null;
    }
    const processedIndentRulesSupport = new ProcessedIndentRulesSupport(virtualModel, indentRulesSupport, languageConfigurationService);
    const indent = getInheritIndentForLine(autoIndent, virtualModel, lineNumber, undefined, languageConfigurationService);
    if (indent) {
        const inheritLine = indent.line;
        if (inheritLine !== undefined) {
            // Apply enter action as long as there are only whitespace lines between inherited line and this line.
            let shouldApplyEnterRules = true;
            for (let inBetweenLine = inheritLine; inBetweenLine < lineNumber - 1; inBetweenLine++) {
                if (!/^\s*$/.test(virtualModel.getLineContent(inBetweenLine))) {
                    shouldApplyEnterRules = false;
                    break;
                }
            }
            if (shouldApplyEnterRules) {
                const enterResult = richEditSupport.onEnter(autoIndent, '', virtualModel.getLineContent(inheritLine), '');
                if (enterResult) {
                    let indentation = strings.getLeadingWhitespace(virtualModel.getLineContent(inheritLine));
                    if (enterResult.removeText) {
                        indentation = indentation.substring(0, indentation.length - enterResult.removeText);
                    }
                    if ((enterResult.indentAction === IndentAction.Indent) ||
                        (enterResult.indentAction === IndentAction.IndentOutdent)) {
                        indentation = indentConverter.shiftIndent(indentation);
                    }
                    else if (enterResult.indentAction === IndentAction.Outdent) {
                        indentation = indentConverter.unshiftIndent(indentation);
                    }
                    if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
                        indentation = indentConverter.unshiftIndent(indentation);
                    }
                    if (enterResult.appendText) {
                        indentation += enterResult.appendText;
                    }
                    return strings.getLeadingWhitespace(indentation);
                }
            }
        }
        if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
            if (indent.action === IndentAction.Indent) {
                return indent.indentation;
            }
            else {
                return indentConverter.unshiftIndent(indent.indentation);
            }
        }
        else {
            if (indent.action === IndentAction.Indent) {
                return indentConverter.shiftIndent(indent.indentation);
            }
            else {
                return indent.indentation;
            }
        }
    }
    return null;
}
export function getIndentForEnter(autoIndent, model, range, indentConverter, languageConfigurationService) {
    if (autoIndent < 4 /* EditorAutoIndentStrategy.Full */) {
        return null;
    }
    const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
    const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
    if (!indentRulesSupport) {
        return null;
    }
    model.tokenization.forceTokenization(range.startLineNumber);
    const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
    const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
    const afterEnterProcessedTokens = processedContextTokens.afterRangeProcessedTokens;
    const beforeEnterProcessedTokens = processedContextTokens.beforeRangeProcessedTokens;
    const beforeEnterIndent = strings.getLeadingWhitespace(beforeEnterProcessedTokens.getLineContent());
    const virtualModel = createVirtualModelWithModifiedTokensAtLine(model, range.startLineNumber, beforeEnterProcessedTokens);
    const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
    const currentLine = model.getLineContent(range.startLineNumber);
    const currentLineIndent = strings.getLeadingWhitespace(currentLine);
    const afterEnterAction = getInheritIndentForLine(autoIndent, virtualModel, range.startLineNumber + 1, undefined, languageConfigurationService);
    if (!afterEnterAction) {
        const beforeEnter = languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent;
        return {
            beforeEnter: beforeEnter,
            afterEnter: beforeEnter
        };
    }
    let afterEnterIndent = languageIsDifferentFromLineStart ? currentLineIndent : afterEnterAction.indentation;
    if (afterEnterAction.action === IndentAction.Indent) {
        afterEnterIndent = indentConverter.shiftIndent(afterEnterIndent);
    }
    if (indentRulesSupport.shouldDecrease(afterEnterProcessedTokens.getLineContent())) {
        afterEnterIndent = indentConverter.unshiftIndent(afterEnterIndent);
    }
    return {
        beforeEnter: languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent,
        afterEnter: afterEnterIndent
    };
}
/**
 * We should always allow intentional indentation. It means, if users change the indentation of `lineNumber` and the content of
 * this line doesn't match decreaseIndentPattern, we should not adjust the indentation.
 */
export function getIndentActionForType(cursorConfig, model, range, ch, indentConverter, languageConfigurationService) {
    const autoIndent = cursorConfig.autoIndent;
    if (autoIndent < 4 /* EditorAutoIndentStrategy.Full */) {
        return null;
    }
    const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
    if (languageIsDifferentFromLineStart) {
        // this line has mixed languages and indentation rules will not work
        return null;
    }
    const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
    const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
    if (!indentRulesSupport) {
        return null;
    }
    const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
    const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
    const beforeRangeText = processedContextTokens.beforeRangeProcessedTokens.getLineContent();
    const afterRangeText = processedContextTokens.afterRangeProcessedTokens.getLineContent();
    const textAroundRange = beforeRangeText + afterRangeText;
    const textAroundRangeWithCharacter = beforeRangeText + ch + afterRangeText;
    // If previous content already matches decreaseIndentPattern, it means indentation of this line should already be adjusted
    // Users might change the indentation by purpose and we should honor that instead of readjusting.
    if (!indentRulesSupport.shouldDecrease(textAroundRange) && indentRulesSupport.shouldDecrease(textAroundRangeWithCharacter)) {
        // after typing `ch`, the content matches decreaseIndentPattern, we should adjust the indent to a good manner.
        // 1. Get inherited indent action
        const r = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
        if (!r) {
            return null;
        }
        let indentation = r.indentation;
        if (r.action !== IndentAction.Indent) {
            indentation = indentConverter.unshiftIndent(indentation);
        }
        return indentation;
    }
    const previousLineNumber = range.startLineNumber - 1;
    if (previousLineNumber > 0) {
        const previousLine = model.getLineContent(previousLineNumber);
        if (indentRulesSupport.shouldIndentNextLine(previousLine) && indentRulesSupport.shouldIncrease(textAroundRangeWithCharacter)) {
            const inheritedIndentationData = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
            const inheritedIndentation = inheritedIndentationData?.indentation;
            if (inheritedIndentation !== undefined) {
                const currentLine = model.getLineContent(range.startLineNumber);
                const actualCurrentIndentation = strings.getLeadingWhitespace(currentLine);
                const inferredCurrentIndentation = indentConverter.shiftIndent(inheritedIndentation);
                // If the inferred current indentation is not equal to the actual current indentation, then the indentation has been intentionally changed, in that case keep it
                const inferredIndentationEqualsActual = inferredCurrentIndentation === actualCurrentIndentation;
                const textAroundRangeContainsOnlyWhitespace = /^\s*$/.test(textAroundRange);
                const autoClosingPairs = cursorConfig.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
                const autoClosingPairExists = autoClosingPairs && autoClosingPairs.length > 0;
                const isChFirstNonWhitespaceCharacterAndInAutoClosingPair = autoClosingPairExists && textAroundRangeContainsOnlyWhitespace;
                if (inferredIndentationEqualsActual && isChFirstNonWhitespaceCharacterAndInAutoClosingPair) {
                    return inheritedIndentation;
                }
            }
        }
    }
    return null;
}
export function getIndentMetadata(model, lineNumber, languageConfigurationService) {
    const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).indentRulesSupport;
    if (!indentRulesSupport) {
        return null;
    }
    if (lineNumber < 1 || lineNumber > model.getLineCount()) {
        return null;
    }
    return indentRulesSupport.getIndentMetadata(model.getLineContent(lineNumber));
}
function createVirtualModelWithModifiedTokensAtLine(model, modifiedLineNumber, modifiedTokens) {
    const virtualModel = {
        tokenization: {
            getLineTokens: (lineNumber) => {
                if (lineNumber === modifiedLineNumber) {
                    return modifiedTokens;
                }
                else {
                    return model.tokenization.getLineTokens(lineNumber);
                }
            },
            getLanguageId: () => {
                return model.getLanguageId();
            },
            getLanguageIdAtPosition: (lineNumber, column) => {
                return model.getLanguageIdAtPosition(lineNumber, column);
            },
        },
        getLineContent: (lineNumber) => {
            if (lineNumber === modifiedLineNumber) {
                return modifiedTokens.getLineContent();
            }
            else {
                return model.getLineContent(lineNumber);
            }
        }
    };
    return virtualModel;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0b0luZGVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2F1dG9JbmRlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUczRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFLMUQsT0FBTyxFQUFFLDJCQUEyQixFQUFFLGdDQUFnQyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFtQnBKOzs7Ozs7R0FNRztBQUNILFNBQVMscUJBQXFCLENBQUMsS0FBb0IsRUFBRSxVQUFrQixFQUFFLDJCQUF3RDtJQUNoSSxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RSxJQUFJLFVBQVUsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNwQixJQUFJLGNBQXNCLENBQUM7UUFDM0IsSUFBSSxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUUxQixLQUFLLGNBQWMsR0FBRyxVQUFVLEdBQUcsQ0FBQyxFQUFFLGNBQWMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLEVBQUUsQ0FBQztZQUM3RSxJQUFJLEtBQUssQ0FBQyxZQUFZLENBQUMsdUJBQXVCLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxLQUFLLFVBQVUsRUFBRSxDQUFDO2dCQUNsRixPQUFPLGdCQUFnQixDQUFDO1lBQ3pCLENBQUM7WUFDRCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ2xELElBQUksMkJBQTJCLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFB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