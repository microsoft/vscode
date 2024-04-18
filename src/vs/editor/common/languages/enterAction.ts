/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IndentAction, CompleteEnterAction } from 'vs/editor/common/languages/languageConfiguration';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { getIndentationAtPosition, getScopedLineTokens, ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ScopedLineTokens } from 'vs/editor/common/languages/supports';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { IVirtualModel } from 'vs/editor/common/languages/autoIndent';

export function getEnterAction(
	autoIndent: EditorAutoIndentStrategy,
	model: ITextModel,
	range: Range,
	languageConfigurationService: ILanguageConfigurationService
): CompleteEnterAction | null {
	const scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);
	const richEditSupport = languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId);
	if (!richEditSupport) {
		return null;
	}

	const processLines = new ProcessLinesForIndentationExtended(model, languageConfigurationService);
	const beforeEnterText = processLines.getBeforeProcessedLine(range, scopedLineTokens).strippedLine;
	const afterEnterText = processLines.getAfterProcessedLine(range, scopedLineTokens).strippedLine;
	const previousLineText = processLines.getPreviousLineText(range);

	const enterResult = richEditSupport.onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText);
	console.log('enterResult : ', enterResult);

	if (!enterResult) {
		return null;
	}

	const indentAction = enterResult.indentAction;
	let appendText = enterResult.appendText;
	const removeText = enterResult.removeText || 0;

	// Here we add `\t` to appendText first because enterAction is leveraging appendText and removeText to change indentation.
	if (!appendText) {
		if (
			(indentAction === IndentAction.Indent) ||
			(indentAction === IndentAction.IndentOutdent)
		) {
			appendText = '\t';
		} else {
			appendText = '';
		}
	} else if (indentAction === IndentAction.Indent) {
		appendText = '\t' + appendText;
	}

	let indentation = getIndentationAtPosition(model, range.startLineNumber, range.startColumn);
	if (removeText) {
		indentation = indentation.substring(0, indentation.length - removeText);
	}

	return {
		indentAction: indentAction,
		appendText: appendText,
		removeText: removeText,
		indentation: indentation
	};
}

export class ProcessLinesForIndentation {
	constructor(
		protected readonly model: IVirtualModel,
		protected readonly languageConfigurationService: ILanguageConfigurationService
	) { }

	getStrippedLine(lineNumber: number): string {
		console.log('getStrippedLine');
		const lineContent = this.model.getLineContent(lineNumber);
		console.log('lineContent : ', lineContent);
		const tokens = this.model.tokenization.getLineTokens(lineNumber);
		const languageId = this.model.tokenization.getLanguageId();
		const strippedLineContent = this.getStrippedLineForLineAndTokens(this.languageConfigurationService, languageId, lineContent, tokens);
		console.log('strippedLineContent : ', strippedLineContent);
		return strippedLineContent;
	}

