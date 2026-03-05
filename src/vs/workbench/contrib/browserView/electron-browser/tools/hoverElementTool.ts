/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const HoverElementToolData: IToolData = {
	id: 'hover_element',
	toolReferenceName: 'hoverElement',
	displayName: localize('hoverElementTool.displayName', 'Hover Element'),
	userDescription: localize('hoverElementTool.userDescription', 'Hover over an element in a browser page'),
	modelDescription: 'Hover over an element in a browser page. Provide either a Playwright selector or an element reference.',
	icon: Codicon.cursor,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID, acquired from context or the open tool.`
			},
			selector: {
				type: 'string',
				description: 'Playwright selector of the element to hover over.'
			},
			ref: {
				type: 'string',
				description: 'Element reference to hover over. One of "selector" or "ref" must be provided.'
			},
		},
		required: ['pageId'],
	},
};

interface IHoverElementToolParams {
	pageId: string;
	selector?: string;
	ref?: string;
}

export class HoverElementTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('browser.hover.invocation', "Hovering over element in browser"),
			pastTenseMessage: localize('browser.hover.past', "Hovered over element in browser"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IHoverElementToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		let selector = params.selector;
		if (params.ref) {
			selector = `aria-ref=${params.ref}`;
		}

		if (!selector) {
			return errorResult('Either a "selector" or "ref" parameter is required.');
		}

		return playwrightInvoke(this.playwrightService, params.pageId, (page, sel) => page.locator(sel).hover(), selector);
	}
}
