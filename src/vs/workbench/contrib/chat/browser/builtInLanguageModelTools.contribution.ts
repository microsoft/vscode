/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ILanguageModelToolsService, LanguageModelToolsService } from 'vs/workbench/contrib/chat/common/languageModelToolsService';


export class BuiltInLanguageModelTools implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.builtInLanguageModelTools';

	constructor(
		@ILanguageModelToolsService languageModelToolsService: LanguageModelToolsService,
	) {
		const renameId = 'vscode-rename';
		languageModelToolsService.registerToolData({
			id: renameId,
			modelDescription: 'Rename a symbol in the current file.',
			canBeInvokedManually: true,
			userDescription: 'Rename a symbol in the current file.',
			displayName: 'Rename',
			name: 'rename',
			icon: Codicon.pencil,
			parametersSchema: {
				type: 'object',
				properties: {
					// Some other props that tell it what to do
					newName: {
						type: 'string',
						description: 'The new name for the symbol.',
					},
				},
				required: ['newName'],
				additionalProperties: false,
			},
		});
		languageModelToolsService.registerToolImplementation(renameId, {
			invoke: async (dto, countTokens, cancelToken) => {
				// do rename
				return {
					string: 'Renamed successfully!',
				};
			}
		});
	}
}
