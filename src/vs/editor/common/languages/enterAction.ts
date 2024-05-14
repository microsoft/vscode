/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IndentAction, CompleteEnterAction } from 'vs/editor/common/languages/languageConfiguration';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { getIndentationAtPosition, ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IndentationContextProcessor } from 'vs/editor/common/languages/supports/indentationLineProcessor';
import { ILanguageService } from 'vs/editor/common/languages/language';

export function getEnterAction(
	autoIndent: EditorAutoIndentStrategy,
	model: ITextModel,
	range: Range,
	languageService: ILanguageService,
	languageConfigurationService: ILanguageConfigurationService
): CompleteEnterAction | null {
	model.tokenization.forceTokenization(range.startLineNumber);
	const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
	const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
	if (!richEditSupport) {
		return null;
	}
	const indentationContextProcessor = new IndentationContextProcessor(model, languageService, languageConfigurationService);
	const processedContext = indentationContextProcessor.getProcessedContextAroundRange(range);
	const previousLineText = processedContext.previousLineProcessedData.processedLine;
	const beforeRangeText = processedContext.beforeRangeProcessedData.processedLine;
	const afterRangeText = processedContext.afterRangeProcessedData.processedLine;

	const enterResult = richEditSupport.onEnter(autoIndent, previousLineText, beforeRangeText, afterRangeText);
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
