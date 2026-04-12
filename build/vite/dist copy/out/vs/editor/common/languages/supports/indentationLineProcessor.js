/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from '../../../../base/common/strings.js';
import { createScopedLineTokens } from '../supports.js';
import { LineTokens } from '../../tokens/lineTokens.js';
/**
 * This class is a wrapper class around {@link IndentRulesSupport}.
 * It processes the lines by removing the language configuration brackets from the regex, string and comment tokens.
 * It then calls into the {@link IndentRulesSupport} to validate the indentation conditions.
 */
export class ProcessedIndentRulesSupport {
    constructor(model, indentRulesSupport, languageConfigurationService) {
        this._indentRulesSupport = indentRulesSupport;
        this._indentationLineProcessor = new IndentationLineProcessor(model, languageConfigurationService);
    }
    /**
     * Apply the new indentation and return whether the indentation level should be increased after the given line number
     */
    shouldIncrease(lineNumber, newIndentation) {
        const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber, newIndentation);
        return this._indentRulesSupport.shouldIncrease(processedLine);
    }
    /**
     * Apply the new indentation and return whether the indentation level should be decreased after the given line number
     */
    shouldDecrease(lineNumber, newIndentation) {
        const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber, newIndentation);
        return this._indentRulesSupport.shouldDecrease(processedLine);
    }
    /**
     * Apply the new indentation and return whether the indentation level should remain unchanged at the given line number
     */
    shouldIgnore(lineNumber, newIndentation) {
        const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber, newIndentation);
        return this._indentRulesSupport.shouldIgnore(processedLine);
    }
    /**
     * Apply the new indentation and return whether the indentation level should increase on the line after the given line number
     */
    shouldIndentNextLine(lineNumber, newIndentation) {
        const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber, newIndentation);
        return this._indentRulesSupport.shouldIndentNextLine(processedLine);
    }
}
/**
 * This class fetches the processed text around a range which can be used for indentation evaluation.
 * It returns:
 * - The processed text before the given range and on the same start line
 * - The processed text after the given range and on the same end line
 * - The processed text on the previous line
 */
export class IndentationContextProcessor {
    constructor(model, languageConfigurationService) {
        this.model = model;
        this.indentationLineProcessor = new IndentationLineProcessor(model, languageConfigurationService);
    }
    /**
     * Returns the processed text, stripped from the language configuration brackets within the string, comment and regex tokens, around the given range
     */
    getProcessedTokenContextAroundRange(range) {
        const beforeRangeProcessedTokens = this._getProcessedTokensBeforeRange(range);
        const afterRangeProcessedTokens = this._getProcessedTokensAfterRange(range);
        const previousLineProcessedTokens = this._getProcessedPreviousLineTokens(range);
        return { beforeRangeProcessedTokens, afterRangeProcessedTokens, previousLineProcessedTokens };
    }
    _getProcessedTokensBeforeRange(range) {
        this.model.tokenization.forceTokenization(range.startLineNumber);
        const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
        const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);
        let slicedTokens;
        if (isLanguageDifferentFromLineStart(this.model, range.getStartPosition())) {
            const columnIndexWithinScope = (range.startColumn - 1) - scopedLineTokens.firstCharOffset;
            const firstCharacterOffset = scopedLineTokens.firstCharOffset;
            const lastCharacterOffset = firstCharacterOffset + columnIndexWithinScope;
            slicedTokens = lineTokens.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
        }
        else {
            const columnWithinLine = range.startColumn - 1;
            slicedTokens = lineTokens.sliceAndInflate(0, columnWithinLine, 0);
        }
        const processedTokens = this.indentationLineProcessor.getProcessedTokens(slicedTokens);
        return processedTokens;
    }
    _getProcessedTokensAfterRange(range) {
        const position = range.isEmpty() ? range.getStartPosition() : range.getEndPosition();
        this.model.tokenization.forceTokenization(position.lineNumber);
        const lineTokens = this.model.tokenization.getLineTokens(position.lineNumber);
        const scopedLineTokens = createScopedLineTokens(lineTokens, position.column - 1);
        const columnIndexWithinScope = position.column - 1 - scopedLineTokens.firstCharOffset;
        const firstCharacterOffset = scopedLineTokens.firstCharOffset + columnIndexWithinScope;
        const lastCharacterOffset = scopedLineTokens.firstCharOffset + scopedLineTokens.getLineLength();
        const slicedTokens = lineTokens.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
        const processedTokens = this.indentationLineProcessor.getProcessedTokens(slicedTokens);
        return processedTokens;
    }
    _getProcessedPreviousLineTokens(range) {
        const getScopedLineTokensAtEndColumnOfLine = (lineNumber) => {
            this.model.tokenization.forceTokenization(lineNumber);
            const lineTokens = this.model.tokenization.getLineTokens(lineNumber);
            const endColumnOfLine = this.model.getLineMaxColumn(lineNumber) - 1;
            const scopedLineTokensAtEndColumn = createScopedLineTokens(lineTokens, endColumnOfLine);
            return scopedLineTokensAtEndColumn;
        };
        this.model.tokenization.forceTokenization(range.startLineNumber);
        const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
        const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);
        const emptyTokens = LineTokens.createEmpty('', scopedLineTokens.languageIdCodec);
        const previousLineNumber = range.startLineNumber - 1;
        const isFirstLine = previousLineNumber === 0;
        if (isFirstLine) {
            return emptyTokens;
        }
        const canScopeExtendOnPreviousLine = scopedLineTokens.firstCharOffset === 0;
        if (!canScopeExtendOnPreviousLine) {
            return emptyTokens;
        }
        const scopedLineTokensAtEndColumnOfPreviousLine = getScopedLineTokensAtEndColumnOfLine(previousLineNumber);
        const doesLanguageContinueOnPreviousLine = scopedLineTokens.languageId === scopedLineTokensAtEndColumnOfPreviousLine.languageId;
        if (!doesLanguageContinueOnPreviousLine) {
            return emptyTokens;
        }
        const previousSlicedLineTokens = scopedLineTokensAtEndColumnOfPreviousLine.toIViewLineTokens();
        const processedTokens = this.indentationLineProcessor.getProcessedTokens(previousSlicedLineTokens);
        return processedTokens;
    }
}
/**
 * This class performs the actual processing of the indentation lines.
 * The brackets of the language configuration are removed from the regex, string and comment tokens.
 */