	protected getStrippedScopedLineTextFor(languageConfigurationService: ILanguageConfigurationService, initialLineTokens: LineTokens, scopedLineTokens: ScopedLineTokens | LineTokens, nextLineTokens: LineTokens, opts: { columnIndexWithinScope: number, isStart: boolean }): {
		line: string;
		strippedLine: string;
		tokens: ScopedLineTokens | LineTokens;
	} {

		console.log('getStrippedScopedLineTextFor');
		console.log('opts : ', opts);
		console.log('initialLineTokens : ', initialLineTokens);
		console.log('scopedLineTokens : ', scopedLineTokens);

		const language = 'languageId' in scopedLineTokens ? scopedLineTokens.languageId : scopedLineTokens.getLanguageId(0);
		const scopedLineText = scopedLineTokens.getLineContent();
		let text: string;
		let firstCharacterOffset: number;
		let lastCharacterOffset: number;
		let firstTokenIndex: number;
		let lastTokenIndex: number;

		let modifiedLineTokens: LineTokens;

		const isStart = opts.isStart;
		console.log('isStart : ', isStart);
		if (isStart) {
			text = scopedLineText.substring(opts.columnIndexWithinScope);
			firstCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + opts.columnIndexWithinScope + 1;
			lastCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + opts.columnIndexWithinScope + text.length + 1;
			firstTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0) + scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope) + 1;
			lastTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0) + scopedLineTokens.findTokenIndexAtOffset(scopedLineText.length - 1) + 1;
		} else {
			text = scopedLineText.substring(0, opts.columnIndexWithinScope);
			firstCharacterOffset = 'firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0;
			lastCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + opts.columnIndexWithinScope;
			firstTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0);
			lastTokenIndex = firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope);
		}

		console.log('firstCharacterOffset : ', firstCharacterOffset);
		console.log('lastCharacterOffset : ', lastCharacterOffset);
		console.log('firstTokenIndex : ', firstTokenIndex);
		console.log('lastTokenIndex : ', lastTokenIndex);

		// divid the initial line tokens so that the indices coincide
		// const modifiedInitialLineTokens = new LineTokens(initialLineTokens.getLineContent());

		const initialTokens: number[] = [];
		initialLineTokens.tokens().forEach((token) => {
			initialTokens.push(token);
		});
		console.log('initialTokens : ', initialTokens);
		const tokenIndex = scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope);

		let middleArray: [number, number];
		console.log('tokenIndex : ', tokenIndex);
		if (firstCharacterOffset === lastCharacterOffset && firstCharacterOffset >= initialLineTokens.getLineContent().length) {
			middleArray = [opts.columnIndexWithinScope, nextLineTokens.getStandardTokenType(0)];
		} else {
			middleArray = [opts.columnIndexWithinScope, initialTokens[2 * tokenIndex + 1]];
		}

		console.log('middleArray : ', middleArray);
		console.log('initialTokens.slice(0, 2 * (tokenIndex + 1)) : ', initialTokens.slice(0, 2 * (tokenIndex + 1)));
		console.log('initialTokens.slice(2 * (tokenIndex + 2) : ', initialTokens.slice(2 * (tokenIndex + 2)));

		const modifiedTokens = new Uint32Array([...initialTokens.slice(0, 2 * (tokenIndex + 1)), ...middleArray, ...initialTokens.slice(2 * (tokenIndex + 2))]);
		console.log('modifiedtokens : ', modifiedTokens);

		modifiedLineTokens = new LineTokens(modifiedTokens, initialLineTokens.getLineContent(), {
			encodeLanguageId: () => 0,
			decodeLanguageId: () => ''
		});
		console.log('modifiedLineTokens : ', modifiedLineTokens);

		const tokensOfText = new ScopedLineTokens(
			modifiedLineTokens,
			language,
			firstTokenIndex,
			lastTokenIndex,
			firstCharacterOffset,
			lastCharacterOffset
		);
		console.log('tokensOfText : ', tokensOfText);
		const strippedLine = this.getStrippedLineForLineAndTokens(languageConfigurationService, language, text, tokensOfText);
		return { line: text, strippedLine, tokens: tokensOfText }
	}

	protected getStrippedLineForLineAndTokens(languageConfigurationService: ILanguageConfigurationService, languageId: string, line: string, tokens: LineTokens | ScopedLineTokens): string {

		console.log('getStrippedLineForLineAndTokens');
		console.log('line : ', line);
		console.log('languageID : ', languageId);

		const brackets = languageConfigurationService.getLanguageConfiguration(languageId).brackets;
		// console.log('brackets : ', brackets);

		let offset = 0;
		let strippedLine = line;
		const numberOfTokens = tokens.getCount();
		console.log('numberOfTokens : ', numberOfTokens);

		for (let i = 0; i < numberOfTokens; i++) {

			console.log('i : ', i);

			const standardTokenType = tokens.getStandardTokenType(i);

			if (
				standardTokenType === StandardTokenType.String
				|| standardTokenType === StandardTokenType.RegEx
				|| standardTokenType === StandardTokenType.Comment
			) {

				console.log('string or regex token');

				const startTokenOffset = tokens.getStartOffset(i);
				const endTokenOffset = tokens.getEndOffset(i);
				const substringOfToken = line.substring(startTokenOffset, endTokenOffset);
				console.log('substringOfToken : ', substringOfToken);

				let strippedSubstringOfToken = substringOfToken;
				const openBrackets = brackets?.brackets.map((brackets) => brackets.open).flat();
				const closedBrackets = brackets?.brackets.map((brackets) => brackets.close).flat();
				console.log('openBrackets : ', openBrackets);
				console.log('closedBrackets : ', closedBrackets);

				if (openBrackets) {
					openBrackets.forEach((bracket) => {
						console.log('strippedSubstringOfToken : ', strippedSubstringOfToken);
						console.log('bracket : ', bracket);
						strippedSubstringOfToken = strippedSubstringOfToken.replace(bracket, '_');
						console.log('strippedSubstringOfToken : ', strippedSubstringOfToken);
					});
				}

				if (closedBrackets) {
					closedBrackets.forEach((bracket) => {
						console.log('strippedSubstringOfToken : ', strippedSubstringOfToken);
						console.log('bracket : ', bracket);
						strippedSubstringOfToken = strippedSubstringOfToken.replace(bracket, '_');
						console.log('strippedSubstringOfToken : ', strippedSubstringOfToken);
					});
				}

				console.log('strippedSubstringOfToken : ', strippedSubstringOfToken);
				offset += substringOfToken.length - strippedSubstringOfToken.length;
				console.log('offset : ', offset);

				strippedLine = strippedLine.substring(0, offset + startTokenOffset) + strippedSubstringOfToken + strippedLine.substring(offset + endTokenOffset);
				console.log('strippedLine : ', strippedLine);
			}
		}
		return strippedLine;
	}
}

