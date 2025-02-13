/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { TreeSitterTextModelService } from '../../../../editor/common/services/treeSitter/treeSitterParserService.js';
import { ITreeSitterImporter, ITreeSitterParserService, TreeSitterImporter } from '../../../../editor/common/services/treeSitterParserService.js';
import { ITreeSitterTokenizationFeature } from './treeSitterTokenizationFeature.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { TreeSitterTokenizationRegistry } from '../../../../editor/common/languages.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';

/**
 * Makes sure the ITreeSitterTokenizationService is instantiated
 */
class TreeSitterTokenizationInstantiator implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.treeSitterTokenizationInstantiator';

	constructor(
		@ITreeSitterParserService _treeSitterTokenizationService: ITreeSitterParserService,
		@ITreeSitterTokenizationFeature _treeSitterTokenizationFeature: ITreeSitterTokenizationFeature
	) { }
}

registerSingleton(ITreeSitterImporter, TreeSitterImporter, InstantiationType.Eager);
registerSingleton(ITreeSitterParserService, TreeSitterTextModelService, InstantiationType.Eager);

registerWorkbenchContribution2(TreeSitterTokenizationInstantiator.ID, TreeSitterTokenizationInstantiator, WorkbenchPhase.BlockRestore);

CommandsRegistry.registerCommand('_workbench.colorizeTreeSitterTokens', async (accessor: ServicesAccessor, resource?: URI): Promise<{ parseTime: number; captureTime: number; metadataTime: number }> => {
	const treeSitterParserService = accessor.get(ITreeSitterParserService);
	const textModelService = accessor.get(ITextFileService);
	const textModel = resource ? (await textModelService.files.resolve(resource)).textEditorModel : undefined;
	if (!textModel) {
		throw new Error(`Cannot resolve text model for resource ${resource}`);
	}

	const tokenizer = await TreeSitterTokenizationRegistry.getOrCreate(textModel.getLanguageId());
	if (!tokenizer) {
		throw new Error(`Cannot resolve tokenizer for language ${textModel.getLanguageId()}`);
	}

	const textModelTreeSitter = await treeSitterParserService.getTextModelTreeSitter(textModel);
	if (!textModelTreeSitter) {
		throw new Error(`Cannot resolve tree sitter parser for language ${textModel.getLanguageId()}`);
	}
	const stopwatch = new StopWatch();
	await textModelTreeSitter.parse();
	stopwatch.stop();

	let captureTime = 0;
	let metadataTime = 0;
	for (let i = 1; i <= textModel.getLineCount(); i++) {
		const result = tokenizer.tokenizeEncodedInstrumented(i, textModel);
		if (result) {
			captureTime += result.captureTime;
			metadataTime += result.metadataTime;
		}
	}
	textModelTreeSitter.dispose();
	textModel.dispose();
	return { parseTime: stopwatch.elapsed(), captureTime, metadataTime };
});
