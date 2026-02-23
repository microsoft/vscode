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

export const TypeBrowserToolData: IToolData = {
	id: 'type_in_page',
	toolReferenceName: 'typeInPage',
	displayName: localize('typeBrowserTool.displayName', 'Type in Page'),
	userDescription: localize('typeBrowserTool.userDescription', 'Type text or press keys in a browser page'),
	modelDescription: 'Type text or press keys in a browser page.',
	icon: Codicon.symbolText,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID, acquired from context or ${OpenPageToolId}.`
			},
			text: {
				type: 'string',
				description: 'The text to type. One of "text" or "key" must be provided.'
			},
			key: {
				type: 'string',
				description: 'A key or key combination to press (e.g., "Enter", "Tab", "Control+c"). One of "text" or "key" must be provided.'
			},
			selector: {
				type: 'string',
				description: 'Playwright selector of element to target. If omitted, types into the focused element.'
			},
			ref: {
				type: 'string',
				description: 'Element reference to target. If omitted, types into the focused element.'
			},
		},
		required: ['pageId'],
	},
};

interface ITypeBrowserToolParams {
	pageId: string;
	text?: string;
	key?: string;
	selector?: string;
	ref?: string;
}

export class TypeBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as ITypeBrowserToolParams;
		if (params.key) {
			return {
				invocationMessage: localize('browser.pressKey.invocation', "Pressing key {0} in browser", params.key),
				pastTenseMessage: localize('browser.pressKey.past', "Pressed key {0} in browser", params.key),
			};
		}
		return {
			invocationMessage: localize('browser.type.invocation', "Typing text in browser"),
			pastTenseMessage: localize('browser.type.past', "Typed text in browser"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as ITypeBrowserToolParams;

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		let selector = params.selector;
		if (params.ref) {
			selector = `aria-ref=${params.ref}`;
		}

		if (!params.text && !params.key) {
			return errorResult('Either a "text" or "key" parameter is required.');
		}

		// Press key
		if (params.key) {
			if (selector) {
				return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, key) => page.locator(sel).press(key), selector, params.key);
			}
			return playwrightInvoke(this.playwrightService, params.pageId, (page, key) => page.keyboard.press(key), params.key);
		}

		// Type text
		if (selector) {
			return playwrightInvoke(this.playwrightService, params.pageId, (page, sel, text) => page.locator(sel).fill(text), selector, params.text!);
		}
		return playwrightInvoke(this.playwrightService, params.pageId, (page, text) => page.keyboard.type(text), params.text!);
	}
}
