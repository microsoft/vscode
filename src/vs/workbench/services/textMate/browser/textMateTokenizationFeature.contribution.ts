/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ITextMateTokenizationService } from './textMateTokenizationFeature.js';
import { TextMateTokenizationFeature } from './textMateTokenizationFeatureImpl.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { URI } from '../../../../base/common/uri.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';

/**
 * Makes sure the ITextMateTokenizationService is instantiated
 */
class TextMateTokenizationInstantiator implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.textMateTokenizationInstantiator';

	constructor(
		@ITextMateTokenizationService _textMateTokenizationService: ITextMateTokenizationService
	) { }
}

registerSingleton(ITextMateTokenizationService, TextMateTokenizationFeature, InstantiationType.Eager);

registerWorkbenchContribution2(TextMateTokenizationInstantiator.ID, TextMateTokenizationInstantiator, WorkbenchPhase.BlockRestore);

CommandsRegistry.registerCommand('_workbench.colorizeTextMateTokens', async (accessor: ServicesAccessor, resource?: URI): Promise<{ tokenizeTime: number }> => {
	const textModelService = accessor.get(ITextFileService);
	const textModel = resource ? (await textModelService.files.resolve(resource)).textEditorModel : undefined;
	if (!textModel) {
		throw new Error(`Cannot resolve text model for resource ${resource}`);
	}

	const tokenizer = await TokenizationRegistry.getOrCreate(textModel.getLanguageId());
	if (!tokenizer) {
		throw new Error(`Cannot resolve tokenizer for language ${textModel.getLanguageId()}`);
	}

	const stopwatch = new StopWatch();
	let state = tokenizer.getInitialState();
	for (let i = 1; i <= textModel.getLineCount(); i++) {
		state = tokenizer.tokenizeEncoded(textModel.getLineContent(i), true, state).endState;
	}
	stopwatch.stop();
	return { tokenizeTime: stopwatch.elapsed() };
});
