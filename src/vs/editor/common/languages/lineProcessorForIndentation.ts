/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { getScopedLineTokens, ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ScopedLineTokens } from 'vs/editor/common/languages/supports';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { IVirtualModel } from 'vs/editor/common/languages/autoIndent';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';

type LineTokensType = LineTokens | ScopedLineTokens;

interface ProcessedLineForIndentation {
	line: string;
	processedLine: string;
}

export class LineProcessorForIndentation {

	constructor(
		protected readonly model: IVirtualModel,
		protected readonly languageConfigurationService: ILanguageConfigurationService
	) { }

	getLine(lineNumber: number): string {

		const languageId = this.model.tokenization.getLanguageId();
		const lineContent = this.model.getLineContent(lineNumber);
		const tokens = this.model.tokenization.getLineTokens(lineNumber);
		const processedLine = this.getProcessedLineForLineAndTokens(languageId, lineContent, tokens);

		console.log('getStrippedLine');
		console.log('lineContent : ', lineContent);
		console.log('processedLine : ', processedLine);

		return processedLine;
	}

	protected getProcessedLineForLineAndTokens(languageId: string, line: string, tokens: LineTokensType): string {

		const removeBracketsFromTokenWithIndexWithinLine = (tokenIndex: number, characterOffset: number, line: string): { processedCharacterOffset: number, processedLine: string } => {
			const result = removeBracketsFromTokenWithIndex(tokenIndex);
			const processedCharacterOffset = characterOffset + result.tokenText.length - result.processedText.length;
			const processedLine = line.substring(0, characterOffset + result.tokenStartCharacterOffset) + result.processedText + line.substring(characterOffset + result.tokenEndCharacterOffset);
			return { processedCharacterOffset, processedLine };
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
				processedLine = processedLine.replace(bracket, '_');
			});
			closedBrackets.forEach((bracket) => {
				processedLine = processedLine.replace(bracket, '_');
			});
			return processedLine;
		}

		console.log('getStrippedLineForLineAndTokens');
		console.log('line : ', line);
		console.log('languageID : ', languageId);

		const brackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
		if (!brackets) {
			return line;
		}

		const openBrackets = brackets.brackets.map((brackets) => brackets.open).flat();
		const closedBrackets = brackets.brackets.map((brackets) => brackets.close).flat();

		let characterOffset = 0;
		let processedLine = line;

		for (let i = 0; i < tokens.getCount(); i++) {

			console.log('i : ', i);

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

export class ScopedLineProcessorForIndentation extends LineProcessorForIndentation {

	protected override readonly model: ITextModel;

	constructor(
		model: ITextModel,
		languageConfigurationService: ILanguageConfigurationService
	) {
		super(model, languageConfigurationService);
		this.model = model;
	}

	getProcessedLineAfterRange(range: Range, scopedLineTokens: ScopedLineTokens): ProcessedLineForIndentation {
		let columnIndexWithinScope: number;
		let lineTokens: LineTokens;
		// let afterScopedLineTokens: ScopedLineTokens
		if (range.isEmpty()) {
			columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
			lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
			// afterScopedLineTokens = scopedLineTokens;
		} else {
			columnIndexWithinScope = range.endColumn - 1 - scopedLineTokens.firstCharOffset;
			lineTokens = this.model.tokenization.getLineTokens(range.endLineNumber);
			// afterScopedLineTokens = getScopedLineTokens(this.model, range.endLineNumber, range.endColumn);
		}
		return this.getProcessedScopedLine(lineTokens, scopedLineTokens, { isStart: true, columnIndexWithinScope });
	}

	getProcessedLineBeforeRange(range: Range, scopedLineTokens: ScopedLineTokens): ProcessedLineForIndentation {
		const lineTokens = this.model.tokenization.getLineTokens(range.startLineNumber);
		let columnIndexWithinScope: number;
		let scopedLineTokensOfInterest: ScopedLineTokens | LineTokens;
		if (withinEmbeddedLanguage(lineTokens, scopedLineTokens)) {
			// we are in the embeded language content
			columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
			scopedLineTokensOfInterest = scopedLineTokens;
		} else {
			columnIndexWithinScope = range.startColumn - 1;
			scopedLineTokensOfInterest = lineTokens;
		}
		return this.getProcessedScopedLine(lineTokens, scopedLineTokensOfInterest, { isStart: false, columnIndexWithinScope });
	}

	getProcessedPreviousLine(range: Range) {
		let processedPreviousLine = '';
		const scopedLineTokens = getScopedLineTokens(this.model, range.startLineNumber, range.startColumn);
		const language = this.model.tokenization.getLanguageId();
		if (range.startLineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
			// This is not the first line and the entire line belongs to this mode
			const previousLineScopedLineTokens = getScopedLineTokens(this.model, range.startLineNumber - 1);
			if (previousLineScopedLineTokens.languageId === scopedLineTokens.languageId) {
				// The line above ends with text belonging to the same mode
				const previousLine = previousLineScopedLineTokens.getLineContent();
				processedPreviousLine = this.getProcessedLineForLineAndTokens(language, previousLine, previousLineScopedLineTokens);
			}
		}
		console.log('previousLineText : ', processedPreviousLine);
		return processedPreviousLine;
	}

	private getProcessedScopedLine(initialLineTokens: LineTokens, scopedLineTokens: LineTokensType, opts: { columnIndexWithinScope: number, isStart: boolean }): ProcessedLineForIndentation {

		let languageId: string;
		if (scopedLineTokens instanceof LineTokens) {
			languageId = scopedLineTokens.getLanguageId(0);
		} else {
			languageId = scopedLineTokens.languageId;
		}

		const scopedLineText = scopedLineTokens.getLineContent();
		let firstCharacterOffset: number = scopedLineTokens instanceof LineTokens ? 0 : scopedLineTokens.firstCharOffset;
		let lastCharacterOffset: number = scopedLineTokens instanceof LineTokens ? 0 : scopedLineTokens.firstCharOffset;
		let firstTokenIndex: number = scopedLineTokens instanceof LineTokens ? 0 : scopedLineTokens.firstTokenIndex;
		let lastTokenIndex: number = scopedLineTokens instanceof LineTokens ? 0 : scopedLineTokens.firstTokenIndex;
		let line: string;

		if (opts.isStart) {
			const scopedLineTextLength = scopedLineText.length;
			firstCharacterOffset += opts.columnIndexWithinScope + 1;
			lastCharacterOffset += opts.columnIndexWithinScope + scopedLineTextLength - opts.columnIndexWithinScope + 1;
			firstTokenIndex += scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope) + 1;
			lastTokenIndex += scopedLineTokens.findTokenIndexAtOffset(scopedLineTextLength - 1) + 1;
			line = scopedLineText.substring(opts.columnIndexWithinScope);
		} else {
			lastCharacterOffset += opts.columnIndexWithinScope;
			lastTokenIndex += scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope);
			line = scopedLineText.substring(0, opts.columnIndexWithinScope);
		}
		const processedTokens = new ScopedLineTokens(
			initialLineTokens,
			languageId,
			firstTokenIndex,
			lastTokenIndex,
			firstCharacterOffset,
			lastCharacterOffset
		);
		const processedLine = this.getProcessedLineForLineAndTokens(languageId, line, processedTokens);

		console.log('getStrippedScopedLineTextFor');
		console.log('opts : ', opts);
		console.log('initialLineTokens : ', initialLineTokens);
		console.log('scopedLineTokens : ', scopedLineTokens);
		console.log('firstCharacterOffset : ', firstCharacterOffset);
		console.log('lastCharacterOffset : ', lastCharacterOffset);
		console.log('firstTokenIndex : ', firstTokenIndex);
		console.log('lastTokenIndex : ', lastTokenIndex);
		console.log('processedLine : ', processedLine);

		return { line, processedLine }
	}
}

export const withinEmbeddedLanguage = (lineTokens: LineTokens, scopedLineTokens: ScopedLineTokens) => {
	return scopedLineTokens.firstCharOffset > 0 && lineTokens.getLanguageId(0) !== scopedLineTokens.languageId;
};
