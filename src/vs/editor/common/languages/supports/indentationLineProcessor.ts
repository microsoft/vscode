/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { createScopedLineTokens, ScopedLineTokens } from 'vs/editor/common/languages/supports';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { IVirtualModel } from 'vs/editor/common/languages/autoIndent';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { IndentRulesSupport } from 'vs/editor/common/languages/supports/indentRules';

/**
 * This class processes the lines (it removes the brackets of the given language configuration) before calling the {@link IndentRulesSupport} methods
 */
export class ProcessedIndentRulesSupport {

	private readonly _indentationLineProcessor: IndentationLineProcessor;
	private readonly _indentRulesSupport: IndentRulesSupport;

	constructor(
		model: IVirtualModel,
		indentRulesSupport: IndentRulesSupport,
		languageConfigurationService: ILanguageConfigurationService
	) {
		this._indentRulesSupport = indentRulesSupport;
		this._indentationLineProcessor = new IndentationLineProcessor(model, languageConfigurationService);
	}

	public shouldIncrease(lineNumber: number): boolean {
		const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber)
		return this._indentRulesSupport.shouldIncrease(processedLine);
	}

	public shouldDecrease(lineNumber: number): boolean {
		const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber)
		return this._indentRulesSupport.shouldDecrease(processedLine);
	}

	public shouldIgnore(lineNumber: number): boolean {
		const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber)
		return this._indentRulesSupport.shouldIgnore(processedLine);
	}

	public shouldIndentNextLine(lineNumber: number): boolean {
		const processedLine = this._indentationLineProcessor.getProcessedLine(lineNumber)
		return this._indentRulesSupport.shouldIndentNextLine(processedLine);
	}
}

export class IndentationLineProcessor {

	constructor(
		protected readonly model: IVirtualModel,
		protected readonly languageConfigurationService: ILanguageConfigurationService
	) { }

	getProcessedLine(lineNumber: number): string {
		const lineContent = this.model.getLineContent(lineNumber);
		const tokens = this.model.tokenization.getLineTokens(lineNumber);
		const processedLine = this.getProcessedLineForLineAndTokens(lineContent, tokens);
		return processedLine;
	}