export class ProcessLinesForIndentationExtended extends ProcessLinesForIndentation {

	constructor(
		private readonly _model: ITextModel,
		languageConfigurationService: ILanguageConfigurationService
	) {
		super(_model, languageConfigurationService);
	}

	getAfterProcessedLine(range: Range, scopedLineTokens: ScopedLineTokens): {
		line: string;
		strippedLine: string;
		tokens: ScopedLineTokens | LineTokens;
	} {
		const lineTokens = this._model.tokenization.getLineTokens(range.startLineNumber);
		const nextLineTokens = this._model.tokenization.getLineTokens(range.startLineNumber + 1);

		let afterColumnIndexWithinScope: number;
		let afterLineTokens: LineTokens;
		let afterNextLineToken: LineTokens | ScopedLineTokens;
		let afterScopedLineTokens: ScopedLineTokens
		if (range.isEmpty()) {
			afterColumnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
			afterLineTokens = lineTokens;
			afterNextLineToken = nextLineTokens;
			afterScopedLineTokens = scopedLineTokens;
		} else {
			afterColumnIndexWithinScope = range.endColumn - 1 - scopedLineTokens.firstCharOffset;
			afterLineTokens = this._model.tokenization.getLineTokens(range.endLineNumber);
			afterNextLineToken = this._model.tokenization.getLineTokens(range.endLineNumber + 1);
			afterScopedLineTokens = getScopedLineTokens(this._model, range.endLineNumber, range.endColumn);
		}
		return this.getStrippedScopedLineTextFor(this.languageConfigurationService, afterLineTokens, afterScopedLineTokens, afterNextLineToken, { isStart: true, columnIndexWithinScope: afterColumnIndexWithinScope });
	}

	getBeforeProcessedLine(range: Range, scopedLineTokens: ScopedLineTokens) {
		const lineTokens = this._model.tokenization.getLineTokens(range.startLineNumber);
		const nextLineTokens = this._model.tokenization.getLineTokens(range.startLineNumber + 1);
		let beforeColumnIndexWithinScope: number;
		let beforeEnterScopedLineTokens: ScopedLineTokens | LineTokens;
		if (withinEmbeddedLanguage(lineTokens, scopedLineTokens)) {
			// we are in the embeded language content
			beforeColumnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
			beforeEnterScopedLineTokens = scopedLineTokens;
		} else {
			beforeColumnIndexWithinScope = range.startColumn - 1;
			beforeEnterScopedLineTokens = lineTokens;
		}
		return this.getStrippedScopedLineTextFor(this.languageConfigurationService, lineTokens, beforeEnterScopedLineTokens, nextLineTokens, { isStart: false, columnIndexWithinScope: beforeColumnIndexWithinScope });
	}

	getPreviousLineText(range: Range) {
		console.log('getPreviousLineText');
		let previousLineText = '';
		const scopedLineTokens = getScopedLineTokens(this._model, range.startLineNumber, range.startColumn);
		const language = this.model.tokenization.getLanguageId();
		if (range.startLineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
			// This is not the first line and the entire line belongs to this mode
			const oneLineAboveScopedLineTokens = getScopedLineTokens(this._model, range.startLineNumber - 1);
			if (oneLineAboveScopedLineTokens.languageId === scopedLineTokens.languageId) {
				// The line above ends with text belonging to the same mode
				const _previousLineText = oneLineAboveScopedLineTokens.getLineContent();
				previousLineText = this.getStrippedLineForLineAndTokens(this.languageConfigurationService, language, _previousLineText, oneLineAboveScopedLineTokens);
			}
		}
		console.log('previousLineText : ', previousLineText);
		return previousLineText;
	}
}

export const withinEmbeddedLanguage = (lineTokens: LineTokens, scopedLineTokens: ScopedLineTokens) => {
	return scopedLineTokens.firstCharOffset > 0 && lineTokens.getLanguageId(0) !== scopedLineTokens.languageId;
};
