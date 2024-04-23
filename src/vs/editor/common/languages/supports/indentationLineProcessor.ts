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
import { StandardTokenType, TokenMetadata } from 'vs/editor/common/encodedTokenAttributes';

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
	getProcessedContextAroundRange(range: Range): {
		beforeRangeText: string;
		afterRangeText: string;
		previousLineText: string;
	} {
		this.model.tokenization.forceTokenization(range.startLineNumber);
		const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);
		const beforeRangeText = this._getProcessedTextBeforeRange(range, scopedLineTokens);
		const afterRangeText = this._getProcessedTextAfterRange(range, scopedLineTokens);
		const previousLineText = this._getProcessedPreviousLine(range, scopedLineTokens);
		return { beforeRangeText, afterRangeText, previousLineText };
	}

	private _getProcessedTextBeforeRange(range: Range, scopedLineTokens: ScopedLineTokens): string {
		const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		const columnIndexWithinScope = (range.startColumn - 1) - scopedLineTokens.firstCharOffset;
		const firstCharacterOffset = scopedLineTokens.firstCharOffset;
		const lastCharacterOffset = scopedLineTokens.firstCharOffset + columnIndexWithinScope;
		const slicedTokens = lineTokens.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
		const processedLine = this.indentationLineProcessor.getProcessedLineForTokens(slicedTokens);
		return processedLine;
	}

	private _getProcessedTextAfterRange(range: Range, scopedLineTokens: ScopedLineTokens): string {
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
		const firstCharacterOffset = scopedLineTokens.firstCharOffset + columnIndexWithinScope + 1;
		const lastCharacterOffset = scopedLineTokens.firstCharOffset + scopedLineContent.length + 1;
		const slicedTokens = lineTokens.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
		const processedLine = this.indentationLineProcessor.getProcessedLineForTokens(slicedTokens);
		return processedLine;
	}

	private _getProcessedPreviousLine(range: Range, scopedLineTokens: ScopedLineTokens): string {
		let processedPreviousLine = '';
		if (range.startLineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
			// This is not the first line and the entire line belongs to this mode
			const previousLineNumber = range.startLineNumber - 1;
			this.model.tokenization.forceTokenization(previousLineNumber);
			const lineTokens = this.model.tokenization.getLineTokens(previousLineNumber);
			const column = this.model.getLineMaxColumn(previousLineNumber) - 1;
			const previousLineScopedLineTokens = createScopedLineTokens(lineTokens, column);
			if (previousLineScopedLineTokens.languageId === scopedLineTokens.languageId) {
				// The line above ends with text belonging to the same mode
				const previousScopedLine = previousLineScopedLineTokens.getLineContent();
				const firstCharacterOffset = previousLineScopedLineTokens.firstCharOffset;
				const lastCharacterOffset = firstCharacterOffset + previousScopedLine.length;
				const previousLineTokens = lineTokens.sliceAndInflate(firstCharacterOffset, lastCharacterOffset, 0);
				processedPreviousLine = this.indentationLineProcessor.getProcessedLineForTokens(previousLineTokens);
			}
		}
		return processedPreviousLine;
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
	 * Get the processed line for the given line number and potentially adjust the indentation level. Remove the language configuration brackets from the regex, string and comment tokens.
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
		let processedLine = this.getProcessedLineForTokens(tokens);
		if (newIndentation !== undefined) {
			processedLine = adjustIndentation(processedLine, newIndentation);
		}
		return processedLine;
	}

	/**
	 * Process the line with the given tokens, remove the language configuration brackets from the regex, string and comment tokens.
	 */
	getProcessedLineForTokens(tokens: IViewLineTokens): string {

		// Utility functions
		const removeBracketsFromText = (line: string): string => {
			let processedLine = line;
			openBrackets.forEach((bracket) => {
				const regex = new RegExp(escapeStringForRegex(bracket), 'g');
				processedLine = processedLine.replace(regex, '');
			});
			closedBrackets.forEach((bracket) => {
				const regex = new RegExp(escapeStringForRegex(bracket), 'g');
				processedLine = processedLine.replace(regex, '');
			});
			return processedLine;
		}
		const escapeStringForRegex = (text: string): string => {
			let res = '';
			for (const chr of text) {
				res += escapeCharacterForRegex(chr);
			}
			return res;
		};
		const escapeCharacterForRegex = (character: string): string => {
			return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}

		// Main code
		const languageId = tokens.getLanguageId(0);
		const brackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
		if (!brackets) {
			return tokens.getLineContent();
		}
		const openBrackets = brackets.brackets.map((brackets) => brackets.open).flat();
		const closedBrackets = brackets.brackets.map((brackets) => brackets.close).flat();

		let processedLine = '';
		tokens.forEach((text: string, metadata: number) => {
			const standardTokenType = TokenMetadata.getTokenType(metadata);
			if (standardTokenType === StandardTokenType.String
				|| standardTokenType === StandardTokenType.RegEx
				|| standardTokenType === StandardTokenType.Comment
			) {
				processedLine += removeBracketsFromText(text);
			} else {
				processedLine += text;
			}
		});
		return processedLine;
	}
}
