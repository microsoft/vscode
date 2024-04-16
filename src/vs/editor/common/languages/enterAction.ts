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
import { getStrippedLineForLineAndTokens } from 'vs/editor/common/languages/autoIndent';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';

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
		firstCharacterOffset = 'firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0;
		lastCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + opts.columnIndexWithinScope;
		firstTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0);
		lastTokenIndex = firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope) + 1;
	} else {
		text = scopedLineText.substring(0, opts.columnIndexWithinScope);
		firstCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + opts.columnIndexWithinScope;
		lastCharacterOffset = ('firstCharOffset' in scopedLineTokens ? scopedLineTokens.firstCharOffset : 0) + text.length;
		firstTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0) + scopedLineTokens.findTokenIndexAtOffset(opts.columnIndexWithinScope) + 1;
		lastTokenIndex = ('firstTokenIndex' in scopedLineTokens ? scopedLineTokens.firstTokenIndex : 0) + scopedLineTokens.findTokenIndexAtOffset(scopedLineText.length - 1) + 1;
	}

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
	return previousLineText;
}
