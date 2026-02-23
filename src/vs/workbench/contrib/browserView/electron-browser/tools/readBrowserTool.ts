/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const ReadBrowserToolData: IToolData = {
	id: 'read_page',
	toolReferenceName: 'readPage',
	displayName: localize('readBrowserTool.displayName', 'Read Page'),
	userDescription: localize('readBrowserTool.userDescription', 'Read the content of a browser page'),
	modelDescription: 'Get a snapshot of the current browser page state. This is better than screenshot.',
	icon: Codicon.fileText,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID to read, acquired from context or ${OpenPageToolId}.`
			},
		},
		required: ['pageId'],
	},
};

interface IReadBrowserToolParams {
	pageId: string;
}

export class ReadBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const link = `[browser page](${BrowserViewUri.forUrl('', _context.parameters.pageId).toString()})`;
		return {
			invocationMessage: new MarkdownString(localize('browser.read.invocation', "Reading {0}", link)),
			pastTenseMessage: new MarkdownString(localize('browser.read.past', "Read {0}", link)),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IReadBrowserToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		const summary = await this.playwrightService.getSummary(params.pageId);
		if (!summary) {
			return errorResult('No page summary available.');
		}

		return {
			content: [{
				kind: 'text',
				value: summary,
			}],
		};
	}
}
