/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import {
	escapeMarkdownSyntaxTokens,
	MarkdownString
} from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { createBrowserPageLink, errorResult, playwrightInvoke } from './browserToolHelpers.js';
import { BrowserChatToolReferenceName } from '../../common/browserChatToolReferenceNames.js';
import { OpenPageToolId } from './openBrowserTool.js';

export const TypeBrowserToolData: IToolData = {
	id: 'type_in_page',
	toolReferenceName: BrowserChatToolReferenceName.TypeInPage,
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
				description: `The browser page ID, acquired from context or the open tool.`
			},
			text: {
				type: 'string',
				description: 'The text to type. One of "text" or "key" must be provided.'
			},
			key: {
				type: 'string',
				description: 'A key or key combination to press (e.g., "Enter", "Tab", "Control+c"). One of "text" or "key" must be provided.'
			},
			ref: {
				type: 'string',
				description: 'Element reference to target. If omitted, types into the focused element.'
			},
			selector: {
				type: 'string',
				description: 'Playwright selector of element to target when "ref" is not available. If omitted, types into the focused element.'
			},
			element: {
				type: 'string',
				description: 'Human-readable description of the element to type into (e.g., "search box", "comment field"). Required when "ref" or "selector" is specified.'
			},
		},
		required: ['pageId'],
		$comment: 'If "ref" or "selector" is provided, then "element" is required.',
	},
};

interface ITypeBrowserToolParams {
	pageId: string;
	text?: string;
	key?: string;
	ref?: string;
	selector?: string;
	element?: string;
}

export class TypeBrowserTool implements IToolImpl {
	constructor(
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as ITypeBrowserToolParams;
		const link = createBrowserPageLink(params.pageId);
		const hasTarget = params.ref || params.selector;

		if (params.key) {
			const key = escapeMarkdownSyntaxTokens(params.key);
			if (hasTarget && params.element) {
				const element = escapeMarkdownSyntaxTokens(params.element);
				return {
					invocationMessage: new MarkdownString(localize('browser.pressKey.invocation.element', "Pressing key `{0}` in {1} in {2}", key, element, link)),
					pastTenseMessage: new MarkdownString(localize('browser.pressKey.past.element', "Pressed key `{0}` in {1} in {2}", key, element, link)),
				};
			}
			return {
				invocationMessage: new MarkdownString(localize('browser.pressKey.invocation', "Pressing key `{0}` in {1}", key, link)),
				pastTenseMessage: new MarkdownString(localize('browser.pressKey.past', "Pressed key `{0}` in {1}", key, link)),
			};
		}

		if (hasTarget && params.element) {
			const element = escapeMarkdownSyntaxTokens(params.element);
			return {
				invocationMessage: new MarkdownString(localize('browser.type.invocation.element', "Typing text in {0} in {1}", element, link)),
				pastTenseMessage: new MarkdownString(localize('browser.type.past.element', "Typed text in {0} in {1}", element, link)),
			};
		}
		return {
			invocationMessage: new MarkdownString(localize('browser.type.invocation', "Typing text in {0}", link)),
			pastTenseMessage: new MarkdownString(localize('browser.type.past', "Typed text in {0}", link)),
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
