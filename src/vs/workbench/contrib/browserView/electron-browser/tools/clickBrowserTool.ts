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

export const ClickBrowserToolData: IToolData = {
	id: 'click_element',
	toolReferenceName: 'clickElement',
	displayName: localize('clickBrowserTool.displayName', 'Click Element'),
	userDescription: localize('clickBrowserTool.userDescription', 'Click an element in a browser page'),
	modelDescription: 'Click on an element in a browser page.',
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
				description: 'Playwright selector of the element to click.'
			},
			ref: {
				type: 'string',
				description: 'Element reference to click. One of "selector" or "ref" must be provided.'
			},
			dblClick: {
				type: 'boolean',
				description: 'Set to true for double clicks. Default is false.'
			},
			button: {
				type: 'string',
				enum: ['left', 'right', 'middle'],
				description: 'Mouse button to click with. Default is "left".'
			},
		},
		required: ['pageId'],
	},
};

interface IClickBrowserToolParams {
	pageId: string;
	selector?: string;
	ref?: string;
	dblClick?: boolean;
	button?: 'left' | 'right' | 'middle';
}

export class ClickBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('browser.click.invocation', "Clicking element in browser"),
			pastTenseMessage: localize('browser.click.past', "Clicked element in browser"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IClickBrowserToolParams;

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

		const button = params.button ?? 'left';

		if (params.dblClick) {
			return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, btn) => page.locator(sel).dblclick({ button: btn }), selector, button);
		}

		return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, btn) => page.locator(sel).click({ button: btn }), selector, button);
	}
}
