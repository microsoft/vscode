/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { createBrowserPageLink, getExistingPagesResult } from './browserToolHelpers.js';

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
				description: 'The URL to open in the browser. Must be an absolute URI with a scheme such as file:, http:, or https:. For local files, use the canonical absolute form, for example file:///path/to/file.'
			},
			forceNew: {
				type: 'boolean',
				description: 'Whether to force opening a new page even if a page with the same host already exists. Default is false.'
			}
		},
		required: ['url'],
	},
};

export interface IOpenBrowserToolParams {
	url: string;
	forceNew?: boolean;
}

export class OpenBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@IEditorService private readonly editorService: IEditorService,
		@IAgentNetworkFilterService private readonly agentNetworkFilterService: IAgentNetworkFilterService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as IOpenBrowserToolParams;

		if (!params.url) {
			throw new Error('The "url" parameter is required.');
		}

		const parsed = URL.parse(params.url);
		if (!parsed) {
			throw new Error('You must provide a complete, valid URL.');
		}

		const uri = URI.parse(params.url);
		if (!this.agentNetworkFilterService.isUriAllowed(uri)) {
			throw new Error(this.agentNetworkFilterService.formatError(uri));
		}

		return {
			invocationMessage: localize('browser.open.invocation', "Opening browser page at {0}", parsed.href),
			pastTenseMessage: localize('browser.open.past', "Opened browser page at {0}", parsed.href),
			confirmationMessages: {
				title: localize('browser.open.confirmTitle', 'Open Browser Page?'),
				message: localize('browser.open.confirmMessage', 'This will open {0} in the integrated browser. The agent will be able to read and interact with its contents.', parsed.href),
				allowAutoConfirm: true,
			},
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IOpenBrowserToolParams;

		if (!params.forceNew) {
			const existingResult = await getExistingPagesResult(this.editorService, this.playwrightService, params.url, { agentNetworkFilterService: this.agentNetworkFilterService });
			if (existingResult) {
				return existingResult;
			}
		}

		const { pageId, summary } = await this.playwrightService.openPage(params.url);

		return {
			content: [{
				kind: 'text',
				value: `Page ID: ${pageId}\n\nSummary:\n`,
			}, {
				kind: 'text',
				value: summary,
			}],
			toolResultMessage: new MarkdownString(localize('browser.open.result', "Opened {0}", createBrowserPageLink(pageId)))
		};
	}
}
