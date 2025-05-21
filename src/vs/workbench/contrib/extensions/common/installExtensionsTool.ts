/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../chat/common/languageModelToolsService.js';
import { IExtensionsWorkbenchService } from './extensions.js';

export const InstallExtensionsToolId = 'vscode_installExtensions';

export const InstallExtensionsToolData: IToolData = {
	id: InstallExtensionsToolId,
	toolReferenceName: 'installExtensions',
	canBeReferencedInPrompt: true,
	displayName: localize('installExtensionsTool.displayName', 'Install Extensions'),
	modelDescription: localize('installExtensionsTool.modelDescription', "This is a tool for installing extensions in Visual Studio Code. You should provide the list of extension ids to install and the reason for installation which is shown to the user. The identifier of an extension is '\${ publisher }.\${ name }' for example: 'vscode.csharp'. The reason should just explain about the extensions and do not mention about installing."),
	userDescription: localize('installExtensionsTool.userDescription', ''),
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
			reason: {
				type: 'string',
				description: 'The reason for installing the extensions. This is shown to the user. The reason should just explain about the extensions and do not mention about installing.',
			}
		},
	}
};

type InputParams = {
	ids: string[];
	reason: string;
};

export class InstallExtensionsTool implements IToolImpl {

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) { }

	async prepareToolInvocation(parameters: InputParams, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			confirmationMessages: {
				title: localize('installExtensionsTool.confirmationTitle', 'Install Extensions'),
				message: parameters.reason ?? localize('installExtensionsTool.confirmationMessage', 'These extensions are recommeded for you by Copilot.'),
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
				value: localize('installExtensionsTool.resultMessage', 'Following extensions are installed: {0}', installed.map(e => e.identifier.id).join(', ')),
			}]
		};
	}
}

