/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';
import { IndentAction, CompleteEnterAction } from './languageConfiguration.js';
import { EditorAutoIndentStrategy } from '../config/editorOptions.js';
import { getIndentationAtPosition, ILanguageConfigurationService } from './languageConfigurationRegistry.js';
import { IndentationContextProcessor } from './supports/indentationLineProcessor.js';

export function getEnterAction(
	autoIndent: EditorAutoIndentStrategy,
	model: ITextModel,
	range: Range,
	languageConfigurationService: ILanguageConfigurationService
): CompleteEnterAction | null {
	model.tokenization.forceTokenization(range.startLineNumber);
	const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
	const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
	if (!richEditSupport) {
		return null;
	}
	const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
	const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
	const previousLineText = processedContextTokens.previousLineProcessedTokens.getLineContent();
	const beforeEnterText = processedContextTokens.beforeRangeProcessedTokens.getLineContent();
	const afterEnterText = processedContextTokens.afterRangeProcessedTokens.getLineContent();

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
