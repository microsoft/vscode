/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatExternalPathConfirmationContribution } from '../../common/tools/builtinTools/chatExternalPathConfirmation.js';
import { ChatUrlFetchingConfirmationContribution } from '../../common/tools/builtinTools/chatUrlFetchingConfirmation.js';
import { ILanguageModelToolsConfirmationService } from '../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { InternalFetchWebPageToolId } from '../../common/tools/builtinTools/tools.js';
import { FetchWebPageTool, FetchWebPageToolData, IFetchWebPageToolParams } from './fetchPageTool.js';

export class NativeBuiltinToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.nativeBuiltinTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsConfirmationService confirmationService: ILanguageModelToolsConfirmationService,
	) {
		super();

		const editTool = instantiationService.createInstance(FetchWebPageTool);
		this._register(toolsService.registerTool(FetchWebPageToolData, editTool));

		this._register(confirmationService.registerConfirmationContribution(
			InternalFetchWebPageToolId,
			instantiationService.createInstance(
				ChatUrlFetchingConfirmationContribution,
				params => (params as IFetchWebPageToolParams).urls
			)
		));

		// Register external path confirmation contribution for read_file and list_dir
		// They share the same allowlist so approving a folder for reading files also allows listing that directory
		const externalPathConfirmation = new ChatExternalPathConfirmationContribution(
			(ref) => {
				const params = ref.parameters as { filePath?: string; path?: string };
				// read_file uses filePath (it's a file), list_dir uses path (it's a directory)
				if (params?.filePath) {
					return { path: params.filePath, isDirectory: false };
				}
				if (params?.path) {
					return { path: params.path, isDirectory: true };
				}
				return undefined;
			}
		);

		this._register(confirmationService.registerConfirmationContribution(
			'copilot_readFile',
			externalPathConfirmation
		));

		this._register(confirmationService.registerConfirmationContribution(
			'copilot_listDirectory',
			externalPathConfirmation
		));
	}
}
