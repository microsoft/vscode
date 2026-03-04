/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult } from './browserToolHelpers.js';

export const OpenPageToolId = 'open_browser_page';

export const OpenBrowserToolData: IToolData = {
	id: OpenPageToolId,
	toolReferenceName: 'openBrowserPage',
	displayName: localize('openBrowserTool.displayName', 'Open Browser Page'),
	userDescription: localize('openBrowserTool.userDescription', 'Open a URL in the integrated browser'),
	modelDescription: 'Open a new browser page in the integrated browser at the given URL. Returns a page ID that must be used with other browser tools to interact with the page. Prefer to reuse existing pages whenever possible and only call this tool if a new page is necessary.',
	icon: Codicon.openInProduct,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'The URL to open in the browser.'
			},
		},
		required: ['url'],
	},
};

export interface IOpenBrowserToolParams {
	url: string;
}

export class OpenBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as IOpenBrowserToolParams;
		return {
			invocationMessage: localize('browser.open.invocation', "Opening browser page at {0}", params.url ?? 'about:blank'),
			pastTenseMessage: localize('browser.open.past', "Opened browser page at {0}", params.url ?? 'about:blank'),
			confirmationMessages: {
				title: localize('browser.open.confirmTitle', 'Open Browser Page?'),
				message: localize('browser.open.confirmMessage', 'This will open {0} in the integrated browser. The agent will be able to read and interact with its contents.', params.url ?? 'about:blank'),
				allowAutoConfirm: true,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IOpenBrowserToolParams;

		if (!params.url) {
			return errorResult('The "url" parameter is required.');
		}

		const { pageId, summary } = await this.playwrightService.openPage(params.url);

		return {
			content: [{
				kind: 'text',
				value: `Page ID: ${pageId}\n${summary}`,
			}],
		};
	}
}
