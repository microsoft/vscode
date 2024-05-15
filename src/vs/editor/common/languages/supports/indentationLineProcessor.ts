/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { createScopedLineTokens, ScopedLineTokens } from 'vs/editor/common/languages/supports';
import { IVirtualModel } from 'vs/editor/common/languages/autoIndent';
import { IViewLineTokens, LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { IndentRulesSupport } from 'vs/editor/common/languages/supports/indentRules';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';

/**
 * This class is a wrapper class around {@link IndentRulesSupport}.
 * It processes the lines by removing the language configuration brackets from the regex, string and comment tokens.
 * It then calls into the {@link IndentRulesSupport} to validate the indentation conditions.
 */
export class ProcessedIndentRulesSupport {

	private readonly _indentRulesSupport: IndentRulesSupport;
	private readonly _indentationLineProcessor: IndentationLineProcessor;

	constructor(
		model: IVirtualModel,
		indentRulesSupport: IndentRulesSupport,
		languageConfigurationService: ILanguageConfigurationService
	) {
		this._indentRulesSupport = indentRulesSupport;
		this._indentationLineProcessor = new IndentationLineProcessor(model, languageConfigurationService);
	}

	/**
	 * Apply the new indentation and return whether the indentation level should be increased after the given line number
	 */
	public shouldIncrease(lineNumber: number, newIndentation?: string): boolean {
		const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber, newIndentation);
		return this._indentRulesSupport.shouldIncrease(processedLine);
	}

	/**
	 * Apply the new indentation and return whether the indentation level should be decreased after the given line number
	 */
	public shouldDecrease(lineNumber: number, newIndentation?: string): boolean {
		const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber, newIndentation);
		return this._indentRulesSupport.shouldDecrease(processedLine);
	}

	/**
	 * Apply the new indentation and return whether the indentation level should remain unchanged at the given line number
	 */
	public shouldIgnore(lineNumber: number, newIndentation?: string): boolean {
		const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber, newIndentation);
		return this._indentRulesSupport.shouldIgnore(processedLine);
	}

	/**
	 * Apply the new indentation and return whether the indentation level should increase on the line after the given line number
	 */
	public shouldIndentNextLine(lineNumber: number, newIndentation?: string): boolean {
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

	private readonly model: ITextModel;
	private readonly indentationLineProcessor: IndentationLineProcessor;

	constructor(
		model: ITextModel,
		languageConfigurationService: ILanguageConfigurationService
	) {
		this.model = model;
		this.indentationLineProcessor = new IndentationLineProcessor(model, languageConfigurationService);
	}

	/**
	 * Returns the processed text, stripped from the language configuration brackets within the string, comment and regex tokens, around the given range
	 */
	getProcessedTokenContextAroundRange(range: Range): {
		beforeRangeProcessedTokens: IViewLineTokens;
		afterRangeProcessedTokens: IViewLineTokens;
		previousLineProcessedTokens: IViewLineTokens;
	} {
		this.model.tokenization.forceTokenization(range.startLineNumber);
		const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);
		const beforeRangeProcessedTokens = this._getProcessedTokensBeforeRange(range, scopedLineTokens);
		const afterRangeProcessedTokens = this._getProcessedTokensAfterRange(range, scopedLineTokens);
		const previousLineProcessedTokens = this._getProcessedPreviousLineTokens(range, scopedLineTokens);
		return { beforeRangeProcessedTokens, afterRangeProcessedTokens, previousLineProcessedTokens };
	}

	private _getProcessedTokensBeforeRange(range: Range, scopedLineTokens: ScopedLineTokens): IViewLineTokens {
		const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		const columnIndexWithinScope = (range.startColumn - 1) - scopedLineTokens.firstCharOffset;
		const firstCharacterOffset = scopedLineTokens.firstCharOffset;
		const lastCharacterOffset = scopedLineTokens.firstCharOffset + columnIndexWithinScope;
		const slicedTokensBefore = lineTokens.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
		const processedTokens = this.indentationLineProcessor.getProcessedTokens(slicedTokensBefore);
		return processedTokens;
	}

	private _getProcessedTokensAfterRange(range: Range, scopedLineTokens: ScopedLineTokens): IViewLineTokens {
		let columnIndexWithinScope: number;
		let lineTokens: LineTokens;
		if (range.isEmpty()) {
			columnIndexWithinScope = (range.startColumn - 1) - scopedLineTokens.firstCharOffset;
			lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		} else {
			columnIndexWithinScope = (range.endColumn - 1) - scopedLineTokens.firstCharOffset;
			lineTokens = this.model.tokenization.getLineTokens(range.endLineNumber);
		}
		const scopedLineContent = scopedLineTokens.getLineContent();
		const firstCharacterOffset = scopedLineTokens.firstCharOffset + columnIndexWithinScope;
		const lastCharacterOffset = scopedLineTokens.firstCharOffset + scopedLineContent.length;
		const slicedTokensAfter = lineTokens.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
		const processedTokens = this.indentationLineProcessor.getProcessedTokens(slicedTokensAfter);
		return processedTokens;
	}

	private _getProcessedPreviousLineTokens(range: Range, scopedLineTokens: ScopedLineTokens): IViewLineTokens {

		// Utility functions
		const getScopedLineTokensAtEndColumnOfLine = (lineNumber: number): ScopedLineTokens => {
			this.model.tokenization.forceTokenization(lineNumber);
			const lineTokens = this.model.tokenization.getLineTokens(lineNumber);
			const endColumnOfLine = this.model.getLineMaxColumn(lineNumber) - 1;
			const scopedLineTokensAtEndColumn = createScopedLineTokens(lineTokens, endColumnOfLine);
			return scopedLineTokensAtEndColumn;
		}
		const getSlicedLineTokensForScopeAtLine = (scopedLineTokens: ScopedLineTokens, lineNumber: number): IViewLineTokens => {
			const initialLine = this.model.tokenization.getLineTokens(lineNumber);
			const scopedLine = scopedLineTokens.getLineContent();
			const firstCharacterOffset = scopedLineTokens.firstCharOffset;
			const lastCharacterOffset = firstCharacterOffset + scopedLine.length;
			const slicedLineTokens = initialLine.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
			return slicedLineTokens;
		}

		// Main code
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
		const previousSlicedLineTokens = getSlicedLineTokensForScopeAtLine(scopedLineTokensAtEndColumnOfPreviousLine, previousLineNumber);
		const processedTokens = this.indentationLineProcessor.getProcessedTokens(previousSlicedLineTokens);
		return processedTokens;
	}
}