	getProcessedLineForLineAndTokens(line: string, tokens: LineTokens | ScopedLineTokens): string {

		// Utility functions
		const removeBracketsFromTokenWithIndexWithinLine = (tokenIndex: number, characterOffset: number, processedLine: string): { processedCharacterOffset: number, processedLine: string } => {
			const result = removeBracketsFromTokenWithIndex(tokenIndex);
			const processedCharacterOffset = characterOffset - (result.tokenText.length - result.processedText.length);
			const lineBeforeCharacterOffset = processedLine.substring(0, characterOffset + result.tokenStartCharacterOffset);
			const lineAfterCharacterOffset = processedLine.substring(characterOffset + result.tokenEndCharacterOffset);
			const newProcessedLine = lineBeforeCharacterOffset + result.processedText + lineAfterCharacterOffset;
			return { processedCharacterOffset, processedLine: newProcessedLine };
		};
		const removeBracketsFromTokenWithIndex = (tokenIndex: number): { tokenText: string; processedText: string; tokenStartCharacterOffset: number; tokenEndCharacterOffset: number } => {
			const tokenStartCharacterOffset = tokens.getStartOffset(tokenIndex);
			const tokenEndCharacterOffset = tokens.getEndOffset(tokenIndex);
			const tokenText = line.substring(tokenStartCharacterOffset, tokenEndCharacterOffset);
			const processedText = removeBracketsFromText(tokenText);
			return { tokenText, processedText, tokenStartCharacterOffset, tokenEndCharacterOffset };
		}
		const removeBracketsFromText = (line: string): string => {
			let processedLine = line;
			openBrackets.forEach((bracket) => {
				const regex = new RegExp(escapeStringForRegex(bracket), "g");
				processedLine = processedLine.replace(regex, '');
			});
			closedBrackets.forEach((bracket) => {
				const regex = new RegExp(escapeStringForRegex(bracket), "g");
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
			return line;
		}
		const openBrackets = brackets.brackets.map((brackets) => brackets.open).flat();
		const closedBrackets = brackets.brackets.map((brackets) => brackets.close).flat();

		let characterOffset = 0;
		let processedLine = line;

		for (let i = 0; i < tokens.getCount(); i++) {
			const standardTokenType = tokens.getStandardTokenType(i);
			if (standardTokenType === StandardTokenType.String
				|| standardTokenType === StandardTokenType.RegEx
				|| standardTokenType === StandardTokenType.Comment
			) {
				const result = removeBracketsFromTokenWithIndexWithinLine(i, characterOffset, processedLine);
				characterOffset = result.processedCharacterOffset;
				processedLine = result.processedLine;
			}
		}
		return processedLine;
	}
}

interface ProcessedIndentationContext {
	beforeRangeText: string;
	afterRangeText: string;
	previousLineText: string;
}

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

	getProcessedContextAroundRange(range: Range): ProcessedIndentationContext {
		this.model.tokenization.forceTokenization(range.startLineNumber);
		const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		const scopedLineTokens = createScopedLineTokens(lineTokens, range.startColumn - 1);
		const beforeRangeText = this._getProcessedTextBeforeRange(range, scopedLineTokens);
		const afterRangeText = this._getProcessedTextAfterRange(range, scopedLineTokens);
		const previousLineText = this._getProcessedPreviousLine(range, scopedLineTokens);
		return { beforeRangeText, afterRangeText, previousLineText };
	}

	private _getProcessedTextAfterRange(range: Range, scopedLineTokens: ScopedLineTokens): string {
		let columnIndexWithinScope: number;
		let lineTokens: LineTokens;
		if (range.isEmpty()) {
			columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
			lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		} else {
			columnIndexWithinScope = range.endColumn - 1 - scopedLineTokens.firstCharOffset;
			lineTokens = this.model.tokenization.getLineTokens(range.endLineNumber);
		}
		const scopedLineContent = scopedLineTokens.getLineContent();
		const scopedLineLength = scopedLineContent.length;
		const firstCharacterOffset = scopedLineTokens.firstCharOffset + columnIndexWithinScope + 1;
		const lastCharacterOffset = scopedLineTokens.firstCharOffset + scopedLineLength + 1;
		const firstTokenIndex = scopedLineTokens.firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(columnIndexWithinScope);
		const lastTokenIndex = scopedLineTokens.firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(scopedLineLength - 1) + 1;
		const line = scopedLineContent.substring(columnIndexWithinScope);
		const languageId = scopedLineTokens.languageId;
		const processedTokens = new ScopedLineTokens(
			lineTokens,
			languageId,
			firstTokenIndex,
			lastTokenIndex,
			firstCharacterOffset,
			lastCharacterOffset
		);
		const processedLine = this.indentationLineProcessor.getProcessedLineForLineAndTokens(line, processedTokens);
		return processedLine;
	}

	private _getProcessedTextBeforeRange(range: Range, scopedLineTokens: ScopedLineTokens): string {
		const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		const columnIndexWithinScope = (range.startColumn - 1) - scopedLineTokens.firstCharOffset;
		const firstCharacterOffset = scopedLineTokens.firstCharOffset;
		const lastCharacterOffset = scopedLineTokens.firstCharOffset + columnIndexWithinScope;
		const firstTokenIndex = scopedLineTokens.firstTokenIndex;
		const lastTokenIndex = scopedLineTokens.firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(columnIndexWithinScope) + 1;
		const languageId = scopedLineTokens.languageId;
		const processedTokens = new ScopedLineTokens(
			lineTokens,
			languageId,
			firstTokenIndex,
			lastTokenIndex,
			firstCharacterOffset,
			lastCharacterOffset
		);
		const scopedLineContent = scopedLineTokens.getLineContent();
		const line = scopedLineContent.substring(0, columnIndexWithinScope);
		const processedLine = this.indentationLineProcessor.getProcessedLineForLineAndTokens(line, processedTokens);
		return processedLine;
	}

	private _getProcessedPreviousLine(range: Range, scopedLineTokens: ScopedLineTokens) {
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
				const previousLine = previousLineScopedLineTokens.getLineContent();
				processedPreviousLine = this.indentationLineProcessor.getProcessedLineForLineAndTokens(previousLine, previousLineScopedLineTokens);
			}
		}
		return processedPreviousLine;
	}
}

export function isWithinEmbeddedLanguage(model: ITextModel, position: Position): boolean {
	const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
	const scopedLineTokens = createScopedLineTokens(lineTokens, position.column - 1);
	return scopedLineTokens.firstCharOffset > 0 && lineTokens.getLanguageId(0) !== scopedLineTokens.languageId;
};
