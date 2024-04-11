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
	console.log('getEnterAction');

	const scopedLineTokens = getScopedLineTokens(model, range.startLineNumber, range.startColumn);
	const richEditSupport = languageConfigurationService.getLanguageConfiguration(scopedLineTokens.languageId);
	if (!richEditSupport) {
		return null;
	}

	const scopedLineText = scopedLineTokens.getLineContent();
	const indexOfCursor = range.startColumn - 1 - scopedLineTokens.firstCharOffset;
	const beforeEnterText = scopedLineText.substring(0, indexOfCursor);

	const firstTokenIndex = scopedLineTokens.firstTokenIndex;
	const lastTokenIndex = firstTokenIndex + scopedLineTokens.findTokenIndexAtOffset(indexOfCursor) + 1;
	const initialTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const language = initialTokens.getLanguageId(firstTokenIndex);
	const firstCharOffset = scopedLineTokens.firstCharOffset;

	const beforeEnterTokens = new ScopedLineTokens(
		initialTokens,
		language,
		firstTokenIndex,
		lastTokenIndex,
		firstCharOffset,
		indexOfCursor
	);
	const strippedBeforeEnterText = getStrippedLineForLineAndTokens(languageConfigurationService, language, beforeEnterText, beforeEnterTokens);

	// selection support
	let afterEnterText: string;
	let afterEnterTokens: ScopedLineTokens;

	if (range.isEmpty()) {
		afterEnterText = scopedLineText.substring(indexOfCursor);

		const lastScopedCharOffset = scopedLineText.length - 1;
		const firstTokenIndex = scopedLineTokens.findTokenIndexAtOffset(indexOfCursor);
		const lastTokenIndex = scopedLineTokens.findTokenIndexAtOffset(lastScopedCharOffset);
		const initialTokens = model.tokenization.getLineTokens(range.startLineNumber);
		const language = initialTokens.getLanguageId(firstTokenIndex);
		const lastCharOffset = scopedLineTokens.firstCharOffset + lastScopedCharOffset;
		afterEnterTokens = new ScopedLineTokens(
			initialTokens,
			language,
			firstTokenIndex,
			lastTokenIndex,
			indexOfCursor,
			lastCharOffset
		);
	} else {
		const endScopedLineTokens = getScopedLineTokens(model, range.endLineNumber, range.endColumn);
		const endScopedLineText = endScopedLineTokens.getLineContent();
		afterEnterText = endScopedLineTokens.getLineContent().substring(range.endColumn - 1 - scopedLineTokens.firstCharOffset);

		const lastScopedCharOffset = endScopedLineText.length - 1;
		const firstTokenIndex = endScopedLineTokens.findTokenIndexAtOffset(indexOfCursor);
		const lastTokenIndex = endScopedLineTokens.findTokenIndexAtOffset(lastScopedCharOffset);
		const initialTokens = model.tokenization.getLineTokens(range.startLineNumber);
		const language = initialTokens.getLanguageId(firstTokenIndex);
		const lastCharOffset = scopedLineTokens.firstCharOffset + lastScopedCharOffset;
		afterEnterTokens = new ScopedLineTokens(
			initialTokens,
			language,
			firstTokenIndex,
			lastTokenIndex,
			indexOfCursor,
			lastCharOffset
		);
	}

	const strippedAfterEnterText = getStrippedLineForLineAndTokens(languageConfigurationService, language, afterEnterText, afterEnterTokens);

	let strippedPreviousLineText = '';
	if (range.startLineNumber > 1 && scopedLineTokens.firstCharOffset === 0) {
		// This is not the first line and the entire line belongs to this mode
		const oneLineAboveScopedLineTokens = getScopedLineTokens(model, range.startLineNumber - 1);
		if (oneLineAboveScopedLineTokens.languageId === scopedLineTokens.languageId) {
			// The line above ends with text belonging to the same mode
			const previousLineText = oneLineAboveScopedLineTokens.getLineContent();
			strippedPreviousLineText = getStrippedLineForLineAndTokens(languageConfigurationService, language, previousLineText, oneLineAboveScopedLineTokens);
		}
	}

	const enterResult = richEditSupport.onEnter(autoIndent, strippedPreviousLineText, strippedBeforeEnterText, strippedAfterEnterText);
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
