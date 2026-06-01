/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../chat/common/tools/languageModelToolsService.js';
import { IExtensionsWorkbenchService } from './extensions.js';

export const InstallExtensionsToolId = 'vscode_installExtensions';

export const InstallExtensionsToolData: IToolData = {
	id: InstallExtensionsToolId,
	toolReferenceName: 'installExtensions',
	canBeReferencedInPrompt: true,
	displayName: localize('installExtensionsTool.displayName', 'Install Extensions'),
	modelDescription: 'This is a tool for installing extensions in Visual Studio Code. You should provide the list of extension ids to install. The identifier of an extension is \'\${ publisher }.\${ name }\' for example: \'vscode.csharp\'.',
	userDescription: localize('installExtensionsTool.userDescription', 'Tool for installing extensions'),
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			ids: {
				type: 'array',
				items: {
					type: 'string',
				},
				description: 'The ids of the extensions to search for. The identifier of an extension is \'\${ publisher }.\${ name }\' for example: \'vscode.csharp\'.',
			},
		}
	}
};

type InputParams = {
	ids: string[];
};

export class InstallExtensionsTool implements IToolImpl {

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const parameters = context.parameters as InputParams;
		return {
			confirmationMessages: {
				title: localize('installExtensionsTool.confirmationTitle', 'Install Extensions'),
				message: new MarkdownString(localize('installExtensionsTool.confirmationMessage', "Review the suggested extensions and click the **Install** button for each extension you wish to add. Once you have finished installing the selected extensions, click **Continue** to proceed.")),
			},
			toolSpecificData: {
				kind: 'extensions',
				extensions: parameters.ids
			}
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const input = invocation.parameters as InputParams;
		const installed = this.extensionsWorkbenchService.local.filter(e => input.ids.some(id => areSameExtensions({ id }, e.identifier)));
		return {
			content: [{
				kind: 'text',
				value: installed.length ? localize('installExtensionsTool.resultMessage', 'Following extensions are installed: {0}', installed.map(e => e.identifier.id).join(', ')) : localize('installExtensionsTool.noResultMessage', 'No extensions were installed.'),
			}]
		};
	}
}