/**
 * This class performs the actual processing of the indentation lines.
 * The brackets of the language configuration are removed from the regex, string and comment tokens.
 */
class IndentationLineProcessor {

	constructor(
		private readonly model: IVirtualModel,
		private readonly languageConfigurationService: ILanguageConfigurationService
	) { }

	/**
	 * Get the processed line for the given line number and potentially adjust the indentation level.
	 * Remove the language configuration brackets from the regex, string and comment tokens.
	 */
	getProcessedLine(lineNumber: number, newIndentation?: string): string {

		// Utility function
		const adjustIndentation = (line: string, newIndentation: string): string => {
			const currentIndentation = strings.getLeadingWhitespace(line);
			const adjustedLine = newIndentation + line.substring(currentIndentation.length);
			return adjustedLine;
		}

		// Main code
		const tokens = this.model.tokenization.getLineTokens(lineNumber);
		let processedLine = this.getProcessedTokens(tokens).getLineContent();
		if (newIndentation !== undefined) {
			processedLine = adjustIndentation(processedLine, newIndentation);
		}
		return processedLine;
	}

	/**
	 * Process the line with the given tokens, remove the language configuration brackets from the regex, string and comment tokens.
	 */
	getProcessedTokens(tokens: IViewLineTokens): IViewLineTokens {

		// Utility function
		const shouldRemoveBracketsFromTokenType = (tokenType: StandardTokenType): boolean => {
			return tokenType === StandardTokenType.String
				|| tokenType === StandardTokenType.RegEx
				|| tokenType === StandardTokenType.Comment;
		}

		// Main code
		const languageId = tokens.getLanguageId(0);
		const bracketsConfiguration = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
		const bracketsRegExp = bracketsConfiguration.getBracketRegExp({ global: true });
		const textAndMetadata: { text: string, metadata: number }[] = [];

		let processedLine = '';
		tokens.forEach((tokenIndex: number) => {
			const tokenType = tokens.getStandardTokenType(tokenIndex);
			const text = tokens.getTokenText(tokenIndex);
			const metadata = tokens.getMetadata(tokenIndex);
			if (shouldRemoveBracketsFromTokenType(tokenType)) {
				const processedText = text.replace(bracketsRegExp, '');
				processedLine += processedText;
				textAndMetadata.push({ text: processedText, metadata });
			} else {
				processedLine += text;
				textAndMetadata.push({ text, metadata });
			}
		});
		const processedLineTokens = LineTokens.createFromTextAndMetadata(textAndMetadata, tokens.languageIdCodec);
		return processedLineTokens;
	}
}
