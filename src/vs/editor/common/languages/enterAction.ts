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

	const beforeEnterText = getBeforeEnterText(model, range, languageConfigurationService);
	const afterEnterText = getAfterEnterText(model, range, languageConfigurationService);
	const previousLineText = getPreviousLineText(model, range, languageConfigurationService);

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

function getBeforeEnterText(
	model: ITextModel,
	range: Range,
	languageConfigurationService: ILanguageConfigurationService
) {
	console.log('getBeforeEnterText');
	console.log('range : ', JSON.stringify(range));
	const scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);
	const initialLineTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
	return getStrippedScopedLineTextFor(languageConfigurationService, initialLineTokens, scopedLineTokens, { isStart: false, columnIndexWithinScope });
}

/** look at the following */
function getAfterEnterText(
	model: ITextModel,
	range: Range,
	languageConfigurationService: ILanguageConfigurationService
) {
	console.log('getAfterEnterText');
	console.log('range : ', JSON.stringify(range));
	let initialLineTokens: LineTokens;
	let scopedLineTokens: ScopedLineTokens;
	let columnIndexWithinScope: number;

	if (range.isEmpty()) {
		initialLineTokens = model.tokenization.getLineTokens(range.startLineNumber);
		scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);
		columnIndexWithinScope = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
	} else {
		initialLineTokens = model.tokenization.getLineTokens(range.endLineNumber);
		scopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
		columnIndexWithinScope = range.endColumn - 1 - scopedLineTokens.firstCharOffset;
	}

	return getStrippedScopedLineTextFor(languageConfigurationService, initialLineTokens, scopedLineTokens, { isStart: true, columnIndexWithinScope });
}

export function getStrippedScopedLineTextFor(languageConfigurationService: ILanguageConfigurationService, initialLineTokens: LineTokens, scopedLineTokens: ScopedLineTokens | LineTokens, opts: { columnIndexWithinScope: number, isStart: boolean }) {

	console.log('getStrippedScopedLineTextFor');
	console.log('opts : ', opts);
	console.log('scopedLineTokens : ', scopedLineTokens);

	const language = 'languageId' in scopedLineTokens ? scopedLineTokens.languageId : '';
	const scopedLineText = scopedLineTokens.getLineContent();
	let text: string;
	let firstCharacterOffset: number;
	let lastCharacterOffset: number;
	let firstTokenIndex: number;
	let lastTokenIndex: number;

	const isStart = opts.isStart;
	if (isStart) {
		text = scopedLineText.substring(opts.columnIndexWithinScope);
		firstCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + opts.columnIndexWithinScope;
		lastCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + text.length;
		firstTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0) + scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope) + 1;
		lastTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0) + scopedLineTokens.findTokenIndexAtOffset(scopedLineText.length - 1) + 1;
	} else {
		text = scopedLineText.substring(0, opts.columnIndexWithinScope);
		firstCharacterOffset = 'firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0;
		lastCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + opts.columnIndexWithinScope;
		firstTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0);
		lastTokenIndex = firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope) + 1;
	}

	console.log('firstCharacterOffset : ', firstCharacterOffset);
	console.log('lastCharacterOffset : ', lastCharacterOffset);
	console.log('firstTokenIndex : ', firstTokenIndex);
	console.log('lastTokenIndex : ', lastTokenIndex);

	const tokensOfText = new ScopedLineTokens(
		initialLineTokens,
		language,
		firstTokenIndex,
		lastTokenIndex,
		firstCharacterOffset,
		lastCharacterOffset
	);
	return getStrippedLineForLineAndTokens(languageConfigurationService, language, text, tokensOfText);
}

function getPreviousLineText(
	model: ITextModel,
	range: Range,
	languageConfigurationService: ILanguageConfigurationService
) {
	console.log('getPreviousLineText');
	let previousLineText = '';
	const scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);
	const language = model.tokenization.getLanguageId();
	if (range.startLineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
		// This is not the first line and the entire line belongs to this mode
		const oneLineAboveScopedLineTokens = getScopedLineTokens(model, range.startLineNumber - 1);
		if (oneLineAboveScopedLineTokens.languageId === scopedLineTokens.languageId) {
			// The line above ends with text belonging to the same mode
			const _previousLineText = oneLineAboveScopedLineTokens.getLineContent();
			previousLineText = getStrippedLineForLineAndTokens(languageConfigurationService, language, _previousLineText, oneLineAboveScopedLineTokens);
		}
	}
	console.log('previousLineText : ', previousLineText);
	return previousLineText;
}

export function getStrippedLineForLineAndTokens(languageConfigurationService: ILanguageConfigurationService, languageId: string, line: string, tokens: LineTokens | ScopedLineTokens): string {

	console.log('getStrippedLineForLineAndTokens');
	console.log('line : ', line);

	const brackets = languageConfigurationService.getLanguageConfiguration(languageId).brackets;
	// console.log('brackets : ', brackets);

	let offset = 0;
	let strippedLine = line;
	const numberOfTokens = tokens.getCount();
	console.log('numberOfTokens : ', numberOfTokens);

	for (let i = 0; i < numberOfTokens; i++) {

		console.log('i : ', i);

		const standardTokenType = tokens.getStandardTokenType(i);

		if (standardTokenType === StandardTokenType.Comment) {

			console.log('comment token');

			const startOffset = tokens.getStartOffset(i);
			const endOffset = tokens.getEndOffset(i);
			strippedLine = strippedLine.substring(0, offset + startOffset) + strippedLine.substring(offset + endOffset);
			offset += startOffset - endOffset;
			console.log('strippedLine : ', strippedLine);
			console.log('offset : ', offset);
		}

		if (standardTokenType === StandardTokenType.String || standardTokenType === StandardTokenType.RegEx) {

			console.log('string or regex token');

			const startTokenOffset = tokens.getStartOffset(i);
			const endTokenOffset = tokens.getEndOffset(i);
			const substringOfToken = line.substring(startTokenOffset, endTokenOffset);
			console.log('substringOfToken : ', substringOfToken);

			let strippedSubstringOfToken = substringOfToken;
			const openBrackets = brackets?.brackets.map((brackets) => brackets.open).flat();
			const closedBrackets = brackets?.brackets.map((brackets) => brackets.close).flat();

			if (openBrackets) {
				openBrackets.forEach((bracket) => {
					strippedSubstringOfToken = strippedSubstringOfToken.replace(bracket, '_');
				});
			}

			if (closedBrackets) {
				closedBrackets.forEach((bracket) => {
					strippedSubstringOfToken = strippedSubstringOfToken.replace(bracket, '_');
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