class IndentationLineProcessor {
    constructor(model, languageConfigurationService) {
        this.model = model;
        this.languageConfigurationService = languageConfigurationService;
    }
    /**
     * Get the processed line for the given line number and potentially adjust the indentation level.
     * Remove the language configuration brackets from the regex, string and comment tokens.
     */
    getProcessedLine(lineNumber, newIndentation) {
        const replaceIndentation = (line, newIndentation) => {
            const currentIndentation = strings.getLeadingWhitespace(line);
            const adjustedLine = newIndentation + line.substring(currentIndentation.length);
            return adjustedLine;
        };
        this.model.tokenization.forceTokenization?.(lineNumber);
        const tokens = this.model.tokenization.getLineTokens(lineNumber);
        let processedLine = this.getProcessedTokens(tokens).getLineContent();
        if (newIndentation !== undefined) {
            processedLine = replaceIndentation(processedLine, newIndentation);
        }
        return processedLine;
    }
    /**
     * Process the line with the given tokens, remove the language configuration brackets from the regex, string and comment tokens.
     */
    getProcessedTokens(tokens) {
        const shouldRemoveBracketsFromTokenType = (tokenType) => {
            return tokenType === 2 /* StandardTokenType.String */
                || tokenType === 3 /* StandardTokenType.RegEx */
                || tokenType === 1 /* StandardTokenType.Comment */;
        };
        const languageId = tokens.getLanguageId(0);
        const bracketsConfiguration = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        const bracketsRegExp = bracketsConfiguration.getBracketRegExp({ global: true });
        const textAndMetadata = [];
        tokens.forEach((tokenIndex) => {
            const tokenType = tokens.getStandardTokenType(tokenIndex);
            let text = tokens.getTokenText(tokenIndex);
            if (shouldRemoveBracketsFromTokenType(tokenType)) {
                text = text.replace(bracketsRegExp, '');
            }
            const metadata = tokens.getMetadata(tokenIndex);
            textAndMetadata.push({ text, metadata });
        });
        const processedLineTokens = LineTokens.createFromTextAndMetadata(textAndMetadata, tokens.languageIdCodec);
        return processedLineTokens;
    }
}
export function isLanguageDifferentFromLineStart(model, position) {
    model.tokenization.forceTokenization(position.lineNumber);
    const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
    const scopedLineTokens = createScopedLineTokens(lineTokens, position.column - 1);
    const doesScopeStartAtOffsetZero = scopedLineTokens.firstCharOffset === 0;
    const isScopedLanguageEqualToFirstLanguageOnLine = lineTokens.getLanguageId(0) === scopedLineTokens.languageId;
    const languageIsDifferentFromLineStart = !doesScopeStartAtOffsetZero && !isScopedLanguageEqualToFirstLanguageOnLine;
    return languageIsDifferentFromLineStart;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZW50YXRpb25MaW5lUHJvY2Vzc29yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvaW5kZW50YXRpb25MaW5lUHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFJOUQsT0FBTyxFQUFFLHNCQUFzQixFQUFvQixNQUFNLGdCQUFnQixDQUFDO0FBRTFFLE9BQU8sRUFBbUIsVUFBVSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFLekU7Ozs7R0FJRztBQUNILE1BQU0sT0FBTywyQkFBMkI7SUFLdkMsWUFDQyxLQUFvQixFQUNwQixrQkFBc0MsRUFDdEMsNEJBQTJEO1FBRTNELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxrQkFBa0IsQ0FBQztRQUM5QyxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztJQUNwRyxDQUFDO0lBRUQ7O09BRUc7SUFDSSxjQUFjLENBQUMsVUFBa0IsRUFBRSxjQUF1QjtRQUNoRSxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ2xHLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxjQUFjLENBQUMsVUFBa0IsRUFBRSxjQUF1QjtRQUNoRSxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ2xHLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLGNB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