/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { createBrowserPageLink, errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const NavigateBrowserToolData: IToolData = {
	id: 'navigate_page',
	toolReferenceName: 'navigatePage',
	displayName: localize('navigateBrowserTool.displayName', 'Navigate Page'),
	userDescription: localize('navigateBrowserTool.userDescription', 'Navigate or reload a browser page'),
	modelDescription: 'Navigate a browser page by URL, history, or reload.',
	icon: Codicon.arrowRight,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID to navigate, acquired from context or the open tool.`
			},
			type: {
				type: 'string',
				enum: ['url', 'back', 'forward', 'reload'],
				description: 'Navigation type: "url" to navigate to a URL (default, requires "url" param), "back" or "forward" for history, "reload" to refresh.'
			},
			url: {
				type: 'string',
				description: 'The URL to navigate to. Required when type is "url".'
			},
		},
		required: ['pageId'],
	},
};

interface INavigateBrowserToolParams {
	pageId: string;
	type?: 'url' | 'back' | 'forward' | 'reload';
	url?: string;
}

export class NavigateBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as INavigateBrowserToolParams;
		const link = createBrowserPageLink(params.pageId);
		switch (params.type) {
			case 'reload':
				return {
					invocationMessage: new MarkdownString(localize('browser.reload.invocation', "Reloading {0}", link)),
					pastTenseMessage: new MarkdownString(localize('browser.reload.past', "Reloaded {0}", link)),
					icon: Codicon.refresh,
				};
			case 'back':
				return {
					invocationMessage: new MarkdownString(localize('browser.goBack.invocation', "Navigating backward in {0}", link)),
					pastTenseMessage: new MarkdownString(localize('browser.goBack.past', "Navigated backward in {0}", link)),
					icon: Codicon.arrowLeft,
				};
			case 'forward':
				return {
					invocationMessage: new MarkdownString(localize('browser.goForward.invocation', "Navigating forward in {0}", link)),
					pastTenseMessage: new MarkdownString(localize('browser.goForward.past', "Navigated forward in {0}", link)),
					icon: Codicon.arrowRight,
				};
			default: {
				if (!params.url) {
					throw new Error('The "url" parameter is required when type is "url".');
				}
				const parsed = URL.parse(params.url);
				if (!parsed) {
					throw new Error('You must provide a complete, valid URL.');
				}

				return {
					invocationMessage: new MarkdownString(localize('browser.navigate.invocation', "Navigating to {0} in {1}", parsed.href, link)),
					pastTenseMessage: new MarkdownString(localize('browser.navigate.past', "Navigated to {0} in {1}", parsed.href, link)),
					confirmationMessages: {
						title: localize('browser.navigate.confirmTitle', 'Navigate Browser?'),
						message: localize('browser.navigate.confirmMessage', 'This will navigate the browser to {0} and allow the agent to access its contents.', parsed.href),
						allowAutoConfirm: true,
					},
				};
			}
		}
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as INavigateBrowserToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		switch (params.type) {
			case 'reload':
				return playwrightInvoke(this.playwrightService, params.pageId, (page) => page.reload({ waitUntil: 'domcontentloaded' }));
			case 'back':
				return playwrightInvoke(this.playwrightService, params.pageId, (page) => page.goBack({ waitUntil: 'domcontentloaded' }));
			case 'forward':
				return playwrightInvoke(this.playwrightService, params.pageId, (page) => page.goForward({ waitUntil: 'domcontentloaded' }));
			default: {
				return playwrightInvoke(this.playwrightService, params.pageId, (page, url) => {
					return page.goto(url, { waitUntil: 'domcontentloaded' });
				}, params.url!);
			}
		}
	}
}
