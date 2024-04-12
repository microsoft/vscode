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
	const language = scopedLineTokens.languageId;
	const scopedLineText = scopedLineTokens.getLineContent();
	const columnIndexOfStart = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
	const beforeEnterText = scopedLineText.substring(0, columnIndexOfStart);

	const firstTokenIndex = scopedLineTokens.firstTokenIndex;
	const lastTokenIndex = firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(columnIndexOfStart) + 1;
	const initialTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const firstCharOffset = scopedLineTokens.firstCharOffset;

	const beforeEnterTokens = new ScopedLineTokens(
		initialTokens,
		language,
		firstTokenIndex,
		lastTokenIndex,
		firstCharOffset,
		columnIndexOfStart
	);
	return getStrippedLineForLineAndTokens(languageConfigurationService, language, beforeEnterText, beforeEnterTokens);
}

/** look at the following */
function getAfterEnterText(
	model: ITextModel,
	range: Range,
	languageConfigurationService: ILanguageConfigurationService
) {
	const scopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
	const columnIndexOfEnd = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
	let afterEnterText: string;
	let tokensOfInterest: ScopedLineTokens;
	let afterEnterTokens: ScopedLineTokens;

	if (range.isEmpty()) {
		const scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);
		const scopedLineText = scopedLineTokens.getLineContent();
		afterEnterText = scopedLineText.substring(columnIndexOfEnd);
		tokensOfInterest = getScopedLineTokens(model, range.startLineNumber, range.startColumn);
	} else {
		const endScopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
		afterEnterText = endScopedLineTokens.getLineContent().substring(range.endColumn - 1 - endScopedLineTokens.firstCharOffset);
		tokensOfInterest = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
	}
	const text = tokensOfInterest.getLineContent();
	const lastScopedCharOffset = text.length - 1;
	const firstTokenIndex = tokensOfInterest.findTokenIndexAtOffset(columnIndexOfEnd);
	const lastTokenIndex = tokensOfInterest.findTokenIndexAtOffset(lastScopedCharOffset);
	const initialTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const language = initialTokens.getLanguageId(firstTokenIndex);
	const lastCharOffset = tokensOfInterest.firstCharOffset + lastScopedCharOffset;
	afterEnterTokens = new ScopedLineTokens(
		initialTokens,
		language,
		firstTokenIndex,
		lastTokenIndex,
		columnIndexOfEnd,
		lastCharOffset
	);
	return getStrippedLineForLineAndTokens(languageConfigurationService, language, afterEnterText, afterEnterTokens);
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
